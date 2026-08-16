#!/usr/bin/env node
/**
 * Elimina TUTTI i ticket esistenti (Discord + web) e i relativi canali aperti.
 *
 *   node Vinyls/Scripts/purgeAllTickets.js --apply
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

function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

async function main() {
  loadEnv();
  const apply = process.argv.includes("--apply");
  const mongoUrl =
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGO_URI_LOCAL ||
    process.env.MONGO_URL ||
    process.env.MONGODB_URI;
  const token =
    process.env.DISCORD_TOKEN ||
    process.env.DISCORD_TOKEN_OFFICIAL ||
    process.env.TOKEN ||
    process.env.VINYLS_TOKEN;
  if (!mongoUrl) throw new Error("missing mongo");
  if (!token) throw new Error("missing bot token");

  const mongoose = require("mongoose");
  await mongoose.connect(mongoUrl);
  const db = mongoose.connection.db;

  const buckets = await db
    .collection("guildfeaturebuckets")
    .find({}, { projection: { guildId: 1, "tickets._id": 1, "tickets.channelId": 1, "tickets.open": 1, "tickets.ticketNumber": 1 } })
    .toArray();

  const channelIds = new Set();
  let bucketTicketCount = 0;
  let openCount = 0;
  for (const b of buckets) {
    const tickets = Array.isArray(b.tickets) ? b.tickets : [];
    bucketTicketCount += tickets.length;
    for (const t of tickets) {
      const open = t.open === true || t.open === 1 || t.open === "1" || t.open === "true";
      if (open) openCount += 1;
      const ch = String(t.channelId || "").trim();
      // Solo canali di ticket ancora aperti: i chiusi di solito non esistono più.
      if (open && /^\d{16,22}$/.test(ch)) channelIds.add(ch);
    }
  }

  const legacy = await db.collection("tickets").find({}, { projection: { channelId: 1, open: 1 } }).toArray();
  let legacyOpen = 0;
  for (const t of legacy) {
    const open = t.open === true || t.open === 1 || t.open === "1" || t.open === "true";
    if (open) legacyOpen += 1;
    const ch = String(t.channelId || "").trim();
    if (open && /^\d{16,22}$/.test(ch)) channelIds.add(ch);
  }

  const webCount = await db.collection("sitewebtickets").countDocuments().catch(() => 0);
  const webMsgCount = await db.collection("sitewebticketmessages").countDocuments().catch(() => 0);

  console.log(
    JSON.stringify(
      {
        apply,
        bucketTicketCount,
        openInBuckets: openCount,
        legacyTicketCount: legacy.length,
        legacyOpen,
        webTickets: webCount,
        webMessages: webMsgCount,
        uniqueChannels: channelIds.size,
      },
      null,
      2,
    ),
  );

  if (!apply) {
    console.log("Dry-run. Passa --apply per eliminare canali + documenti.");
    await mongoose.disconnect();
    return;
  }

  const { Client, GatewayIntentBits, Routes } = require("discord.js");
  const client = new Client({ intents: [GatewayIntentBits.Guilds] });
  client.token = token;
  client.rest.setToken(token);
  await client.login(token);

  let channelsDeleted = 0;
  let channelsFailed = 0;
  const channelList = [...channelIds];
  for (let i = 0; i < channelList.length; i += 1) {
    const id = channelList[i];
    try {
      await client.rest.delete(Routes.channel(id), {
        reason: "Purge all tickets (staff)",
      });
      channelsDeleted += 1;
    } catch (err) {
      channelsFailed += 1;
      const code = err?.code || err?.status || err?.rawError?.code;
      if (code !== 10003) {
        console.warn("channel delete fail", id, code, err?.message || err);
      }
    }
    if ((i + 1) % 5 === 0) await sleep(1200);
    else await sleep(350);
  }

  const bucketClear = await db.collection("guildfeaturebuckets").updateMany({}, { $set: { tickets: [] } });
  const legacyDel = await db.collection("tickets").deleteMany({});
  const webDel = await db.collection("sitewebtickets").deleteMany({});
  const webMsgDel = await db.collection("sitewebticketmessages").deleteMany({});
  const webCtrDel = await db.collection("sitewebticketcounters").deleteMany({});

  console.log(
    JSON.stringify(
      {
        channelsDeleted,
        channelsFailed,
        bucketsCleared: bucketClear.modifiedCount,
        legacyDeleted: legacyDel.deletedCount,
        webDeleted: webDel.deletedCount,
        webMessagesDeleted: webMsgDel.deletedCount,
        webCountersDeleted: webCtrDel.deletedCount,
      },
      null,
      2,
    ),
  );

  await client.destroy().catch(() => null);
  await mongoose.disconnect().catch(() => null);
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});
