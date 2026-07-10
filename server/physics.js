const TANK_RADIUS = 22;
const BULLET_RADIUS = 5;

// Movement is absolute/screen-relative: the input vector directly IS the
// move direction, and the tank instantly faces that direction - no more
// "rotate in place, then drive forward relative to facing" controls, which
// is what made moving feel indirect. Speed/fire-rate/bullet-speed are base
// values that the room host can scale via per-room multipliers.
const BASE_TANK_SPEED = 210; // px/s, same in every direction
const MOVE_DEADZONE = 0.1;

const BASE_BULLET_SPEED = 420; // px/s
const MAX_BOUNCES = 4;
const BASE_SHOOT_COOLDOWN_MS = 450;
const MIN_SHOOT_COOLDOWN_MS = 120;
const BULLET_LIFETIME_MS = 9000;

function closestPointOnSegment(px, py, x1, y1, x2, y2) {
  const dx = x2 - x1;
  const dy = y2 - y1;
  const len2 = dx * dx + dy * dy;
  let t = len2 === 0 ? 0 : ((px - x1) * dx + (py - y1) * dy) / len2;
  t = Math.max(0, Math.min(1, t));
  return { x: x1 + t * dx, y: y1 + t * dy };
}

function resolveCircleWalls(pos, radius, walls, wallThick) {
  const minDist = radius + wallThick / 2;
  for (let iter = 0; iter < 2; iter++) {
    for (const w of walls) {
      const cp = closestPointOnSegment(pos.x, pos.y, w.x1, w.y1, w.x2, w.y2);
      let nx = pos.x - cp.x;
      let ny = pos.y - cp.y;
      let dist = Math.hypot(nx, ny);
      if (dist < minDist) {
        if (dist < 1e-6) {
          nx = 1;
          ny = 0;
          dist = 1e-6;
        } else {
          nx /= dist;
          ny /= dist;
        }
        const overlap = minDist - dist;
        pos.x += nx * overlap;
        pos.y += ny * overlap;
      }
    }
  }
}

function resolveTankTank(tanks) {
  const list = tanks.filter((t) => t.alive);
  for (let i = 0; i < list.length; i++) {
    for (let j = i + 1; j < list.length; j++) {
      const a = list[i];
      const b = list[j];
      let dx = b.x - a.x;
      let dy = b.y - a.y;
      let dist = Math.hypot(dx, dy);
      const minDist = TANK_RADIUS * 2;
      if (dist < minDist) {
        if (dist < 1e-6) {
          dx = 1;
          dy = 0;
          dist = 1e-6;
        } else {
          dx /= dist;
          dy /= dist;
        }
        const overlap = (minDist - dist) / 2;
        a.x -= dx * overlap;
        a.y -= dy * overlap;
        b.x += dx * overlap;
        b.y += dy * overlap;
      }
    }
  }
}

function updateTank(tank, input, dt, walls, wallThick, speedMult = 1) {
  if (!tank.alive) return;
  input = input || {};

  const mx = Number(input.moveX) || 0;
  const my = Number(input.moveY) || 0;
  const mag = Math.hypot(mx, my);
  if (mag > MOVE_DEADZONE) {
    const nx = mx / mag;
    const ny = my / mag;
    tank.angle = Math.atan2(ny, nx);
    const speed = BASE_TANK_SPEED * speedMult * Math.min(1, mag);
    tank.x += nx * speed * dt;
    tank.y += ny * speed * dt;
  }

  resolveCircleWalls(tank, TANK_RADIUS, walls, wallThick);
}

function tryShoot(tank, input, now, bullets, nextBulletId, fireRateMult = 1, bulletSpeedMult = 1) {
  if (!tank.alive) return nextBulletId;
  if (!input || !input.shoot) return nextBulletId;
  const cooldown = Math.max(MIN_SHOOT_COOLDOWN_MS, BASE_SHOOT_COOLDOWN_MS / fireRateMult);
  if (now - (tank.lastShotAt || 0) < cooldown) return nextBulletId;

  tank.lastShotAt = now;
  const bulletSpeed = BASE_BULLET_SPEED * bulletSpeedMult;
  const muzzle = TANK_RADIUS + BULLET_RADIUS + 2;
  const id = nextBulletId;
  bullets.push({
    id,
    ownerId: tank.id,
    x: tank.x + Math.cos(tank.angle) * muzzle,
    y: tank.y + Math.sin(tank.angle) * muzzle,
    vx: Math.cos(tank.angle) * bulletSpeed,
    vy: Math.sin(tank.angle) * bulletSpeed,
    bounces: 0,
    createdAt: now,
  });
  return id + 1;
}

function updateBullet(bullet, dt, walls, wallThick) {
  bullet.x += bullet.vx * dt;
  bullet.y += bullet.vy * dt;

  const minDist = BULLET_RADIUS + wallThick / 2;
  for (const w of walls) {
    const cp = closestPointOnSegment(bullet.x, bullet.y, w.x1, w.y1, w.x2, w.y2);
    let nx = bullet.x - cp.x;
    let ny = bullet.y - cp.y;
    let dist = Math.hypot(nx, ny);
    if (dist < minDist) {
      if (dist < 1e-6) {
        nx = 1;
        ny = 0;
        dist = 1e-6;
      } else {
        nx /= dist;
        ny /= dist;
      }
      const dot = bullet.vx * nx + bullet.vy * ny;
      bullet.vx -= 2 * dot * nx;
      bullet.vy -= 2 * dot * ny;
      const overlap = minDist - dist;
      bullet.x += nx * overlap;
      bullet.y += ny * overlap;
      bullet.bounces += 1;
      break; // only resolve one wall per tick
    }
  }
}

// Returns "none" | "block" | "hit".
// A bullet never affects the tank that fired it. Otherwise, a hit on the
// front half (the armored side, facing the barrel) is blocked by the armor,
// while a hit on the back half costs the tank a life.
function bulletTankInteraction(bullet, tank) {
  if (!tank.alive) return "none";
  if (bullet.ownerId === tank.id) return "none";
  const dx = bullet.x - tank.x;
  const dy = bullet.y - tank.y;
  const dist = Math.hypot(dx, dy);
  if (dist >= TANK_RADIUS + BULLET_RADIUS) return "none";

  const fx = Math.cos(tank.angle);
  const fy = Math.sin(tank.angle);
  const dot = fx * dx + fy * dy;
  return dot > 0 ? "block" : "hit";
}

module.exports = {
  TANK_RADIUS,
  BULLET_RADIUS,
  MAX_BOUNCES,
  BULLET_LIFETIME_MS,
  resolveCircleWalls,
  resolveTankTank,
  updateTank,
  tryShoot,
  updateBullet,
  bulletTankInteraction,
};
