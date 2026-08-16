/**
 * Sposta gli inviti MultiGuild permanenti sul canale partnership (solo testo/annunci).
 * Utile per guild già esistenti con invito creato su un canale vocale o generico.
 *
 * Usage (da root repo o /opt/bot):
 *   node Vinyls/Scripts/relocatePartnershipInvites.js           # dry-run
 *   node Vinyls/Scripts/relocatePartnershipInvites.js --apply   # applica
 *   node Vinyls/Scripts/relocatePartnershipInvites.js --apply --guild=123
 */
const fs = require("fs");
const path = require("path");
const Discord = require("discord.js");

const root = path.resolve(__dirname, "..");
const APPLY = process.argv.includes("--apply");
const ONLY_GUILD = (() => {
  const arg = process.argv.find((a) => a.startsWith("--guild="));
  if (!arg) return null;
  const id = arg.slice("--guild=".length).trim();
  return /^\d{16,22}$/.test(id) ? id : null;
})();

function loadEnv() {
  const candidates = [
    path.resolve(root, "../.env"),
    path.resolve("/opt/bot/.env"),
    path.resolve(process.cwd(), ".env"),
  ];
  const file = candidates.find((p) => fs.existsSync(p));
  if (!file) throw new Error("missing .env");
  for (const line of fs.readFileSync(file, "utf8").split(/\r?\n/)) {
    const t = line.trim();
    if (!t || t.startsWith("#") || !t.includes("=")) continue;
    const i = t.indexOf("=");
    const key = t.slice(0, i).trim();
    let val = t.slice(i + 1).trim();
    if (
      (val.startsWith('"') && val.endsWith('"')) ||
      (val.startsWith("'") && val.endsWith("'"))
    ) {
      val = val.slice(1, -1);
    }
    if (key && process.env[key] == null) process.env[key] = val;
  }
}

function needsRelocate(managed, cfg, channel) {
  const partnerCh = String(cfg?.partnershipsChannelId || "").trim();
  if (!partnerCh) return { need: false, reason: "no_partnership_channel" };

  const { isInviteEligibleTextChannel } = require("../MultiGuild/services/guildJoinAlertService");
  if (channel && !isInviteEligibleTextChannel(channel)) {
    return { need: true, reason: "current_channel_not_text" };
  }

  const managedCh = String(managed?.channelId || cfg?.invite?.channelId || "").trim();
  if (managedCh && managedCh !== partnerCh) {
    return { need: true, reason: "wrong_channel", from: managedCh, to: partnerCh };
  }

  if (!managed?.code && !cfg?.invite?.code) {
    return { need: true, reason: "missing_invite", to: partnerCh };
  }

  if (cfg?.invite?.code && String(cfg.invite.channelId || "") !== partnerCh) {
    return { need: true, reason: "stored_wrong_channel", from: cfg.invite.channelId, to: partnerCh };
  }

  return { need: false, reason: "ok" };
}

(async () => {
  loadEnv();
  const token = process.env.DISCORD_TOKEN || process.env.DISCORD_TOKEN_OFFICIAL;
  const mongoUri = process.env.MONGO_URL_LOCAL || process.env.MONGO_URL || process.env.MONGODB_URI;
  if (!token || !mongoUri) throw new Error("missing DISCORD_TOKEN / MONGO_URL");

  const mongoose = require("mongoose");
  await mongoose.connect(mongoUri, { maxPoolSize: 2 });

  const { getBotState } = require("../Utils/BotState/botStateStore");
  const {
    refreshPartnershipConfigCache,
    getPartnershipConfigSync,
  } = require("../MultiGuild/core/tenantPartnershipSettings");
  const { getManagedInvite } = require("../MultiGuild/services/guildJoinAlertService");
  const { ensurePartnershipChannelInvite } = require("../Services/Partner/partnershipInviteService");
  const { isViniliProtectedGuild } = require("../MultiGuild/core/viniliProtectedGuilds");

  await refreshPartnershipConfigCache();

  const managedMap = (await getBotState("multiGuildManagedInvites", {})) || {};
  const partnershipMap = (await getBotState("multiGuildPartnershipConfig.v1", {})) || {};
  const guildIds = new Set([
    ...Object.keys(managedMap || {}),
    ...Object.keys(partnershipMap || {}),
  ]);

  if (ONLY_GUILD) {
    guildIds.clear();
    guildIds.add(ONLY_GUILD);
  }

  const client = new Discord.Client({
    intents: [Discord.GatewayIntentBits.Guilds],
  });
  await client.login(token);
  await new Promise((r) => client.once("ready", r));

  console.log(
    `[relocatePartnershipInvites] mode=${APPLY ? "APPLY" : "DRY-RUN"} guilds=${guildIds.size}`,
  );

  let checked = 0;
  let relocated = 0;
  let skipped = 0;
  let failed = 0;

  for (const guildId of [...guildIds].sort()) {
    if (!/^\d{16,22}$/.test(guildId) || isViniliProtectedGuild(guildId)) {
      skipped += 1;
      continue;
    }

    await refreshPartnershipConfigCache().catch(() => null);
    const cfg = getPartnershipConfigSync(guildId);
    const managed = await getManagedInvite(guildId).catch(() => null);
    if (!cfg?.partnershipsChannelId) {
      skipped += 1;
      continue;
    }

    const guild =
      client.guilds.cache.get(guildId) ||
      (await client.guilds.fetch(guildId).catch(() => null));
    if (!guild) {
      console.log(`skip ${guildId} bot_not_in_guild`);
      skipped += 1;
      continue;
    }

    await guild.channels.fetch().catch(() => null);
    const currentChId = String(managed?.channelId || cfg?.invite?.channelId || "").trim();
    const currentChannel = currentChId
      ? guild.channels.cache.get(currentChId) ||
        (await guild.channels.fetch(currentChId).catch(() => null))
      : null;

    const plan = needsRelocate(managed, cfg, currentChannel);
    checked += 1;
    if (!plan.need) {
      skipped += 1;
      continue;
    }

    console.log(
      `${APPLY ? "APPLY" : "WOULD"} ${guildId} (${guild.name}) reason=${plan.reason}` +
        (plan.from ? ` from=${plan.from}` : "") +
        (plan.to ? ` to=${plan.to}` : "") +
        (managed?.code ? ` code=${managed.code}` : ""),
    );

    if (!APPLY) continue;

    try {
      const result = await ensurePartnershipChannelInvite(guild, cfg.partnershipsChannelId);
      if (!result?.ok) {
        console.log(`FAIL ${guildId} ${result?.reason || "unknown"}`);
        failed += 1;
        continue;
      }
      console.log(
        `OK ${guildId} source=${result.source} code=${result.invite?.code} channel=${result.invite?.channelId}`,
      );
      relocated += 1;
    } catch (err) {
      console.log(`FAIL ${guildId}`, err?.message || err);
      failed += 1;
    }
  }

  console.log(
    `[relocatePartnershipInvites] done checked=${checked} relocated=${relocated} skipped=${skipped} failed=${failed}`,
  );

  await client.destroy();
  await mongoose.disconnect();
  process.exit(failed ? 1 : 0);
})().catch((err) => {
  console.error(err);
  process.exit(1);
});
