/**
 * Aggrega i documenti legacy `mod_case` in `mod_case_user` (array `cases` per guild+user).
 *
 * Uso:
 *   node scripts/migrate-mod-case-to-compact.js           → dry-run (conteggi)
 *   node scripts/migrate-mod-case-to-compact.js --write   → esegue upsert ModCaseUser
 *   node scripts/migrate-mod-case-to-compact.js --write --guild=GUILD_ID
 *
 * Richiede .env: MONGO_URL (o MONGO_URL_LOCAL). Opzionale: MOD_CASE_MAX_CASES_PER_USER (default 800).
 */
const path = require("path");
require("dotenv").config({ path: path.resolve(__dirname, "../.env") });
const mongoose = require("mongoose");
const { ModCase, ModCaseUser } = require("../Vinyls/Schemas/Moderation/moderationSchemas");

const MONGO_URL =
  process.env.MONGO_URL_LOCAL ||
  process.env.MONGODB_URI_LOCAL ||
  process.env.MONGO_URL ||
  process.env.MONGODB_URI;
const MAX_CASES = Math.max(100, Number(process.env.MOD_CASE_MAX_CASES_PER_USER) || 800);
const write = process.argv.includes("--write");
const guildArg = process.argv.find((a) => String(a).startsWith("--guild="));
const guildFilter = guildArg ? String(guildArg.split("=")[1] || "").trim() : "";

function toEntry(doc) {
  return {
    caseId: Number(doc.caseId),
    action: String(doc.action || ""),
    userId: String(doc.userId || ""),
    modId: String(doc.modId || ""),
    reason: doc.reason != null ? String(doc.reason) : "Nessun motivo fornito",
    durationMs: doc.durationMs == null ? null : Number(doc.durationMs),
    expiresAt: doc.expiresAt ? new Date(doc.expiresAt) : null,
    active: doc.active !== false,
    context: doc.context || { channelId: null, messageId: null },
    edits: Array.isArray(doc.edits) ? doc.edits : [],
    closedAt: doc.closedAt ? new Date(doc.closedAt) : null,
    closeReason: doc.closeReason != null ? String(doc.closeReason) : null,
    createdAt: doc.createdAt ? new Date(doc.createdAt) : new Date(),
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt) : new Date(),
  };
}

async function main() {
  if (!MONGO_URL) {
    console.error("[migrate-mod-case] MONGO_URL mancante");
    process.exit(1);
  }
  await mongoose.connect(MONGO_URL);
  const q = guildFilter ? { guildId: guildFilter } : {};
  const totalLegacy = await ModCase.countDocuments(q).catch(() => 0);
  console.log("[migrate-mod-case] legacy mod_case:", totalLegacy, write ? "WRITE" : "DRY-RUN", guildFilter || "all guilds");

  const groups = new Map();
  const cursor = ModCase.find(q).lean().cursor();
  for await (const doc of cursor) {
    const gid = String(doc.guildId || "");
    const uid = String(doc.userId || "");
    const key = `${gid}\t${uid}`;
    if (!groups.has(key)) groups.set(key, new Map());
    groups.get(key).set(Number(doc.caseId), toEntry(doc));
  }

  let upsertCount = 0;
  for (const [key, caseMap] of groups) {
    const [guildId, userId] = key.split("\t");
    let arr = Array.from(caseMap.values()).sort((a, b) => Number(a.caseId) - Number(b.caseId));
    if (arr.length > MAX_CASES) arr = arr.slice(-MAX_CASES);

    if (write) {
      const existing = await ModCaseUser.findOne({ guildId, userId }).lean().catch(() => null);
      const byId = new Map();
      for (const c of existing?.cases || []) byId.set(Number(c.caseId), c);
      for (const c of arr) {
        if (!byId.has(Number(c.caseId))) byId.set(Number(c.caseId), c);
      }
      let merged = Array.from(byId.values()).sort((a, b) => Number(a.caseId) - Number(b.caseId));
      if (merged.length > MAX_CASES) merged = merged.slice(-MAX_CASES);
      await ModCaseUser.updateOne(
        { guildId, userId },
        { $set: { cases: merged }, $setOnInsert: { guildId, userId } },
        { upsert: true },
      ).catch((e) => console.error("[migrate-mod-case] upsert fail", guildId, userId, e?.message || e));
    }
    upsertCount += 1;
  }

  console.log("[migrate-mod-case] ModCaseUser keys (guild+user):", upsertCount);
  await mongoose.disconnect().catch(() => null);
}

main().catch((e) => {
  console.error(e);
  process.exit(1);
});