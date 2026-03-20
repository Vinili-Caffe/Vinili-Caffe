const { TicketCounter } = require("../../Schemas/Ticket/ticketSchema");
const TICKET_COUNTER_KEY = "global_ticket_id";

async function getNextTicketId() {
  const counter = await TicketCounter.findOneAndUpdate({ key: TICKET_COUNTER_KEY }, { $inc: { value: 1 } }, { new: true, upsert: true, setDefaultsOnInsert: true },);
  return Number(counter?.value || 0);
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