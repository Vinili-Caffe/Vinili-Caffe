/**
 * Migra pollschemas, suggestions, tickets e giveaways nella collection unica guildfeaturebuckets
 * (un documento per guildId con array polls, suggestions, tickets, giveaways).
 *
 * Uso (dalla root del repo, con MongoDB raggiungibile e .env configurato):
 *   node scripts/migrate-guild-feature-bucket.js
 *
 * Opzioni env:
 *   GUILD_FEATURE_BUCKET_DROP_LEGACY=1 — dopo migrazione ok, elimina le collection legacy usate
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

const {
  GuildFeatureBucket,
  ensureGuildFeatureBucket,
} = require(path.join(ROOT, "Vinyls", "Schemas", "Guild", "guildFeatureBucketSchema.js"));

const COUNTER_Q = "__counter__";
const LEGACY_POLL = "pollschemas";
const LEGACY_SUGG = "suggestions";
const LEGACY_TICKET = "tickets";
const LEGACY_GIVEAWAY = "giveaways";

function resolveMongoUrl() {
  return (
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGODB_URI_LOCAL ||
    process.env.MONGO_URL ||
    process.env.MONGODB_URI ||
    ""
  );
}

async function mergeGiveawaysFromLegacyIntoBuckets(giveawayRows) {
  if (!Array.isArray(giveawayRows) || !giveawayRows.length) return { guildsTouched: 0, added: 0 };
  const byGuild = new Map();
  for (const r of giveawayRows) {
    const gid = String(r.guildId || "");
    if (!gid) continue;
    if (!byGuild.has(gid)) byGuild.set(gid, []);
    byGuild.get(gid).push(r);
  }
  let guildsTouched = 0;
  let added = 0;
  for (const [guildId, list] of byGuild) {
    let bucket = await GuildFeatureBucket.findOne({ guildId }).catch(() => null);
    if (!bucket) {
      await ensureGuildFeatureBucket(guildId);
      bucket = await GuildFeatureBucket.findOne({ guildId }).catch(() => null);
    }
    if (!bucket) continue;
    if (!Array.isArray(bucket.giveaways)) bucket.giveaways = [];
    const existing = new Set(bucket.giveaways.map((g) => String(g._id)));
    let addedHere = 0;
    for (const row of list) {
      if (existing.has(String(row._id))) continue;
      const { _id, guildId: gg, ...rest } = row;
      bucket.giveaways.push({ ...rest, _id, guildId: String(gg || guildId) });
      existing.add(String(row._id));
      addedHere += 1;
    }
    if (addedHere) await bucket.save();
    guildsTouched += 1;
    added += addedHere;
    console.log(`[giveaway-merge] guild ${guildId} added=${addedHere}/${list.length}`);
  }
  return { guildsTouched, added };
}

async function main() {
  const url = resolveMongoUrl();
  if (!url) {
    console.error("Nessun URL MongoDB in .env (MONGO_URL / MONGODB_URI / *_LOCAL).");
    process.exit(1);
  }
  await mongoose.connect(url);
  const db = mongoose.connection.db;

  const [pollRows, suggRows, ticketRows, giveawayRows] = await Promise.all([
    db.collection(LEGACY_POLL).find({}).toArray().catch(() => []),
    db.collection(LEGACY_SUGG).find({}).toArray().catch(() => []),
    db.collection(LEGACY_TICKET).find({}).toArray().catch(() => []),
    db.collection(LEGACY_GIVEAWAY).find({}).toArray().catch(() => []),
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
  for (const g of giveawayRows) {
    if (g.guildId) guildSet.add(String(g.guildId));
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

    const giveaways = [];
    for (const gw of giveawayRows) {
      if (String(gw.guildId) !== guildId) continue;
      const { _id, ...rest } = gw;
      giveaways.push({ ...rest, _id });
    }

    await GuildFeatureBucket.collection.insertOne({
      guildId,
      pollCounter,
      polls,
      suggestionCounter,
      suggestions,
      tickets,
      giveaways,
      createdAt: new Date(),
      updatedAt: new Date(),
    });
    migrated += 1;
    console.log(
      `[ok] guild ${guildId} polls=${polls.length} sugg=${suggestions.length} tickets=${tickets.length} giveaways=${giveaways.length}`,
    );
  }

  console.log(`Fase 1: nuovi bucket creati: ${migrated}.`);

  const mergeStats = await mergeGiveawaysFromLegacyIntoBuckets(giveawayRows);
  console.log(
    `Fase 2: merge giveaway da legacy — guild toccate=${mergeStats.guildsTouched}, documenti aggiunti=${mergeStats.added}.`,
  );

  const drop = String(process.env.GUILD_FEATURE_BUCKET_DROP_LEGACY || "") === "1";
  if (drop) {
    if (migrated > 0) {
      await db.collection(LEGACY_POLL).drop().catch(() => null);
      await db.collection(LEGACY_SUGG).drop().catch(() => null);
      await db.collection(LEGACY_TICKET).drop().catch(() => null);
      console.log("Collection legacy poll/suggestions/tickets eliminate.");
    }
    if (giveawayRows.length > 0) {
      await db.collection(LEGACY_GIVEAWAY).drop().catch(() => null);
      console.log("Collection legacy giveaways eliminata.");
    }
  }

  await mongoose.disconnect();
}

main().catch((err) => {
  console.error(err);
  process.exit(1);
});