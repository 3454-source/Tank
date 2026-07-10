const SETTINGS_SCHEMA = [
  { key: "maxNumber", label: "숫자 범위 (1~N)", min: 10, max: 1000, step: 10, default: 100, unit: "" },
];

function defaultSettings() {
  const s = {};
  for (const f of SETTINGS_SCHEMA) s[f.key] = f.default;
  return s;
}

function start(room) {
  const maxNumber = room.settings.updown.maxNumber;
  const secret = 1 + Math.floor(Math.random() * maxNumber);
  room.game = {
    maxNumber,
    secret,
    guesses: new Map(), // socketId -> count
    finished: false,
  };
  return { maxNumber };
}

function onInput() {
  // no movement in this game
}

function onAction(socketId, room, data, ctx) {
  const g = room.game;
  if (!g || g.finished) return;
  if (!data || data.type !== "guess") return;
  const n = Number(data.value);
  if (!Number.isFinite(n)) return;
  const guess = Math.round(n);

  g.guesses.set(socketId, (g.guesses.get(socketId) || 0) + 1);

  if (guess === g.secret) {
    g.finished = true;
    ctx.endRound(socketId, {
      secret: g.secret,
      guessCounts: [...room.players.values()].map((p) => ({
        id: p.id,
        name: p.name,
        guesses: g.guesses.get(p.id) || 0,
      })),
    });
    return;
  }

  ctx.io.to(socketId).emit("updownFeedback", { guess, hint: guess < g.secret ? "up" : "down" });
}

function tick() {
  // purely event-driven, nothing to do per tick
}

module.exports = {
  id: "updown",
  name: "업다운 맞추기",
  usesMap: false,
  realtime: false,
  settingsSchema: SETTINGS_SCHEMA,
  defaultSettings,
  start,
  tick,
  onInput,
  onAction,
};
