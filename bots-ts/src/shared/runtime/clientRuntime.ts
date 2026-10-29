const { Collection } = require("discord.js") as typeof import("discord.js");
const { pruneMapByAge, pruneMapByMaxSize, ensureMapPruneInterval } = require("./mapPrune") as typeof import("./mapPrune");

const SNIPES_MAX_AGE_MS = Math.max(
  60_000,
  Number(process.env.VC_SNIPES_MAX_AGE_MS || 30 * 60 * 1000) || 30 * 60 * 1000,
);
const SNIPES_MAX_CHANNELS = Math.max(
  50,
  Number(process.env.VC_SNIPES_MAX_CHANNELS || 400) || 400,
);

function initializeCommandCollections(client?, { includeSnipes = false } = {}) {
  client.commands = new Collection();
  client.pcommands = new Collection();
  client.aliases = new Collection();
  client.buttons = new Collection();
  if (includeSnipes) {
    client.snipes = new Map();
    ensureMapPruneInterval("__vcSnipesPruneInterval", () => {
      const map = client?.snipes;
      if (!(map instanceof Map)) return;
      pruneMapByAge(map, {
        maxAgeMs: SNIPES_MAX_AGE_MS,
        getTs: (_key?, value?) => {
          const row = Array.isArray(value) ? value[0] : value;
          return Number(row?.createdTimestamp || row?.at || row?.ts || 0);
        },
      });
      pruneMapByMaxSize(map, SNIPES_MAX_CHANNELS);
    });
  }
}

export = { initializeCommandCollections };