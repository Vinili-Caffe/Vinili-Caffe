/* eslint-disable no-console */
require("dotenv").config();
const mongoose = require("mongoose");

const SOURCE_GUILD_ID = "1462458562507964584";
const TARGET_GUILD_ID = "1329080093599076474";
const COLLECTION_NAME = "guildfeaturebuckets";

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function ticketKey(ticket) {
  if (!ticket || typeof ticket !== "object") return "";
  if (ticket.channelId) return `ch:${String(ticket.channelId)}`;
  if (ticket.ticketNumber != null) return `num:${String(ticket.ticketNumber)}`;
  if (ticket._id) return `id:${String(ticket._id)}`;
  return JSON.stringify(ticket);
}

function mergeOnlyNew(targetTickets, sourceTickets) {
  const merged = [...toArray(targetTickets)];
  const seen = new Set(merged.map((t) => ticketKey(t)));
  let added = 0;
  for (const t of toArray(sourceTickets)) {
    const key = ticketKey(t);
    if (seen.has(key)) continue;
    seen.add(key);
    merged.push(t);
    added += 1;
  }
  return { merged, added };
}

async function run() {
  const mongoUri =
    process.env.MONGO_URL_LOCAL ||
    process.env.MONGODB_URI_LOCAL ||
    process.env.MONGO_URL ||
    process.env.MONGO_URI ||
    process.env.MONGODB_URI;
  if (!mongoUri) {
    throw new Error(
      "Mongo URI non trovata. Imposta una tra: MONGO_URL_LOCAL, MONGODB_URI_LOCAL, MONGO_URL, MONGO_URI, MONGODB_URI",
    );
  }
  await mongoose.connect(mongoUri);
  const collection = mongoose.connection.db.collection(COLLECTION_NAME);

  const [sourceDoc, targetDoc] = await Promise.all([
    collection.findOne({ guildId: SOURCE_GUILD_ID }, { projection: { _id: 1, guildId: 1, tickets: 1 } }),
    collection.findOne({ guildId: TARGET_GUILD_ID }, { projection: { _id: 1, guildId: 1, tickets: 1 } }),
  ]);

  if (!sourceDoc) throw new Error(`Sorgente non trovata: guildId=${SOURCE_GUILD_ID}`);
  if (!targetDoc) throw new Error(`Destinazione non trovata: guildId=${TARGET_GUILD_ID}`);

  const sourceTickets = toArray(sourceDoc.tickets);
  const targetTickets = toArray(targetDoc.tickets);
  const { merged, added } = mergeOnlyNew(targetTickets, sourceTickets);

  const updateResult = await collection.updateOne(
    { _id: targetDoc._id },
    { $set: { tickets: merged } },
  );

  console.log(
    `[migrate-guildfeaturebucket-tickets-source-to-target] source=${SOURCE_GUILD_ID}(${sourceTickets.length}) target=${TARGET_GUILD_ID} before=${targetTickets.length} added=${added} after=${merged.length} modified=${Number(updateResult?.modifiedCount || 0)}`,
  );

  await mongoose.disconnect();
}

run()
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error("[migrate-guildfeaturebucket-tickets-source-to-target] error", err);
    try {
      await mongoose.disconnect();
    } catch (_) {}
    process.exit(1);
  });