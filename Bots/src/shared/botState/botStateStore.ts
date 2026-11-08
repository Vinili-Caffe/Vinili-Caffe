const BotState = require("../schemas/botState/botStateSchema");
const { isMongoReady } = require("../db/mongoConnect") as typeof import("../db/mongoConnect");

const { COMPACT_BOTSTATE_KEY } = BotState;

async function getBotState(key?, fallback = null) {
  const k = String(key);
  if (!isMongoReady()) return fallback;
  try {
    const canUseCompact = !k.includes(".");
    if (canUseCompact) {
      const compact = await BotState.findOne({ key: COMPACT_BOTSTATE_KEY }).lean();
      if (
        compact?.value &&
        Object.prototype.hasOwnProperty.call(compact.value, k)
      ) {
        return compact.value[k];
      }
    }
    const legacy = await BotState.findOne({ key: k }).lean();
    return legacy?.value !== undefined ? legacy.value : fallback;
  } catch (err) {
    global.logger?.warn?.("[botState] get:", key, err?.message ?? err);
    return fallback;
  }
}

async function setBotState(key?, value?) {
  const k = String(key);
  if (!isMongoReady()) return false;
  try {
    const canUseCompact = !k.includes(".");
    if (canUseCompact) {
      const compact = await BotState.findOne({ key: COMPACT_BOTSTATE_KEY }).lean();
      if (compact) {
        try {
          await BotState.updateOne(
            { key: COMPACT_BOTSTATE_KEY },
            { $set: { [`value.${k}`]: value } },
          );
          return true;
        } catch (err) {
          global.logger?.warn?.("[botState] compact set failed, fallback to legacy:", key, err?.message ?? err);
        }
      }
    }
    await BotState.findOneAndUpdate(
      { key: k },
      { $set: { value } },
      { upsert: true },
    );
    return true;
  } catch (err) {
    global.logger?.warn?.("[botState] set:", key, err?.message ?? err);
    return false;
  }
}

/** Claim atomico one-shot (doc dedicato, non compact). true = questo processo ha vinto. */
async function tryClaimBotStateOnce(key?, meta: Record<string, any> = {}) {
  const k = String(key || "").trim();
  if (!k || !isMongoReady()) return false;
  try {
    const existing = await BotState.findOne({ key: k }).lean();
    if (existing?.value?.done === true) return false;
    const payload = { done: true, claimedAt: Date.now(), ...meta };
    if (!existing) {
      try {
        await BotState.create({ key: k, value: payload });
        return true;
      } catch (err: any) {
        if (err?.code === 11000) return false;
        throw err;
      }
    }
    const updated = await BotState.findOneAndUpdate(
      {
        key: k,
        $or: [{ "value.done": { $exists: false } }, { "value.done": { $ne: true } }],
      },
      { $set: { value: payload } },
      { new: false },
    );
    return Boolean(updated);
  } catch (err) {
    global.logger?.warn?.("[botState] claim:", key, err?.message ?? err);
    return false;
  }
}

export = { getBotState, setBotState, tryClaimBotStateOnce };