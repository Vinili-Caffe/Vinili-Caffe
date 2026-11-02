/** Attività: documento dell'utente e analisi del messaggio (media, emoji, comandi). */
const { isMongoTransientError } = require("../../../shared/db/mongoConnect") as typeof import("../../../shared/db/mongoConnect");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { isValidGuildUserId } = require("../../../shared/db/validateWriteIds") as typeof import("../../../shared/db/validateWriteIds");
const { getDayKey, getWeekKey } = require("./activityTime") as typeof import("./activityTime");
const { logActivityBumpError } = require("./activityBumps") as typeof import("./activityBumps");

function ensureMessageKeys(doc?, now?) {
  if (!doc.profile) doc.profile = {};
  if (!doc.profile.totals) doc.profile.totals = {};
  ensureTimedCounters(doc.profile.totals, now, {
    dailyKey: "messagesDailyKey",
    dailyCount: "messagesDaily",
    weeklyKey: "messagesWeeklyKey",
    weeklyCount: "messagesWeekly",
  });
}

function ensureVoiceKeys(doc?, now?) {
  if (!doc.profile) doc.profile = {};
  if (!doc.profile.totals) doc.profile.totals = {};
  ensureTimedCounters(doc.profile.totals, now, {
    dailyKey: "voiceDailyKey",
    dailyCount: "voiceDailySeconds",
    weeklyKey: "voiceWeeklyKey",
    weeklyCount: "voiceWeeklySeconds",
  });
}

function ensureTimedCounters(target?, now?, keys?) {
  if (!target) return;
  const dayKey = getDayKey(now);
  const weekKey = getWeekKey(now);
  if (target[keys.dailyKey] !== dayKey) {
    target[keys.dailyKey] = dayKey;
    target[keys.dailyCount] = 0;
  }
  if (target[keys.weeklyKey] !== weekKey) {
    target[keys.weeklyKey] = weekKey;
    target[keys.weeklyCount] = 0;
  }
}

function isMongoDuplicateKeyError(err?) {
  if (!err) return false;
  if (Number(err.code) === 11000) return true;
  const msg = String(err.message || err);
  return msg.includes("E11000") || msg.includes("duplicate key");
}

async function getOrCreateActivityUser(guildId?, userId?) {
  if (!isValidGuildUserId(guildId, userId)) return null;
  const gid = String(guildId);
  const uid = String(userId);
  const filter = { guildId: gid, userId: uid };
  const update = { $setOnInsert: { guildId: gid, userId: uid } };
  const options = { upsert: true, new: true, setDefaultsOnInsert: true };
  let lastErr = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      const doc = await ActivityUserProfile.findOneAndUpdate(filter, update, options);
      if (doc) return doc;
            const existing = await ActivityUserProfile.findOne(filter).catch(() => null);
      if (existing) return existing;
      try {
        const created = await ActivityUserProfile.create({ guildId: gid, userId: uid });
        if (created) return created;
      } catch (createErr) {
        lastErr = createErr;
        if (isMongoDuplicateKeyError(createErr)) {
          const again = await ActivityUserProfile.findOne(filter).catch(() => null);
          if (again) return again;
        }
      }
    } catch (err) {
      lastErr = err;
      if (isMongoDuplicateKeyError(err)) {
        const existing = await ActivityUserProfile.findOne(filter).catch(() => null);
        if (existing) return existing;
        continue;
      }
      if (isMongoTransientError(err) && attempt < 2) {
        await new Promise((r?) => setTimeout(r, 40 * (attempt + 1)));
        continue;
      }
      break;
    }
  }
  if (lastErr) {
    logActivityBumpError(`getOrCreateActivityUser failed guild=${gid} user=${uid}`, lastErr);
  }
  return null;
}

function countMessageMedia(message?) {
  let gifs = 0;
  let images = 0;
  const atts = message.attachments;
  if (atts && typeof atts.forEach === "function") {
    atts.forEach((att?) => {
      const name = String(att?.name || att?.url || "").toLowerCase();
      const ctype = String(att?.contentType || "").toLowerCase();
      if (ctype.includes("gif") || name.endsWith(".gif")) gifs += 1;
      else if (ctype.startsWith("image/") || /\.(png|jpe?g|webp|bmp)$/i.test(name)) images += 1;
    });
  }
  const content = String(message.content || "");
  if (/tenor\.com|giphy\.com|\.gif(?:\?|$)/i.test(content)) gifs += 1;
  return { gifs, images };
}

function collectCustomEmojiUses(content?) {
  const out: Record<string, any> = {};
  const re = /<a?:([a-zA-Z0-9_]+):(\d+)>/g;
  let m;
  while ((m = re.exec(String(content || "")))) {
    const key = `${m[1]}:${m[2]}`;
    out[key] = (out[key] || 0) + 1;
  }
  return out;
}

function looksLikePrefixCommand(message?) {
  const content = String(message.content || "").trim();
  if (!content) return false;
  const prefix = String(message.client?.config?.prefix || message.guild?.client?.config?.prefix || "+").trim() || "+";
  return content.startsWith(prefix) && content.length > prefix.length;
}

export = { ensureMessageKeys, ensureVoiceKeys, getOrCreateActivityUser, countMessageMedia, collectCustomEmojiUses, looksLikePrefixCommand };
