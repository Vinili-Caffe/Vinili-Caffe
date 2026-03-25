/**
 * Migra pollschemas, suggestions e tickets nella collection unica guildfeaturebuckets
 * (un documento per guildId con array polls, suggestions, tickets).
 *
 * Uso (dalla root del repo, con MongoDB raggiungibile e .env configurato):
 *   node scripts/migrate-guild-feature-bucket.js
 *
 * Opzioni env:
 *   GUILD_FEATURE_BUCKET_DROP_LEGACY=1 — dopo migrazione ok, elimina le tre collection legacy
 */
const path = require("path");
const ROOT = path.join(__dirname, "..");
require("dotenv").config({ path: path.join(ROOT, ".env"), quiet: true });

function requireMongoose() {
  const attempts = [
    () => require("mongoose"),
    () => require(path.join(ROOT, "node_modules", "mongoose")),
    () => require(path.join(ROOT, "Vinyls", "node_modules", "mongoose")),
  ];
  for (const fn of attempts) {
    try {
      return fn();
    } catch {
      /* try next */
    }
  }
  throw new Error(
    "Mongoose non trovato. Installa le dipendenze del bot (es. nella root: npm ci / npm install, oppure in Vinyls) così che esista node_modules/mongoose.",
  );
}

const mongoose = requireMongoose();

const { GuildFeatureBucket } = require(path.join(ROOT, "Vinyls", "Schemas", "Guild", "guildFeatureBucketSchema.js"));

const COUNTER_Q = "__counter__";
const LEGACY_POLL = "pollschemas";
const LEGACY_SUGG = "suggestions";
const LEGACY_TICKET = "tickets";

function resolveMongoUrl() {
  return (
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGODB_URI_LOCAL ||
    process.env.MONGO_URL ||
    process.env.MONGODB_URI ||
    ""
  );
}

async function main() {
  const url = resolveMongoUrl();
  if (!url) {
    console.error("Nessun URL MongoDB in .env (MONGO_URL / MONGODB_URI / *_LOCAL).");
    process.exit(1);
  }
  await mongoose.connect(url);
  const db = mongoose.connection.db;

  const [pollRows, suggRows, ticketRows] = await Promise.all([
    db.collection(LEGACY_POLL).find({}).toArray().catch(() => []),
    db.collection(LEGACY_SUGG).find({}).toArray().catch(() => []),
    db.collection(LEGACY_TICKET).find({}).toArray().catch(() => []),
  ]);

  const guildSet = new Set();
  for (const p of pollRows) {
    if (p.guildId) guildSet.add(String(p.guildId));
  }
  for (const s of suggRows) {
    if (s.GuildID) guildSet.add(String(s.GuildID));
  }
  for (const t of ticketRows) {
    if (t.guildId) guildSet.add(String(t.guildId));
  }

  let migrated = 0;
  for (const guildId of guildSet) {
    const existing = await GuildFeatureBucket.findOne({ guildId }).lean().catch(() => null);
    if (existing) {
      console.log(`[skip] bucket già presente per guild ${guildId}`);
      continue;
    }

    const polls = [];
    let pollCounter = 0;
    for (const p of pollRows) {
      if (String(p.guildId) !== guildId) continue;
      if (String(p.domanda || "") === COUNTER_Q) {
        pollCounter = Math.max(pollCounter, Number(p.pollcount || 0));
        continue;
      }
      const { _id, guildId: _g, ...rest } = p;
      polls.push({ ...rest, _id });
      pollCounter = Math.max(pollCounter, Number(p.pollcount || 0));
    }
    for (const p of polls) {
      pollCounter = Math.max(pollCounter, Number(p.pollcount || 0));
    }

    let suggestionCounter = 0;
    const suggestions = [];
    for (const s of suggRows) {
      if (String(s.GuildID) !== guildId) continue;
      if (
        String(s.ChannelID || "") === "__counter__" &&
        String(s.Msg || "") === "__counter__" &&
        String(s.AuthorID || "") === "__system__"
      ) {
        suggestionCounter = Math.max(suggestionCounter, Number(s.count || 0));
        continue;
      }
      const { _id, ...rest } = s;
      suggestions.push({ ...rest, _id });
    }

    const tickets = [];
    for (const t of ticketRows) {
      if (String(t.guildId) !== guildId) continue;
      const { _id, ...rest } = t;
      tickets.push({ ...rest, _id });
    }

    await GuildFeatureBucket.collection.insertOne({
      guildId,
      pollCounter,
      polls,
      suggestionCounter,
      suggestions,
      tickets,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    migrated += 1;
    console.log(`[ok] guild ${guildId} polls=${polls.length} sugg=${suggestions.length} tickets=${tickets.length}`);
  }

  console.log(`Fatto. Nuovi bucket creati: ${migrated}.`);

  if (String(process.env.GUILD_FEATURE_BUCKET_DROP_LEGACY || "") === "1" && migrated > 0) {
    await db.collection(LEGACY_POLL).drop().catch(() => null);
    await db.collection(LEGACY_SUGG).drop().catch(() => null);
    await db.collection(LEGACY_TICKET).drop().catch(() => null);
    console.log("Collection legacy eliminate.");
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});