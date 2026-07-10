const maps = require("../maps");
const physics = require("../physics");

const CHAR_RADIUS = physics.TANK_RADIUS;
const SWORD_REACH = CHAR_RADIUS + 34;
const SWORD_HALF_ARC = Math.PI / 3; // 60 degrees each side of facing
const SWING_ACTIVE_MS = 150;
const BASE_SWING_COOLDOWN_MS = 500;

const SETTINGS_SCHEMA = [
  { key: "speedMult", label: "이동 속도", min: 50, max: 200, step: 5, default: 100, unit: "%" },
  { key: "maxLives", label: "목숨", min: 1, max: 20, step: 1, default: 3, unit: "" },
];

function defaultSettings() {
  const s = {};
  for (const f of SETTINGS_SCHEMA) s[f.key] = f.default;
  return s;
}

function start(room) {
  const map = maps.MAPS[room.mapId] || maps.MAPS.maze;
  const settings = room.settings.sword;
  const maxLives = settings.maxLives;
  const players = [...room.players.values()];
  const fighters = new Map();
  players.forEach((p, i) => {
    const spawn = map.spawns[i % map.spawns.length];
    fighters.set(p.id, {
      id: p.id,
      x: spawn.x,
      y: spawn.y,
      angle: spawn.angle,
      alive: true,
      lives: maxLives,
      lastSwingAt: 0,
      swingActiveUntil: 0,
      hitThisSwing: new Set(),
      swinging: false,
    });
  });
  room.game = { fighters, inputs: new Map() };

  return {
    mapId: map.id,
    walls: map.walls,
    worldW: maps.WORLD_W,
    worldH: maps.WORLD_H,
    wallThick: maps.WALL_THICK,
    charRadius: CHAR_RADIUS,
    maxLives,
    players: players.map((p) => ({ id: p.id, name: p.name, color: p.color })),
  };
}

function onInput(socketId, room, inp) {
  const moveX = Number(inp && inp.moveX);
  const moveY = Number(inp && inp.moveY);
  room.game.inputs.set(socketId, {
    moveX: Number.isFinite(moveX) ? moveX : 0,
    moveY: Number.isFinite(moveY) ? moveY : 0,
    shoot: !!(inp && inp.shoot),
  });
}

function tick(room, ctx) {
  const g = room.game;
  const map = maps.MAPS[room.mapId] || maps.MAPS.maze;
  const walls = map.walls;
  const settings = room.settings.sword;
  const speedMult = settings.speedMult / 100;

  for (const f of g.fighters.values()) {
    const input = g.inputs.get(f.id);
    physics.updateMovement(f, input, ctx.dt, walls, maps.WALL_THICK, speedMult, CHAR_RADIUS);

    if (f.alive && input && input.shoot && ctx.now - f.lastSwingAt >= BASE_SWING_COOLDOWN_MS) {
      f.lastSwingAt = ctx.now;
      f.swingActiveUntil = ctx.now + SWING_ACTIVE_MS;
      f.hitThisSwing = new Set();
    }
    f.swinging = ctx.now < f.swingActiveUntil;
  }
  physics.resolveEntityCollisions([...g.fighters.values()], CHAR_RADIUS);

  for (const attacker of g.fighters.values()) {
    if (!attacker.alive || !attacker.swinging) continue;
    for (const target of g.fighters.values()) {
      if (target.id === attacker.id || !target.alive) continue;
      if (attacker.hitThisSwing.has(target.id)) continue;
      const dx = target.x - attacker.x;
      const dy = target.y - attacker.y;
      const dist = Math.hypot(dx, dy);
      if (dist > SWORD_REACH) continue;
      let diff = Math.atan2(dy, dx) - attacker.angle;
      diff = Math.atan2(Math.sin(diff), Math.cos(diff));
      if (Math.abs(diff) > SWORD_HALF_ARC) continue;

      attacker.hitThisSwing.add(target.id);
      target.lives -= 1;
      if (target.lives <= 0) target.alive = false;
    }
  }

  const alive = [...g.fighters.values()].filter((f) => f.alive);
  if (g.fighters.size >= 2 && alive.length <= 1) {
    ctx.endRound(alive.length === 1 ? alive[0].id : null);
  }
}

function serialize(room) {
  const g = room.game;
  return {
    fighters: [...g.fighters.values()].map((f) => ({
      id: f.id,
      x: f.x,
      y: f.y,
      angle: f.angle,
      alive: f.alive,
      lives: f.lives,
      swinging: f.swinging,
    })),
  };
}

module.exports = {
  id: "sword",
  name: "칼싸움",
  usesMap: true,
  realtime: true,
  settingsSchema: SETTINGS_SCHEMA,
  defaultSettings,
  start,
  tick,
  onInput,
  serialize,
};
