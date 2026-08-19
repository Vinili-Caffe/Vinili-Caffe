/* eslint-disable no-console */
/**
 * Rimuove Double Booster dato per errore su un primo boost
 * (embed "una volta", native senza "2 volte").
 * Usage: node Vinyls/Scripts/correctFalseDoubleBoosterNow.js
 */
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

async function main() {
  loadEnv();
  const mongoose = require("mongoose");
  const mongoUrl =
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGO_URI_LOCAL ||
    process.env.MONGO_URL ||
    process.env.MONGODB_URI;
  if (!mongoUrl) throw new Error("missing mongo");
  await mongoose.connect(mongoUrl);

  const { Client, GatewayIntentBits, PermissionsBitField } = require("discord.js");
  const IDs = require("../Utils/Config/ids");
  const extras = require("../Events/guildMemberUpdate");
  const { setAnnouncedBoostSlots, persistAnnouncedBoostSlotsToDb } = require("../Utils/Community/boostSlotAnnounceTracker");
  const { ActivityUserProfile } = require("../Schemas/Community/communitySchemas");

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
  const boostChannelId = String(IDs.channels.supporters || "");
  const channel = boostChannelId
    ? await guild.channels.fetch(boostChannelId).catch(() => null)
    : null;
  const lookbackMs = 24 * 60 * 60 * 1000;
  const minTs = Date.now() - lookbackMs;
  const me = guild.members.me;
  const role = guild.roles.cache.get(doubleId);
  const canManage =
    me?.permissions?.has(PermissionsBitField.Flags.ManageRoles) &&
    role &&
    role.position < me.roles.highest.position;

  const holders = [...guild.members.cache.values()].filter(
    (m) => !m.user?.bot && m.roles.cache.has(doubleId) && m.premiumSinceTimestamp,
  );
  console.log("double_holders", holders.length);
  let fixed = 0;
  for (const member of holders) {
    const premiumAge = Date.now() - Number(member.premiumSinceTimestamp || 0);
    if (premiumAge > lookbackMs) continue;
    const nativeSlots = await extras
      .countNativeBoostSlotsInRecentMessages(guild, channel || guild.systemChannel, member.id, {
        sinceMs: minTs,
        perChannelLimit: 80,
      })
      .catch(() => 0);
    const embeds = channel?.isTextBased?.()
      ? await extras
          .countRecentBotBoostAnnouncesForUser(channel, member.id, { sinceMs: minTs, limit: 80 })
          .catch(() => 0)
      : 0;
    const looksSingle = Number(nativeSlots || 0) < 2 && Number(embeds || 0) < 2;
    console.log("check", member.user.username, member.id, {
      nativeSlots,
      embeds,
      premiumAgeMin: Math.round(premiumAge / 60000),
      looksSingle,
    });
    if (!looksSingle) continue;
    setAnnouncedBoostSlots(guild.id, member.id, 1);
    await persistAnnouncedBoostSlotsToDb(guild.id, member.id).catch(() => null);
    await ActivityUserProfile.findOneAndUpdate(
      { guildId: String(guild.id), userId: String(member.id) },
      { $set: { "profile.serverBoostAnnouncedSlotCount": 1 } },
    ).catch(() => null);
    if (canManage) {
      const ok = await member.roles.remove(doubleId).then(() => true).catch(() => false);
      console.log("removed_role", member.id, ok);
    }
    fixed += 1;
  }
  console.log("fixed", fixed);
  await client.destroy();
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
