#!/usr/bin/env node
/**
 * Blacklist permanente Hogwarts + wipe galeoni/punti/shop/sorting/ruoli.
 *
 *   node Vinyls/Scripts/blacklistWipeHogwartsUser.js --user 1371740280063135908 --apply
 */
"use strict";

const fs = require("fs");
const path = require("path");

function loadEnv() {
  const candidates = ["/opt/bot/.env", path.resolve(__dirname, "../../.env")];
  for (const p of candidates) {
    if (!fs.existsSync(p)) continue;
    for (const line of fs.readFileSync(p, "utf8").split(/\r?\n/)) {
      const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
      if (!m) continue;
      let val = m[2].trim();
      if ((val.startsWith('"') && val.endsWith('"')) || (val.startsWith("'") && val.endsWith("'"))) {
        val = val.slice(1, -1);
      }
      if (!process.env[m[1]]) process.env[m[1]] = val;
    }
    break;
  }
}

function argValue(name) {
  const idx = process.argv.indexOf(name);
  if (idx < 0 || idx + 1 >= process.argv.length) return "";
  return String(process.argv[idx + 1] || "").trim();
}

async function main() {
  loadEnv();
  const userId = argValue("--user");
  const apply = process.argv.includes("--apply");
  const note = argValue("--note") || "Blacklist evento Hogwarts (staff)";
  if (!userId) {
    throw new Error("Uso: node Vinyls/Scripts/blacklistWipeHogwartsUser.js --user <id> --apply");
  }
  if (!apply) {
    console.log("Dry-run: passa --apply per eseguire blacklist + wipe.");
    console.log({ userId, note });
    return;
  }

  const token =
    process.env.DISCORD_TOKEN ||
    process.env.DISCORD_TOKEN_OFFICIAL ||
    process.env.TOKEN ||
    process.env.VINYLS_TOKEN;
  const mongoUrl =
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGO_URI_LOCAL ||
    process.env.MONGO_URL ||
    process.env.MONGODB_URI;
  if (!token) throw new Error("missing bot token");
  if (!mongoUrl) throw new Error("missing mongo");

  const mongoose = require("mongoose");
  await mongoose.connect(mongoUrl);

  const { Client, GatewayIntentBits } = require("discord.js");
  const vinylsConfig = require("../config.json");
  const IDs = require("../Utils/Config/ids");
  const { blacklistAndWipeHogwartsUser } = require("../Services/Community/hogwartsEventBlacklistWipeService");
  const { getGringottBalance } = require("../Services/Community/gringottService");
  const { SiteDocument, SITE_DOCUMENT_TYPE, ActivityUserProfile } = require("../Schemas/Community/communitySchemas");

  const client = new Client({
    intents: [GatewayIntentBits.Guilds, GatewayIntentBits.GuildMembers],
  });
  client.token = token;
  client.rest.setToken(token);
  client.config = vinylsConfig;

  const guildId = String(client.config?.mainGuildId || IDs.guilds?.main || "").trim();
  const eventKey = String(client.config?.hogwartsEvent?.eventKey || "hogwarts_summer_2026").trim();

  const beforeBal = await getGringottBalance(guildId, userId, eventKey).catch(() => null);
  const beforeProfile = await ActivityUserProfile.findOne({ guildId, userId })
    .select("profile.events.hogwarts")
    .lean()
    .catch(() => null);
  const beforePoints = await SiteDocument.findOne({
    docType: SITE_DOCUMENT_TYPE.HOGWARTS_HOUSE_POINTS,
    guildId,
    userId: "__event__",
    dedupeKey: eventKey,
  })
    .select(`rawWebhook.byMember.${userId}`)
    .lean()
    .catch(() => null);

  console.log(
    "BEFORE",
    JSON.stringify(
      {
        balance: beforeBal?.balance || 0,
        hasHogwartsProfile: Boolean(beforeProfile?.profile?.events?.hogwarts),
        memberPoints: beforePoints?.rawWebhook?.byMember?.[userId] || null,
      },
      null,
      2,
    ),
  );

  await client.login(token);
  const result = await blacklistAndWipeHogwartsUser(client, userId, {
    guildId,
    eventKey,
    addedBy: "script:blacklistWipeHogwartsUser",
    note,
  });
  console.log("RESULT", JSON.stringify(result, null, 2));

  const afterBal = await getGringottBalance(guildId, userId, eventKey).catch(() => null);
  const afterProfile = await ActivityUserProfile.findOne({ guildId, userId })
    .select("profile.events.hogwarts")
    .lean()
    .catch(() => null);
  const afterPoints = await SiteDocument.findOne({
    docType: SITE_DOCUMENT_TYPE.HOGWARTS_HOUSE_POINTS,
    guildId,
    userId: "__event__",
    dedupeKey: eventKey,
  })
    .select(`rawWebhook.byMember.${userId}`)
    .lean()
    .catch(() => null);
  const { isUserHogwartsEventBlacklisted } = require("../Services/Community/hogwartsEventBlacklistService");

  console.log(
    "AFTER",
    JSON.stringify(
      {
        blacklisted: await isUserHogwartsEventBlacklisted(userId),
        balance: afterBal?.balance || 0,
        hasHogwartsProfile: Boolean(afterProfile?.profile?.events?.hogwarts),
        memberPoints: afterPoints?.rawWebhook?.byMember?.[userId] || null,
      },
      null,
      2,
    ),
  );

  if (!result?.ok) process.exitCode = 1;
  await client.destroy().catch(() => null);
  await mongoose.disconnect().catch(() => null);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
