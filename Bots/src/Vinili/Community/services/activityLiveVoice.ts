/** Attività: EXP in tempo reale a chi è in vocale. */
const { isMongoReady } = require("../../../shared/db/mongoConnect") as typeof import("../../../shared/db/mongoConnect");
const { ActivityUserProfile, ACTIVITY_MAIN_GUILD_ID } = require("../schemas/communitySchemas") as typeof import("../schemas/communitySchemas");
const { isValidGuildUserIdChannelId } = require("../../../shared/db/validateWriteIds") as typeof import("../../../shared/db/validateWriteIds");
const { addExpWithLevel, VOICE_EXP_PER_MINUTE, shouldIgnoreExpForMember, isLevelExpGuild } = require("../../Level/services/expService") as typeof import("../../Level/services/expService");
const { resolveVoiceExpMultiplier, computeVoiceExpFromSeconds } = require("../utils/voiceExpChannelUtils") as typeof import("../utils/voiceExpChannelUtils");
const { bumpDailyVoice, bumpHourlyVoice } = require("./activityBumps") as typeof import("./activityBumps");
const { recordVoiceSessionEnd, isCountableVoiceState } = require("./activityRecord") as typeof import("./activityRecord");

async function syncLiveVoiceSessionsFromGateway(client?) {
  if (!client?.guilds?.cache) return;
  const now = new Date();

  for (const guild of client.guilds.cache.values()) {
    const guildId = String(guild?.id || "");
    if (!guildId) continue;
    /* Sessioni live EXP solo sul guild livelli (main): evita ghost su tenant MultiGuild. */
    if (!isLevelExpGuild(guildId)) continue;

    const activeUserIds = new Set();
    for (const state of guild.voiceStates?.cache?.values?.() || []) {
      const member = state?.member;
      if (!member || member.user?.bot) continue;
      if (!isCountableVoiceState(state)) continue;
      const userId = String(member.id || "");
      if (!userId) continue;
      activeUserIds.add(userId);

      await ActivityUserProfile.updateOne(
        { guildId, userId, "profile.totals.sessionStartedAt": { $eq: null } },
        {
          $set: {
            "profile.totals.sessionStartedAt": now,
            "profile.totals.sessionChannelId": String(state.channelId || ""),
            "profile.totals.expAwardedSeconds": 0,
            "profile.totals.voiceActivityBucketFlushSeconds": 0,
          },
          $setOnInsert: { guildId, userId },
        },
        { upsert: true },
      ).catch(() => { });

      await ActivityUserProfile.updateOne(
        { guildId, userId, "profile.totals.sessionStartedAt": { $ne: null } },
        {
          $set: {
            "profile.totals.sessionChannelId": String(state.channelId || ""),
          },
        },
      ).catch(() => { });
    }

    /* voiceGhostAward1: sessione aperta ma user non più in VC (reboot/offline leave)
       → chiudi come leave normale (EXP + bucket), non azzerare a vuoto. */
    const openSessions = await ActivityUserProfile.find({ guildId, "profile.totals.sessionStartedAt": { $ne: null } })
      .select(
        "userId profile.totals.sessionStartedAt profile.totals.sessionChannelId profile.totals.expAwardedSeconds profile.totals.voiceActivityBucketFlushSeconds profile.totals.voiceTotalSeconds profile.totals.voiceDailySeconds profile.totals.voiceWeeklySeconds profile.totals.exp",
      )
      .catch(() => []);

    for (const doc of openSessions || []) {
      const userId = String(doc?.userId || "");
      if (!userId || activeUserIds.has(userId)) continue;
      try {
        const channelId = String(doc.profile?.totals?.sessionChannelId || "");
        const flushedBefore = Math.max(0, Number(doc.profile?.totals?.voiceActivityBucketFlushSeconds || 0));
        let member = null;
        try {
          member = await guild.members.fetch(userId).catch(() => null);
        } catch (_) {
          member = null;
        }
        const ignored = await shouldIgnoreExpForMember({
          guildId,
          member,
          channelId: channelId || null,
        }).catch(() => false);
        const elapsedSeconds = await recordVoiceSessionEnd(doc, now, guild, ignored, channelId || null);
        const remainingBucket = Math.max(0, Number(elapsedSeconds || 0) - flushedBefore);
        if (channelId && remainingBucket > 0) {
          await bumpDailyVoice(guildId, userId, channelId, remainingBucket);
          await bumpHourlyVoice(guildId, userId, channelId, remainingBucket);
        }
        if (!doc.profile) doc.profile = {};
        if (!doc.profile.totals) doc.profile.totals = {};
        doc.profile.totals.voiceActivityBucketFlushSeconds = 0;
        await doc.save().catch(() => null);
      } catch (err) {
        global.logger?.warn?.(
          "[activity] voice ghost close failed:",
          guildId,
          userId,
          err?.message || err,
        );
        await ActivityUserProfile.updateOne(
          { guildId, userId },
          {
            $set: {
              "profile.totals.sessionStartedAt": null,
              "profile.totals.sessionChannelId": null,
              "profile.totals.expAwardedSeconds": 0,
              "profile.totals.voiceActivityBucketFlushSeconds": 0,
            },
          },
        ).catch(() => { });
      }
    }
  }
}

/* perfP1: batch più piccolo / intervallo più largo di default */
const LIVE_VOICE_EXP_BATCH_SIZE = Math.max(10, Math.min(200, Number(process.env.LIVE_VOICE_EXP_BATCH_SIZE) || 50));
const VOICE_ACTIVITY_BUCKET_FLUSH_SEC = Math.max(5, Math.min(120, Number(process.env.VOICE_ACTIVITY_BUCKET_FLUSH_SEC) || 15));

async function runLiveVoiceExpTick(client?) {
  if (!client?.guilds?.cache) return;
  if (!isMongoReady()) return;
  const nowMs = Date.now();
  const mainGuildId = String(ACTIVITY_MAIN_GUILD_ID || "").trim();
  const sessionFilter: Record<string, any> = { "profile.totals.sessionStartedAt": { $ne: null } };
  if (mainGuildId) sessionFilter.guildId = mainGuildId;
  const rows = await ActivityUserProfile.find(sessionFilter)
    .select("guildId userId profile.totals.sessionStartedAt profile.totals.sessionChannelId profile.totals.expAwardedSeconds profile.totals.voiceActivityBucketFlushSeconds")
    .sort({ "profile.totals.sessionStartedAt": 1 })
    .limit(LIVE_VOICE_EXP_BATCH_SIZE)
    .lean()
    .catch(() => []);

  if (!isMongoReady()) return;
  for (const row of rows) {
    const guildId = String(row?.guildId || "");
    const userId = String(row?.userId || "");
    const startedAt = row?.profile?.totals?.sessionStartedAt;
    const channelId = String(row?.profile?.totals?.sessionChannelId || "");
    if (!guildId || !userId || !startedAt || !channelId) continue;
    if (!isLevelExpGuild(guildId)) {
      /* Chiudi sessioni ghost su guild senza livelli (non devono restare in coda). */
      await ActivityUserProfile.updateOne(
        { guildId, userId },
        {
          $set: {
            "profile.totals.sessionStartedAt": null,
            "profile.totals.sessionChannelId": null,
            "profile.totals.expAwardedSeconds": 0,
            "profile.totals.voiceActivityBucketFlushSeconds": 0,
          },
        },
      ).catch(() => { });
      continue;
    }

    const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
    if (!guild) continue;

    let member = guild.members?.cache?.get(userId) || null;
    if (!member) {
      try {
        const { getGuildMemberCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
        member = await getGuildMemberCached(guild, userId);
      } catch (_) {
        member = await guild.members?.fetch(userId).catch(() => null);
      }
    }
    if (!member || member.user?.bot) continue;

    const elapsedSeconds = Math.max(0, Math.floor((nowMs - new Date(startedAt).getTime()) / 1000),);
    const flushed = Math.max(0, Math.floor(Number(row?.profile?.totals?.voiceActivityBucketFlushSeconds || 0)));
    const pendingBucket = Math.max(0, elapsedSeconds - flushed);
    if (pendingBucket >= VOICE_ACTIVITY_BUCKET_FLUSH_SEC && isValidGuildUserIdChannelId(guildId, userId, channelId)) {
      await bumpDailyVoice(guildId, userId, channelId, pendingBucket);
      await bumpHourlyVoice(guildId, userId, channelId, pendingBucket);
      const rowId = row?._id;
      if (rowId) {
        await ActivityUserProfile.updateOne(
          { _id: rowId },
          { $inc: { "profile.totals.voiceActivityBucketFlushSeconds": pendingBucket } },
        ).catch(() => { });
      }
    }

    const alreadyAwardedSeconds = Math.max(0, Number(row?.profile?.totals?.expAwardedSeconds || 0),);
    const ignored = await shouldIgnoreExpForMember({ guildId, member, channelId, });
    const voiceMult = ignored ? 0 : await resolveVoiceExpMultiplier({ id: channelId }, guild, client);
    const totalAwardableExp = computeVoiceExpFromSeconds(elapsedSeconds, voiceMult, VOICE_EXP_PER_MINUTE);
    const alreadyAwardedExp = computeVoiceExpFromSeconds(alreadyAwardedSeconds, voiceMult, VOICE_EXP_PER_MINUTE);
    const grantableExp = Math.max(0, totalAwardableExp - alreadyAwardedExp);
    if (grantableExp <= 0) continue;

    if (!ignored) {
      await addExpWithLevel(guild, userId, grantableExp, true, true, { source: "activity" }).catch(() => { });
    }

    await ActivityUserProfile.updateOne(
      {
        guildId,
        userId,
        "profile.totals.sessionStartedAt": row?.profile?.totals?.sessionStartedAt || null,
      },
      { $set: { "profile.totals.expAwardedSeconds": elapsedSeconds } },
    ).catch(() => { });
  }
}

export = { syncLiveVoiceSessionsFromGateway, runLiveVoiceExpTick };
