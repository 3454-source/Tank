const { MAPS } = require("./maps");

const COLORS = ["#e74c3c", "#3498db", "#2ecc71", "#f1c40f"];
const CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0/I/1
const MAX_PLAYERS = 4;

function randomCode(len = 4) {
  let s = "";
  for (let i = 0; i < len; i++) {
    s += CODE_CHARS[Math.floor(Math.random() * CODE_CHARS.length)];
  }
  return s;
}

class Room {
  constructor(code, hostId) {
    this.code = code;
    this.hostId = hostId;
    this.players = new Map(); // id -> { id, name, color, ready, score }
    this.mapId = "maze";
    this.state = "lobby"; // lobby | countdown | playing | roundover
    this.countdown = 0;
    this.countdownTimer = 0;
    this.countdownStarted = false;
    this.roundOverAt = 0;
    this.lastWinner = null;
    this.game = null; // { tanks: Map, bullets: [], nextBulletId, inputs: Map }
    this.broadcastTick = 0;
  }

  get size() {
    return this.players.size;
  }

  isFull() {
    return this.players.size >= MAX_PLAYERS;
  }

  usedColors() {
    return new Set([...this.players.values()].map((p) => p.color));
  }

  addPlayer(id, name) {
    const used = this.usedColors();
    const color = COLORS.find((c) => !used.has(c)) || COLORS[0];
    const player = { id, name: name || "Player", color, ready: false, score: 0 };
    this.players.set(id, player);
    if (!this.hostId) this.hostId = id;
    return player;
  }

  removePlayer(id) {
    this.players.delete(id);
    if (this.game) {
      this.game.tanks.delete(id);
      if (this.game.inputs) this.game.inputs.delete(id);
    }
    if (this.hostId === id) {
      const next = [...this.players.keys()][0];
      this.hostId = next || null;
    }
    if (this.state === "lobby" || this.state === "countdown") {
      this.cancelCountdown();
    }
  }

  cancelCountdown() {
    if (this.state === "countdown") this.state = "lobby";
    this.countdownStarted = false;
    this.countdown = 0;
    this.countdownTimer = 0;
  }

  allReady() {
    return this.players.size >= 2 && [...this.players.values()].every((p) => p.ready);
  }

  toJSON() {
    return {
      code: this.code,
      hostId: this.hostId,
      mapId: this.mapId,
      state: this.state,
      countdown: this.countdown,
      players: [...this.players.values()],
    };
  }
}

class RoomManager {
  constructor() {
    this.rooms = new Map();
  }

  createRoom(hostId, name) {
    let code;
    do {
      code = randomCode(4);
    } while (this.rooms.has(code));
    const room = new Room(code, hostId);
    room.addPlayer(hostId, name);
    this.rooms.set(code, room);
    return room;
  }

  getRoom(code) {
    return this.rooms.get((code || "").toUpperCase());
  }

  deleteIfEmpty(room) {
    if (room && room.players.size === 0) {
      this.rooms.delete(room.code);
    }
  }
}

module.exports = { Room, RoomManager, MAX_PLAYERS };
