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

function channelIdKey(ticket) {
  const channelId = String(ticket?.channelId || "").trim();
  return channelId ? `ch:${channelId}` : "";
}

function ticketNumberKey(ticket) {
  if (ticket?.ticketNumber == null) return "";
  return `num:${String(ticket.ticketNumber)}`;
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
  const allOtherDocs = await collection
    .find(
      { guildId: { $nin: [SOURCE_GUILD_ID, TARGET_GUILD_ID] } },
      { projection: { tickets: 1 } },
    )
    .toArray();

  const usedChannelIdsOutside = new Set();
  const usedTicketNumbersOutside = new Set();
  for (const doc of allOtherDocs) {
    for (const t of toArray(doc?.tickets)) {
      const ch = channelIdKey(t);
      const num = ticketNumberKey(t);
      if (ch) usedChannelIdsOutside.add(ch);
      if (num) usedTicketNumbersOutside.add(num);
    }
  }

  const targetKeys = new Set(targetTickets.map((t) => ticketKey(t)));
  const targetChannelIds = new Set(targetTickets.map((t) => channelIdKey(t)).filter(Boolean));
  const targetTicketNumbers = new Set(targetTickets.map((t) => ticketNumberKey(t)).filter(Boolean));

  const toMove = [];
  let skippedAlreadyInTarget = 0;
  let skippedConflictOutside = 0;
  for (const t of sourceTickets) {
    const key = ticketKey(t);
    const ch = channelIdKey(t);
    const num = ticketNumberKey(t);

    if (targetKeys.has(key) || (ch && targetChannelIds.has(ch)) || (num && targetTicketNumbers.has(num))) {
      skippedAlreadyInTarget += 1;
      continue;
    }
    if ((ch && usedChannelIdsOutside.has(ch)) || (num && usedTicketNumbersOutside.has(num))) {
      skippedConflictOutside += 1;
      continue;
    }

    toMove.push(t);
    targetKeys.add(key);
    if (ch) targetChannelIds.add(ch);
    if (num) targetTicketNumbers.add(num);
  }

  const movedKeySet = new Set(toMove.map((t) => ticketKey(t)));
  const sourceAfter = sourceTickets.filter((t) => !movedKeySet.has(ticketKey(t)));
  const targetAfter = [...targetTickets, ...toMove];

  // IMPORTANT: unique indexes on tickets.channelId/ticketNumber are global per collection.
  // To avoid E11000, moved rows are removed from source first, then appended to target.
  const srcUpdate = await collection.updateOne(
    { _id: sourceDoc._id },
    { $set: { tickets: sourceAfter } },
  );

  const targetUpdate = await collection.updateOne(
    { _id: targetDoc._id },
    { $set: { tickets: targetAfter } },
  );

  console.log(
    `[migrate-guildfeaturebucket-tickets-source-to-target] source=${SOURCE_GUILD_ID} before=${sourceTickets.length} after=${sourceAfter.length} target=${TARGET_GUILD_ID} before=${targetTickets.length} moved=${toMove.length} after=${targetAfter.length} skipped_target=${skippedAlreadyInTarget} skipped_outside=${skippedConflictOutside} srcModified=${Number(srcUpdate?.modifiedCount || 0)} targetModified=${Number(targetUpdate?.modifiedCount || 0)}`,
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