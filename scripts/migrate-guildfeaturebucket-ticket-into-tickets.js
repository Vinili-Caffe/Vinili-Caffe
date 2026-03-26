/* eslint-disable no-console */
require("dotenv").config();
const mongoose = require("mongoose");

const TARGET_GUILD_ID = "1462458562507964584";
const COLLECTION_NAME = "guildfeaturebuckets";

function toArray(value) {
  return Array.isArray(value) ? value : [];
}

function entryMergeKey(entry) {
  if (!entry || typeof entry !== "object") return "";
  if (entry._id) return `id:${String(entry._id)}`;
  if (entry.channelId) return `ch:${String(entry.channelId)}`;
  if (entry.ticketNumber != null) return `num:${String(entry.ticketNumber)}`;
  return JSON.stringify(entry);
}

function mergeTicketArrays(currentTickets, legacyTicket) {
  const out = [];
  const seen = new Set();
  for (const row of [...toArray(currentTickets), ...toArray(legacyTicket)]) {
    const key = entryMergeKey(row);
    if (seen.has(key)) continue;
    seen.add(key);
    out.push(row);
  }
  return out;
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

  const doc = await collection.findOne(
    { guildId: TARGET_GUILD_ID },
    { projection: { _id: 1, guildId: 1, ticket: 1, tickets: 1 } },
  );

  if (!doc) {
    console.log(`[migrate-guildfeaturebucket-ticket-into-tickets] guild ${TARGET_GUILD_ID} non trovata`);
    await mongoose.disconnect();
    return;
  }

  const merged = mergeTicketArrays(doc.tickets, doc.ticket);
  await collection.updateOne(
    { _id: doc._id },
    {
      $set: { tickets: merged },
      $unset: { ticket: "" },
    },
  );

  console.log(
    `[migrate-guildfeaturebucket-ticket-into-tickets] guild=${TARGET_GUILD_ID} tickets=${toArray(doc.tickets).length} ticket=${toArray(doc.ticket).length} merged=${merged.length}`,
  );
  await mongoose.disconnect();
}

run()
  .then(() => process.exit(0))
  .catch(async (err) => {
    console.error("[migrate-guildfeaturebucket-ticket-into-tickets] error", err);
    try {
      await mongoose.disconnect();
    } catch (_) {}
    process.exit(1);
  });