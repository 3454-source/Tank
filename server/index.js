const path = require("path");
const express = require("express");
const http = require("http");
const { Server } = require("socket.io");

const { RoomManager } = require("./rooms");
const { MAPS, MAP_LIST, WORLD_W, WORLD_H, WALL_THICK } = require("./maps");
const physics = require("./physics");

const app = express();
app.use(express.static(path.join(__dirname, "..", "public")));

const server = http.createServer(app);
const io = new Server(server, { cors: { origin: "*" } });

const roomManager = new RoomManager();
const socketRoom = new Map(); // socket.id -> room code

function broadcastRoom(room) {
  io.to(room.code).emit("room", room.toJSON());
}

function startGame(room) {
  const map = MAPS[room.mapId] || MAPS.maze;
  const tanks = new Map();
  const players = [...room.players.values()];
  players.forEach((p, i) => {
    const spawn = map.spawns[i % map.spawns.length];
    tanks.set(p.id, {
      id: p.id,
      x: spawn.x,
      y: spawn.y,
      angle: spawn.angle,
      alive: true,
      lastShotAt: 0,
    });
  });
  room.game = {
    tanks,
    bullets: [],
    nextBulletId: 1,
    inputs: new Map(),
  };
  room.state = "playing";
  room.countdownStarted = false;
  io.to(room.code).emit("gameStart", {
    mapId: map.id,
    walls: map.walls,
    worldW: WORLD_W,
    worldH: WORLD_H,
    wallThick: WALL_THICK,
    players: players.map((p) => ({ id: p.id, name: p.name, color: p.color })),
  });
}

function serializeGame(room) {
  return {
    tanks: [...room.game.tanks.values()].map((t) => ({
      id: t.id,
      x: t.x,
      y: t.y,
      angle: t.angle,
      alive: t.alive,
    })),
    bullets: room.game.bullets.map((b) => ({ id: b.id, x: b.x, y: b.y })),
  };
}

function resetToLobby(room) {
  room.state = "lobby";
  room.game = null;
  room.countdownStarted = false;
  room.countdown = 0;
  for (const p of room.players.values()) p.ready = false;
  broadcastRoom(room);
}

function endRound(room, winnerId) {
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
  });
}

function updateGame(room, dt) {
  const g = room.game;
  const now = Date.now();
  const map = MAPS[room.mapId] || MAPS.maze;
  const walls = map.walls;

  for (const tank of g.tanks.values()) {
    const input = g.inputs.get(tank.id);
    physics.updateTank(tank, input, dt, walls, WALL_THICK);
    g.nextBulletId = physics.tryShoot(tank, input, now, g.bullets, g.nextBulletId);
  }
  physics.resolveTankTank([...g.tanks.values()]);

  for (const bullet of g.bullets) {
    physics.updateBullet(bullet, dt, walls, WALL_THICK);
  }
  g.bullets = g.bullets.filter(
    (b) => b.bounces < physics.MAX_BOUNCES && now - b.createdAt < physics.BULLET_LIFETIME_MS
  );

  for (const bullet of g.bullets) {
    for (const tank of g.tanks.values()) {
      if (bullet.dead) break;
      const result = physics.bulletTankInteraction(bullet, tank);
      if (result === "kill") {
        tank.alive = false;
        bullet.dead = true;
      } else if (result === "block") {
        bullet.dead = true;
      }
    }
  }
  g.bullets = g.bullets.filter((b) => !b.dead);

  const alive = [...g.tanks.values()].filter((t) => t.alive);
  if (g.tanks.size >= 2 && alive.length <= 1) {
    endRound(room, alive.length === 1 ? alive[0].id : null);
  }
}

io.on("connection", (socket) => {
  socket.on("createRoom", ({ name } = {}) => {
    const room = roomManager.createRoom(socket.id, sanitizeName(name));
    socket.join(room.code);
    socketRoom.set(socket.id, room.code);
    socket.emit("joined", { code: room.code, mapList: MAP_LIST });
    broadcastRoom(room);
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
    socket.emit("joined", { code: room.code, mapList: MAP_LIST });
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

  socket.on("setMap", (mapId) => {
    const room = getMyRoom(socket);
    if (!room) return;
    if (room.hostId !== socket.id) return;
    if (room.state !== "lobby") return;
    if (!MAPS[mapId]) return;
    room.mapId = mapId;
    broadcastRoom(room);
  });

  socket.on("input", (inp) => {
    const room = getMyRoom(socket);
    if (!room || !room.game) return;
    room.game.inputs.set(socket.id, {
      up: !!(inp && inp.up),
      down: !!(inp && inp.down),
      left: !!(inp && inp.left),
      right: !!(inp && inp.right),
      shoot: !!(inp && inp.shoot),
    });
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
      updateGame(room, dt);
      room.broadcastTick = (room.broadcastTick || 0) + 1;
      if (room.broadcastTick % 2 === 0) {
        io.to(room.code).emit("state", serializeGame(room));
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
  console.log(`Tank Trouble Online server listening on port ${PORT}`);
});
