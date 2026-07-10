const maps = require("../maps");
const physics = require("../physics");

const SETTINGS_SCHEMA = [
  { key: "speedMult", label: "탱크 속도", min: 50, max: 200, step: 5, default: 100, unit: "%" },
  { key: "fireRateMult", label: "연사 속도", min: 50, max: 250, step: 5, default: 100, unit: "%" },
  { key: "bulletSpeedMult", label: "총알 속도", min: 50, max: 200, step: 5, default: 100, unit: "%" },
  { key: "maxLives", label: "탱크 목숨", min: 1, max: 20, step: 1, default: 1, unit: "" },
];

function defaultSettings() {
  const s = {};
  for (const f of SETTINGS_SCHEMA) s[f.key] = f.default;
  return s;
}

function start(room) {
  const map = maps.MAPS[room.mapId] || maps.MAPS.maze;
  const settings = room.settings.tank;
  const maxLives = settings.maxLives;
  const players = [...room.players.values()];
  const tanks = new Map();
  players.forEach((p, i) => {
    const spawn = map.spawns[i % map.spawns.length];
    tanks.set(p.id, {
      id: p.id,
      x: spawn.x,
      y: spawn.y,
      angle: spawn.angle,
      alive: true,
      lastShotAt: 0,
      lives: maxLives,
    });
  });
  room.game = { tanks, bullets: [], nextBulletId: 1, inputs: new Map() };

  return {
    mapId: map.id,
    walls: map.walls,
    worldW: maps.WORLD_W,
    worldH: maps.WORLD_H,
    wallThick: maps.WALL_THICK,
    tankRadius: physics.TANK_RADIUS,
    bulletRadius: physics.BULLET_RADIUS,
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
  const settings = room.settings.tank;
  const speedMult = settings.speedMult / 100;
  const fireRateMult = settings.fireRateMult / 100;
  const bulletSpeedMult = settings.bulletSpeedMult / 100;

  for (const tank of g.tanks.values()) {
    const input = g.inputs.get(tank.id);
    physics.updateMovement(tank, input, ctx.dt, walls, maps.WALL_THICK, speedMult);
    g.nextBulletId = physics.tryShoot(tank, input, ctx.now, g.bullets, g.nextBulletId, fireRateMult, bulletSpeedMult);
  }
  physics.resolveEntityCollisions([...g.tanks.values()]);

  for (const bullet of g.bullets) {
    physics.updateBullet(bullet, ctx.dt, walls, maps.WALL_THICK);
  }
  g.bullets = g.bullets.filter(
    (b) => b.bounces < physics.MAX_BOUNCES && ctx.now - b.createdAt < physics.BULLET_LIFETIME_MS
  );

  for (const bullet of g.bullets) {
    for (const tank of g.tanks.values()) {
      if (bullet.dead) break;
      const result = physics.bulletTankInteraction(bullet, tank);
      if (result === "hit") {
        tank.lives -= 1;
        if (tank.lives <= 0) tank.alive = false;
        bullet.dead = true;
      } else if (result === "block") {
        bullet.dead = true;
      }
    }
  }
  g.bullets = g.bullets.filter((b) => !b.dead);

  const alive = [...g.tanks.values()].filter((t) => t.alive);
  if (g.tanks.size >= 2 && alive.length <= 1) {
    ctx.endRound(alive.length === 1 ? alive[0].id : null);
  }
}

function serialize(room) {
  const g = room.game;
  return {
    tanks: [...g.tanks.values()].map((t) => ({
      id: t.id,
      x: t.x,
      y: t.y,
      angle: t.angle,
      alive: t.alive,
      lives: t.lives,
    })),
    bullets: g.bullets.map((b) => ({ id: b.id, x: b.x, y: b.y, ownerId: b.ownerId })),
  };
}

module.exports = {
  id: "tank",
  name: "탱크 게임",
  usesMap: true,
  realtime: true,
  settingsSchema: SETTINGS_SCHEMA,
  defaultSettings,
  start,
  tick,
  onInput,
  serialize,
};
