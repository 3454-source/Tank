const tank = require("./tank");
const sword = require("./sword");
const reaction = require("./reaction");
const updown = require("./updown");

const GAMES = {
  [tank.id]: tank,
  [sword.id]: sword,
  [reaction.id]: reaction,
  [updown.id]: updown,
};

const DEFAULT_GAME_ID = tank.id;

const GAME_LIST = Object.values(GAMES).map((g) => ({
  id: g.id,
  name: g.name,
  usesMap: !!g.usesMap,
  settingsSchema: g.settingsSchema || [],
}));

module.exports = { GAMES, GAME_LIST, DEFAULT_GAME_ID };
