const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const IDs = require("../../Utils/Config/ids");
const { shouldBlockDm } = require("../../Utils/noDmList");
const { getClientChannelCached, getClientGuildCached, getGuildMemberCached, getUserCached } = require("../../Utils/Interaction/interactionEntityCache");
const { addExpWithLevel, shouldIgnoreExpForMember } = require("../Community/expService");
const discadiaVoteTimers = new Map();
const STAFF_BYPASS_ROLE_IDS = new Set([IDs.roles.Staff, IDs.roles.Helper, IDs.roles.Mod, IDs.roles.PartnerManager, IDs.roles.Coordinator, IDs.roles.Supervisor, IDs.roles.HighStaff, IDs.roles.Admin, IDs.roles.Manager, IDs.roles.CoFounder, IDs.roles.Founder,].filter(Boolean),);
const BUMP_REMINDER_CHANNEL_BY_KEY = { disboard: IDs.channels.commands, discadia: IDs.channels.commands, };
const DISBOARD_BUMP_USER_ID = "__disboard_bump__";
const DISCADIA_BUMP_USER_ID = "__discadia_bump__";

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
      const doc = await ActivityUserProfile.findOne({ guildId, userId: stateUserId })
        .select(`${lastBumpAtPath} ${lastBumpUserIdPath} ${reminderSentAtPath}`)
        .lean()
        .catch(() => null);
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
      const query = { userId: stateUserId };
      if (filter?.reminderSentAt === null) query[reminderSentAtPath] = null;
      if (filter?.lastBumpAt?.$exists) query[lastBumpAtPath] = { $exists: true, $ne: null };
      const docs = await ActivityUserProfile.find(query)
        .select(`guildId ${projection?.lastBumpAt ? lastBumpAtPath : ""}`)
        .lean()
        .catch(() => []);
      return docs.map((doc) => ({
        guildId: String(doc?.guildId || ""),
        lastBumpAt: doc?.bumpState?.[kind]?.lastBumpAt || null,
      }));
    },
  };
}

function createBumpReminderService(options) {
  const { model, configKey, defaultCooldownMinutes, mentionContent, title, url, description, errorTag, logTag = errorTag, suppressInfoLogs = false, } = options;

  const bumpTimers = new Map();

  function getCooldownMs(client) {
    const minutes = client?.config?.[configKey]?.cooldownMinutes || defaultCooldownMinutes;
    return minutes * 60 * 1000;
  }

  function getReminderChannelId() {
    return BUMP_REMINDER_CHANNEL_BY_KEY[configKey] || null;
  }

  async function sendReminder(client, guildId) {
    const reminderChannelId = getReminderChannelId();
    if (!reminderChannelId) {
      global.logger?.warn?.(
        `${errorTag} reminderChannelId missing for guild ${guildId}`,
      );
      return;
    }
    const channel = client.channels.cache.get(reminderChannelId) || (await getClientChannelCached(client, reminderChannelId));
    if (!channel) {
      global.logger?.warn?.(
        `${errorTag} reminder channel not found (${reminderChannelId}) for guild ${guildId}`,
      );
      return;
    }

    const embedColor = client?.config?.embedInfo || "#6f4e37";
    await channel.send({
      content: mentionContent,
      embeds: [
        new EmbedBuilder()
          .setColor(embedColor)
          .setTitle(title)
          .setURL(url)
          .setDescription(description),
      ],
    });

    await model
      .updateOne({ guildId }, { $set: { reminderSentAt: new Date() } })
      .catch((err) =>
        global.logger.error(
          `${errorTag} updateOne reminderSentAt failed:`,
          err,
        ),
      );
  }

  function scheduleReminder(client, guildId, lastBumpAt) {
    if (!suppressInfoLogs) {
      global.logger?.info?.(
        `${errorTag} scheduleReminder called guild=${guildId} lastBumpAt=${lastBumpAt}`,
      );
    }
    const existing = bumpTimers.get(guildId);
    if (existing) clearTimeout(existing);

    const cooldownMs = getCooldownMs(client);
    const now = Date.now();
    const lastBumpTime = new Date(lastBumpAt).getTime();
    if (!Number.isFinite(lastBumpTime)) {
      bumpTimers.delete(guildId);
      global.logger?.warn?.(
        `${errorTag} scheduleReminder invalid lastBumpAt guild=${guildId}`,
      );
      return;
    }
    const targetTime = lastBumpTime + cooldownMs;
    const remaining = targetTime - now;

    if (remaining <= 0) {
      bumpTimers.delete(guildId);
      if (!suppressInfoLogs) {
        global.logger?.info?.(
          `${logTag} cooldown already passed, sending reminder now guild=${guildId}`,
        );
      }
      sendReminder(client, guildId).catch((err) => {
        global.logger.error(`${errorTag} sendReminder failed:`, err);
      });
      return;
    }

    const remainingMinutes = Math.round(remaining / 60_000);
    if (!suppressInfoLogs) {
      global.logger?.info?.(
        `${logTag} reminder scheduled for guild=${guildId} in ${remainingMinutes} minutes`,
      );
    }

    const timeout = setTimeout(async () => {
      try {
        if (!suppressInfoLogs) {
          global.logger?.info?.(`${logTag}firing reminder for guild=${guildId}`);
        }
        await sendReminder(client, guildId);
      } catch (error) {
        global.logger.error(errorTag, error);
      } finally {
        bumpTimers.delete(guildId);
      }
    }, remaining);

    timeout.unref?.();
    bumpTimers.set(guildId, timeout);
  }

  async function setBumpAt(client, guildId, bumpAt, userId) {
    const bumpDate = bumpAt instanceof Date ? bumpAt : new Date(bumpAt);
    let lastBumpAt = bumpDate;
    let doc = null;
    let previousLastBumpAt = null;
    let previousLastBumpUserId = null;
    let previousReminderSentAt = null;
    try {
      const before = await resolveLean(model.findOne({ guildId })).catch(() => null);
      if (before?.lastBumpAt) previousLastBumpAt = new Date(before.lastBumpAt);
      if (before?.lastBumpUserId) previousLastBumpUserId = String(before.lastBumpUserId);
      if (before?.reminderSentAt) previousReminderSentAt = new Date(before.reminderSentAt);
      doc = await model.findOneAndUpdate(
        { guildId },
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
    } catch (err) {
      global.logger?.error?.(`${errorTag} setBumpAt DB failed, scheduling in-memory anyway:`, err?.message || err);
    }
    scheduleReminder(client, guildId, lastBumpAt);
    return { doc, previousLastBumpAt, previousLastBumpUserId, previousReminderSentAt };
  }

  async function recordBump(client, guildId, userId) {
    const result = await setBumpAt(client, guildId, new Date(), userId);
    return result;
  }

  async function restorePendingReminders(client) {
    const baseFind = model.find(
      { reminderSentAt: null, lastBumpAt: { $exists: true } },
      { guildId: 1, lastBumpAt: 1 },
    );
    let docs = [];
    if (baseFind && typeof baseFind.limit === "function" && typeof baseFind.lean === "function") {
      docs = await baseFind.limit(500).lean();
    } else {
      const resolved = await baseFind;
      docs = Array.isArray(resolved) ? resolved.slice(0, 500) : [];
    }
    if (docs.length > 0 && !suppressInfoLogs) {
      global.logger?.info?.(
        `${logTag} restoring ${docs.length} pending reminder(s)`,
      );
    }
    for (const doc of docs) {
      scheduleReminder(client, doc.guildId, doc.lastBumpAt);
    }
  }

  return { recordBump, setBumpAt, restorePendingReminders };
}

const disboardService = createBumpReminderService({ model: buildBumpStateModel("disboard", DISBOARD_BUMP_USER_ID), configKey: "disboard", defaultCooldownMinutes: 120, mentionContent: "<@&1442569013074071644>", title: "<:VC_Eye:1331619214410383381> **È L'ORA DEL `BUMP`!**", url: "https://disboard.org/it/server/1329080093599076474", description: "<:VC_bump:1482531857521311885> **Per bumpare scrivi __`/bump` in chat__**!", errorTag: "<a:VC_Alert:1482706673176150077> [DISBOARD REMINDER ERROR]", logTag: "<a:VC_Alert:1482706673176150077> [DISBOARD REMINDER]", suppressInfoLogs: true, });

const discadiaBumpService = createBumpReminderService({ model: buildBumpStateModel("discadia", DISCADIA_BUMP_USER_ID), configKey: "discadia", defaultCooldownMinutes: 1440, mentionContent: "<@&1442569013074071644>", title: "<:VC_Eye:1331619214410383381> **È L'ORA DEL `BUMP` SU DISCADIA!**", url: "https://discadia.com/server/viniliecaffe/", description: "<:VC_bump:1482531857521311885> **Per bumpare scrivi __`/bump` in chat__**!", errorTag: "<a:VC_Alert:1482706673176150077> [DISCADIA REMINDER ERROR]", logTag: "<a:VC_Alert:1482706673176150077> [DISCADIA REMINDER]", suppressInfoLogs: true, });
let discadiaVoteReminderLoopHandle = null;

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
      text: "Per non ricevere più DM automatici usa +dm-disable (blocca anche avvisi importanti).",
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
 * Registra un voto Discadia per utente. `discadiaVote.voteCount` è sempre incrementato sul profilo
 * (1 voto = +1), mai preso dal testo del messaggio: Discadia espone spesso il totale voti del server.
 */
async function recordDiscadiaVote(client, guildId, userId) {
  const now = new Date();
  const mainGuildId = IDs.guilds.main;
  guildId = mainGuildId;
  let previousLastVoteAt = null;
  const before = await ActivityUserProfile.findOne({ guildId: IDs.guilds.main, userId })
    .select("discadiaVote.lastVoteAt")
    .lean()
    .catch(() => null);
  if (before?.discadiaVote?.lastVoteAt) previousLastVoteAt = new Date(before.discadiaVote.lastVoteAt);
  const doc = await ActivityUserProfile.findOneAndUpdate(
    { guildId: IDs.guilds.main, userId },
    {
      $setOnInsert: { guildId: IDs.guilds.main, userId },
      $set: { "discadiaVote.lastVoteAt": now },
      $inc: { "discadiaVote.voteCount": 1 },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);

  scheduleDiscadiaVoteReminder(client, mainGuildId, userId, now);
  return { voteCount: Number(doc?.discadiaVote?.voteCount || 1), previousLastVoteAt };
}

function scheduleDiscadiaVoteReminder(client, guildId, userId, lastVoteAt) {
  const enabled = client?.config?.discadiaVoteReminder?.enabled;
  if (!enabled) return;

  const key = `vote:${userId}`;
  const existing = discadiaVoteTimers.get(key);
  if (existing) clearTimeout(existing);

  const cooldownMs = getVoteCooldownMs(client);
  const targetTime = new Date(lastVoteAt).getTime() + cooldownMs;
  const delay = targetTime - Date.now();

  const run = async () => { try { const doc = await ActivityUserProfile.findOne({ guildId, userId }).select("discadiaVote").lean(); const state = doc?.discadiaVote || null; if (!state?.lastVoteAt) return; const cooldownMsRun = getVoteCooldownMs(client); if (Date.now() - new Date(state.lastVoteAt).getTime() < cooldownMsRun) return; if (state.lastRemindedAt && new Date(state.lastRemindedAt).getTime() >= new Date(state.lastVoteAt).getTime()) return; if (await shouldSkipVoteDmByNoDm(client, guildId, userId)) return; let user = await getUserCached(client, userId); if (!user && client?.users?.fetch) user = await client.users.fetch(userId).catch(() => null); if (!user) return; const { embed, components } = buildVoteReminderEmbed(client); try { await user.send({ embeds: [embed], ...(components.length ? { components } : {}) }); } catch { await sendVoteFallbackChannelReminder(client, guildId, userId); } await ActivityUserProfile.updateOne({ guildId, userId }, { $set: { "discadiaVote.lastRemindedAt": new Date() } },).catch(() => { }); } finally { discadiaVoteTimers.delete(key); } };

  if (delay <= 0) {
    void run();
    return;
  }

  const timer = setTimeout(() => run().catch(() => { }), delay);
  timer.unref?.();
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
      { "discadiaVote.lastVoteAt": { $exists: true, $ne: null } },
      { guildId: 1, userId: 1, "discadiaVote.lastVoteAt": 1 },
    ).lean();
  } catch (err) {
    global.logger?.error?.("[DISCADIA] Failed fetching vote docs:", err);
    return;
  }

  if (!docs.length) return;

  const latestByUser = new Map();

  for (const doc of docs) {
    const lastVoteAtRaw = doc?.discadiaVote?.lastVoteAt;
    if (!doc?.userId || !lastVoteAtRaw) continue;

    const prev = latestByUser.get(doc.userId);
    const currentTs = new Date(lastVoteAtRaw).getTime();

    if (!prev) {
      latestByUser.set(doc.userId, doc);
      continue;
    }

    const prevTs = new Date(prev.lastVoteAt).getTime();
    if (currentTs > prevTs) {
      latestByUser.set(doc.userId, doc);
    }
  }

  let restored = 0;
  let skipped = 0;

  for (const doc of latestByUser.values()) {
    const userId = String(doc.userId);
    const guildId = String(doc.guildId);
    const lastVoteAt = new Date(doc?.discadiaVote?.lastVoteAt);

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
      { guildId, "discadiaVote.lastVoteAt": { $lte: cutoff } },
      { userId: 1, "discadiaVote.lastVoteAt": 1, "discadiaVote.lastRemindedAt": 1 },
    ).lean();
  } catch (err) {
    global.logger?.error?.("[DISCADIA VOTE REMINDER] Failed to fetch voters:", err);
    return;
  }

  for (const doc of docs) {
    const userId = String(doc?.userId);
    const state = doc?.discadiaVote || null;
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
      { $set: { "discadiaVote.lastRemindedAt": new Date() } },
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
  discadiaVoteReminderLoopHandle.unref?.();
  sendDueDiscadiaVoteReminders(client).catch((error) => {
    global.logger.error("[DISCADIA VOTE REMINDER ERROR] (first run)", error);
  });
  return discadiaVoteReminderLoopHandle;
}

const DEFAULT_REWARD = {
  disboard: { baseExp: 80, fastGuess: { windowMs: 5 * 60 * 1000, multiplier: 1.5 }, streak: { bonusPercentPerWin: 10, maxBonusPercent: 50 } },
  discadia_bump: { baseExp: 100, fastGuess: { windowMs: 15 * 60 * 1000, multiplier: 1.5 }, streak: { bonusPercentPerWin: 10, maxBonusPercent: 50 } },
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
    .select("bumpVoteRewards")
    .lean()
    .catch(() => null);
  const rewardDoc = profile?.bumpVoteRewards?.[sourceKey] || null;
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
        [`bumpVoteRewards.${sourceKey}.lastActionAt`]: new Date(),
        [`bumpVoteRewards.${sourceKey}.currentStreak`]: newStreak,
        [`bumpVoteRewards.${sourceKey}.bestStreak`]: bestStreak,
      },
      $inc: { [`bumpVoteRewards.${sourceKey}.totalExpAwarded`]: effectiveExp },
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

module.exports = { createBumpReminderService, recordBump: disboardService.recordBump, restorePendingReminders: disboardService.restorePendingReminders, recordDiscadiaBump: discadiaBumpService.recordBump, restorePendingDiscadiaReminders: discadiaBumpService.restorePendingReminders, recordDiscadiaVote, sendDueReminders: sendDueDiscadiaVoteReminders, startDiscadiaVoteReminderLoop, restorePendingVoteReminders, awardBumpVoteExp, getVoteCooldownMs };