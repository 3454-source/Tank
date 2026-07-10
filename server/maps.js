// Map layouts are designed on a 900x600 grid for readability, then scaled up
// uniformly so the arena feels bigger without hand-recomputing coordinates.
const SCALE = 1.6;
const DESIGN_W = 900;
const DESIGN_H = 600;

const WORLD_W = Math.round(DESIGN_W * SCALE);
const WORLD_H = Math.round(DESIGN_H * SCALE);
const WALL_THICK = 14;

function seg(x1, y1, x2, y2) {
  return { x1: x1 * SCALE, y1: y1 * SCALE, x2: x2 * SCALE, y2: y2 * SCALE };
}

function borderWalls() {
  return [
    seg(0, 0, DESIGN_W, 0),
    seg(DESIGN_W, 0, DESIGN_W, DESIGN_H),
    seg(DESIGN_W, DESIGN_H, 0, DESIGN_H),
    seg(0, DESIGN_H, 0, 0),
  ];
}

// Spawn points, facing roughly toward the center of the arena. The 4 corners
// come first so 2-4 player games spawn exactly where they used to; the 4
// edge-midpoints are only used once a lobby grows past 4 players (up to 8).
const SPAWNS = [
  { x: 70, y: 70, angle: Math.PI / 4 },
  { x: DESIGN_W - 70, y: 70, angle: (Math.PI * 3) / 4 },
  { x: DESIGN_W - 70, y: DESIGN_H - 70, angle: (-Math.PI * 3) / 4 },
  { x: 70, y: DESIGN_H - 70, angle: -Math.PI / 4 },
  { x: DESIGN_W / 2, y: 70, angle: Math.PI / 2 },
  { x: DESIGN_W - 70, y: DESIGN_H / 2, angle: Math.PI },
  { x: DESIGN_W / 2, y: DESIGN_H - 70, angle: -Math.PI / 2 },
  { x: 70, y: DESIGN_H / 2, angle: 0 },
].map((s) => ({ x: s.x * SCALE, y: s.y * SCALE, angle: s.angle }));

const MAPS = {
  maze: {
    id: "maze",
    name: "미로",
    // Every interior wall here is a standalone floating bar that never
    // touches another wall or the border, so there is always room to go
    // around it - this guarantees the map can't accidentally wall off a
    // pocket the way overlapping/interlocking segments previously did.
    walls: [
      ...borderWalls(),
      seg(230, 160, 230, 320),
      seg(670, 160, 670, 320),
      seg(230, 400, 230, 540),
      seg(670, 400, 670, 540),
      seg(350, 250, 550, 250),
      seg(350, 450, 550, 450),
      seg(450, 320, 450, 380),
    ],
    spawns: SPAWNS,
  },
  plain: {
    id: "plain",
    name: "평지",
    walls: [...borderWalls()],
    spawns: SPAWNS,
  },
  bunker: {
    id: "bunker",
    name: "벙커 아레나",
    walls: [
      ...borderWalls(),
      // four symmetric L-shaped bunkers giving cover and flanking lanes
      seg(230, 160, 230, 260),
      seg(230, 260, 330, 260),
      seg(670, 160, 670, 260),
      seg(570, 260, 670, 260),
      seg(230, 340, 230, 440),
      seg(230, 340, 330, 340),
      seg(670, 340, 670, 440),
      seg(570, 340, 670, 340),
      // small cross-shaped cover in the middle of the arena
      seg(450, 260, 450, 340),
      seg(410, 300, 490, 300),
    ],
    spawns: SPAWNS,
  },
};

const MAP_LIST = Object.values(MAPS).map((m) => ({ id: m.id, name: m.name }));

module.exports = { WORLD_W, WORLD_H, WALL_THICK, MAPS, MAP_LIST };
