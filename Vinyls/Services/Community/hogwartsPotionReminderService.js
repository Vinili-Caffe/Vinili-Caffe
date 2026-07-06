const { ActivityUserProfile, SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas");
const { enqueueSiteInAppNotification } = require("../../Utils/Web/siteInAppNotificationsService");
const { sendDm } = require("../../Utils/noDmList");
const { resolveHogwartsEventConfig } = require("../../Utils/Web/hogwartsSortingConfig");
const IDs = require("../../Utils/Config/ids");

const POTIONS_PROFILE_PATH = "profile.events.hogwarts.potions";
const DEFAULT_CONFIG = Object.freeze({
  enabled: true,
  startDate: "2026-08-24T12:00:00",
  cooldownMs: 12 * 60 * 60 * 1000,
  reminderSweepMs: 30 * 60 * 1000,
  reminderDmCategory: "perks",
  pageUrl: "/evento/pozioni",
});
const HOUSE_IDS = ["gryffindor", "hufflepuff", "ravenclaw", "slytherin"];
const loopState = new WeakSet();

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
  out.reminderSweepMs = safeInt(out.reminderSweepMs, DEFAULT_CONFIG.reminderSweepMs, 5 * 60 * 1000, 24 * 60 * 60 * 1000);
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

function isPotionAvailable(state, nowMs = Date.now()) {
  const nextMs = new Date(state?.nextAvailableAt || 0).getTime();
  return !(Number.isFinite(nextMs) && nextMs > Number(nowMs || Date.now()));
}

function notificationOpenUrl(c) {
  const page = normalizeId(c.pageUrl) || "/evento/pozioni";
  return page.startsWith("/") ? page : `/${page}`;
}

async function remindUser(client, guild, sortingDoc, c, eventKey, slotKey) {
  const userId = normalizeId(sortingDoc?.userId);
  if (!userId) return;
  const profile = await ActivityUserProfile.findOne({ guildId: guild.id, userId })
    .select(POTIONS_PROFILE_PATH)
    .lean()
    .catch(() => null);
  const state = profile?.profile?.events?.hogwarts?.potions && typeof profile.profile.events.hogwarts.potions === "object" ? profile.profile.events.hogwarts.potions : {};
  if (!isPotionAvailable(state)) return;
  if (normalizeId(state.lastReminderSlot) === slotKey) return;

  const now = new Date();
  await ActivityUserProfile.updateOne(
    { guildId: guild.id, userId },
    {
      $setOnInsert: { guildId: guild.id, userId },
      $set: {
        [`${POTIONS_PROFILE_PATH}.eventKey`]: eventKey,
        [`${POTIONS_PROFILE_PATH}.lastReminderAt`]: now,
        [`${POTIONS_PROFILE_PATH}.lastReminderSlot`]: slotKey,
      },
    },
    { upsert: true, setDefaultsOnInsert: true },
  ).catch(() => null);

  const openUrl = notificationOpenUrl(c);
  await enqueueSiteInAppNotification({
    guildId: guild.id,
    userId,
    title: "Pozioni disponibili",
    body: "Puoi tornare in aula pozioni: il minigioco da 12 ore è pronto.",
    kind: "info",
    openUrl,
    dedupeKey: slotKey,
    dedupeWindowMs: c.cooldownMs,
  }).catch(() => null);

  const user = await client.users.fetch(userId).catch(() => null);
  if (user) {
    await sendDm(
      user,
      {
        content: `La tua lezione di Pozioni è pronta. Entra qui: ${openUrl}`,
      },
      { guildId: guild.id, category: c.reminderDmCategory },
    ).catch(() => null);
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
  const first = setTimeout(tick, 45 * 1000);
  if (typeof first.unref === "function") first.unref();
  const interval = setInterval(tick, c.reminderSweepMs);
  if (typeof interval.unref === "function") interval.unref();
}

module.exports = { runPotionReminderSweep, startPotionReminderLoop };