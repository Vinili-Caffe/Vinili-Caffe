/** Bump: stato e promemoria del bump. */
const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { getClientChannelCached, getClientGuildCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { resolveLean } = require("./voteReminderState") as typeof import("./voteReminderState");

const BUMP_REMINDER_CHANNEL_BY_KEY = { disboard: IDs.channels.commands, discadia: IDs.channels.commands, };

function buildBumpStateModel(kind?, stateUserId?) {
  const lastBumpAtPath = `bumpState.${kind}.lastBumpAt`;
  const lastBumpUserIdPath = `bumpState.${kind}.lastBumpUserId`;
  const reminderSentAtPath = `bumpState.${kind}.reminderSentAt`;
  return {
    async findOne(filter?) {
      const guildId = String(filter?.guildId || "");
      if (!guildId) return null;
      let doc = await ActivityUserProfile.findOne({ guildId, userId: stateUserId })
        .select(`${lastBumpAtPath} ${lastBumpUserIdPath} ${reminderSentAtPath}`)
        .lean()
        .catch(() => null);
      if (!doc?.bumpState?.[kind]?.lastBumpAt) {
        doc = await ActivityUserProfile.findOne({
          guildId,
          [lastBumpAtPath]: { $exists: true, $ne: null },
        })
          .sort({ [lastBumpAtPath]: -1 })
          .select(`${lastBumpAtPath} ${lastBumpUserIdPath} ${reminderSentAtPath}`)
          .lean()
          .catch(() => null);
      }
      if (!doc) return null;
      return {
        guildId,
        lastBumpAt: doc?.bumpState?.[kind]?.lastBumpAt || null,
        lastBumpUserId: doc?.bumpState?.[kind]?.lastBumpUserId || null,
        reminderSentAt: doc?.bumpState?.[kind]?.reminderSentAt || null,
      };
    },
    async findOneAndUpdate(filter?, update?, options: Record<string, any> = {}) {
      const guildId = String(filter?.guildId || "");
      if (!guildId) return null;
      const setPayload = update?.$set || {};
      const setDoc: Record<string, any> = {};
      if ("lastBumpAt" in setPayload) setDoc[lastBumpAtPath] = setPayload.lastBumpAt;
      if ("lastBumpUserId" in setPayload) setDoc[lastBumpUserIdPath] = setPayload.lastBumpUserId;
      if ("reminderSentAt" in setPayload) setDoc[reminderSentAtPath] = setPayload.reminderSentAt;
      const doc = await ActivityUserProfile.findOneAndUpdate(
        { guildId, userId: stateUserId },
        { $setOnInsert: { guildId, userId: stateUserId }, $set: setDoc },
        { upsert: true, new: options?.new !== false, setDefaultsOnInsert: true },
      ).lean().catch(() => null);
      if (!doc) return null;
      return {
        guildId,
        lastBumpAt: doc?.bumpState?.[kind]?.lastBumpAt || null,
        lastBumpUserId: doc?.bumpState?.[kind]?.lastBumpUserId || null,
        reminderSentAt: doc?.bumpState?.[kind]?.reminderSentAt || null,
      };
    },
    async updateOne(filter?, update?) {
      const guildId = String(filter?.guildId || "");
      if (!guildId) return null;
      const setPayload = update?.$set || {};
      const setDoc: Record<string, any> = {};
      if ("reminderSentAt" in setPayload) setDoc[reminderSentAtPath] = setPayload.reminderSentAt;
      return ActivityUserProfile.updateOne(
        { guildId, userId: stateUserId },
        { $setOnInsert: { guildId, userId: stateUserId }, $set: setDoc },
        { upsert: true },
      ).catch(() => null);
    },
    async find(filter?, projection: Record<string, any> = {}) {
      const query: Record<string, any> = {};
      if (filter?.lastBumpAt?.$exists) query[lastBumpAtPath] = { $exists: true, $ne: null };
      const docs = await ActivityUserProfile.find(query)
        .select(`guildId ${projection?.lastBumpAt ? lastBumpAtPath : ""} ${projection?.reminderSentAt ? reminderSentAtPath : ""}`)
        .limit(4000)
        .lean()
        .catch(() => []);
      const byGuild = new Map();
      for (const doc of docs) {
        const gid = String(doc?.guildId || "");
        if (!gid) continue;
        const nextLast = doc?.bumpState?.[kind]?.lastBumpAt || null;
        if (!nextLast) continue;
        const prev = byGuild.get(gid);
        if (!prev) {
          byGuild.set(gid, {
            guildId: gid,
            lastBumpAt: nextLast,
            reminderSentAt: doc?.bumpState?.[kind]?.reminderSentAt || null,
          });
          continue;
        }
        const prevTs = new Date(prev.lastBumpAt).getTime();
        const nextTs = new Date(nextLast).getTime();
        if (Number.isFinite(nextTs) && (!Number.isFinite(prevTs) || nextTs > prevTs)) {
          byGuild.set(gid, {
            guildId: gid,
            lastBumpAt: nextLast,
            reminderSentAt: doc?.bumpState?.[kind]?.reminderSentAt || null,
          });
        }
      }
      return Array.from(byGuild.values());
    },
    async findGuildIdsDueForReminderSweep(cooldownMs?) {
      const ms = Number(cooldownMs);
      if (!Number.isFinite(ms) || ms <= 0) return [];
      const cutoff = new Date(Date.now() - ms);
      const docs = await ActivityUserProfile.find({
        userId: stateUserId,
        [lastBumpAtPath]: { $exists: true, $ne: null, $lte: cutoff },
      })
        .select("guildId")
        .limit(100)
        .lean()
        .catch(() => []);
      return docs.map((d?) => String(d?.guildId || "")).filter(Boolean);
    },
    async claimReminderNotificationSlot(guildId?, lastBumpAt?) {
      const gid = String(guildId || "");
      if (!gid || !lastBumpAt) return null;
      const lb = lastBumpAt instanceof Date ? lastBumpAt : new Date(lastBumpAt);
      const lbMs = lb.getTime();
      if (!Number.isFinite(lbMs)) return null;
      const winMs = 5000;
      const claimedAt = new Date();
      const res = await ActivityUserProfile.updateOne(
        {
          guildId: gid,
          userId: stateUserId,
          [lastBumpAtPath]: { $gte: new Date(lbMs - winMs), $lte: new Date(lbMs + winMs) },
          $or: [
            { [reminderSentAtPath]: { $exists: false } },
            { [reminderSentAtPath]: null },
            { [reminderSentAtPath]: { $lt: lb } },
          ],
        },
        { $set: { [reminderSentAtPath]: claimedAt } },
      ).catch(() => ({ modifiedCount: 0 }));
      return res?.modifiedCount === 1 ? claimedAt : null;
    },
    async rollbackReminderNotificationClaim(guildId?, claimedAt?) {
      const gid = String(guildId || "");
      if (!gid || !claimedAt) return;
      await ActivityUserProfile.updateOne(
        { guildId: gid, userId: stateUserId, [reminderSentAtPath]: claimedAt },
        { $set: { [reminderSentAtPath]: null } },
      ).catch(() => null);
    },
  };
}

function createBumpReminderService(options?) {
  const { model, configKey, defaultCooldownMinutes, mentionContent, title, url, description } = options;

  const bumpTimers = new Map();
  const RETRY_DELAY_MS = 5 * 60 * 1000;
  const MIN_CHAT_MESSAGES_FOR_REMINDER = 10;

  function getCooldownMs(client?) {
    const minutes = client?.config?.[configKey]?.cooldownMinutes || defaultCooldownMinutes;
    return minutes * 60 * 1000;
  }

  function getReminderChannelId(client?) {
    const fromCfg = client?.config?.[configKey]?.reminderChannelId;
    if (fromCfg) return String(fromCfg);
    return BUMP_REMINDER_CHANNEL_BY_KEY[configKey] || null;
  }

  function debugReminder(guildId?, message?) {
    void guildId;
    void message;
  }

  async function resolveFallbackReminderChannel(client?, guildId?) {
    const guild = await getClientGuildCached(client, guildId).catch(() => null);
    if (!guild) return null;
    await guild.channels.fetch().catch(() => null);
    const fallback = guild.channels.cache.find((ch?) => {
      if (!ch?.isTextBased?.()) return false;
      const name = String(ch?.name || "").toLowerCase();
      return /(comand|command|cmd)/i.test(name);
    });
    return fallback || null;
  }

  async function resolveReminderChannel(client?, reminderChannelId?, guildId?) {
    let channel =
      client.channels.cache.get(reminderChannelId) ||
      (await getClientChannelCached(client, reminderChannelId).catch(() => null));
    if (channel?.id) return channel;
    const mainGid = String(client?.config?.mainGuildId || IDs.guilds?.main || "");
    if (!mainGid) return null;
    const guild = await getClientGuildCached(client, mainGid).catch(() => null);
    if (!guild) return null;
    const fromMainGuild = (
      guild.channels.cache.get(reminderChannelId) ||
      (await guild.channels.fetch(reminderChannelId).catch(() => null))
    );
    if (fromMainGuild?.id) return fromMainGuild;
    return resolveFallbackReminderChannel(client, guildId || mainGid);
  }

  async function channelHasMinMessagesForReminder(channel?) {
    if (!channel?.messages?.fetch) return false;
    const batch = await channel.messages.fetch({ limit: MIN_CHAT_MESSAGES_FOR_REMINDER }).catch(() => null);
    return Boolean(batch && batch.size >= MIN_CHAT_MESSAGES_FOR_REMINDER);
  }

  async function sendReminder(client?, guildId?) {
    const gid = String(guildId || "");
    if (!gid) return false;
    const cooldownMs = getCooldownMs(client);
    const fresh = await resolveLean(model.findOne({ guildId: gid })).catch(() => null);
    if (!fresh?.lastBumpAt) {
      debugReminder(gid, "skip:no_lastBumpAt");
      return false;
    }
    const lastT = new Date(fresh.lastBumpAt).getTime();
    const remindedT = fresh?.reminderSentAt
      ? new Date(fresh.reminderSentAt).getTime()
      : NaN;
    if (Number.isFinite(remindedT) && remindedT >= lastT) {
      debugReminder(gid, `skip:already_reminded remindedAt=${new Date(remindedT).toISOString()} lastBumpAt=${new Date(lastT).toISOString()}`);
      return false;
    }
    if (!Number.isFinite(lastT)) {
      debugReminder(gid, "skip:invalid_lastBumpAt");
      return false;
    }
    const dueAt = lastT + cooldownMs;
    if (Date.now() < dueAt) {
      debugReminder(gid, `skip:not_due dueAt=${new Date(dueAt).toISOString()}`);
      return false;
    }

    const lastBumpAtForClaim = fresh.lastBumpAt;

    async function afterFailedClaim() {
      const again = await resolveLean(model.findOne({ guildId: gid })).catch(() => null);
      if (!again) return false;
      if (!again.lastBumpAt) return true;
      const lastT2 = new Date(again.lastBumpAt).getTime();
      const remindedT2 = again?.reminderSentAt ? new Date(again.reminderSentAt).getTime() : NaN;
      if (Number.isFinite(remindedT2) && remindedT2 >= lastT2) return true;
      return false;
    }

    const reminderChannelId = getReminderChannelId(client);
    if (!reminderChannelId) {
      const fallback = await resolveFallbackReminderChannel(client, gid);
      if (!fallback) {
        debugReminder(gid, "send_fail:no_config_channel_and_no_fallback");
        return false;
      }
      if (!(await channelHasMinMessagesForReminder(fallback))) {
        debugReminder(gid, "skip:few_channel_messages");
        return false;
      }
      const claimedAt = await model.claimReminderNotificationSlot(gid, lastBumpAtForClaim);
      if (!claimedAt) {
        const done = await afterFailedClaim();
        debugReminder(gid, done ? "skip:claim_lost_already_reminded" : "skip:claim_lost");
        return done;
      }
      debugReminder(gid, `send_try:fallback_channel channelId=${String(fallback.id || "")}`);
      const sent = await fallback.send({
        content: mentionContent,
        embeds: [
          new EmbedBuilder()
            .setColor(client?.config?.embedInfo || "#6f4e37")
            .setTitle(title)
            .setURL(url)
            .setDescription(description),
        ],
      }).then(() => true).catch(() => false);
      if (!sent) {
        debugReminder(gid, `send_fail:fallback_channel channelId=${String(fallback.id || "")}`);
        await model.rollbackReminderNotificationClaim(gid, claimedAt);
        return false;
      }
      debugReminder(gid, `send_ok:fallback_channel channelId=${String(fallback.id || "")}`);
      return true;
    }
    const channel = await resolveReminderChannel(client, reminderChannelId, gid);
    if (!channel) {
      debugReminder(gid, `send_fail:resolved_channel_missing configuredChannelId=${reminderChannelId}`);
      return false;
    }
    if (!(await channelHasMinMessagesForReminder(channel))) {
      debugReminder(gid, "skip:few_channel_messages");
      return false;
    }

    const claimedAt = await model.claimReminderNotificationSlot(gid, lastBumpAtForClaim);
    if (!claimedAt) {
      const done = await afterFailedClaim();
      debugReminder(gid, done ? "skip:claim_lost_already_reminded" : "skip:claim_lost");
      return done;
    }

    const embedColor = client?.config?.embedInfo || "#6f4e37";
    const roleIds = [...String(mentionContent || "").matchAll(/<@&(\d+)>/g)].map((m?) => m[1]);
    debugReminder(gid, `send_try:configured_channel channelId=${String(channel.id || "")}`);
    const sent = await channel.send({
      content: mentionContent,
      ...(roleIds.length ? { allowedMentions: { roles: roleIds } } : {}),
      embeds: [
        new EmbedBuilder()
          .setColor(embedColor)
          .setTitle(title)
          .setURL(url)
          .setDescription(description),
      ],
    }).then(() => true).catch(() => false);
    if (!sent) {
      const fallbackChannel = await resolveFallbackReminderChannel(client, gid);
      if (!fallbackChannel || String(fallbackChannel.id || "") === String(channel?.id || "")) {
        debugReminder(gid, "send_fail:configured_failed_and_no_distinct_fallback");
        await model.rollbackReminderNotificationClaim(gid, claimedAt);
        return false;
      }
      if (!(await channelHasMinMessagesForReminder(fallbackChannel))) {
        debugReminder(gid, "skip:fallback_few_channel_messages");
        await model.rollbackReminderNotificationClaim(gid, claimedAt);
        return false;
      }
      debugReminder(gid, `send_try:fallback_after_config_fail channelId=${String(fallbackChannel.id || "")}`);
      const fallbackSent = await fallbackChannel.send({
        content: mentionContent,
        ...(roleIds.length ? { allowedMentions: { roles: roleIds } } : {}),
        embeds: [
          new EmbedBuilder()
            .setColor(embedColor)
            .setTitle(title)
            .setURL(url)
            .setDescription(description),
        ],
      }).then(() => true).catch(() => false);
      if (!fallbackSent) {
        debugReminder(gid, `send_fail:fallback_after_config_fail channelId=${String(fallbackChannel.id || "")}`);
        await model.rollbackReminderNotificationClaim(gid, claimedAt);
        return false;
      }
      debugReminder(gid, `send_ok:fallback_after_config_fail channelId=${String(fallbackChannel.id || "")}`);
      return true;
    }
    debugReminder(gid, `send_ok:configured_channel channelId=${String(channel.id || "")}`);
    return true;
  }

  function scheduleRetry(client?, guildId?, lastBumpAtFallback?) {
    const gid = String(guildId || "");
    if (!gid) return;
    const existing = bumpTimers.get(gid);
    if (existing) clearTimeout(existing);
    const retryTimer = setTimeout(async () => {
      const row = await resolveLean(model.findOne({ guildId: gid })).catch(() => null);
      const at = row?.lastBumpAt ? new Date(row.lastBumpAt) : lastBumpAtFallback;
      scheduleReminder(client, gid, at);
    }, RETRY_DELAY_MS);
    bumpTimers.set(gid, retryTimer);
  }

  function scheduleReminder(client?, guildId?, lastBumpAt?) {
    const gid = String(guildId || "");
    if (!gid) return;
    const existing = bumpTimers.get(gid);
    if (existing) clearTimeout(existing);

    const cooldownMs = getCooldownMs(client);
    const now = Date.now();
    const lastBumpTime = new Date(lastBumpAt).getTime();
    if (!Number.isFinite(lastBumpTime)) {
      bumpTimers.delete(gid);
      return;
    }
    const targetTime = lastBumpTime + cooldownMs;
    const remaining = targetTime - now;

    if (remaining <= 0) {
      bumpTimers.delete(gid);
      sendReminder(client, gid)
        .then((ok?) => {
          if (!ok) scheduleRetry(client, gid, lastBumpAt);
        })
        .catch(() => {
          scheduleRetry(client, gid, lastBumpAt);
        });
      return;
    }

    const timeout = setTimeout(async () => {
      try {
        const ok = await sendReminder(client, gid);
        if (!ok) {
          scheduleRetry(client, gid, lastBumpAt);
          return;
        }
      } catch {
        scheduleRetry(client, gid, lastBumpAt);
      } finally {
        const active = bumpTimers.get(gid);
        if (active === timeout) bumpTimers.delete(gid);
      }
    }, remaining);

    bumpTimers.set(gid, timeout);
  }

  async function setBumpAt(client?, guildId?, bumpAt?, userId?) {
    const gid = String(guildId || "");
    if (!gid) return { doc: null, previousLastBumpAt: null, previousLastBumpUserId: null, previousReminderSentAt: null };
    const bumpDate = bumpAt instanceof Date ? bumpAt : new Date(bumpAt);
    let lastBumpAt = bumpDate;
    let doc = null;
    let previousLastBumpAt = null;
    let previousLastBumpUserId = null;
    let previousReminderSentAt = null;
    try {
      const before = await resolveLean(model.findOne({ guildId: gid })).catch(() => null);
      if (before?.lastBumpAt) previousLastBumpAt = new Date(before.lastBumpAt);
      if (before?.lastBumpUserId) previousLastBumpUserId = String(before.lastBumpUserId);
      if (before?.reminderSentAt) previousReminderSentAt = new Date(before.reminderSentAt);
      doc = await model.findOneAndUpdate(
        { guildId: gid },
        {
          $set: {
            lastBumpAt: bumpDate,
            lastBumpUserId: userId || null,
            reminderSentAt: null,
          },
        },
        { upsert: true, new: true, setDefaultsOnInsert: true },
      );
      if (doc?.lastBumpAt) lastBumpAt = new Date(doc.lastBumpAt);
      debugReminder(gid, `setBumpAt_ok bumpAt=${new Date(lastBumpAt).toISOString()} userId=${String(userId || "")}`);
    } catch (err) {
      debugReminder(gid, `setBumpAt_db_fail reason=${String(err?.message || err || "")}`);
    }
    scheduleReminder(client, gid, lastBumpAt);
    return { doc, previousLastBumpAt, previousLastBumpUserId, previousReminderSentAt };
  }

  async function recordBump(client?, guildId?, userId?, extra: Record<string, any> = {}) {
    const raw = extra?.bumpAt;
    const bumpAt =
      raw instanceof Date && !Number.isNaN(raw.getTime()) ? raw : new Date();
    const result = await setBumpAt(client, guildId, bumpAt, userId);
    return result;
  }

  async function restorePendingReminders(client?) {
    const baseFind = model.find(
      { lastBumpAt: { $exists: true } },
      { guildId: 1, lastBumpAt: 1, reminderSentAt: 1 },
    );
    let docs = [];
    if (baseFind && typeof baseFind.limit === "function" && typeof baseFind.lean === "function") {
      docs = await baseFind.limit(500).lean();
    } else {
      const resolved = await baseFind;
      docs = Array.isArray(resolved) ? resolved.slice(0, 500) : [];
    }
    for (const doc of docs) {
      const lastT = new Date(doc?.lastBumpAt).getTime();
      const remindedT = doc?.reminderSentAt
        ? new Date(doc.reminderSentAt).getTime()
        : NaN;
      if (!Number.isFinite(lastT)) continue;
      if (Number.isFinite(remindedT) && remindedT >= lastT) continue;
      scheduleReminder(client, doc.guildId, doc.lastBumpAt);
    }
  }

  async function sweepDueReminders(client?) {
    const cooldownMs = getCooldownMs(client);
    const rows = await model.find(
      { lastBumpAt: { $exists: true } },
      { guildId: 1, lastBumpAt: 1, reminderSentAt: 1 },
    ).catch(() => []);
    const allRows = Array.isArray(rows) ? rows : [];
    const nowTs = Date.now();
    const guildIds = [];
    for (const row of allRows) {
      const gid = String(row?.guildId || "");
      if (!gid) continue;
      const lastT = row?.lastBumpAt ? new Date(row.lastBumpAt).getTime() : NaN;
      if (!Number.isFinite(lastT)) continue;
      const remindedT = row?.reminderSentAt
        ? new Date(row.reminderSentAt).getTime()
        : NaN;
      const alreadyRemindedForThisBump =
        Number.isFinite(remindedT) && remindedT >= lastT;
      if (alreadyRemindedForThisBump) continue;
      if (nowTs < lastT + cooldownMs) continue;
      guildIds.push(gid);
    }
    debugReminder("all", `sweep_rows=${allRows.length} due_candidates=${guildIds.length} cooldownMs=${cooldownMs}`);
    if (guildIds.length === 0) {
      debugReminder("all", "sweep_skip:no_due_candidates");
      return;
    }
    let processed = 0;
    let skipped = 0;
    let sent = 0;
    for (const rawGid of guildIds) {
      const g = String(rawGid || "");
      if (!g) {
        skipped += 1;
        continue;
      }
      const fresh = await resolveLean(model.findOne({ guildId: g })).catch(() => null);
      if (!fresh?.lastBumpAt) {
        skipped += 1;
        debugReminder(g, "sweep_skip:no_lastBumpAt");
        continue;
      }
      const remindedT = fresh?.reminderSentAt
        ? new Date(fresh.reminderSentAt).getTime()
        : NaN;
      const t = new Date(fresh.lastBumpAt).getTime();
      if (Number.isFinite(remindedT) && remindedT >= t) {
        skipped += 1;
        debugReminder(g, "sweep_skip:already_reminded_for_last_bump");
        continue;
      }
      if (!Number.isFinite(t) || Date.now() < t + cooldownMs) {
        skipped += 1;
        debugReminder(g, "sweep_skip:not_due_after_refresh");
        continue;
      }
      const ok = await sendReminder(client, g);
      processed += 1;
      if (ok) sent += 1;
      if (!ok) scheduleRetry(client, g, fresh.lastBumpAt);
    }
    debugReminder("all", `sweep_done processed=${processed} sent=${sent} skipped=${skipped}`);
  }

  return { recordBump, setBumpAt, restorePendingReminders, sweepDueReminders };
}

export = { buildBumpStateModel, createBumpReminderService };
