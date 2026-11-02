const COFFEE_PREFIX_COMMAND_NAMES = new Set([
  "join",
  "leave",
  "set",
  "voices",
  "play",
  "pause",
  "resume",
  "stop",
  "skip",
  "next",
  "previous",
  "queue",
  "now",
  "volume",
  "shuffle",
  "clear",
  "repeat",
  "restart",
  "rewind",
  "lyrics",
  "upcoming",
  "requested",
]);

function isCoffeePrefixCommandToken(token?) {
  const t = String(token || "")
    .trim()
    .toLowerCase();
  return COFFEE_PREFIX_COMMAND_NAMES.has(t);
}

export = {
  COFFEE_PREFIX_COMMAND_NAMES,
  isCoffeePrefixCommandToken,
};