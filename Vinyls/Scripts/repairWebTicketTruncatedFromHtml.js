/**
 * Ripara messaggi web ticket tagliati con …[troncato] recuperando il testo
 * completo dai transcript HTML Discord (local_transcripts).
 *
 * Uso (da /opt/bot/Vinyls):
 *   node Scripts/repairWebTicketTruncatedFromHtml.js
 *   node Scripts/repairWebTicketTruncatedFromHtml.js --dry
 */
"use strict";

const fs = require("fs");
const path = require("path");

for (const line of fs.readFileSync(path.resolve(__dirname, "../../.env"), "utf8").split(/\r?\n/)) {
  const m = line.match(/^\s*([A-Za-z_][A-Za-z0-9_]*)\s*=\s*(.*)$/);
  if (!m) continue;
  let v = m[2].trim();
  if ((v.startsWith('"') && v.endsWith('"')) || (v.startsWith("'") && v.endsWith("'"))) v = v.slice(1, -1);
  if (!process.env[m[1]]) process.env[m[1]] = v;
}

const mongoose = require("mongoose");

const DRY = process.argv.includes("--dry");
const GUILD_ID = String(process.env.MAIN_GUILD_ID || "1329080093599076474").trim();

function stripHtml(s) {
  return String(s || "")
    .replace(/<br\s*\/?>/gi, "\n")
    .replace(/<\/p>/gi, "\n")
    .replace(/<\/div>/gi, "\n")
    .replace(/<[^>]+>/g, "")
    .replace(/&gt;/g, ">")
    .replace(/&lt;/g, "<")
    .replace(/&amp;/g, "&")
    .replace(/&quot;/g, '"')
    .replace(/&#39;/g, "'")
    .replace(/&nbsp;/g, " ")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

function parseTranscriptHtml(htmlPath) {
  if (!htmlPath || !fs.existsSync(htmlPath)) return [];
  const html = fs.readFileSync(htmlPath, "utf8");
  const arts = [...html.matchAll(/<article class="msg">([\s\S]*?)<\/article>/gi)];
  const out = [];
  for (const m of arts) {
    const block = m[1] || "";
    const author = String((block.match(/class="author"[^>]*>([^<]+)/i) || [])[1] || "").trim();
    const body = (block.match(/class="content"[^>]*>([\s\S]*?)<\/div>/i) || [])[1] || "";
    const text = stripHtml(body);
    if (!text) continue;
    out.push({ author, content: text.slice(0, 8000) });
  }
  return out;
}

function normalizeForMatch(s) {
  return String(s || "")
    .replace(/…\s*\[troncato\]\s*$/i, "")
    .replace(/\[\s*troncato\s*\]/gi, "")
    .replace(/[*_`~|>]+/g, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function findBestHtmlMatch(truncated, htmlMsgs) {
  const needle = normalizeForMatch(truncated);
  if (needle.length < 32) return null;
  const prefixLen = Math.min(120, Math.max(48, Math.floor(needle.length * 0.35)));
  const prefix = needle.slice(0, prefixLen);
  const midStart = Math.max(0, Math.floor(needle.length * 0.35));
  const mid = needle.slice(midStart, midStart + Math.min(100, needle.length - midStart));
  let best = null;
  let bestScore = 0;
  for (const row of htmlMsgs) {
    const hay = normalizeForMatch(row.content);
    if (!hay) continue;
    if (hay === needle) return row;
    let score = 0;
    if (hay.startsWith(prefix)) score += prefix.length + 50;
    else if (hay.includes(prefix)) score += prefix.length;
    if (mid.length >= 24 && hay.includes(mid)) score += mid.length;
    if (hay.length > needle.length + 3) score += 10;
    if (score > bestScore && hay.length >= needle.length) {
      best = row;
      bestScore = score;
    }
  }
  // soglia minima: almeno un pezzo significativo trovato
  if (bestScore < 40) return null;
  return best;
}

(async () => {
  await mongoose.connect(process.env.MONGO_URL_LOCAL || process.env.MONGO_URL || process.env.MONGODB_URI);
  const db = mongoose.connection.db;
  const buckets = db.collection("guildfeaturebuckets");
  const tickets = db.collection("sitewebtickets");
  const msgs = db.collection("sitewebticketmessages");

  const htmlByNumber = new Map();
  const cursor = buckets.find({ guildId: GUILD_ID }, { projection: { tickets: 1 } });
  while (await cursor.hasNext()) {
    const doc = await cursor.next();
    for (const t of doc.tickets || []) {
      const num = Number(t.ticketNumber);
      const htmlPath = String(t.transcriptHtmlPath || "").trim();
      if (!num || !htmlPath) continue;
      htmlByNumber.set(num, htmlPath);
    }
  }
  console.log("discordTicketsWithHtml", htmlByNumber.size);

  const truncated = await msgs
    .find({ guildId: GUILD_ID, content: /\[troncato\]/i })
    .project({ _id: 1, ticketId: 1, content: 1, authorName: 1 })
    .toArray();
  console.log("truncatedMessages", truncated.length);

  const ticketNums = new Map();
  const ticketIds = [...new Set(truncated.map((m) => String(m.ticketId)))];
  if (ticketIds.length) {
    const oids = ticketIds.filter((id) => mongoose.isValidObjectId(id)).map((id) => new mongoose.Types.ObjectId(id));
    const rows = await tickets.find({ _id: { $in: oids } }).project({ ticketNumber: 1 }).toArray();
    for (const r of rows) ticketNums.set(String(r._id), Number(r.ticketNumber) || 0);
  }

  const htmlCache = new Map();
  let fixed = 0;
  let skippedNoHtml = 0;
  let skippedNoMatch = 0;

  for (const m of truncated) {
    const num = ticketNums.get(String(m.ticketId)) || 0;
    const htmlPath = htmlByNumber.get(num);
    if (!htmlPath) {
      skippedNoHtml += 1;
      continue;
    }
    if (!htmlCache.has(htmlPath)) htmlCache.set(htmlPath, parseTranscriptHtml(htmlPath));
    const htmlMsgs = htmlCache.get(htmlPath) || [];
    const match = findBestHtmlMatch(m.content, htmlMsgs);
    if (!match || !match.content) {
      skippedNoMatch += 1;
      continue;
    }
    const next = String(match.content).slice(0, 8000);
    if (normalizeForMatch(next) === normalizeForMatch(m.content)) {
      skippedNoMatch += 1;
      continue;
    }
    if (!DRY) {
      await msgs.updateOne({ _id: m._id }, { $set: { content: next } });
    }
    fixed += 1;
    if (fixed <= 8 || Number(num) === 1332) {
      console.log("fixed", { ticketNumber: num, from: String(m.content).length, to: next.length, author: m.authorName });
    }
  }

  console.log({ dry: DRY, fixed, skippedNoHtml, skippedNoMatch });
  await mongoose.disconnect();
})().catch((e) => {
  console.error(e);
  process.exit(1);
});
