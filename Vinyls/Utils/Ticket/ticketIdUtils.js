const mongoose = require("mongoose");
const TICKET_COUNTER_KEY = "global_ticket_id";
const COUNTER_COLLECTION = "globalsettings";

async function getNextTicketId() {
  const db = mongoose.connection?.db;
  if (!db) throw new Error("MongoDB connection not ready for ticket counter");
  const counter = await db.collection(COUNTER_COLLECTION).findOneAndUpdate(
    { _counterKey: TICKET_COUNTER_KEY },
    { $inc: { _counterValue: 1 } },
    { upsert: true, returnDocument: "after" },
  );
  return Number(counter?.value?._counterValue || 0);
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
  throw lastError || new Error("Unable to allocate unique ticketNumber");
}

module.exports = { getNextTicketId, createTicketDocWithGlobalId };