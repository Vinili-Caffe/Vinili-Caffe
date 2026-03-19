/**
 * Rimuove dal DB i documenti di utenti che non sono più nei server del bot.
 * Per default elabora TUTTE le guild in cui il bot è presente (come all'avvio del bot).
 * Usa la Discord REST API (no Gateway Intents).
 *
 * SICUREZZA: per default NON elimina nulla, solo conta. Per eliminare serve --confirm.
 *
 * Uso:
 *   node scripts/cleanup-db-users-not-in-server.js          → solo conteggio, tutte le guild
 *   node scripts/cleanup-db-users-not-in-server.js --confirm → esegue le eliminazioni
 *   GUILD_ID=xxx node scripts/cleanup-db-users-not-in-server.js --confirm → solo quella guild
 *
 * Richiede .env: DISCORD_TOKEN (o DISCORD_TOKEN_OFFICIAL), MONGO_URL.
 * Opzionale: GUILD_ID per limitare a un solo server (altrimenti tutti i server del bot).
 */
const path = require("path");
const confirm = process.argv.includes("--confirm");
const mongoose = require("mongoose");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });

const DISCORD_TOKEN = process.env.DISCORD_TOKEN || process.env.DISCORD_TOKEN_OFFICIAL;
const MONGO_URL =
  process.env.MONGO_URL_LOCAL ||
  process.env.MONGODB_URI_LOCAL ||
  process.env.MONGO_URL ||
  process.env.MONGODB_URI;

async function fetchAllGuildMemberIds(guildId, token) {
  const memberIds = new Set();
  let after = "0";
  const limit = 1000;
  const baseUrl = `https://discord.com/api/v10/guilds/${guildId}/members`;
  while (true) {
    const url = `${baseUrl}?limit=${limit}&after=${after}`;
    const res = await fetch(url, {
      headers: { Authorization: `Bot ${token}` },
    });
    if (!res.ok) {
      throw new Error(`Discord API ${res.status}: ${await res.text()}`);
    }
    const data = await res.json();
    if (!Array.isArray(data) || data.length === 0) break;
    for (const m of data) {
      const id = m.user?.id;
      if (id) memberIds.add(id);
    }
    if (data.length < limit) break;
    after = data[data.length - 1].user?.id || "0";
    if (!after) break;
  }
  return Array.from(memberIds);
}

async function fetchBotGuildIds(token) {
  const res = await fetch("https://discord.com/api/v10/users/@me/guilds", {
    headers: { Authorization: `Bot ${token}` },
  });
  if (!res.ok) throw new Error(`Discord API ${res.status}: ${await res.text()}`);
  const data = await res.json();
  return Array.isArray(data) ? data.map((g) => ({ id: g.id, name: g.name })) : [];
}

async function run() {
  if (!DISCORD_TOKEN) {
    console.error("Imposta DISCORD_TOKEN (o DISCORD_TOKEN_OFFICIAL) in .env");
    process.exit(1);
  }
  if (!MONGO_URL) {
    console.error("Imposta MONGO_URL in .env");
    process.exit(1);
  }

  const singleGuildId = process.env.GUILD_ID || null;
  let guilds;
  if (singleGuildId) {
    guilds = [{ id: singleGuildId, name: singleGuildId }];
    console.log("[cleanup] Modalità singola guild:", singleGuildId);
  } else {
    guilds = await fetchBotGuildIds(DISCORD_TOKEN);
    console.log("[cleanup] Guild in cui è il bot:", guilds.length);
  }
  if (!guilds.length) {
    console.log("[cleanup] Nessuna guild da elaborare.");
    return;
  }

  await mongoose.connect(MONGO_URL);
  const { runCleanupUsersNotInServer } = require("../Vinyls/Services/Community/cleanupUsersNotInServerService");
  const dryRun = !confirm;
  if (!confirm) {
    console.log("[cleanup] Modalità SICURA: nessuna eliminazione (manca --confirm).\n");
  }
  let grandTotal = 0;
  for (const g of guilds) {
    const memberIds = await fetchAllGuildMemberIds(g.id, DISCORD_TOKEN);
    const { total, details } = await runCleanupUsersNotInServer(g.id, memberIds, { dryRun });
    if (total > 0) {
      grandTotal += total;
      const label = g.name ? `${g.name} (${g.id})` : g.id;
      console.log(`[cleanup] ${label}: ${dryRun ? "da rimuovere" : "rimossi"} ${total}`);
      for (const d of details) {
        console.log(`  ${d.name}: ${d.count}`);
      }
    }
  }
  console.log("\n[cleanup] Totale documenti " + (dryRun ? "da rimuovere" : "rimossi") + ":", grandTotal);
  if (!confirm && grandTotal > 0) {
    console.log("\n[cleanup] Per eliminare davvero esegui: node scripts/cleanup-db-users-not-in-server.js --confirm");
  }
  await mongoose.disconnect();
}

run().catch((err) => {
  console.error(err);
  process.exit(1);
});