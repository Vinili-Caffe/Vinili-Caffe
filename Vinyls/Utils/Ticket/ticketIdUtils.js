const mongoose = require("mongoose");
const TICKET_COUNTER_KEY = "global_ticket_id";
const COUNTER_COLLECTION = "globalsettings";

async function getNextTicketId() {
  const db = mongoose.connection?.db;
  if (!db) throw new Error("MongoDB connection not ready for ticket counter");
  const collection = db.collection(COUNTER_COLLECTION);
  const counter = await collection.findOneAndUpdate(
    { _counterKey: TICKET_COUNTER_KEY },
    { $inc: { _counterValue: 1 } },
    { upsert: true, returnDocument: "after" },
  );
  const fromResult = Number(counter?.value?._counterValue);
  const fromDirect = Number(counter?._counterValue);
  const parsed = Number.isFinite(fromResult) && fromResult > 0
    ? fromResult
    : Number.isFinite(fromDirect) && fromDirect > 0
      ? fromDirect
      : NaN;
  if (Number.isFinite(parsed) && parsed > 0) return parsed;

  // Fallback for driver variants that don't expose `.value`.
  const persisted = await collection.findOne({ _counterKey: TICKET_COUNTER_KEY });
  const persistedValue = Number(persisted?._counterValue);
  if (Number.isFinite(persistedValue) && persistedValue > 0) {
    return persistedValue;
  }
  throw new Error("Ticket counter returned an invalid value");
}

function isDuplicateKeyError(err) {
  return Boolean(
    err?.code === 11000 ||
      (err?.message && String(err.message).includes("E11000")),
  );
}

function isTicketNumberDuplicate(err) {
  if (!isDuplicateKeyError(err)) return false;
  const msg = String(err?.message || "");
  return msg.includes("ticketNumber");
}

function isCounterUnavailableError(err) {
  const msg = String(err?.message || "").toLowerCase();
  return (
    msg.includes("mongodb connection not ready for ticket counter") ||
    msg.includes("topology is closed") ||
    msg.includes("client must be connected")
  );
}

async function createTicketDocWithGlobalId(TicketModel, payload = {}, maxRetries = 5) {
  let lastError = null;
  for (let i = 0; i < maxRetries; i += 1) {
    try {
      const ticketNumber = await getNextTicketId();
      const doc = await TicketModel.create({ ...payload, ticketNumber });
      return doc;
    } catch (err) {
      lastError = err;
      if (!isTicketNumberDuplicate(err)) throw err;
    }
  }
  if (isCounterUnavailableError(lastError)) {
    // Fallback: create ticket without number; will be backfilled later.
    return TicketModel.create({ ...payload });
  }
  throw lastError || new Error("Unable to allocate unique ticketNumber");
}

module.exports = { getNextTicketId, createTicketDocWithGlobalId };