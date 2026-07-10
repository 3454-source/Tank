const WORLD_W = 900;
const WORLD_H = 600;
const WALL_THICK = 12;

function seg(x1, y1, x2, y2) {
  return { x1, y1, x2, y2 };
}

function borderWalls() {
  return [
    seg(0, 0, WORLD_W, 0),
    seg(WORLD_W, 0, WORLD_W, WORLD_H),
    seg(WORLD_W, WORLD_H, 0, WORLD_H),
    seg(0, WORLD_H, 0, 0),
  ];
}

// Corner spawn points, facing roughly toward the center of the arena.
const SPAWNS = [
  { x: 70, y: 70, angle: Math.PI / 4 },
  { x: WORLD_W - 70, y: 70, angle: (Math.PI * 3) / 4 },
  { x: WORLD_W - 70, y: WORLD_H - 70, angle: (-Math.PI * 3) / 4 },
  { x: 70, y: WORLD_H - 70, angle: -Math.PI / 4 },
];

const MAPS = {
  open: {
    id: "open",
    name: "오픈 아레나",
    walls: [
      ...borderWalls(),
      seg(350, 300, 550, 300),
      seg(300, 150, 300, 260),
      seg(600, 340, 600, 450),
    ],
    spawns: SPAWNS,
  },
  cross: {
    id: "cross",
    name: "교차로",
    walls: [
      ...borderWalls(),
      seg(450, 20, 450, 220),
      seg(450, 380, 450, 580),
      seg(20, 300, 380, 300),
      seg(520, 300, 880, 300),
    ],
    spawns: SPAWNS,
  },
  maze: {
    id: "maze",
    name: "미로",
    walls: [
      ...borderWalls(),
      seg(200, 20, 200, 200),
      seg(200, 200, 400, 200),
      seg(700, 20, 700, 200),
      seg(500, 200, 700, 200),
      seg(100, 320, 320, 320),
      seg(580, 320, 800, 320),
      seg(350, 150, 350, 450),
      seg(550, 150, 550, 450),
      seg(200, 400, 200, 580),
      seg(700, 400, 700, 580),
      seg(320, 460, 580, 460),
    ],
    spawns: SPAWNS,
  },
};

const MAP_LIST = Object.values(MAPS).map((m) => ({ id: m.id, name: m.name }));

module.exports = { WORLD_W, WORLD_H, WALL_THICK, MAPS, MAP_LIST };
