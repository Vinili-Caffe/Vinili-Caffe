/**
 * Rimuove dal bundle weekly contest tutti i voti PC (counts + legacy array)
 * verso i messaggi di submission PC dell'autore indicato.
 *
 * Uso (dalla root del repo, con .env con MONGO_*):
 *   node scripts/strip-contest-pc-votes-for-author.js <authorUserId> [eventKey] [guildId]
 *
 * Esempio:
 *   node scripts/strip-contest-pc-votes-for-author.js 1416505080781209642 sfondi-2026-04-13
 */
const path = require("path");
const mongoose = require("mongoose");
require("dotenv").config({ path: path.join(__dirname, "..", ".env") });

const IDs = require("../Vinyls/Utils/Config/ids");
const { WeeklyContestBundle } = require("../Vinyls/Schemas/Community/weeklyContestSchemas");

const DEFAULT_GUILD = String(process.env.ACTIVITY_MAIN_GUILD_ID || IDs.guilds?.main || "").trim();
const DEFAULT_EVENT_KEY = String(process.env.WEEKLY_CONTEST_SFONDI_EVENT_KEY || "sfondi-2026-04-13").trim();

function collectPcSubmissionMessageIdsForAuthor(bundle, authorId) {
  const uid = String(authorId || "").trim();
  const mids = new Set();
  if (!uid) return mids;
  const pcMap =
    bundle?.submissions?.pc && typeof bundle.submissions.pc === "object" && !Array.isArray(bundle.submissions.pc)
      ? bundle.submissions.pc
      : {};
  const direct = String(pcMap[uid] || "").trim();
  if (/^\d{17,22}$/.test(direct)) mids.add(direct);
  const idx = bundle?.submissionMessageIndex && typeof bundle.submissionMessageIndex === "object" ? bundle.submissionMessageIndex : {};
  for (const [mid, meta] of Object.entries(idx)) {
    if (!meta || typeof meta !== "object") continue;
    if (String(meta.category || "") !== "pc") continue;
    if (String(meta.userId || "") !== uid) continue;
    const k = String(mid || "").trim();
    if (/^\d{17,22}$/.test(k)) mids.add(k);
  }
  return mids;
}

function stripPcVotesFromVoterLeaf(leaf, midSet) {
  let removed = 0;
  let changed = false;
  if (!leaf || typeof leaf !== "object") return { removed, changed };
  const counts =
    leaf.votesPcCounts && typeof leaf.votesPcCounts === "object" && !Array.isArray(leaf.votesPcCounts)
      ? leaf.votesPcCounts
      : null;
  if (counts) {
    for (const mid of Object.keys(counts)) {
      if (!midSet.has(String(mid))) continue;
      const n = Math.max(0, Math.floor(Number(counts[mid]) || 0));
      removed += n;
      delete counts[mid];
      changed = true;
    }
  }
  const filterArr = (key) => {
    const arr = Array.isArray(leaf[key]) ? leaf[key] : [];
    if (!arr.length) return;
    const next = [];
    for (const id of arr) {
      const s = String(id || "").trim();
      if (midSet.has(s)) {
        removed += 1;
        changed = true;
      } else {
        next.push(id);
      }
    }
    leaf[key] = next;
  };
  filterArr("votesPc");
  filterArr("votesPcSparkle");
  return { removed, changed };
}

async function main() {
  const authorId = String(process.argv[2] || "").trim();
  const eventKey = String(process.argv[3] || DEFAULT_EVENT_KEY).trim();
  const guildId = String(process.argv[4] || DEFAULT_GUILD).trim();
  if (!/^\d{17,22}$/.test(authorId)) {
    console.error("Uso: node scripts/strip-contest-pc-votes-for-author.js <authorUserId> [eventKey] [guildId]");
    process.exit(1);
  }
  if (!guildId || !eventKey) {
    console.error("guildId o eventKey mancante (imposta ACTIVITY_MAIN_GUILD_ID / WEEKLY_CONTEST_SFONDI_EVENT_KEY o passali come argomenti).");
    process.exit(1);
  }
  const mongoUrl =
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGODB_URI_LOCAL ||
    process.env.MONGO_URL ||
    process.env.MONGODB_URI;
  if (!mongoUrl) {
    console.error("Nessun MONGO_URL / MONGODB_URI nel .env");
    process.exit(1);
  }
  await mongoose.connect(mongoUrl, { serverSelectionTimeoutMS: 20000, connectTimeoutMS: 20000 });
  const bundle = await WeeklyContestBundle.findOne({ guildId, eventKey });
  if (!bundle) {
    console.error(`Nessun bundle per guildId=${guildId} eventKey=${eventKey}`);
    await mongoose.disconnect();
    process.exit(1);
  }
  const midSet = collectPcSubmissionMessageIdsForAuthor(bundle.toObject ? bundle.toObject() : bundle, authorId);
  if (!midSet.size) {
    console.error(`Nessun messaggio submission PC trovato per autore ${authorId} (submissions.pc / submissionMessageIndex).`);
    await mongoose.disconnect();
    process.exit(1);
  }
  console.log(`MessageId PC da ripulire (${midSet.size}):`, [...midSet].join(", "));
  const voters = bundle.voters && typeof bundle.voters === "object" && !Array.isArray(bundle.voters) ? bundle.voters : {};
  let votersTouched = 0;
  let votesRemoved = 0;
  for (const [vid, leaf] of Object.entries(voters)) {
    if (!vid || !leaf || typeof leaf !== "object") continue;
    const { removed, changed } = stripPcVotesFromVoterLeaf(leaf, midSet);
    if (changed) {
      votersTouched += 1;
      votesRemoved += removed;
    }
  }
  bundle.voters = voters;
  bundle.markModified("voters");
  await bundle.save();
  console.log(`OK: rimossi ~${votesRemoved} voto/i PC aggregati da ${votersTouched} votant(e/i) verso autore ${authorId}.`);
  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  mongoose.disconnect().catch(() => {});
  process.exit(1);
});