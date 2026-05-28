const IDs = require("../../Utils/Config/ids");
const { ActivityUserProfile, SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas");
const { HOUSES } = require("../../Utils/Web/hogwartsSortingBank");
const { resolveHogwartsEventConfig } = require("../../Utils/Web/hogwartsSortingConfig");

const SORTING_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_SORTING;
const MAIN_GUILD_ID = String(IDs.guilds?.main || "").trim();

function normalizeId(value) {
  return String(value || "").trim();
}

function isHogwartsEventRetentionActive(cfg, nowMs = Date.now()) {
  if (!cfg?.enabled) return false;
  const end = Number(cfg.endMs);
  if (!Number.isFinite(end)) return false;
  return Number(nowMs) <= end;
}

function hogwartsProfileRetainUntilActive(doc, eventKey, nowMs = Date.now()) {
  const key = normalizeId(eventKey);
  const until = doc?.profile?.events?.hogwarts?.retainUntil;
  const markerKey = normalizeId(doc?.profile?.events?.hogwarts?.retainEventKey);
  if (!until || (key && markerKey && markerKey !== key)) return false;
  const ms = new Date(until).getTime();
  return Number.isFinite(ms) && ms > Number(nowMs);
}

async function isSortedHogwartsParticipant(guildId, userId, eventKey) {
  const gid = normalizeId(guildId);
  const uid = normalizeId(userId);
  const key = normalizeId(eventKey);
  if (!gid || !uid || !key) return false;
  const doc = await SiteDocument.findOne({
    docType: SORTING_DOC,
    guildId: gid,
    userId: uid,
    dedupeKey: key,
    status: { $in: HOUSES },
  })
    .select({ _id: 1 })
    .lean()
    .catch(() => null);
  return Boolean(doc);
}

function extractHogwartsProfileSlice(doc) {
  const hw = doc?.profile?.events?.hogwarts;
  if (!hw || typeof hw !== "object") return null;
  return JSON.parse(JSON.stringify(hw));
}

function attachHogwartsRetentionMarkers(hogwartsSlice, cfg) {
  if (!hogwartsSlice || typeof hogwartsSlice !== "object" || !cfg) return hogwartsSlice;
  const end = Number(cfg.endMs);
  if (Number.isFinite(end) && !hogwartsSlice.retainUntil) {
    hogwartsSlice.retainUntil = new Date(end);
  }
  const eventKey = normalizeId(cfg.eventKey);
  if (eventKey && !hogwartsSlice.retainEventKey) hogwartsSlice.retainEventKey = eventKey;
  return hogwartsSlice;
}

async function shouldRetainHogwartsProfileOnLeave(client, doc, opts = {}) {
  if (!client) return false;
  const cfg = resolveHogwartsEventConfig(client);
  if (!isHogwartsEventRetentionActive(cfg)) return false;
  const guildId = normalizeId(opts.guildId || doc?.guildId);
  const userId = normalizeId(opts.userId || doc?.userId);
  if (!guildId || !userId || guildId !== MAIN_GUILD_ID) return false;
  if (hogwartsProfileRetainUntilActive(doc, cfg.eventKey)) return true;
  return isSortedHogwartsParticipant(guildId, userId, cfg.eventKey);
}

async function markHogwartsProfileRetainedUntil(guildId, userId, client) {
  if (!client) return;
  const cfg = resolveHogwartsEventConfig(client);
  if (!isHogwartsEventRetentionActive(cfg)) return;
  const gid = normalizeId(guildId);
  const uid = normalizeId(userId);
  const eventKey = normalizeId(cfg.eventKey);
  const end = Number(cfg.endMs);
  if (!gid || !uid || !eventKey || !Number.isFinite(end)) return;
  await ActivityUserProfile.updateOne(
    { guildId: gid, userId: uid },
    {
      $set: {
        "profile.events.hogwarts.retainUntil": new Date(end),
        "profile.events.hogwarts.retainEventKey": eventKey,
        updatedAt: new Date(),
      },
    },
  ).catch(() => {});
}

async function loadSortedHogwartsParticipantUserIds(guildId, eventKey) {
  const gid = normalizeId(guildId);
  const key = normalizeId(eventKey);
  if (!gid || !key) return [];
  const docs = await SiteDocument.find({
    docType: SORTING_DOC,
    guildId: gid,
    dedupeKey: key,
    status: { $in: HOUSES },
  })
    .select({ userId: 1 })
    .lean()
    .catch(() => []);
  return [...new Set((docs || []).map((row) => normalizeId(row?.userId)).filter(Boolean))];
}

async function resolveHogwartsCleanupExcludeUserIds(client, guildId) {
  if (!client) return [];
  const gid = normalizeId(guildId);
  if (gid !== MAIN_GUILD_ID) return [];
  const cfg = resolveHogwartsEventConfig(client);
  if (!isHogwartsEventRetentionActive(cfg)) return [];
  return loadSortedHogwartsParticipantUserIds(gid, cfg.eventKey);
}

module.exports = {
  attachHogwartsRetentionMarkers,
  extractHogwartsProfileSlice,
  isHogwartsEventRetentionActive,
  isSortedHogwartsParticipant,
  loadSortedHogwartsParticipantUserIds,
  markHogwartsProfileRetainedUntil,
  resolveHogwartsCleanupExcludeUserIds,
  shouldRetainHogwartsProfileOnLeave,
};