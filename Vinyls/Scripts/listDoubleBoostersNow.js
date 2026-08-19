/* eslint-disable no-console */
const fs = require("fs");
const path = require("path");
function loadEnv() {
  for (const p of ["/opt/bot/.env", path.join(__dirname, "..", "..", ".env")]) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      let v = m[2].trim();
      if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
      if (!process.env[m[1]]) process.env[m[1]] = v;
    }
    break;
  }
}
(async () => {
  loadEnv();
  const mongoose = require("mongoose");
  const mongoUrl =
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGO_URI_LOCAL ||
    process.env.MONGO_URL ||
    process.env.MONGODB_URI;
  if (mongoUrl) await mongoose.connect(mongoUrl);
  const { Client, GatewayIntentBits } = require("discord.js");
  const IDs = require("../Utils/Config/ids");
  const extras = require("../Events/guildMemberUpdate");
  const { getAnnouncedBoostSlots, ensureBoostSlotsSynced } = require("../Utils/Community/boostSlotAnnounceTracker");
  const client = new Client({
    intents: [
      GatewayIntentBits.Guilds,
      GatewayIntentBits.GuildMembers,
      GatewayIntentBits.GuildMessages,
      GatewayIntentBits.MessageContent,
    ],
  });
  await client.login(process.env.DISCORD_TOKEN || process.env.DISCORD_TOKEN_OFFICIAL);
  await new Promise((r) => client.once("ready", r));
  const guild = await client.guilds.fetch(IDs.guilds.main);
  await guild.members.fetch().catch(() => null);
  const doubleId = String(IDs.roles.DoubleBooster || "");
  const ch = await guild.channels.fetch(String(IDs.channels.supporters)).catch(() => null);
  const rows = [...guild.members.cache.values()]
    .filter((m) => !m.user.bot && m.roles.cache.has(doubleId))
    .sort((a, b) => Number(b.premiumSinceTimestamp || 0) - Number(a.premiumSinceTimestamp || 0));
  console.log("holders", rows.length);
  for (const m of rows.slice(0, 8)) {
    await ensureBoostSlotsSynced(guild.id, m.id).catch(() => null);
    console.log("holder", {
      id: m.id,
      username: m.user.username,
      global: m.user.globalName,
      premiumAgoMin: m.premiumSinceTimestamp ? Math.round((Date.now() - m.premiumSinceTimestamp) / 60000) : null,
      dbSlots: getAnnouncedBoostSlots(guild.id, m.id),
    });
  }
  const hits = [...guild.members.cache.values()].filter((m) => {
    const blob = `${m.user.username} ${m.user.globalName || ""} ${m.nickname || ""}`;
    return /haise|hai\._se|hai\./i.test(blob);
  });
  console.log("nameHits", hits.length);
  for (const m of hits) {
    await ensureBoostSlotsSynced(guild.id, m.id).catch(() => null);
    const nativeSlots = ch
      ? await extras
          .countNativeBoostSlotsInRecentMessages(guild, ch, m.id, {
            sinceMs: Date.now() - 24 * 60 * 60 * 1000,
            perChannelLimit: 80,
          })
          .catch(() => 0)
      : 0;
    const embeds = ch
      ? await extras
          .countRecentBotBoostAnnouncesForUser(ch, m.id, {
            sinceMs: Date.now() - 24 * 60 * 60 * 1000,
            limit: 80,
          })
          .catch(() => 0)
      : 0;
    console.log("hit", {
      id: m.id,
      username: m.user.username,
      global: m.user.globalName,
      hasDouble: m.roles.cache.has(doubleId),
      premiumAgoMin: m.premiumSinceTimestamp
        ? Math.round((Date.now() - m.premiumSinceTimestamp) / 60000)
        : null,
      dbSlots: getAnnouncedBoostSlots(guild.id, m.id),
      nativeSlots,
      embeds,
    });
  }
  await client.destroy();
  if (mongoUrl) await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
