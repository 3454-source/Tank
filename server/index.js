const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const { RoomManager } = require("./rooms");
const { GAMES, GAME_LIST } = require("./games/registry");
const { MAP_LIST, MAPS } = require("./maps");

const app = express();
app.use(express.static(path.join(__dirname, "..", "public")));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const roomManager = new RoomManager();
const socketRoom = new Map(); // socket.id -> room code

function currentGame(room) {
  return GAMES[room.gameId] || GAMES.tank;
}

function broadcastRoom(room) {
  io.to(room.code).emit("room", room.toJSON());
}

function startGame(room) {
  const game = currentGame(room);
  room.state = "playing";
  room.countdownStarted = false;
  const payload = game.start(room);
  io.to(room.code).emit("gameStart", { gameId: game.id, ...payload });
}

function resetToLobby(room) {
  room.state = "lobby";
  room.game = null;
  room.countdownStarted = false;
  room.countdown = 0;
  for (const p of room.players.values()) p.ready = false;
  broadcastRoom(room);
}

function endRound(room, winnerId, extra) {
  room.state = "roundover";
  room.roundOverAt = Date.now() + 4000;
  room.lastWinner = winnerId;
  if (winnerId) {
    const p = room.players.get(winnerId);
    if (p) p.score += 1;
  }
  io.to(room.code).emit("roundOver", {
    winnerId,
    winnerName: winnerId ? (room.players.get(winnerId) || {}).name : null,
    scores: [...room.players.values()].map((p) => ({ id: p.id, name: p.name, score: p.score })),
    ...extra,
  });
}

io.on("connection", (socket) => {
  socket.on("createRoom", ({ name, code } = {}) => {
    const { room, error } = roomManager.createRoom(socket.id, sanitizeName(name), code);
    if (error) {
      socket.emit("joinError", error);
      return;
    }
    socket.join(room.code);
    socketRoom.set(socket.id, room.code);
    socket.emit("joined", { code: room.code, mapList: MAP_LIST, gameList: GAME_LIST });
    broadcastRoom(room);
  });

  socket.on("startPractice", ({ name } = {}) => {
    leaveRoom(socket);
    const { room, error } = roomManager.createRoom(socket.id, sanitizeName(name));
    if (error) return;
    room.isPractice = true;
    room.gameId = "tank";
    socket.join(room.code);
    socketRoom.set(socket.id, room.code);
    startGame(room);
  });

  socket.on("joinRoom", ({ code, name } = {}) => {
    const room = roomManager.getRoom(code);
    if (!room) {
      socket.emit("joinError", "존재하지 않는 방 코드입니다.");
      return;
    }
    if (room.isFull()) {
      socket.emit("joinError", "방이 가득 찼습니다.");
      return;
    }
    if (room.state !== "lobby") {
      socket.emit("joinError", "게임이 이미 진행 중입니다.");
      return;
    }
    room.addPlayer(socket.id, sanitizeName(name));
    socket.join(room.code);
    socketRoom.set(socket.id, room.code);
    socket.emit("joined", { code: room.code, mapList: MAP_LIST, gameList: GAME_LIST });
    broadcastRoom(room);
  });

  socket.on("setReady", (ready) => {
    const room = getMyRoom(socket);
    if (!room) return;
    const p = room.players.get(socket.id);
    if (!p) return;
    p.ready = !!ready;
    if (!p.ready) room.cancelCountdown();
    broadcastRoom(room);
  });

  socket.on("setGame", (gameId) => {
    const room = getMyRoom(socket);
    if (!room) return;
    if (room.hostId !== socket.id) return;
    if (room.state !== "lobby") return;
    if (!GAMES[gameId]) return;
    room.setGame(gameId);
    broadcastRoom(room);
  });

  socket.on("setMap", (mapId) => {
    const room = getMyRoom(socket);
    if (!room) return;
    if (room.hostId !== socket.id) return;
    if (room.state !== "lobby") return;
    if (!currentGame(room).usesMap) return;
    if (!MAPS[mapId]) return;
    room.mapId = mapId;
    broadcastRoom(room);
  });

  socket.on("setSettings", (settings) => {
    const room = getMyRoom(socket);
    if (!room) return;
    if (room.hostId !== socket.id) return;
    if (room.state !== "lobby") return;
    room.setSettings(room.gameId, settings);
    broadcastRoom(room);
  });

  socket.on("input", (inp) => {
    const room = getMyRoom(socket);
    if (!room || !room.game) return;
    const game = currentGame(room);
    if (game.onInput) game.onInput(socket.id, room, inp);
  });

  socket.on("gameAction", (data) => {
    const room = getMyRoom(socket);
    if (!room || !room.game) return;
    const game = currentGame(room);
    if (!game.onAction) return;
    const ctx = { now: Date.now(), io, endRound: (winnerId, extra) => endRound(room, winnerId, extra) };
    game.onAction(socket.id, room, data, ctx);
  });

  socket.on("leaveRoom", () => leaveRoom(socket));
  socket.on("disconnect", () => leaveRoom(socket));
});

function sanitizeName(name) {
  const n = (name || "").toString().trim().slice(0, 12);
  return n || "Player";
}

function getMyRoom(socket) {
  const code = socketRoom.get(socket.id);
  if (!code) return null;
  return roomManager.getRoom(code);
}

function leaveRoom(socket) {
  const room = getMyRoom(socket);
  if (!room) return;
  room.removePlayer(socket.id);
  socket.leave(room.code);
  socketRoom.delete(socket.id);
  if (room.players.size === 0) {
    roomManager.deleteIfEmpty(room);
  } else {
    broadcastRoom(room);
  }
}

const TICK_MS = 1000 / 60;
let lastTick = Date.now();

setInterval(() => {
  const now = Date.now();
  const dt = Math.min((now - lastTick) / 1000, 0.1);
  lastTick = now;

  for (const room of roomManager.rooms.values()) {
    if (room.state === "lobby") {
      if (room.allReady() && !room.countdownStarted) {
        room.countdownStarted = true;
        room.state = "countdown";
        room.countdown = 3;
        room.countdownTimer = 0;
        io.to(room.code).emit("countdown", room.countdown);
      }
    } else if (room.state === "countdown") {
      room.countdownTimer += dt;
      if (room.countdownTimer >= 1) {
        room.countdownTimer = 0;
        room.countdown -= 1;
        if (room.countdown <= 0) {
          startGame(room);
        } else {
          io.to(room.code).emit("countdown", room.countdown);
        }
      }
    } else if (room.state === "playing") {
      const game = currentGame(room);
      const ctx = { now, dt, io, endRound: (winnerId, extra) => endRound(room, winnerId, extra) };
      if (game.tick) game.tick(room, ctx);
      if (room.state === "playing" && game.realtime && game.serialize) {
        io.to(room.code).emit("state", game.serialize(room));
      }
    } else if (room.state === "roundover") {
      if (now >= room.roundOverAt) {
        resetToLobby(room);
      }
    }
  }
}, TICK_MS);

const PORT = process.env.PORT || 3000;
server.listen(PORT, () => {
  console.log(`미니게임 server listening on port ${PORT}`);
});
