#!/usr/bin/env node
process.chdir("/opt/bot/bots-ts");
const cfgMod = require("./src/Vinili/Config/config.js");
const cfg = cfgMod?.default || cfgMod;
const sw = cfg.starWarsEvent || null;
console.log("config.starWarsEvent", JSON.stringify(sw, null, 2));
console.log("env", {
  STARWARS_EVENT_PUBLIC: process.env.STARWARS_EVENT_PUBLIC || null,
  STARWARS_TEST_FORCE_LIVE: process.env.STARWARS_TEST_FORCE_LIVE || null,
  STARWARS_EVENT_ENABLED: process.env.STARWARS_EVENT_ENABLED || null,
  STARWARS_EVENT_PUBLIC_OPEN: process.env.STARWARS_EVENT_PUBLIC_OPEN || null,
});
const {
  resolveStarWarsEventConfig,
  isStarWarsPublicWindowOpen,
  isStarWarsEventLive,
  isStarWarsForceLiveOnTestGuild,
} = require("./archivio/starwars/src/Vinili/Utils/Eventi/starWarsEventConfig.js");
const IDs = require("./src/Vinili/Config/ids.js");
const client = { config: cfg };
const r = resolveStarWarsEventConfig(client);
console.log("resolved", {
  enabled: r.enabled,
  publicEnabled: r.publicEnabled,
  testGuildForceLive: r.testGuildForceLive,
  publicOpenDate: r.publicOpenDate,
  startDate: r.startDate,
});
console.log("guilds", IDs.guilds);
console.log("publicWindow", isStarWarsPublicWindowOpen(client));
console.log("liveNoGuild", isStarWarsEventLive(client));
console.log("liveMain", isStarWarsEventLive(client, new Date(), IDs.guilds.main));
console.log("liveTest", isStarWarsEventLive(client, new Date(), IDs.guilds.test));
console.log("forceTest", isStarWarsForceLiveOnTestGuild(client, IDs.guilds.test));
const hooks = require("./archivio/starwars/src/Vinili/Utils/Minigames/starWarsMinigameHooks.js");
console.log("liveForMg", hooks.isStarWarsEventLiveForMinigames(client));
console.log("liveForMgMain", hooks.isStarWarsEventLiveForMinigames(client, Date.now(), IDs.guilds.main));
console.log("liveForMgTest", hooks.isStarWarsEventLiveForMinigames(client, Date.now(), IDs.guilds.test));
console.log("channel", hooks.resolveStarWarsMinigameChannelId(client));
