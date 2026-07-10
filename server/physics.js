const TANK_RADIUS = 16;
const BULLET_RADIUS = 4;

// Tanks ramp their speed and turn rate toward a target instead of snapping
// instantly, which is what makes the driving feel smooth rather than jerky.
const TANK_MAX_SPEED = 210; // px/s forward
const TANK_MAX_REVERSE_SPEED = 140; // px/s backward
const TANK_ACCEL = 480; // px/s^2 while accelerating toward a target speed
const TANK_BRAKE = 640; // px/s^2 while decelerating (releasing keys / reversing)
const TANK_MAX_ANGULAR_SPEED = 3.0; // rad/s
const TANK_ANGULAR_ACCEL = 11; // rad/s^2 while turning
const TANK_ANGULAR_BRAKE = 15; // rad/s^2 while releasing turn keys

const BULLET_SPEED = 420; // px/s
const MAX_BOUNCES = 4;
const SHOOT_COOLDOWN_MS = 450;
const MAX_BULLETS_PER_TANK = 3;
const BULLET_LIFETIME_MS = 9000;

function approach(current, target, accel, dt) {
  if (current < target) return Math.min(current + accel * dt, target);
  if (current > target) return Math.max(current - accel * dt, target);
  return current;
}

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

function updateTank(tank, input, dt, walls, wallThick) {
  if (!tank.alive) return;
  input = input || {};
  tank.speed = tank.speed || 0;
  tank.angularVelocity = tank.angularVelocity || 0;

  let targetAngular = 0;
  if (input.left && !input.right) targetAngular = -TANK_MAX_ANGULAR_SPEED;
  else if (input.right && !input.left) targetAngular = TANK_MAX_ANGULAR_SPEED;
  const angularAccel = targetAngular !== 0 ? TANK_ANGULAR_ACCEL : TANK_ANGULAR_BRAKE;
  tank.angularVelocity = approach(tank.angularVelocity, targetAngular, angularAccel, dt);
  tank.angle += tank.angularVelocity * dt;

  let targetSpeed = 0;
  if (input.up && !input.down) targetSpeed = TANK_MAX_SPEED;
  else if (input.down && !input.up) targetSpeed = -TANK_MAX_REVERSE_SPEED;
  const speedAccel = targetSpeed !== 0 ? TANK_ACCEL : TANK_BRAKE;
  tank.speed = approach(tank.speed, targetSpeed, speedAccel, dt);

  if (tank.speed !== 0) {
    tank.x += Math.cos(tank.angle) * tank.speed * dt;
    tank.y += Math.sin(tank.angle) * tank.speed * dt;
  }

  resolveCircleWalls(tank, TANK_RADIUS, walls, wallThick);
}

function tryShoot(tank, input, now, bullets, nextBulletId) {
  if (!tank.alive) return nextBulletId;
  if (!input || !input.shoot) return nextBulletId;
  if (now - (tank.lastShotAt || 0) < SHOOT_COOLDOWN_MS) return nextBulletId;
  const liveCount = bullets.filter((b) => b.ownerId === tank.id).length;
  if (liveCount >= MAX_BULLETS_PER_TANK) return nextBulletId;

  tank.lastShotAt = now;
  const muzzle = TANK_RADIUS + BULLET_RADIUS + 2;
  const id = nextBulletId;
  bullets.push({
    id,
    ownerId: tank.id,
    x: tank.x + Math.cos(tank.angle) * muzzle,
    y: tank.y + Math.sin(tank.angle) * muzzle,
    vx: Math.cos(tank.angle) * BULLET_SPEED,
    vy: Math.sin(tank.angle) * BULLET_SPEED,
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

// Returns "none" | "block" | "kill".
// A bullet never affects the tank that fired it. Otherwise, a hit on the
// front half (the armored side, facing the barrel) is blocked by the armor,
// while a hit on the back half is a kill.
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
  return dot > 0 ? "block" : "kill";
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
