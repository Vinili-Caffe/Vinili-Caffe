#!/usr/bin/env node
/* ticketListDedupeSrv1 cleanup: mark mirror/import dupes listHidden once. */
"use strict";

const path = require("node:path");
const fs = require("node:fs");

const BOT_ROOT = process.env.VC_BOT_ROOT || "/opt/bot";
process.chdir(BOT_ROOT);

const envPath = path.join(BOT_ROOT, ".env");
if (fs.existsSync(envPath)) {
  require("dotenv").config({ path: envPath });
}

const mongoose = require("mongoose");
const { SiteWebTicket } = require(path.join(BOT_ROOT, "Vinyls/Schemas/Web/siteWebTicketSchemas"));

function ticketPreviewCoreSrv(doc) {
  let prev = String(doc?.lastMessagePreview || "")
    .toLowerCase()
    .replace(/\[embed[^\]]*\]/gi, " ")
    .replace(/\b(?:titolo|title|descrizione|description|footer|fields?)\s*:/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/[*_#`•·:]+/g, " ")
    .replace(/@\S+/g, "@")
    .replace(/nessun contenuto[^\s]*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return prev.slice(0, 28);
}

function ticketEventCoreSrv(doc) {
  const p = String(doc?.lastMessagePreview || "").toLowerCase();
  if (/__chiusura__|chiusura/.test(p) && /confermato|verr[aà] chiuso|verra chiuso/.test(p)) {
    return "ev:close_confirm";
  }
  if (/ticket claimato|__ticket claimato__/.test(p)) return "ev:claim";
  return "";
}

function ticketSubjectCoreSrv(doc) {
  return String(doc?.subject || doc?.channelName || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 36);
}

function ticketActivityMsSrv(doc) {
  const raw = doc?.lastMessageAt || doc?.updatedAt || doc?.createdAt;
  const ms = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(ms) ? ms : 0;
}

function ticketDedupeScoreSrv(doc) {
  const msgs = Math.max(0, Number(doc?.messageCount) || 0);
  const prev = ticketPreviewCoreSrv(doc);
  const prevScore = prev && !/nessun contenuto/i.test(prev) ? 1 : 0;
  const num = Math.max(0, Number(doc?.ticketNumber) || 0);
  return msgs * 1e12 + prevScore * 1e10 + num * 1e6 + ticketActivityMsSrv(doc);
}

function ticketsAreImportDupSrv(a, b) {
  if (!a || !b) return false;
  if (String(a.userId || "") !== String(b.userId || "")) return false;
  if (String(a.category || "").toLowerCase() !== String(b.category || "").toLowerCase()) return false;
  if (Math.abs(ticketActivityMsSrv(a) - ticketActivityMsSrv(b)) > 60_000) return false;
  const ea = ticketEventCoreSrv(a);
  const eb = ticketEventCoreSrv(b);
  if (ea && eb && ea === eb) return true;
  const pa = ticketPreviewCoreSrv(a);
  const pb = ticketPreviewCoreSrv(b);
  if (pa && pb && pa === pb) return true;
  const sa = ticketSubjectCoreSrv(a);
  const sb = ticketSubjectCoreSrv(b);
  return Boolean(sa && sb && sa === sb);
}

async function main() {
  const uri =
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGODB_URI_LOCAL ||
    process.env.MONGO_URL ||
    process.env.MONGODB_URI;
  if (!uri) throw new Error("missing MONGO_URL");
  await mongoose.connect(uri, { maxPoolSize: 4, serverSelectionTimeoutMS: 15000 });

  const rows = await SiteWebTicket.find({ listHidden: { $ne: true } })
    .select(
      "_id guildId userId category subject channelName lastMessagePreview lastMessageAt updatedAt createdAt messageCount ticketNumber",
    )
    .lean();
  console.log("OPEN_LIST", rows.length);

  const byGuild = new Map();
  for (const r of rows) {
    const g = String(r.guildId || "");
    if (!byGuild.has(g)) byGuild.set(g, []);
    byGuild.get(g).push(r);
  }

  let hidden = 0;
  const ops = [];
  for (const [, group] of byGuild) {
    const kept = [];
    for (const t of group) {
      let hit = -1;
      for (let j = 0; j < kept.length; j += 1) {
        if (!ticketsAreImportDupSrv(kept[j], t)) continue;
        hit = j;
        break;
      }
      if (hit < 0) {
        kept.push(t);
        continue;
      }
      let loser = t;
      let winner = kept[hit];
      if (ticketDedupeScoreSrv(t) > ticketDedupeScoreSrv(kept[hit])) {
        loser = kept[hit];
        winner = t;
        kept[hit] = t;
      }
      ops.push({
        updateOne: {
          filter: { _id: loser._id, listHidden: { $ne: true } },
          update: { $set: { listHidden: true, duplicateOf: winner._id } },
        },
      });
      hidden += 1;
    }
  }

  if (ops.length) {
    const res = await SiteWebTicket.bulkWrite(ops, { ordered: false });
    console.log("BULK", JSON.stringify(res?.result || res));
  } else {
    console.log("BULK none");
  }
  console.log("HIDDEN_MARKED", hidden);
  console.log("MARKER cleanupWebTicketListHidden1");
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error("FAIL", err?.stack || err);
  process.exit(1);
});
