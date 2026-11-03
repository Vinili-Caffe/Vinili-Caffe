/** Attività: registrazione di messaggi e sessioni in vocale. */
const mongoose = require("mongoose") as typeof import("mongoose");
const { ensureMongoReady } = require("../../../shared/db/mongoConnect") as typeof import("../../../shared/db/mongoConnect");
const { ACTIVITY_LEGACY_DAILY_DISABLED, ACTIVITY_LEGACY_HOURLY_DISABLED } = require("../schemas/communitySchemas") as typeof import("../schemas/communitySchemas");
const { isValidGuildUserIdChannelId } = require("../../../shared/db/validateWriteIds") as typeof import("../../../shared/db/validateWriteIds");
const { addExpWithLevel, MESSAGE_EXP, VOICE_EXP_PER_MINUTE, shouldIgnoreExpForMember, isLevelExpGuild } = require("../../Level/services/expService") as typeof import("../../Level/services/expService");
const { resolveVoiceExpMultiplier, computeVoiceExpFromSeconds } = require("../utils/voiceExpChannelUtils") as typeof import("../utils/voiceExpChannelUtils");
const { isViniliFullFeatureGuild } = require("../../../MultiGuild/core/guildFeatureScope") as typeof import("../../../MultiGuild/core/guildFeatureScope");
const { isExcludedActivityChannel } = require("./activityChannels") as typeof import("./activityChannels");
const { getDayKey, getHourKey, getWeekKey } = require("./activityTime") as typeof import("./activityTime");
const { profileActivityCollection } = require("./activityRows") as typeof import("./activityRows");
const { logActivityBumpError, bumpGuildHourlyText, bumpDailyVoice, bumpHourlyVoice } = require("./activityBumps") as typeof import("./activityBumps");
const { ensureVoiceKeys, getOrCreateActivityUser, countMessageMedia, collectCustomEmojiUses, looksLikePrefixCommand } = require("./activityUser") as typeof import("./activityUser");

async function recordMessageActivity(message?) {
  if (!isViniliFullFeatureGuild(message?.guild?.id)) return;
  const mongoOk = await ensureMongoReady({ maxWaitMs: 4000 });
  if (!mongoOk) {
    if (process.env.ACTIVITY_DEBUG === "1") {
      console.error("[ACTIVITY] recordMessageActivity skip: mongoose non connesso", mongoose.connection?.readyState);
    }
    return;
  }
  if (!message?.guild || !message.author || message.author.bot) return;
  if (isExcludedActivityChannel(message.channel)) return;
  const now = new Date();
  const channelIdResolved = String(message.channelId ?? message.channel?.id ?? "").trim();
  const gid = String(message.guild.id);
  const uid = String(message.author.id);
  if (!isValidGuildUserIdChannelId(gid, uid, channelIdResolved)) return;

  /* perfP0: un solo updateOne invece di save + bumpDaily + bumpHourly */
  const dateKey = getDayKey(now);
  const hourKey = getHourKey(now);
  const col = profileActivityCollection();
  if (!col) {
    logActivityBumpError("recordMessageActivity", new Error("mongoose.connection.db non disponibile"));
    return;
  }
  try {
    const weekKey = getWeekKey(now);
    const media = countMessageMedia(message);
    const mentionedUsers = [];
    try {
      if (message.mentions?.users?.forEach) {
        message.mentions.users.forEach((u?) => {
          const id = String(u?.id || "").trim();
          if (id && id !== uid) mentionedUsers.push(id);
        });
      }
    } catch {
      /* ignore */
    }
    const rolePingInc =
      Math.max(0, Number(message.mentions?.roles?.size || 0)) + (message.mentions?.everyone ? 1 : 0);
    const emojiUses = collectCustomEmojiUses(message.content);
    const cmdInc = looksLikePrefixCommand(message) ? 1 : 0;
    /* pipeline: reset daily/weekly flat counters al cambio chiave (compatibile compact) */
    const pipelineSet = {
      guildId: gid,
      userId: uid,
      "profile.totals.messagesTotal": {
        $add: [{ $ifNull: ["$profile.totals.messagesTotal", 0] }, 1],
      },
      "profile.totals.messagesDaily": {
        $cond: [
          { $eq: [{ $ifNull: ["$profile.totals.messagesDailyKey", ""] }, dateKey] },
          { $add: [{ $ifNull: ["$profile.totals.messagesDaily", 0] }, 1] },
          1,
        ],
      },
      "profile.totals.messagesDailyKey": dateKey,
      "profile.totals.messagesWeekly": {
        $cond: [
          { $eq: [{ $ifNull: ["$profile.totals.messagesWeeklyKey", ""] }, weekKey] },
          { $add: [{ $ifNull: ["$profile.totals.messagesWeekly", 0] }, 1] },
          1,
        ],
      },
      "profile.totals.messagesWeeklyKey": weekKey,
    };
    if (media.gifs > 0) {
      pipelineSet["profile.totals.gifsTotal"] = {
        $add: [{ $ifNull: ["$profile.totals.gifsTotal", 0] }, media.gifs],
      };
    }
    if (media.images > 0) {
      pipelineSet["profile.totals.imagesTotal"] = {
        $add: [{ $ifNull: ["$profile.totals.imagesTotal", 0] }, media.images],
      };
    }
    if (mentionedUsers.length > 0) {
      pipelineSet["profile.totals.mentionsMade"] = {
        $add: [{ $ifNull: ["$profile.totals.mentionsMade", 0] }, mentionedUsers.length],
      };
    }
    if (rolePingInc > 0) {
      pipelineSet["profile.totals.rolePings"] = {
        $add: [{ $ifNull: ["$profile.totals.rolePings", 0] }, rolePingInc],
      };
    }
    if (cmdInc > 0) {
      pipelineSet["profile.totals.commandsTotal"] = {
        $add: [{ $ifNull: ["$profile.totals.commandsTotal", 0] }, cmdInc],
      };
    }
    for (const [ek, n] of Object.entries(emojiUses)) {
      if (!n) continue;
      pipelineSet[`profile.totals.emojiUses.${ek}`] = {
        $add: [{ $ifNull: [`$profile.totals.emojiUses.${ek}`, 0] }, n],
      };
    }
    if (!ACTIVITY_LEGACY_DAILY_DISABLED && /^\d{4}-\d{2}-\d{2}$/.test(dateKey)) {
      pipelineSet[`profile.totals.daily.${dateKey}.textCount`] = {
        $add: [{ $ifNull: [`$profile.totals.daily.${dateKey}.textCount`, 0] }, 1],
      };
      pipelineSet["profile.totals.lastEmbedDailyKey"] = dateKey;
    }
    if (!ACTIVITY_LEGACY_HOURLY_DISABLED && /^\d{4}-\d{2}-\d{2}T\d{2}$/.test(hourKey)) {
      pipelineSet[`profile.totals.hourly.${hourKey}.textCount`] = {
        $add: [{ $ifNull: [`$profile.totals.hourly.${hourKey}.textCount`, 0] }, 1],
      };
      pipelineSet["profile.totals.lastEmbedHourlyKey"] = hourKey;
    }
    await col.updateOne({ guildId: gid, userId: uid }, [{ $set: pipelineSet }], { upsert: true });
    if (mentionedUsers.length > 0) {
      const uniq = [...new Set(mentionedUsers)].slice(0, 15);
      await Promise.all(
        uniq.map((mid?) =>
          col
            .updateOne(
              { guildId: gid, userId: mid },
              [
                {
                  $set: {
                    guildId: gid,
                    userId: mid,
                    "profile.totals.mentionsReceived": {
                      $add: [{ $ifNull: ["$profile.totals.mentionsReceived", 0] }, 1],
                    },
                  },
                },
              ],
              { upsert: true },
            )
            .catch(() => null),
        ),
      );
    }
    if (/^\d{4}-\d{2}-\d{2}T\d{2}$/.test(hourKey)) {
      await bumpGuildHourlyText(gid, uid, channelIdResolved, hourKey, 1);
    }
  } catch (err) {
    logActivityBumpError("recordMessageActivity coalesce", err);
    return;
  }

  const member = message.member || (await message.guild.members.fetch(message.author.id).catch(() => null));
  if (isLevelExpGuild(message.guild.id)) {
    const ignored = await shouldIgnoreExpForMember({ guildId: message.guild.id, member, channelId: message.channel?.id || message.channelId || null, });
    if (!ignored) {
      await addExpWithLevel(message.guild, message.author.id, MESSAGE_EXP, true, true, { source: "activity" });
    }
  }
}

async function recordVoiceSessionEnd(doc?, now?, guild?, skipExp = false, channelIdOverride = null) {
  if (!doc.profile) doc.profile = {};
  if (!doc.profile.totals) doc.profile.totals = {};
  const startedAt = doc.profile.totals.sessionStartedAt;
  if (!startedAt) return 0;
  const channelId = String(channelIdOverride || doc.profile.totals.sessionChannelId || "");
  const elapsedSeconds = Math.max(0, Math.floor((now.getTime() - new Date(startedAt).getTime()) / 1000),);
  ensureVoiceKeys(doc, now);
  doc.profile.totals.voiceTotalSeconds = Number(doc.profile.totals.voiceTotalSeconds || 0) + elapsedSeconds;
  doc.profile.totals.voiceDailySeconds = Number(doc.profile.totals.voiceDailySeconds || 0) + elapsedSeconds;
  doc.profile.totals.voiceWeeklySeconds =
    Number(doc.profile.totals.voiceWeeklySeconds || 0) + elapsedSeconds;
  doc.profile.totals.sessionStartedAt = null;
  doc.profile.totals.sessionChannelId = null;
  const alreadyAwardedSeconds = Math.max(0, Number(doc.profile.totals.expAwardedSeconds || 0),);
  const voiceMult = skipExp ? 0 : await resolveVoiceExpMultiplier({ id: channelId }, guild, guild?.client);
  const totalAwardableExp = computeVoiceExpFromSeconds(elapsedSeconds, voiceMult, VOICE_EXP_PER_MINUTE);
  const alreadyAwardedExp = computeVoiceExpFromSeconds(alreadyAwardedSeconds, voiceMult, VOICE_EXP_PER_MINUTE);
  const remainingExp = Math.max(0, totalAwardableExp - alreadyAwardedExp);
  doc.profile.totals.expAwardedSeconds = 0;
  if (!skipExp && remainingExp > 0 && isLevelExpGuild(guild?.id)) {
    await addExpWithLevel(guild, doc.userId, remainingExp, true, true, { source: "activity" });
  }
  return elapsedSeconds;
}

function isCountableVoiceState(state?) {
  if (!state?.channelId) return false;
  const channel = state.channel || state?.guild?.channels?.cache?.get(state.channelId);
  if (isExcludedActivityChannel(channel || state)) return false;

  if (state.selfMute && state.selfDeaf) return false;
  return true;
}

async function handleVoiceActivity(oldState?, newState?) {
  const member = newState?.member || oldState?.member;
  if (!member || member.user?.bot) return;
  const guildId = newState?.guild?.id || oldState?.guild?.id;
  const userId = member.id;
  if (!guildId || !userId) return;
  if (!isViniliFullFeatureGuild(guildId)) return;

  const now = new Date();
  const wasInVoice = Boolean(oldState?.channelId);
  const isInVoice = Boolean(newState?.channelId);
  const wasCountable = isCountableVoiceState(oldState);
  const isCountable = isCountableVoiceState(newState);

  let doc = await getOrCreateActivityUser(guildId, userId);
  if (!doc) return;

  if (wasInVoice && !isInVoice) {
    const oldChannel = oldState?.channel || oldState?.guild?.channels?.cache?.get(oldState.channelId);
    const flushedBefore = Math.max(0, Number(doc.profile?.totals?.voiceActivityBucketFlushSeconds || 0));
    let elapsedSeconds = 0;
    if (wasCountable) {
      const ignored = await shouldIgnoreExpForMember({ guildId, member, channelId: oldChannel?.id || null, });
      elapsedSeconds = await recordVoiceSessionEnd(
        doc,
        now,
        member.guild,
        ignored,
      );
    } else {
      if (!doc.profile) doc.profile = {};
      if (!doc.profile.totals) doc.profile.totals = {};
      doc.profile.totals.sessionStartedAt = null;
      doc.profile.totals.sessionChannelId = null;
      doc.profile.totals.expAwardedSeconds = 0;
    }
    const remainingBucket = Math.max(0, elapsedSeconds - flushedBefore);
    if (oldChannel?.id && remainingBucket > 0) {
      await bumpDailyVoice(guildId, userId, oldChannel.id, remainingBucket);
      await bumpHourlyVoice(guildId, userId, oldChannel.id, remainingBucket);
    }
    if (!doc.profile) doc.profile = {};
    if (!doc.profile.totals) doc.profile.totals = {};
    doc.profile.totals.voiceActivityBucketFlushSeconds = 0;
    await doc.save();
    return;
  }

  if (wasInVoice && isInVoice && oldState.channelId !== newState.channelId) {
    const oldChannel = oldState?.channel || oldState?.guild?.channels?.cache?.get(oldState.channelId);
    const flushedBefore = Math.max(0, Number(doc.profile?.totals?.voiceActivityBucketFlushSeconds || 0));
    let elapsedSeconds = 0;
    if (wasCountable) {
      const ignored = await shouldIgnoreExpForMember({ guildId, member, channelId: oldChannel?.id || null, });
      elapsedSeconds = await recordVoiceSessionEnd(
        doc,
        now,
        member.guild,
        ignored,
      );
    } else {
      if (!doc.profile) doc.profile = {};
      if (!doc.profile.totals) doc.profile.totals = {};
      doc.profile.totals.sessionStartedAt = null;
      doc.profile.totals.sessionChannelId = null;
      doc.profile.totals.expAwardedSeconds = 0;
    }
    const remainingMove = Math.max(0, elapsedSeconds - flushedBefore);
    if (oldChannel?.id && remainingMove > 0) {
      await bumpDailyVoice(guildId, userId, oldChannel.id, remainingMove);
      await bumpHourlyVoice(guildId, userId, oldChannel.id, remainingMove);
    }
    if (!doc.profile) doc.profile = {};
    if (!doc.profile.totals) doc.profile.totals = {};
    doc.profile.totals.sessionStartedAt = isCountable ? now : null;
    doc.profile.totals.sessionChannelId = isCountable
      ? String(newState?.channelId || "")
      : null;
    doc.profile.totals.expAwardedSeconds = 0;
    doc.profile.totals.voiceActivityBucketFlushSeconds = 0;
    await doc.save();
    return;
  }

  if (wasInVoice && isInVoice && oldState.channelId === newState.channelId) {
    if (wasCountable && !isCountable) {
      const channel = oldState?.channel || newState?.channel || newState?.guild?.channels?.cache?.get(newState.channelId);
      const flushedBefore = Math.max(0, Number(doc.profile?.totals?.voiceActivityBucketFlushSeconds || 0));
      const ignored = await shouldIgnoreExpForMember({ guildId, member, channelId: channel?.id || null, });
      const elapsedSeconds = await recordVoiceSessionEnd(doc, now, member.guild, ignored,);
      const remainingMute = Math.max(0, elapsedSeconds - flushedBefore);
      if (channel?.id && remainingMute > 0) {
        await bumpDailyVoice(guildId, userId, channel.id, remainingMute);
        await bumpHourlyVoice(guildId, userId, channel.id, remainingMute);
      }
      if (!doc.profile) doc.profile = {};
      if (!doc.profile.totals) doc.profile.totals = {};
      doc.profile.totals.voiceActivityBucketFlushSeconds = 0;
      await doc.save();
      return;
    }

    if (!wasCountable && isCountable) {
      if (!doc.profile) doc.profile = {};
      if (!doc.profile.totals) doc.profile.totals = {};
      doc.profile.totals.sessionStartedAt = now;
      doc.profile.totals.sessionChannelId = String(newState?.channelId || "");
      doc.profile.totals.expAwardedSeconds = 0;
      doc.profile.totals.voiceActivityBucketFlushSeconds = 0;
      await doc.save();
      return;
    }
  }

  if (!wasInVoice && isInVoice) {
    if (!doc.profile) doc.profile = {};
    if (!doc.profile.totals) doc.profile.totals = {};
    doc.profile.totals.sessionStartedAt = isCountable ? now : null;
    doc.profile.totals.sessionChannelId = isCountable
      ? String(newState?.channelId || "")
      : null;
    doc.profile.totals.expAwardedSeconds = 0;
    doc.profile.totals.voiceActivityBucketFlushSeconds = 0;
    await doc.save();
    return;
  }
}

export = { recordMessageActivity, recordVoiceSessionEnd, isCountableVoiceState, handleVoiceActivity };
