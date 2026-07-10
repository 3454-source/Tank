const { GAMES, DEFAULT_GAME_ID } = require("./games/registry");

const COLORS = [
  "#e74c3c",
  "#3498db",
  "#2ecc71",
  "#f1c40f",
  "#9b59b6",
  "#1abc9c",
  "#e67e22",
  "#ec407a",
];
const RANDOM_CODE_CHARS = "ABCDEFGHJKLMNPQRSTUVWXYZ23456789"; // no O/0/I/1, for auto-generated codes
const MAX_PLAYERS = 8;

function clamp(v, min, max) {
  return Math.max(min, Math.min(max, v));
}

function randomCode(len = 4) {
  let s = "";
  for (let i = 0; i < len; i++) {
    s += RANDOM_CODE_CHARS[Math.floor(Math.random() * RANDOM_CODE_CHARS.length)];
  }
  return s;
}

// Host-chosen custom room codes: uppercase alphanumeric, 3-8 chars.
function sanitizeCustomCode(code) {
  if (!code) return null;
  const c = code.toString().trim().toUpperCase().replace(/[^A-Z0-9]/g, "");
  if (c.length < 3 || c.length > 8) return null;
  return c;
}

function defaultSettingsForAllGames() {
  const settings = {};
  for (const id of Object.keys(GAMES)) {
    settings[id] = GAMES[id].defaultSettings();
  }
  return settings;
}

class Room {
  constructor(code, hostId) {
    this.code = code;
    this.hostId = hostId;
    this.players = new Map(); // id -> { id, name, color, ready, score }
    this.gameId = DEFAULT_GAME_ID;
    this.mapId = "maze";
    this.settings = defaultSettingsForAllGames(); // settings[gameId] = {...}
    this.state = "lobby"; // lobby | countdown | playing | roundover
    this.countdown = 0;
    this.countdownTimer = 0;
    this.countdownStarted = false;
    this.roundOverAt = 0;
    this.lastWinner = null;
    this.game = null; // per-game runtime state, owned by the active game module
    this.isPractice = false;
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
    if (this.game && this.game.tanks) this.game.tanks.delete(id);
    if (this.game && this.game.fighters) this.game.fighters.delete(id);
    if (this.game && this.game.inputs) this.game.inputs.delete(id);
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

  setGame(gameId) {
    if (!GAMES[gameId]) return;
    this.gameId = gameId;
    if (!this.settings[gameId]) this.settings[gameId] = GAMES[gameId].defaultSettings();
  }

  setSettings(gameId, partial) {
    const game = GAMES[gameId];
    if (!game || !partial) return;
    const target = this.settings[gameId] || (this.settings[gameId] = game.defaultSettings());
    for (const field of game.settingsSchema) {
      if (partial[field.key] === undefined) continue;
      const n = Number(partial[field.key]);
      if (!Number.isFinite(n)) continue;
      let v = clamp(n, field.min, field.max);
      target[field.key] = Math.round(v / field.step) * field.step;
    }
  }

  toJSON() {
    return {
      code: this.code,
      hostId: this.hostId,
      gameId: this.gameId,
      mapId: this.mapId,
      settings: this.settings[this.gameId],
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

  // Returns { room } on success, or { error } if a custom code was requested
  // but is invalid or already taken.
  createRoom(hostId, name, desiredCode) {
    let code;
    if (desiredCode !== undefined && desiredCode !== null && desiredCode !== "") {
      const sanitized = sanitizeCustomCode(desiredCode);
      if (!sanitized) {
        return { error: "초대 코드는 영문/숫자 3~8자로 입력해주세요." };
      }
      if (this.rooms.has(sanitized)) {
        return { error: "이미 사용 중인 초대 코드입니다." };
      }
      code = sanitized;
    } else {
      do {
        code = randomCode(4);
      } while (this.rooms.has(code));
    }
    const room = new Room(code, hostId);
    room.addPlayer(hostId, name);
    this.rooms.set(code, room);
    return { room };
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
