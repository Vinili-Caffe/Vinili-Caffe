const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { isValidGuildUserId } = require("../../Utils/DB/validateWriteIds");
const { validateMentionResponseText } = require("../../Utils/Community/mentionResponseValidation");

function asStrings(values = []) {
  return Array.isArray(values) ? values.map((v) => String(v || "").trim()).filter(Boolean) : [];
}

async function getProfile(guildId, userId, select = "") {
  if (!guildId || !userId) return null;
  return ActivityUserProfile.findOne({ guildId: String(guildId), userId: String(userId) })
    .select(select)
    .lean()
    .catch(() => null);
}

async function upsertProfile(guildId, userId, update) {
  if (!guildId || !userId) return null;
  return ActivityUserProfile.findOneAndUpdate(
    { guildId: String(guildId), userId: String(userId) },
    { $setOnInsert: { guildId: String(guildId), userId: String(userId) }, ...update },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);
}

async function setAfk({ guildId, userId, message, timestamp = new Date(), originalName = null }) {
  return upsertProfile(guildId, userId, {
    $set: {
      "profile.afk.message": String(message || ""),
      "profile.afk.timestamp": new Date(timestamp),
      "profile.afk.originalName": originalName == null ? null : String(originalName),
    },
  });
}

async function getAfk(guildId, userId) {
  const doc = await getProfile(guildId, userId, "profile.afk");
  const afk = doc?.profile?.afk;
  if (!afk?.message) return null;
  return {
    guildId: String(guildId),
    userId: String(userId),
    message: String(afk.message || ""),
    timestamp: afk.timestamp || null,
    originalName: afk.originalName ?? null,
  };
}

async function clearAfk(guildId, userId) {
  return upsertProfile(guildId, userId, {
    $set: {
      "profile.afk.message": null,
      "profile.afk.timestamp": null,
      "profile.afk.originalName": null,
    },
  });
}

async function listMentionReactions(guildId, userIds = []) {
  const ids = asStrings(userIds);
  if (!guildId || !ids.length) return [];
  const docs = await ActivityUserProfile.find({
    guildId: String(guildId),
    userId: { $in: ids },
    "profile.mentionReaction.reactions.0": { $exists: true },
  })
    .select("userId profile.mentionReaction.reactions")
    .lean()
    .catch(() => []);
  return docs.map((doc) => ({
    userId: String(doc?.userId || ""),
    reactions: Array.isArray(doc?.profile?.mentionReaction?.reactions)
      ? doc.profile.mentionReaction.reactions.map((x) => String(x))
      : [],
  }));
}

async function getMentionResponse(guildId, userId) {
  if (!guildId || !userId) return null;
  const doc = await getProfile(guildId, userId, "profile.mentionResponse");
  const text = String(doc?.profile?.mentionResponse?.text || "").trim();
  if (!text) return null;
  return {
    guildId: String(guildId),
    userId: String(userId),
    text,
    updatedAt: doc?.profile?.mentionResponse?.updatedAt || null,
  };
}

async function setMentionResponse(guildId, userId, text) {
  if (!isValidGuildUserId(guildId, userId)) {
    return { ok: false, userMessage: "<:VC_Attention:1482534443632558151> Impossibile salvare la risposta." };
  }
  const validation = validateMentionResponseText(text);
  if (!validation.ok) {
    return { ok: false, reason: validation.reason, userMessage: validation.userMessage };
  }
  if (!validation.text) return clearMentionResponse(guildId, userId).then(() => ({ ok: true, text: "" }));
  const doc = await upsertProfile(guildId, userId, {
    $set: {
      "profile.mentionResponse.text": validation.text,
      "profile.mentionResponse.updatedAt": new Date(),
    },
  });
  return { ok: true, text: validation.text, doc };
}

async function clearMentionResponse(guildId, userId) {
  if (!isValidGuildUserId(guildId, userId)) return null;
  return upsertProfile(guildId, userId, {
    $set: {
      "profile.mentionResponse.text": "",
      "profile.mentionResponse.updatedAt": null,
    },
  });
}

async function listMentionResponses(guildId, userIds = []) {
  const ids = asStrings(userIds);
  if (!guildId || !ids.length) return [];
  const docs = await ActivityUserProfile.find({
    guildId: String(guildId),
    userId: { $in: ids },
    "profile.mentionResponse.text": { $type: "string", $ne: "" },
  })
    .select("userId profile.mentionResponse.text")
    .lean()
    .catch(() => []);
  return docs
    .map((doc) => ({
      userId: String(doc?.userId || ""),
      text: String(doc?.profile?.mentionResponse?.text || "").trim(),
    }))
    .filter((doc) => doc.userId && doc.text);
}

async function getBirthdayProfile(guildId, userId) {
  const doc = await getProfile(guildId, userId, "profile.birthday");
  return doc?.profile?.birthday || null;
}

async function setBirthdayProfile(guildId, userId, payload = {}) {
  const safe = payload || {};
  return upsertProfile(guildId, userId, {
    $set: {
      "profile.birthday.day": safe.day == null ? null : Number(safe.day),
      "profile.birthday.month": safe.month == null ? null : Number(safe.month),
      "profile.birthday.birthYear": safe.birthYear == null ? null : Number(safe.birthYear),
      "profile.birthday.showAge": safe.showAge == null ? true : Boolean(safe.showAge),
      "profile.birthday.lastCelebratedYear": safe.lastCelebratedYear == null ? null : Number(safe.lastCelebratedYear),
      "profile.birthday.registrationMessageId": safe.registrationMessageId == null ? null : String(safe.registrationMessageId),
      "profile.birthday.registrationChannelId": safe.registrationChannelId == null ? null : String(safe.registrationChannelId),
    },
  });
}

async function clearBirthdayProfile(guildId, userId) {
  return upsertProfile(guildId, userId, {
    $set: {
      "profile.birthday.day": null,
      "profile.birthday.month": null,
      "profile.birthday.birthYear": null,
      "profile.birthday.showAge": true,
      "profile.birthday.lastCelebratedYear": null,
      "profile.birthday.registrationMessageId": null,
      "profile.birthday.registrationChannelId": null,
    },
  });
}

async function listBirthdayDue(day, month, year) {
  const docs = await ActivityUserProfile.find({
    "profile.birthday.day": Number(day),
    "profile.birthday.month": Number(month),
    $or: [
      { "profile.birthday.lastCelebratedYear": { $exists: false } },
      { "profile.birthday.lastCelebratedYear": { $ne: Number(year) } },
    ],
  })
    .select("guildId userId profile.birthday")
    .lean()
    .catch(() => []);
  return docs.map((doc) => ({
    _id: doc?._id,
    guildId: String(doc?.guildId || ""),
    userId: String(doc?.userId || ""),
    ...doc?.profile?.birthday,
  }));
}

async function markBirthdayCelebratedByIds(ids = [], year) {
  const safeIds = Array.isArray(ids) ? ids.filter(Boolean) : [];
  if (!safeIds.length) return { modifiedCount: 0 };
  return ActivityUserProfile.updateMany(
    { _id: { $in: safeIds } },
    { $set: { "profile.birthday.lastCelebratedYear": Number(year) } },
  ).catch(() => ({ modifiedCount: 0 }));
}

/** Profili con compleanno salvato (data + anno) per sync ruoli zodiacali all'avvio. */
async function listBirthdayProfilesForZodiacSync() {
  const docs = await ActivityUserProfile.find({
    "profile.birthday.month": { $gte: 1, $lte: 12 },
    "profile.birthday.day": { $gte: 1, $lte: 31 },
    "profile.birthday.birthYear": { $gte: 1900, $lte: 2100 },
  })
    .select("guildId userId profile.birthday.month profile.birthday.day")
    .lean()
    .catch(() => []);
  return docs
    .map((doc) => ({
      guildId: String(doc?.guildId || ""),
      userId: String(doc?.userId || ""),
      month: Number(doc?.profile?.birthday?.month),
      day: Number(doc?.profile?.birthday?.day),
    }))
    .filter(
      (row) =>
        row.guildId &&
        row.userId &&
        Number.isFinite(row.month) &&
        Number.isFinite(row.day) &&
        row.month >= 1 &&
        row.month <= 12 &&
        row.day >= 1 &&
        row.day <= 31,
    );
}

/** Profili con compleanno + anno per sync ruoli fascia d'età (13-14, 15-16, 17-18, 19+). */
async function listBirthdayProfilesForAgeBracketSync() {
  const docs = await ActivityUserProfile.find({
    "profile.birthday.month": { $gte: 1, $lte: 12 },
    "profile.birthday.day": { $gte: 1, $lte: 31 },
    "profile.birthday.birthYear": { $gte: 1900, $lte: 2100 },
  })
    .select("guildId userId profile.birthday.month profile.birthday.day profile.birthday.birthYear")
    .lean()
    .catch(() => []);
  return docs
    .map((doc) => ({
      guildId: String(doc?.guildId || ""),
      userId: String(doc?.userId || ""),
      month: Number(doc?.profile?.birthday?.month),
      day: Number(doc?.profile?.birthday?.day),
      birthYear: Number(doc?.profile?.birthday?.birthYear),
    }))
    .filter(
      (row) =>
        row.guildId &&
        row.userId &&
        Number.isFinite(row.month) &&
        Number.isFinite(row.day) &&
        Number.isFinite(row.birthYear) &&
        row.month >= 1 &&
        row.month <= 12 &&
        row.day >= 1 &&
        row.day <= 31,
    );
}

async function getNoDmPreference(guildId, userId) {
  const doc = await getProfile(guildId, userId, "profile.noDmPreference");
  return doc?.profile?.noDmPreference || null;
}

async function setNoDmPreference(guildId, userId, categories = null) {
  return upsertProfile(guildId, userId, {
    $set: { "profile.noDmPreference.categories": categories == null ? null : asStrings(categories) },
  });
}

async function listNoDmPreferences(guildId) {
  const docs = await ActivityUserProfile.find({ guildId: String(guildId) })
    .select("userId profile.noDmPreference.categories")
    .lean()
    .catch(() => []);
  return docs
    .map((doc) => ({
      guildId: String(guildId),
      userId: String(doc?.userId || ""),
      categories: doc?.profile?.noDmPreference?.categories ?? null,
    }))
    .filter((x) => x.userId && x.categories != null);
}

async function clearNoDmPreference(guildId, userId) {
  return upsertProfile(guildId, userId, {
    $set: { "profile.noDmPreference.categories": null },
  });
}

module.exports = {
  getProfile,
  upsertProfile,
  setAfk,
  getAfk,
  clearAfk,
  listMentionReactions,
  getMentionResponse,
  setMentionResponse,
  clearMentionResponse,
  listMentionResponses,
  getBirthdayProfile,
  setBirthdayProfile,
  clearBirthdayProfile,
  listBirthdayDue,
  listBirthdayProfilesForZodiacSync,
  listBirthdayProfilesForAgeBracketSync,
  markBirthdayCelebratedByIds,
  getNoDmPreference,
  setNoDmPreference,
  listNoDmPreferences,
  clearNoDmPreference,
};