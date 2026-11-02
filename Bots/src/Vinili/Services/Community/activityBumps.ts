/** Attività: incremento dei contatori di messaggi e vocale. */
const { isMongoReady } = require("../../../shared/db/mongoConnect") as typeof import("../../../shared/db/mongoConnect");
const { ActivityGuildHourly, ACTIVITY_LEGACY_DAILY_DISABLED, ACTIVITY_LEGACY_HOURLY_DISABLED } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { isValidGuildUserIdChannelId } = require("../../../shared/db/validateWriteIds") as typeof import("../../../shared/db/validateWriteIds");
const { getDayKey, getHourKey } = require("./activityTime") as typeof import("./activityTime");
const { profileActivityCollection } = require("./activityRows") as typeof import("./activityRows");

function isMongoUnavailableError(err?) {
  if (!err) return false;
  if (err.name === "MongoNotConnectedError") return true;
  const msg = String(err.message || err || "");
  return /Client must be connected before running operations/i.test(msg);
}

function logActivityBumpError(label?, err?) {
    if (isMongoUnavailableError(err) || !isMongoReady()) return;
  const msg = err instanceof Error ? err.stack || err.message : String(err);
  const line = `[ACTIVITY] ${label}: ${msg}`;
  try {
    console.error(line);
  } catch {
  }
  try {
    global.logger?.warn?.(`[ACTIVITY] ${label}:`, err?.message || err);
  } catch {
  }
}

async function bumpGuildHourlyText(guildId?, userId?, channelId?, hourKey?, amount = 1) {
  const inc = Math.max(0, Number(amount || 0));
  if (!inc || !isValidGuildUserIdChannelId(guildId, userId, channelId)) return;
  const hk = String(hourKey || "");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(hk)) return;
  const gid = String(guildId);
  const uid = String(userId);
  const cid = String(channelId);
  try {
    await ActivityGuildHourly.updateOne(
      { guildId: gid },
      {
        $setOnInsert: { guildId: gid },
        $inc: {
          [`hours.${hk}.users.${uid}.text`]: inc,
          [`hours.${hk}.users.${uid}.textCh.${cid}`]: inc,
        },
      },
      { upsert: true },
    );
  } catch (err) {
    logActivityBumpError("bumpGuildHourlyText", err);
  }
}

async function bumpDailyVoice(guildId?, userId?, channelId?, seconds = 0) {
  if (ACTIVITY_LEGACY_DAILY_DISABLED) return;
  const inc = Math.max(0, Math.floor(Number(seconds || 0)));
  if (!inc || !isValidGuildUserIdChannelId(guildId, userId, channelId)) return;
  const dateKey = getDayKey(new Date());
  if (!/^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
    logActivityBumpError("bumpDailyVoice invalid dateKey", new Error(String(dateKey)));
    return;
  }
  const gid = String(guildId);
  const uid = String(userId);
  const cid = String(channelId);
  const col = profileActivityCollection();
  if (!col) {
    logActivityBumpError("bumpDailyVoice", new Error("mongoose.connection.db non disponibile"));
    return;
  }
  try {
    await col.updateOne(
      { guildId: gid, userId: uid },
      {
        $setOnInsert: { guildId: gid, userId: uid },
        $set: { "profile.totals.lastEmbedDailyKey": dateKey },
        $inc: {
          [`profile.totals.daily.${dateKey}.voiceSeconds`]: inc,
          [`profile.totals.daily.${dateKey}.voiceChannels.${cid}`]: inc,
        },
      },
      { upsert: true },
    );
  } catch (err) {
    logActivityBumpError("bumpDailyVoice", err);
  }
}

async function bumpHourlyVoice(guildId?, userId?, channelId?, seconds = 0) {
  const inc = Math.max(0, Math.floor(Number(seconds || 0)));
  if (!inc || !isValidGuildUserIdChannelId(guildId, userId, channelId)) return;
  const hourKey = getHourKey(new Date());
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(hourKey)) {
    logActivityBumpError("bumpHourlyVoice invalid hourKey", new Error(String(hourKey)));
    return;
  }
  if (ACTIVITY_LEGACY_HOURLY_DISABLED) {
    await bumpGuildHourlyVoice(guildId, userId, channelId, hourKey, inc);
    return;
  }
  const gid = String(guildId);
  const uid = String(userId);
  const cid = String(channelId);
  const col = profileActivityCollection();
  if (!col) {
    logActivityBumpError("bumpHourlyVoice", new Error("mongoose.connection.db non disponibile"));
    return;
  }
  try {
    await col.updateOne(
      { guildId: gid, userId: uid },
      {
        $setOnInsert: { guildId: gid, userId: uid },
        $set: { "profile.totals.lastEmbedHourlyKey": hourKey },
        $inc: {
          [`profile.totals.hourly.${hourKey}.voiceSeconds`]: inc,
          [`profile.totals.hourly.${hourKey}.voiceChannels.${cid}`]: inc,
        },
      },
      { upsert: true },
    );
    await bumpGuildHourlyVoice(guildId, userId, channelId, hourKey, inc);
  } catch (err) {
    logActivityBumpError("bumpHourlyVoice", err);
  }
}

async function bumpGuildHourlyVoice(guildId?, userId?, channelId?, hourKey?, seconds = 0) {
  const inc = Math.max(0, Math.floor(Number(seconds || 0)));
  if (!inc || !isValidGuildUserIdChannelId(guildId, userId, channelId)) return;
  const hk = String(hourKey || "");
  if (!/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(hk)) return;
  const gid = String(guildId);
  const uid = String(userId);
  const cid = String(channelId);
  try {
    await ActivityGuildHourly.updateOne(
      { guildId: gid },
      {
        $setOnInsert: { guildId: gid },
        $inc: {
          [`hours.${hk}.users.${uid}.voice`]: inc,
          [`hours.${hk}.users.${uid}.voiceCh.${cid}`]: inc,
        },
      },
      { upsert: true },
    );
  } catch (err) {
    logActivityBumpError("bumpGuildHourlyVoice", err);
  }
}

export = { isMongoUnavailableError, logActivityBumpError, bumpGuildHourlyText, bumpDailyVoice, bumpHourlyVoice };
