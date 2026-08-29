const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { ActivityUserProfile, SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas");
const { enqueueSiteInAppNotification } = require("../../Utils/Web/siteInAppNotificationsService");
const { sendDm } = require("../../Utils/noDmList");
const { resolveHogwartsEventConfig } = require("../../Utils/Web/hogwartsSortingConfig");
const { resolveSitePublicUrl } = require("../../Utils/Web/hogwartsEventAssets");
const IDs = require("../../Utils/Config/ids");

const POTIONS_PROFILE_PATH = "profile.events.hogwarts.potions";
const MAX_TIMEOUT_MS = 2_147_483_647;
const DEFAULT_CONFIG = Object.freeze({
  enabled: true,
  startDate: "2026-08-24T12:00:00",
  cooldownMs: 12 * 60 * 60 * 1000,
  /** Backup sweep only; primary delivery is per-user setTimeout at nextAvailableAt. */
  reminderSweepMs: 60 * 1000,
  reminderDmCategory: "perks",
  pageUrl: "/evento/pozioni",
});
const HOUSE_IDS = ["gryffindor", "hufflepuff", "ravenclaw", "slytherin"];
const loopState = new WeakSet();
/** @type {Map<string, NodeJS.Timeout>} */
const potionReminderTimers = new Map();

function normalizeId(value) {
  return String(value || "").trim();
}

function safeInt(value, fallback, min = 0, max = Number.MAX_SAFE_INTEGER) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.max(min, Math.min(max, n));
}

function cfg(client) {
  const raw = client?.config?.hogwartsPotions && typeof client.config.hogwartsPotions === "object" ? client.config.hogwartsPotions : {};
  const out = { ...DEFAULT_CONFIG, ...raw };
  out.enabled = out.enabled !== false;
  out.startDate = normalizeId(out.startDate) || DEFAULT_CONFIG.startDate;
  out.startMs = new Date(out.startDate).getTime();
  out.cooldownMs = safeInt(out.cooldownMs, DEFAULT_CONFIG.cooldownMs, 60 * 60 * 1000, 7 * 24 * 60 * 60 * 1000);
  out.reminderSweepMs = safeInt(out.reminderSweepMs, DEFAULT_CONFIG.reminderSweepMs, 15 * 1000, 24 * 60 * 60 * 1000);
  out.reminderDmCategory = normalizeId(out.reminderDmCategory) || DEFAULT_CONFIG.reminderDmCategory;
  out.pageUrl = normalizeId(out.pageUrl) || DEFAULT_CONFIG.pageUrl;
  return out;
}

function eventOpen(c, nowMs = Date.now()) {
  return Boolean(c.enabled) && Number.isFinite(Number(c.startMs)) && Number(nowMs || Date.now()) >= Number(c.startMs);
}

function reminderSlotKey(eventKey, c, nowMs = Date.now()) {
  return `${normalizeId(eventKey) || "hogwarts"}:potions:${Math.floor(Number(nowMs || Date.now()) / c.cooldownMs)}`;
}

function timerKey(guildId, userId) {
  return `${normalizeId(guildId)}:${normalizeId(userId)}`;
}

function isPotionAvailable(state, nowMs = Date.now()) {
  const nextMs = new Date(state?.nextAvailableAt || 0).getTime();
  return !(Number.isFinite(nextMs) && nextMs > Number(nowMs || Date.now()));
}

/** Remind once per availability window (after cooldown), not on a global wall-clock bucket. */
function shouldSendPotionReminder(state, c, nowMs = Date.now()) {
  if (!isPotionAvailable(state, nowMs)) return false;
  const lastRem = new Date(state?.lastReminderAt || 0).getTime();
  const nextAt = new Date(state?.nextAvailableAt || 0).getTime();
  if (Number.isFinite(nextAt) && nextAt > 0) {
    return !(Number.isFinite(lastRem) && lastRem >= nextAt);
  }
  // Sorted but never played: at most once per cooldown window.
  if (Number.isFinite(lastRem) && Number(nowMs) - lastRem < Number(c.cooldownMs)) return false;
  return true;
}

function notificationOpenUrl(c) {
  const page = normalizeId(c.pageUrl) || "/evento/pozioni";
  return page.startsWith("/") ? page : `/${page}`;
}

function resolvePotionsAbsoluteUrl(client, c) {
  const page = notificationOpenUrl(c);
  if (/^https?:\/\//i.test(page)) return page;
  const base = resolveSitePublicUrl(client).replace(/\/+$/, "");
  return `${base}${page.startsWith("/") ? page : `/${page}`}`;
}

function buildPotionReminderEmbed(client, c) {
  const hours = Math.max(1, Math.round(Number(c.cooldownMs) / (60 * 60 * 1000)));
  const embed = new EmbedBuilder()
    .setColor(client?.config?.embedInfo || "#6f4e37")
    .setTitle("<:VC_harrypotters:1510941833222557696> Lezione di Pozioni")
    .setDescription(
      [
        `<:VC_Owlcall:1510941826176126976> Sono passate **${hours} ore**: puoi tornare in aula **Pozioni**.`,
        "<a:VC_ThankYou:1330186319673950401> Abbina le voci richieste e guadagna Galeoni + punti casa.",
        "<:link:1470064815899803668> Clicca sul pulsante sottostante per entrare in aula:\n",
      ].join("\n"),
    )
    .setFooter({
      text: "DM Hogwarts: +profile → Privacy / Notifiche DM.",
    });

  const url = resolvePotionsAbsoluteUrl(client, c);
  const components = [
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setStyle(ButtonStyle.Link)
        .setURL(url)
        .setLabel("Apri Pozioni")
        .setEmoji("<:VC_FrogCute:1331620415185096746>"),
    ),
  ];
  return { embed, components, url };
}

async function remindUser(client, guild, sortingDoc, c, eventKey, slotKey) {
  const userId = normalizeId(sortingDoc?.userId);
  if (!userId) return;
  const profile = await ActivityUserProfile.findOne({ guildId: guild.id, userId })
    .select(POTIONS_PROFILE_PATH)
    .lean()
    .catch(() => null);
  const state =
    profile?.profile?.events?.hogwarts?.potions && typeof profile.profile.events.hogwarts.potions === "object"
      ? profile.profile.events.hogwarts.potions
      : {};
  if (!shouldSendPotionReminder(state, c)) return;

  const openUrl = notificationOpenUrl(c);
  const nextAtMs = new Date(state?.nextAvailableAt || 0).getTime();
  const dedupeKey =
    Number.isFinite(nextAtMs) && nextAtMs > 0
      ? `${normalizeId(eventKey) || "hogwarts"}:potions:avail:${nextAtMs}`
      : slotKey;

  const siteNotifMeta = {
    title: "Pozioni disponibili",
    body: "Puoi tornare in aula pozioni: il minigioco da 12 ore è pronto.",
    kind: "info",
    openUrl,
    dedupeKey,
  };

  let siteOk = false;
  try {
    siteOk = (await enqueueSiteInAppNotification({
      guildId: guild.id,
      userId,
      ...siteNotifMeta,
      dedupeWindowMs: c.cooldownMs,
    })) === true;
  } catch (err) {
    global.logger?.warn?.(`[HOGWARTS POTIONS] site notif ${userId}:`, err?.message || err);
  }

  let dmOk = false;
  const user = await client.users.fetch(userId).catch(() => null);
  if (user) {
    const { embed, components } = buildPotionReminderEmbed(client, c);
    try {
      const sent = await sendDm(
        user,
        {
          embeds: [embed],
          components,
        },
        {
          guildId: guild.id,
          category: c.reminderDmCategory,
          skipIfWebPush: true,
          webPushNotifMeta: siteNotifMeta,
        },
      );
      dmOk = Boolean(sent);
    } catch (err) {
      global.logger?.warn?.(`[HOGWARTS POTIONS] dm ${userId}:`, err?.message || err);
    }
  }

  if (!siteOk && !dmOk) return;

  const now = new Date();
  await ActivityUserProfile.updateOne(
    { guildId: guild.id, userId },
    {
      $setOnInsert: { guildId: guild.id, userId },
      $set: {
        [`${POTIONS_PROFILE_PATH}.eventKey`]: eventKey,
        [`${POTIONS_PROFILE_PATH}.lastReminderAt`]: now,
        [`${POTIONS_PROFILE_PATH}.lastReminderSlot`]: dedupeKey,
      },
    },
    { upsert: true, setDefaultsOnInsert: true },
  ).catch(() => null);
}

async function fireScheduledPotionReminder(client, guildId, userId) {
  const c = cfg(client);
  if (!eventOpen(c)) return;
  const gid = normalizeId(guildId);
  const uid = normalizeId(userId);
  if (!gid || !uid) return;
  const eventCfg = resolveHogwartsEventConfig(client);
  const eventKey = normalizeId(eventCfg?.eventKey) || "hogwarts";
  const guild = await client.guilds.fetch(gid).catch(() => null);
  if (!guild) return;
  const slotKey = reminderSlotKey(eventKey, c);
  await remindUser(client, guild, { userId: uid }, c, eventKey, slotKey);
}

/**
 * Schedule site+DM reminder exactly when potions cooldown ends (same idea as vote reminders).
 * @param {import("discord.js").Client} client
 * @param {string} guildId
 * @param {string} userId
 * @param {Date|string|number} nextAvailableAt
 */
function schedulePotionReminder(client, guildId, userId, nextAvailableAt) {
  if (!client) return;
  const c = cfg(client);
  if (!c.enabled) return;
  const gid = normalizeId(guildId);
  const uid = normalizeId(userId);
  if (!gid || !uid) return;
  const targetMs = new Date(nextAvailableAt || 0).getTime();
  if (!Number.isFinite(targetMs) || targetMs <= 0) return;

  const key = timerKey(gid, uid);
  const existing = potionReminderTimers.get(key);
  if (existing) clearTimeout(existing);

  const delay = Math.max(0, targetMs - Date.now());
  const run = async () => {
    try {
      await fireScheduledPotionReminder(client, gid, uid);
    } catch (err) {
      global.logger?.warn?.(`[HOGWARTS POTIONS] scheduled remind ${uid}:`, err?.message || err);
    } finally {
      potionReminderTimers.delete(key);
    }
  };

  if (delay <= 0) {
    void run();
    return;
  }

  const capped = Math.min(delay, MAX_TIMEOUT_MS);
  const timer = setTimeout(() => {
    if (delay > MAX_TIMEOUT_MS) {
      schedulePotionReminder(client, gid, uid, targetMs);
      return;
    }
    void run();
  }, capped);
  if (typeof timer.unref === "function") timer.unref();
  potionReminderTimers.set(key, timer);
}

async function restorePendingPotionReminders(client) {
  const c = cfg(client);
  if (!eventOpen(c)) return;
  const guildId = normalizeId(IDs.guilds?.main || client?.guilds?.cache?.first?.()?.id);
  if (!guildId) return;

  const now = Date.now();
  const docs = await ActivityUserProfile.find({
    guildId,
    [`${POTIONS_PROFILE_PATH}.nextAvailableAt`]: { $exists: true, $ne: null },
  })
    .select(`userId ${POTIONS_PROFILE_PATH}`)
    .lean()
    .catch(() => []);

  let restored = 0;
  for (const doc of docs || []) {
    const userId = normalizeId(doc?.userId);
    const state =
      doc?.profile?.events?.hogwarts?.potions && typeof doc.profile.events.hogwarts.potions === "object"
        ? doc.profile.events.hogwarts.potions
        : {};
    const nextAt = new Date(state.nextAvailableAt || 0).getTime();
    if (!userId || !Number.isFinite(nextAt) || nextAt <= 0) continue;
    if (nextAt > now) {
      schedulePotionReminder(client, guildId, userId, nextAt);
      restored += 1;
      continue;
    }
    if (shouldSendPotionReminder(state, c, now)) {
      schedulePotionReminder(client, guildId, userId, now);
      restored += 1;
    }
  }
  if (restored > 0) {
    global.logger?.info?.(`[HOGWARTS POTIONS] restored ${restored} cooldown reminder timer(s)`);
  }
}

async function runPotionReminderSweep(client) {
  const c = cfg(client);
  if (!eventOpen(c)) return;
  const eventCfg = resolveHogwartsEventConfig(client);
  const eventKey = normalizeId(eventCfg?.eventKey) || "hogwarts";
  const guildId = normalizeId(IDs.guilds?.main || client?.guilds?.cache?.first?.()?.id);
  const guild = guildId ? await client.guilds.fetch(guildId).catch(() => null) : null;
  if (!guild) return;
  const slotKey = reminderSlotKey(eventKey, c);
  const sorted = await SiteDocument.find({
    docType: SITE_DOCUMENT_TYPE.HOGWARTS_SORTING,
    guildId: guild.id,
    dedupeKey: eventKey,
    status: { $in: HOUSE_IDS },
  })
    .sort({ updatedAt: -1 })
    .limit(500)
    .lean()
    .catch(() => []);
  for (const row of sorted) {
    await remindUser(client, guild, row, c, eventKey, slotKey);
  }
}

function startPotionReminderLoop(client) {
  if (!client || loopState.has(client)) return;
  loopState.add(client);
  const c = cfg(client);
  const tick = () => {
    runPotionReminderSweep(client).catch((err) => {
      global.logger?.warn?.("[HOGWARTS POTIONS] reminder sweep:", err?.message || err);
    });
  };
  // Keep timers referenced so restarts/idle GC cannot drop the reminder loop.
  setTimeout(() => {
    restorePendingPotionReminders(client).catch((err) => {
      global.logger?.warn?.("[HOGWARTS POTIONS] restore reminders:", err?.message || err);
    });
    tick();
  }, 20 * 1000);
  setInterval(tick, c.reminderSweepMs);
}

module.exports = {
  runPotionReminderSweep,
  startPotionReminderLoop,
  schedulePotionReminder,
  restorePendingPotionReminders,
  buildPotionReminderEmbed,
};
