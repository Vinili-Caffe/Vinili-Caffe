const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const IDs = require("../../Utils/Config/ids");
const { shouldBlockDm } = require("../../Utils/noDmList");
const { getClientChannelCached, getClientGuildCached, getGuildMemberCached, getUserCached } = require("../../Utils/Interaction/interactionEntityCache");
const { addExpWithLevel, shouldIgnoreExpForMember } = require("../Community/expService");
const discadiaVoteTimers = new Map();
const STAFF_BYPASS_ROLE_IDS = new Set([IDs.roles.Staff, IDs.roles.Helper, IDs.roles.Mod, IDs.roles.PartnerManager, IDs.roles.Coordinator, IDs.roles.Supervisor, IDs.roles.HighStaff, IDs.roles.Admin, IDs.roles.CoFounder, IDs.roles.Founder,].filter(Boolean),);
const BUMP_REMINDER_CHANNEL_BY_KEY = { disboard: IDs.channels.commands, discadia: IDs.channels.commands, };
const DISBOARD_BUMP_USER_ID = "__disboard_bump__";
const DISCADIA_BUMP_USER_ID = "__discadia_bump__";
const DISCADIA_VOTE_ROOT = "profile.totals.exp.bumpVoteRewards.discadia_vote";
const DISCADIA_LAST_VOTE_AT_PATH = `${DISCADIA_VOTE_ROOT}.lastVoteAt`;
const DISCADIA_LAST_REMINDED_AT_PATH = `${DISCADIA_VOTE_ROOT}.lastRemindedAt`;
const DISCADIA_VOTE_COUNT_PATH = `${DISCADIA_VOTE_ROOT}.voteCount`;

async function resolveLean(queryOrValue) {
  if (queryOrValue && typeof queryOrValue.lean === "function") {
    return queryOrValue.lean();
  }
  return queryOrValue;
}

function buildBumpStateModel(kind, stateUserId) {
  const lastBumpAtPath = `bumpState.${kind}.lastBumpAt`;
  const lastBumpUserIdPath = `bumpState.${kind}.lastBumpUserId`;
  const reminderSentAtPath = `bumpState.${kind}.reminderSentAt`;
  return {
    async findOne(filter) {
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
    async findOneAndUpdate(filter, update, options = {}) {
      const guildId = String(filter?.guildId || "");
      if (!guildId) return null;
      const setPayload = update?.$set || {};
      const setDoc = {};
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
    async updateOne(filter, update) {
      const guildId = String(filter?.guildId || "");
      if (!guildId) return null;
      const setPayload = update?.$set || {};
      const setDoc = {};
      if ("reminderSentAt" in setPayload) setDoc[reminderSentAtPath] = setPayload.reminderSentAt;
      return ActivityUserProfile.updateOne(
        { guildId, userId: stateUserId },
        { $setOnInsert: { guildId, userId: stateUserId }, $set: setDoc },
        { upsert: true },
      ).catch(() => null);
    },
    async find(filter, projection = {}) {
      const query = {};
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
    async findGuildIdsDueForReminderSweep(cooldownMs) {
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
      return docs.map((d) => String(d?.guildId || "")).filter(Boolean);
    },
  };
}

function createBumpReminderService(options) {
  const { model, configKey, defaultCooldownMinutes, mentionContent, title, url, description } = options;

  const bumpTimers = new Map();
  const RETRY_DELAY_MS = 5 * 60 * 1000;
  const MIN_CHAT_MESSAGES_FOR_REMINDER = 10;

  function getCooldownMs(client) {
    const minutes = client?.config?.[configKey]?.cooldownMinutes || defaultCooldownMinutes;
    return minutes * 60 * 1000;
  }

  function getReminderChannelId(client) {
    const fromCfg = client?.config?.[configKey]?.reminderChannelId;
    if (fromCfg) return String(fromCfg);
    return BUMP_REMINDER_CHANNEL_BY_KEY[configKey] || null;
  }

  function debugReminder(guildId, message) {
    void guildId;
    void message;
  }

  async function resolveFallbackReminderChannel(client, guildId) {
    const guild = await getClientGuildCached(client, guildId).catch(() => null);
    if (!guild) return null;
    await guild.channels.fetch().catch(() => null);
    const fallback = guild.channels.cache.find((ch) => {
      if (!ch?.isTextBased?.()) return false;
      const name = String(ch?.name || "").toLowerCase();
      return /(comand|command|cmd)/i.test(name);
    });
    return fallback || null;
  }

  async function resolveReminderChannel(client, reminderChannelId, guildId) {
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

  async function channelHasMinMessagesForReminder(channel) {
    if (!channel?.messages?.fetch) return false;
    const batch = await channel.messages.fetch({ limit: MIN_CHAT_MESSAGES_FOR_REMINDER }).catch(() => null);
    return Boolean(batch && batch.size >= MIN_CHAT_MESSAGES_FOR_REMINDER);
  }

  async function sendReminder(client, guildId) {
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
        return false;
      }
      await model
        .updateOne({ guildId: gid }, { $set: { reminderSentAt: new Date(), lastBumpAt: fresh.lastBumpAt } })
        .catch(() => null);
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

    const embedColor = client?.config?.embedInfo || "#6f4e37";
    const roleIds = [...String(mentionContent || "").matchAll(/<@&(\d+)>/g)].map((m) => m[1]);
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
        return false;
      }
      if (!(await channelHasMinMessagesForReminder(fallbackChannel))) {
        debugReminder(gid, "skip:fallback_few_channel_messages");
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
        return false;
      }
      debugReminder(gid, `send_ok:fallback_after_config_fail channelId=${String(fallbackChannel.id || "")}`);
    } else {
      debugReminder(gid, `send_ok:configured_channel channelId=${String(channel.id || "")}`);
    }

    await model
      .updateOne({ guildId: gid }, { $set: { reminderSentAt: new Date(), lastBumpAt: fresh.lastBumpAt } })
      .catch(() => null);
    return true;
  }

  function scheduleRetry(client, guildId, lastBumpAtFallback) {
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

  function scheduleReminder(client, guildId, lastBumpAt) {
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
        .then((ok) => {
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

  async function setBumpAt(client, guildId, bumpAt, userId) {
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

  async function recordBump(client, guildId, userId, extra = {}) {
    const raw = extra?.bumpAt;
    const bumpAt =
      raw instanceof Date && !Number.isNaN(raw.getTime()) ? raw : new Date();
    const result = await setBumpAt(client, guildId, bumpAt, userId);
    return result;
  }

  async function restorePendingReminders(client) {
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

  async function sweepDueReminders(client) {
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

const disboardService = createBumpReminderService({ model: buildBumpStateModel("disboard", DISBOARD_BUMP_USER_ID), configKey: "disboard", defaultCooldownMinutes: 120, mentionContent: "<@&1442569013074071644>", title: "<:VC_Eye:1331619214410383381> **È L'ORA DEL `BUMP`!**", url: "https://disboard.org/it/server/1329080093599076474", description: "<:VC_bump:1482531857521311885> **Per bumpare scrivi __`/bump` in chat__**!", errorTag: "<a:VC_Alert:1482706673176150077> [DISBOARD REMINDER ERROR]", logTag: "<a:VC_Alert:1482706673176150077> [DISBOARD REMINDER]", suppressInfoLogs: true, });

const discadiaBumpService = createBumpReminderService({ model: buildBumpStateModel("discadia", DISCADIA_BUMP_USER_ID), configKey: "discadia", defaultCooldownMinutes: 1440, mentionContent: "<@&1442569013074071644>", title: "<:VC_Eye:1331619214410383381> **È L'ORA DEL `BUMP` SU DISCADIA!**", url: "https://discadia.com/server/viniliecaffe/", description: "<:VC_bump:1482531857521311885> **Per bumpare scrivi __`/bump` in chat__**!", errorTag: "<a:VC_Alert:1482706673176150077> [DISCADIA REMINDER ERROR]", logTag: "<a:VC_Alert:1482706673176150077> [DISCADIA REMINDER]", suppressInfoLogs: true, });
let discadiaVoteReminderLoopHandle = null;
/** Controlla il DB ogni 2 min per Disboard (~2h) e Discadia (~24h): non solo al riavvio o al timer in-memory. */
const BUMP_DUE_REMINDER_SWEEP_MS = 2 * 60 * 1000;

function startBumpDueReminderSweepLoop(client) {
  if (!client || client._bumpDueReminderSweepStarted) return;
  client._bumpDueReminderSweepStarted = true;
  const tick = () => {
    Promise.all([
      disboardService.sweepDueReminders(client),
      discadiaBumpService.sweepDueReminders(client),
    ]).catch(() => null);
  };
  setInterval(tick, BUMP_DUE_REMINDER_SWEEP_MS);
  tick();
}

function getVoteCooldownMs(client) {
  const raw = client?.config?.discadiaVoteReminder?.cooldownHours;
  const hours = Number(raw);

  const safeHours = Number.isFinite(hours) && hours > 0 ? hours : 24;

  return safeHours * 60 * 60 * 1000;
}

function getVoteCheckIntervalMs(client) {
  const minutes = client?.config?.discadiaVoteReminder?.checkIntervalMinutes || 30;
  return minutes * 60 * 1000;
}

function getVoteReminderText(client) {
  return (
    client?.config?.discadiaVoteReminder?.message ||
    [
      "<:VC_bump:1482531857521311885> Hey! Sono passate 24 ore: puoi votare di nuovo su Discadia.",
      "<a:VC_ThankYou:1330186319673950401> **Grazie per il supporto!**",
      "<:link:1470064815899803668> Per votare su Discadia, clicca sul pulsante sottostante:\n",
    ]
  );
}

function buildVoteReminderEmbed(client) {
  const text = getVoteReminderText(client);
  const description = Array.isArray(text) ? text.join("\n") : (text ?? "");
  const embed = new EmbedBuilder()
    .setColor(client?.config?.embedInfo || "#6f4e37")
    .setDescription(description)
    .setFooter({
      text: "Per gestire o disattivare i DM automatici usa +profile (blocca anche avvisi importanti).",
    });

  const components = [];
  const VOTE_URL = client?.config?.discadiaVoteReminder?.voteUrl || IDs.links?.vote;
  if (VOTE_URL) {
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setStyle(ButtonStyle.Link)
          .setEmoji("<a:VC_HeartPink:1448673486603292685>")
          .setLabel("Vota cliccando qui")
          .setURL(VOTE_URL),
      ),
    );
  }
  return { embed, components };
}

const lastVoteFallbackSentAt = new Map();
const VOTE_FALLBACK_COOLDOWN_MS = 60 * 60 * 1000;

async function isStaffNoDmBypassUser(client, guildId, userId) {
  if (!client || !userId || !STAFF_BYPASS_ROLE_IDS.size) return false;

  const resolvedGuildId = guildId || IDs.guilds.main;
  const guild = await getClientGuildCached(client, resolvedGuildId);
  if (!guild) return false;

  const member = await getGuildMemberCached(guild, userId);
  if (!member?.roles?.cache) return false;

  for (const roleId of STAFF_BYPASS_ROLE_IDS) {
    if (member.roles.cache.has(roleId)) return true;
  }

  return false;
}

async function shouldSkipVoteDmByNoDm(client, guildId, userId) {
  if (!(await shouldBlockDm(guildId, userId, "bump").catch(() => false))) return false;
  const isStaffBypass = await isStaffNoDmBypassUser(client, guildId, userId);
  return !isStaffBypass;
}

async function sendVoteFallbackChannelReminder(client, guildId, userId) {
  const fallbackId = client?.config?.discadiaVoteReminder?.fallbackChannelId;
  if (!fallbackId) return;
  const now = Date.now();
  const key = String(guildId || fallbackId);
  if (
    lastVoteFallbackSentAt.get(key) &&
    now - lastVoteFallbackSentAt.get(key) < VOTE_FALLBACK_COOLDOWN_MS
  )
    return;
  const channel = client.channels.cache.get(fallbackId) || (await getClientChannelCached(client, fallbackId));
  if (!channel) return;
  const { embed, components } = buildVoteReminderEmbed(client);
  await channel
    .send({
      content: `<@${userId}>`,
      embeds: [embed],
      ...(components.length ? { components } : {}),
    })
    .catch(() => { });
  lastVoteFallbackSentAt.set(key, now);
}

/**
 * Registra un voto Discadia per utente. `profile.totals.exp.bumpVoteRewards.discadia_vote.voteCount` è sempre incrementato sul profilo
 * (1 voto = +1), mai preso dal testo del messaggio: Discadia espone spesso il totale voti del server.
 */
async function recordDiscadiaVote(client, guildId, userId) {
  const now = new Date();
  const mainGuildId = IDs.guilds.main;
  guildId = mainGuildId;
  let previousLastVoteAt = null;
  const before = await ActivityUserProfile.findOne({ guildId: IDs.guilds.main, userId })
    .select(`${DISCADIA_LAST_VOTE_AT_PATH}`)
    .lean()
    .catch(() => null);
  const previousLastVoteAtRaw = before?.profile?.totals?.exp?.bumpVoteRewards?.discadia_vote?.lastVoteAt || null;
  if (previousLastVoteAtRaw) previousLastVoteAt = new Date(previousLastVoteAtRaw);
  const doc = await ActivityUserProfile.findOneAndUpdate(
    { guildId: IDs.guilds.main, userId },
    {
      $setOnInsert: { guildId: IDs.guilds.main, userId },
      $set: { [DISCADIA_LAST_VOTE_AT_PATH]: now },
      $inc: { [DISCADIA_VOTE_COUNT_PATH]: 1 },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);

  scheduleDiscadiaVoteReminder(client, mainGuildId, userId, now);
  return { voteCount: Number(doc?.profile?.totals?.exp?.bumpVoteRewards?.discadia_vote?.voteCount || 1), previousLastVoteAt };
}

function scheduleDiscadiaVoteReminder(client, guildId, userId, lastVoteAt) {
  const enabled = client?.config?.discadiaVoteReminder?.enabled;
  if (!enabled) return;

  const uid = String(userId || "");
  if (!uid) return;
  const gid = String(guildId || "");
  if (!gid) return;
  const key = `vote:${uid}`;
  const existing = discadiaVoteTimers.get(key);
  if (existing) clearTimeout(existing);

  const cooldownMs = getVoteCooldownMs(client);
  const targetTime = new Date(lastVoteAt).getTime() + cooldownMs;
  const delay = targetTime - Date.now();

  const run = async () => { try { const doc = await ActivityUserProfile.findOne({ guildId: gid, userId: uid }).select(`${DISCADIA_VOTE_ROOT}`).lean(); const state = doc?.profile?.totals?.exp?.bumpVoteRewards?.discadia_vote || null; if (!state?.lastVoteAt) return; const cooldownMsRun = getVoteCooldownMs(client); if (Date.now() - new Date(state.lastVoteAt).getTime() < cooldownMsRun) return; if (state.lastRemindedAt && new Date(state.lastRemindedAt).getTime() >= new Date(state.lastVoteAt).getTime()) return; if (await shouldSkipVoteDmByNoDm(client, gid, uid)) return; let user = await getUserCached(client, uid); if (!user && client?.users?.fetch) user = await client.users.fetch(uid).catch(() => null); if (!user) return; const { embed, components } = buildVoteReminderEmbed(client); try { await user.send({ embeds: [embed], ...(components.length ? { components } : {}) }); } catch { await sendVoteFallbackChannelReminder(client, gid, uid); } await ActivityUserProfile.updateOne({ guildId: gid, userId: uid }, { $set: { [DISCADIA_LAST_REMINDED_AT_PATH]: new Date() } },).catch(() => { }); } finally { discadiaVoteTimers.delete(key); } };

  if (delay <= 0) {
    void run();
    return;
  }

  const timer = setTimeout(() => run().catch(() => { }), delay);
  discadiaVoteTimers.set(key, timer);
}

async function restorePendingVoteReminders(client) {
  const enabled = client?.config?.discadiaVoteReminder?.enabled;
  if (!enabled) return;

  const cooldownMs = getVoteCooldownMs(client);

  const SEND_IMMEDIATELY_IF_LATE_MS = 2 * 60 * 60 * 1000;
  const SKIP_IF_TOO_OLD_MS = 24 * 60 * 60 * 1000;
  let docs = [];
  try {
    docs = await ActivityUserProfile.find(
      { [DISCADIA_LAST_VOTE_AT_PATH]: { $exists: true, $ne: null } },
      { guildId: 1, userId: 1, [DISCADIA_LAST_VOTE_AT_PATH]: 1 },
    ).lean();
  } catch (err) {
    global.logger?.error?.("[DISCADIA] Failed fetching vote docs:", err);
    return;
  }

  if (!docs.length) return;

  const latestByUser = new Map();

  for (const doc of docs) {
    const lastVoteAtRaw = doc?.profile?.totals?.exp?.bumpVoteRewards?.discadia_vote?.lastVoteAt;
    if (!doc?.userId || !lastVoteAtRaw) continue;

    const prev = latestByUser.get(doc.userId);
    const currentTs = new Date(lastVoteAtRaw).getTime();

    if (!prev) {
      latestByUser.set(doc.userId, doc);
      continue;
    }

    const prevTs = new Date(prev?.profile?.totals?.exp?.bumpVoteRewards?.discadia_vote?.lastVoteAt).getTime();
    if (currentTs > prevTs) {
      latestByUser.set(doc.userId, doc);
    }
  }

  let restored = 0;
  let skipped = 0;

  for (const doc of latestByUser.values()) {
    const userId = String(doc.userId);
    const guildId = String(doc.guildId);
    const lastVoteAt = new Date(doc?.profile?.totals?.exp?.bumpVoteRewards?.discadia_vote?.lastVoteAt);

    const targetTime = lastVoteAt.getTime() + cooldownMs;
    const lateBy = Date.now() - targetTime;

    if (lateBy <= 0) {
      scheduleDiscadiaVoteReminder(client, guildId, userId, lastVoteAt);
      restored++;
      continue;
    }

    if (lateBy > SKIP_IF_TOO_OLD_MS) {
      skipped++;
      continue;
    }

    if (lateBy <= SEND_IMMEDIATELY_IF_LATE_MS) {
      scheduleDiscadiaVoteReminder(client, guildId, userId, lastVoteAt);
      restored++;
      continue;
    }
    const jitter = 5 * 60 * 1000 + Math.floor(Math.random() * 10 * 60 * 1000);

    const syntheticLastVote = new Date(Date.now() - cooldownMs + jitter);

    scheduleDiscadiaVoteReminder(client, guildId, userId, syntheticLastVote);

    restored++;
  }
}

async function sendDueDiscadiaVoteReminders(client) {
  const enabled = client?.config?.discadiaVoteReminder?.enabled;
  if (!enabled) return;

  const guildId = IDs.guilds.main;
  const cooldownMs = getVoteCooldownMs(client);
  const cutoff = new Date(Date.now() - cooldownMs);

  let docs = [];
  try {
    docs = await ActivityUserProfile.find(
      { guildId, [DISCADIA_LAST_VOTE_AT_PATH]: { $lte: cutoff } },
      { userId: 1, [DISCADIA_LAST_VOTE_AT_PATH]: 1, [DISCADIA_LAST_REMINDED_AT_PATH]: 1 },
    ).lean();
  } catch (err) {
    global.logger?.error?.("[DISCADIA VOTE REMINDER] Failed to fetch voters:", err);
    return;
  }

  for (const doc of docs) {
    const userId = String(doc?.userId);
    const state = doc?.profile?.totals?.exp?.bumpVoteRewards?.discadia_vote || null;
    if (!userId || !state?.lastVoteAt) continue;
    const lastVoteAt = new Date(state.lastVoteAt).getTime();
    if (Date.now() - lastVoteAt < cooldownMs) continue;
    if (state.lastRemindedAt && new Date(state.lastRemindedAt).getTime() >= lastVoteAt) continue;
    if (await shouldSkipVoteDmByNoDm(client, guildId, userId)) continue;

    let user = await getUserCached(client, userId);
    if (!user && client?.users?.fetch) user = await client.users.fetch(userId).catch(() => null);
    if (!user) continue;

    const { embed, components } = buildVoteReminderEmbed(client);
    try {
      await user.send({
        embeds: [embed],
        ...(components.length ? { components } : {}),
      });
    } catch {
      await sendVoteFallbackChannelReminder(client, guildId, userId);
    }
    await ActivityUserProfile.updateOne(
      { guildId, userId },
      { $set: { [DISCADIA_LAST_REMINDED_AT_PATH]: new Date() } },
    ).catch(() => {});
  }
} 

function startDiscadiaVoteReminderLoop(client) {
  const enabled = client?.config?.discadiaVoteReminder?.enabled;
  if (!enabled) return;
  if (discadiaVoteReminderLoopHandle) return discadiaVoteReminderLoopHandle;
  const intervalMs = getVoteCheckIntervalMs(client);
  discadiaVoteReminderLoopHandle = setInterval(() => {
    sendDueDiscadiaVoteReminders(client).catch((error) => {
      global.logger.error("[DISCADIA VOTE REMINDER ERROR]", error);
    });
  }, intervalMs);
  sendDueDiscadiaVoteReminders(client).catch((error) => {
    global.logger.error("[DISCADIA VOTE REMINDER ERROR] (first run)", error);
  });
  return discadiaVoteReminderLoopHandle;
}

const DEFAULT_REWARD = {
  disboard: { baseExp: 80, fastGuess: { windowMs: 5 * 60 * 1000, multiplier: 1.5 }, streak: { bonusPercentPerWin: 10, maxBonusPercent: 50 } },
  discadia_bump: { baseExp: 0, fastGuess: { windowMs: 0, multiplier: 1 }, streak: { bonusPercentPerWin: 0, maxBonusPercent: 0 } },
  discadia_vote: { baseExp: 150, fastGuess: { windowMs: 15 * 60 * 1000, multiplier: 1.5 }, streak: { bonusPercentPerWin: 10, maxBonusPercent: 50 } },
};

function getRewardConfig(client, source) {
  const base = DEFAULT_REWARD[source] || { baseExp: 100, fastGuess: { windowMs: 15 * 60 * 1000, multiplier: 1.5 }, streak: { bonusPercentPerWin: 10, maxBonusPercent: 50 } };
  if (source === "disboard" && client?.config?.disboard?.reward) {
    return { ...base, ...client.config.disboard.reward };
  }
  if (source === "discadia_bump" && client?.config?.discadia?.reward) {
    return { ...base, ...client.config.discadia.reward };
  }
  if (source === "discadia_vote" && client?.config?.discadiaVoteReminder?.reward) {
    return { ...base, ...client.config.discadiaVoteReminder.reward };
  }
  return base;
}

async function awardBumpVoteExp(client, guild, userId, source, previousLastAt, cooldownMs, baseExpOverride, fastSinceAt = null, previousLastUserId = null) {
  if (String(source || "") === "discadia_bump") return null;
  if (!guild?.id || !userId) return null;
  const now = Date.now();
  const lastSlotAt = previousLastAt ? new Date(previousLastAt).getTime() : 0;
  const fastRefAt = fastSinceAt ? new Date(fastSinceAt).getTime() : lastSlotAt;
  const cfg = getRewardConfig(client, source);
  const baseExp = Number(baseExpOverride) > 0 ? Number(baseExpOverride) : (Number(cfg?.baseExp ?? 100) || 100);
  const fastCfg = cfg?.fastGuess ?? {};
  const windowMs = Number(fastCfg.windowMs ?? 15 * 60 * 1000) || 0;
  const fastMultiplier = Number(fastCfg.multiplier ?? 1.5) || 1;
  const isFast = windowMs > 0 && fastRefAt > 0 && (now - fastRefAt) <= windowMs;
  const fastBonus = isFast ? Math.round(baseExp * (fastMultiplier - 1)) : 0;
  const streakCfg = cfg?.streak ?? {};
  const percentPerWin = Number(streakCfg.bonusPercentPerWin ?? 10) || 0;
  const maxBonusPercent = Number(streakCfg.maxBonusPercent ?? 50) || 0;
  const guildId = String(guild.id);
  const sourceKey = String(source || "");
  const profile = await ActivityUserProfile.findOne({ guildId, userId })
    .select("profile.totals.exp.bumpVoteRewards")
    .lean()
    .catch(() => null);
  const rewardDoc = profile?.profile?.totals?.exp?.bumpVoteRewards?.[sourceKey] || null;
  const prevStreak = Number(rewardDoc?.currentStreak ?? 0);
  const graceMs = Math.max(0, Math.min(cooldownMs, Number(streakCfg.graceMs ?? 30 * 60 * 1000) || 0));
  const sameUserAsPrevious = previousLastUserId ? String(previousLastUserId) === String(userId) : true;
  const deltaMs = lastSlotAt > 0 ? (now - lastSlotAt) : 0;
  const earlySlackMs = Math.max(0, Math.min(cooldownMs, Number(streakCfg.earlySlackMs ?? 5 * 60 * 1000) || 0));
  const didPreviousSlot =
    sameUserAsPrevious &&
    lastSlotAt > 0 &&
    deltaMs >= Math.max(0, cooldownMs - earlySlackMs) &&
    deltaMs <= (cooldownMs + graceMs);
  const newStreak = didPreviousSlot ? prevStreak + 1 : 1;
  const bestStreak = Math.max(Number(rewardDoc?.bestStreak ?? 0), newStreak);
  const streakBonusPercent = percentPerWin > 0 ? Math.min((newStreak - 1) * percentPerWin, maxBonusPercent) : 0;
  const streakBonus = Math.round((baseExp * streakBonusPercent) / 100);
  const effectiveExp = baseExp + fastBonus + streakBonus;
  await ActivityUserProfile.findOneAndUpdate(
    { guildId, userId },
    {
      $setOnInsert: { guildId, userId },
      $set: {
        [`profile.totals.exp.bumpVoteRewards.${sourceKey}.lastActionAt`]: new Date(),
        [`profile.totals.exp.bumpVoteRewards.${sourceKey}.currentStreak`]: newStreak,
        [`profile.totals.exp.bumpVoteRewards.${sourceKey}.bestStreak`]: bestStreak,
      },
      $inc: { [`profile.totals.exp.bumpVoteRewards.${sourceKey}.totalExpAwarded`]: effectiveExp },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  const member = await getGuildMemberCached(guild, userId);
  const ignoreExp = await shouldIgnoreExpForMember({ guildId, member, channelId: null });
  if (!ignoreExp) {
    await addExpWithLevel(guild, userId, effectiveExp, false, true).catch(() => {});
  }
  return { baseExp, fastBonus, streakBonus, effectiveExp, newStreak, bestStreak, isFast };
}

module.exports = { createBumpReminderService, recordBump: disboardService.recordBump, restorePendingReminders: disboardService.restorePendingReminders, startBumpDueReminderSweepLoop, recordDiscadiaBump: discadiaBumpService.recordBump, restorePendingDiscadiaReminders: discadiaBumpService.restorePendingReminders, recordDiscadiaVote, sendDueReminders: sendDueDiscadiaVoteReminders, startDiscadiaVoteReminderLoop, restorePendingVoteReminders, awardBumpVoteExp, getVoteCooldownMs };