const MIN_DELAY_MS = 2000;
const MAX_DELAY_MS = 5000;
const MAX_WAIT_AFTER_GO_MS = 6000;

function defaultSettings() {
  return {};
}

function start(room) {
  const delay = MIN_DELAY_MS + Math.random() * (MAX_DELAY_MS - MIN_DELAY_MS);
  room.game = {
    phase: "waiting", // waiting -> go
    waitUntil: Date.now() + delay,
    goAt: null,
    deadline: null,
    results: new Map(), // socketId -> { early, ms }
    finished: false,
  };
  return {};
}

function onInput() {
  // no movement in this game
}

function finalize(room, ctx) {
  const g = room.game;
  if (g.finished) return;
  g.finished = true;

  const list = [...room.players.values()].map((p) => {
    const r = g.results.get(p.id) || { early: false, ms: null };
    return { id: p.id, name: p.name, ms: r.ms, early: r.early };
  });
  list.sort((a, b) => {
    if (a.ms === null && b.ms === null) return 0;
    if (a.ms === null) return 1;
    if (b.ms === null) return -1;
    return a.ms - b.ms;
  });
  const winner = list.find((r) => r.ms !== null);
  ctx.endRound(winner ? winner.id : null, { reactionResults: list });
}

function onAction(socketId, room, data, ctx) {
  const g = room.game;
  if (!g || g.finished) return;
  if (!data || data.type !== "click") return;
  if (g.results.has(socketId)) return;

  if (g.phase === "waiting") {
    g.results.set(socketId, { early: true, ms: null });
    ctx.io.to(room.code).emit("reactionEarly", { playerId: socketId });
  } else if (g.phase === "go") {
    g.results.set(socketId, { early: false, ms: ctx.now - g.goAt });
  } else {
    return;
  }

  if (g.phase === "go" && g.results.size >= room.players.size) {
    finalize(room, ctx);
  }
}

function tick(room, ctx) {
  const g = room.game;
  if (!g || g.finished) return;
  if (g.phase === "waiting" && ctx.now >= g.waitUntil) {
    g.phase = "go";
    g.goAt = ctx.now;
    g.deadline = ctx.now + MAX_WAIT_AFTER_GO_MS;
    ctx.io.to(room.code).emit("reactionGo");
  } else if (g.phase === "go" && ctx.now >= g.deadline) {
    finalize(room, ctx);
  }
}

module.exports = {
  id: "reaction",
  name: "반응속도 테스트",
  usesMap: false,
  realtime: false,
  settingsSchema: [],
  defaultSettings,
  start,
  tick,
  onInput,
  onAction,
};
