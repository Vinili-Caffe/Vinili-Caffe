const BotState = require("../../Schemas/BotState/botStateSchema");

async function getBotState(key, fallback = null) {
  try {
    const doc = await BotState.findOne({ key: String(key) }).lean();
    return doc?.value !== undefined ? doc.value : fallback;
  } catch (err) {
    global.logger?.warn?.("[botState] get:", key, err?.message ?? err);
    return fallback;
  }
}

async function setBotState(key, value) {
  try {
    await BotState.findOneAndUpdate(
      { key: String(key) },
      { $set: { value } },
      { upsert: true },
    );
  } catch (err) {
    global.logger?.warn?.("[botState] set:", key, err?.message ?? err);
  }
}

module.exports = { getBotState, setBotState };