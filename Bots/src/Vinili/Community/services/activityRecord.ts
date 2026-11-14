/** Attività: registrazione di messaggi e sessioni in vocale. */
const mongoose = require("mongoose") as typeof import("mongoose");
const { ensureMongoReady } = require("../../../shared/db/mongoConnect") as typeof import("../../../shared/db/mongoConnect");
const { ACTIVITY_LEGACY_DAILY_DISABLED, ACTIVITY_LEGACY_HOURLY_DISABLED } = require("../schemas/communitySchemas") as typeof import("../schemas/communitySchemas");
const { isValidGuildUserIdChannelId } = require("../../../shared/db/validateWriteIds") as typeof import("../../../shared/db/validateWriteIds");
const { addExpWithLevel, MESSAGE_EXP, VOICE_EXP_PER_MINUTE, resolveMessageExp, resolveVoiceExpPerMinute, resolveMessageCooldownSec, shouldIgnoreExpForMember, isLevelExpGuild } = require("../../Level/services/expService") as typeof import("../../Level/services/expService");

/** cooldown messaggi EXP (dashboard): chiave guild:user → last award ms */
const messageExpCooldownUntil = new Map<string, number>();
const { resolveVoiceExpMultiplier, computeVoiceExpFromSeconds } = require("../utils/voiceExpChannelUtils") as typeof import("../utils/voiceExpChannelUtils");
const { isViniliFullFeatureGuild } = require("../../../MultiGuild/core/guildFeatureScope") as typeof import("../../../MultiGuild/core/guildFeatureScope");
const { isExcludedActivityChannel } = require("./activityChannels") as typeof import("./activityChannels");
const { getDayKey, getHourKey, getWeekKey } = require("./activityTime") as typeof import("./activityTime");
const { profileActivityCollection } = require("./activityRows") as typeof import("./activityRows");
const { logActivityBumpError, bumpGuildHourlyText, bumpDailyVoice, bumpHourlyVoice } = require("./activityBumps") as typeof import("./activityBumps");
const { ensureVoiceKeys, getOrCreateActivityUser, countMessageMedia, collectCustomEmojiUses, looksLikePrefixCommand } = require("./activityUser") as typeof import("./activityUser");
const {
  enqueueGatewayOffloadJob,
  startGatewayOffloadDrainLoop,
  OFFLOAD_KINDS,
} = require("../../../shared/runtime/gatewayOffloadQueue") as typeof import("../../../shared/runtime/gatewayOffloadQueue");
const { envFlagOn } = require("../../../shared/runtime/externalWorkerGate") as typeof import("../../../shared/runtime/externalWorkerGate");

function shouldOffloadActivityMessageWrites() {
  /* ACTIVITY_WRITE_EXTERNAL=1 (default when BOT_SCHEDULER_EXTERNAL) → worker fa Mongo/EXP */
  if (envFlagOn("ACTIVITY_WRITE_WORKER") || envFlagOn("BOT_SCHEDULER_WORKER")) return false;
  if (String(process.env.ACTIVITY_WRITE_EXTERNAL || "").trim() === "0") return false;
  return (
    envFlagOn("ACTIVITY_WRITE_EXTERNAL") ||
    envFlagOn("BOT_SCHEDULER_EXTERNAL")
  );
}

function buildMessageActivityTick(message?, now = new Date()) {
  const channelIdResolved = String(message.channelId ?? message.channel?.id ?? "").trim();
  const gid = String(message.guild.id);
  const uid = String(message.author.id);
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
  const media = countMessageMedia(message);
  return {
    guildId: gid,
    userId: uid,
    channelId: channelIdResolved,
    atMs: now.getTime(),
    media,
    mentionedUsers: mentionedUsers.slice(0, 15),
    rolePingInc:
      Math.max(0, Number(message.mentions?.roles?.size || 0)) + (message.mentions?.everyone ? 1 : 0),
    emojiUses: collectCustomEmojiUses(message.content),
    cmdInc: looksLikePrefixCommand(message) ? 1 : 0,
  };
}

async function applyMessageActivityTick(client?, tick?) {
  if (!tick?.guildId || !tick?.userId) return;
  const mongoOk = await ensureMongoReady({ maxWaitMs: 4000 });
  if (!mongoOk) return;
  const gid = String(tick.guildId);
  const uid = String(tick.userId);
  const channelIdResolved = String(tick.channelId || "").trim();
  if (!isValidGuildUserIdChannelId(gid, uid, channelIdResolved)) return;
  if (!isViniliFullFeatureGuild(gid)) return;

  const now = new Date(Number(tick.atMs) || Date.now());
  const dateKey = getDayKey(now);
  const hourKey = getHourKey(now);
  const weekKey = getWeekKey(now);
  const col = profileActivityCollection();
  if (!col) {
    logActivityBumpError("applyMessageActivityTick", new Error("mongoose.connection.db non disponibile"));
    return;
  }

  const media = tick.media && typeof tick.media === "object" ? tick.media : {};
  const mentionedUsers = Array.isArray(tick.mentionedUsers) ? tick.mentionedUsers : [];
  const rolePingInc = Math.max(0, Number(tick.rolePingInc || 0));
  const emojiUses = tick.emojiUses && typeof tick.emojiUses === "object" ? tick.emojiUses : {};
  const cmdInc = Number(tick.cmdInc || 0) ? 1 : 0;

  try {
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
      const uniq = [...new Set(mentionedUsers.map((x?) => String(x || "").trim()).filter(Boolean))].slice(0, 15);
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
    logActivityBumpError("applyMessageActivityTick coalesce", err);
    return;
  }

  if (!isLevelExpGuild(gid) || !client) return;
  const guild =
    client.guilds.cache.get(gid) || (await client.guilds.fetch(gid).catch(() => null));
  if (!guild) return;
  const amount = await resolveMessageExp(gid).catch(() => MESSAGE_EXP);
  if (!(amount > 0)) return;
  const cooldownSec = await resolveMessageCooldownSec(gid).catch(() => 0);
  if (cooldownSec > 0) {
    const key = `${gid}:${uid}`;
    const until = Number(messageExpCooldownUntil.get(key) || 0);
    const now = Date.now();
    if (now < until) return;
    messageExpCooldownUntil.set(key, now + cooldownSec * 1000);
    if (messageExpCooldownUntil.size > 20_000) {
      for (const [k, t] of messageExpCooldownUntil) {
        if (t <= now) messageExpCooldownUntil.delete(k);
      }
    }
  }
  const member = await guild.members.fetch(uid).catch(() => null);
  const ignored = await shouldIgnoreExpForMember({
    guildId: gid,
    member,
    channelId: channelIdResolved || null,
  });
  if (!ignored) {
    await addExpWithLevel(guild, uid, amount, true, true, { source: "activity" });
  }
}

async function recordMessageActivity(message?) {
  if (!isViniliFullFeatureGuild(message?.guild?.id)) return;
  if (!message?.guild || !message.author || message.author.bot) return;
  if (isExcludedActivityChannel(message.channel)) return;

  const tick = buildMessageActivityTick(message, new Date());
  if (!isValidGuildUserIdChannelId(tick.guildId, tick.userId, tick.channelId)) return;

  if (shouldOffloadActivityMessageWrites()) {
    const mongoOk = await ensureMongoReady({ maxWaitMs: 1500 });
    if (!mongoOk) return;
    await enqueueGatewayOffloadJob(OFFLOAD_KINDS.ACTIVITY_MESSAGE, tick);
    return;
  }

  const mongoOk = await ensureMongoReady({ maxWaitMs: 4000 });
  if (!mongoOk) {
    if (process.env.ACTIVITY_DEBUG === "1") {
      console.error("[ACTIVITY] recordMessageActivity skip: mongoose non connesso", mongoose.connection?.readyState);
    }
    return;
  }
  await applyMessageActivityTick(message.client || global.botClient, tick);
}

function startActivityMessageWriteDrainLoop(client?) {
  if (!(envFlagOn("ACTIVITY_WRITE_WORKER") || envFlagOn("BOT_SCHEDULER_WORKER"))) return null;
  if (client?._activityWriteDrainStarted) return client._activityWriteDrainTimer || null;
  client._activityWriteDrainStarted = true;
  global.botClient = client || global.botClient;
  const timer = startGatewayOffloadDrainLoop(
    "activity-write",
    [OFFLOAD_KINDS.ACTIVITY_MESSAGE],
    async (job?) => {
      await applyMessageActivityTick(client, job?.payload);
    },
    Math.max(400, Number(process.env.VC_ACTIVITY_WRITE_DRAIN_MS || 800) || 800),
  );
  client._activityWriteDrainTimer = timer;
  if (String(process.env.BOOT_VERBOSE || "").trim() === "1") {
    console.log("[BOT-SCHEDULER] activity/EXP write drain loop started");
  }
  return timer;
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
  const voiceRate = await resolveVoiceExpPerMinute(guild?.id).catch(() => VOICE_EXP_PER_MINUTE);
  const totalAwardableExp = computeVoiceExpFromSeconds(elapsedSeconds, voiceMult, voiceRate);
  const alreadyAwardedExp = computeVoiceExpFromSeconds(alreadyAwardedSeconds, voiceMult, voiceRate);
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

export = {
  recordMessageActivity,
  recordVoiceSessionEnd,
  isCountableVoiceState,
  handleVoiceActivity,
  applyMessageActivityTick,
  startActivityMessageWriteDrainLoop,
};
