const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas");
const { resolveHogwartsEventConfig } = require("../../Utils/Web/hogwartsSortingConfig");
const { getHouseMeta } = require("../../Utils/Web/hogwartsSortingBank");
const { isUserHighStaffExcludedFromHogwartsEvent, hasHogwartsSortingPreviewAccess } = require("../../Utils/Web/hogwartsEventParticipation");
const { getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache");
const { resolveForbiddenBooksSchedule } = require("../../Utils/Web/hogwartsEventSchedule");
const { assignManualHousePoints } = require("./hogwartsManualHousePointsService");
const { addGaleoni } = require("./gringottService");
const {
  FORBIDDEN_EVENT_DEDUPE,
  FORBIDDEN_BOOK_LABELS,
  DEFAULT_ROUND_BOOK_IDS,
  resolveForbiddenBooksRounds,
  forbiddenEventDedupeKey,
  forbiddenRoundDedupeKey,
  resolveForbiddenRoundByTime,
  allConfiguredForbiddenBookIds,
  normalizeForbiddenBookId,
  formatForbiddenBookLabel,
} = require("./hogwartsForbiddenBooksRounds");

const FORBIDDEN_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_FORBIDDEN_BOOKS;
const SORTING_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_SORTING;
const FORBIDDEN_EVENT_OWNER_ID = "__event__";
const FORBIDDEN_BOOK_IDS = Object.freeze(allConfiguredForbiddenBookIds({ config: {} }));
const FORBIDDEN_MAX_WINNERS = 2;
const DEFAULT_FORBIDDEN_REWARD_HOUSE_POINTS = 250;
const DEFAULT_FORBIDDEN_REWARD_GALEONI = 100;

function safeRewardInt(value, fallback, min = 0, max = 100000) {
  const n = Math.floor(Number(value));
  if (!Number.isFinite(n)) return fallback;
  return Math.min(max, Math.max(min, n));
}

function resolveForbiddenBooksRewardConfig(client) {
  const raw = client?.config?.hogwartsForbiddenBooks && typeof client.config.hogwartsForbiddenBooks === "object"
    ? client.config.hogwartsForbiddenBooks
    : {};
  return {
    rewardHousePoints: safeRewardInt(raw.rewardHousePoints, DEFAULT_FORBIDDEN_REWARD_HOUSE_POINTS),
    rewardGaleoni: safeRewardInt(raw.rewardGaleoni, DEFAULT_FORBIDDEN_REWARD_GALEONI),
  };
}

function forbiddenWinnerRewardKey(dedupeKey, userId) {
  return `${String(dedupeKey || "").trim()}:winner:${String(userId || "").trim()}`;
}

async function grantForbiddenSectionWinnerRewards(client, { guildId, userId, houseId, actorId, dedupeKey, eventKey }) {
  const rewardsCfg = resolveForbiddenBooksRewardConfig(client);
  const rewardKey = forbiddenWinnerRewardKey(dedupeKey, userId);
  const housePoints = rewardsCfg.rewardHousePoints;
  const galeoniAmount = rewardsCfg.rewardGaleoni;
  const out = {
    rewardKey,
    housePoints: null,
    galeoni: null,
    housePointsAmount: housePoints,
    galeoniAmount,
  };
  if (housePoints > 0) {
    out.housePoints = await assignManualHousePoints(client, {
      guildId,
      houseId,
      points: housePoints,
      actorId,
      reason: `Sezione proibita — vincitore ${userId}`,
    });
  }
  if (galeoniAmount > 0) {
    out.galeoni = await addGaleoni({
      guildId,
      userId,
      amount: galeoniAmount,
      reason: "Vincitore — Avventura nella Sezione Proibita",
      actorId,
      source: "forbidden_section_winner",
      eventKey: String(eventKey || "").trim(),
      rewardKey,
    });
  }
  return out;
}

function normalizeHouseId(value) {
  return String(value || "").trim().toLowerCase();
}

function normalizeWinnerEntry(entry) {
  if (!entry || typeof entry !== "object") return null;
  const userId = String(entry.userId || "").trim();
  const houseId = normalizeHouseId(entry.houseId);
  if (!userId || !houseId) return null;
  return {
    userId,
    houseId,
    assignedAt: entry.assignedAt || null,
    assignedBy: String(entry.assignedBy || entry.assignedByUserId || "").trim() || null,
  };
}

function isForbiddenEventClosed(closureDoc) {
  if (!closureDoc || typeof closureDoc !== "object") return false;
  if (String(closureDoc.status || "") === "closed") return true;
  const winners = Array.isArray(closureDoc.rawWebhook?.winners)
    ? closureDoc.rawWebhook.winners.map(normalizeWinnerEntry).filter(Boolean)
    : [];
  if (winners.length < FORBIDDEN_MAX_WINNERS) return false;
  const houses = new Set(winners.map((entry) => entry.houseId));
  return houses.size >= FORBIDDEN_MAX_WINNERS;
}

function isForbiddenBooksFeatureEnabled(client) {
  const books = client?.config?.hogwartsForbiddenBooks;
  if (books && typeof books === "object" && books.enabled === false) return false;
  const presence = client?.config?.presence?.forbiddenSectionEvent;
  if (presence && typeof presence === "object" && presence.enabled === false) return false;
  return true;
}

function forbiddenEventOpen(client, nowMs = Date.now()) {
  if (!isForbiddenBooksFeatureEnabled(client)) return false;
  const { startMs, endMs } = resolveForbiddenBooksSchedule(client);
  const now = Number(nowMs || Date.now());
  if (!Number.isFinite(startMs) || !Number.isFinite(endMs) || now < startMs || now > endMs) return false;
  const { active, mode } = resolveForbiddenRoundByTime(client, nowMs);
  if (mode === "legacy") return true;
  return Boolean(active);
}

function canPreviewForbiddenBooks(client, member, userId, nowMs = Date.now()) {
  const cfg = resolveHogwartsEventConfig(client);
  const now = Number(nowMs || Date.now());
  const { endMs } = resolveForbiddenBooksSchedule(client);
  if (Number.isFinite(endMs) && now > endMs) return false;
  return Boolean(cfg?.previewMode && !forbiddenEventOpen(client, now) && hasHogwartsSortingPreviewAccess(cfg, member, userId));
}

function forbiddenProgressPayload(doc, closureDoc = null, options = {}) {
  const bookIds = Array.isArray(options.bookIds) && options.bookIds.length ? options.bookIds : DEFAULT_ROUND_BOOK_IDS;
  const ids = Array.isArray(doc?.rawWebhook?.collectedBookIds)
    ? doc.rawWebhook.collectedBookIds.map((id) => normalizeForbiddenBookId(id, bookIds)).filter(Boolean)
    : [];
  const unique = Array.from(new Set(ids));
  const completed = unique.length >= bookIds.length;
  const missingBookIds = bookIds.filter((id) => !unique.includes(id));
  const winners = Array.isArray(closureDoc?.rawWebhook?.winners)
    ? closureDoc.rawWebhook.winners.map(normalizeWinnerEntry).filter(Boolean)
    : [];
  const closed = isForbiddenEventClosed(closureDoc);
  return {
    roundId: options.roundId || null,
    roundLabel: options.roundLabel || null,
    roundActive: options.roundActive === true,
    roundStartMs: options.roundStartMs ?? null,
    roundEndMs: options.roundEndMs ?? null,
    nextRoundId: options.nextRoundId || null,
    nextRoundStartMs: options.nextRoundStartMs ?? null,
    bookIds,
    collectedBookIds: unique,
    collectedCount: unique.length,
    requiredCount: bookIds.length,
    missingBookIds,
    completed,
    closed,
    closedAt: closureDoc?.rawWebhook?.closedAt || null,
    winners,
  };
}

async function findExistingSort(guildId, userId, eventKey) {
  return SiteDocument.findOne({
    docType: SORTING_DOC,
    guildId: String(guildId || "").trim(),
    userId: String(userId || "").trim(),
    dedupeKey: String(eventKey || "").trim(),
  })
    .lean()
    .catch(() => null);
}

async function getForbiddenClosure(guildId, dedupeKey, round = null) {
  const key = String(dedupeKey || "").trim();
  if (!key) return null;
  let doc = await SiteDocument.findOne({
    docType: FORBIDDEN_DOC,
    guildId: String(guildId || "").trim(),
    userId: FORBIDDEN_EVENT_OWNER_ID,
    dedupeKey: key,
  })
    .lean()
    .catch(() => null);
  if (!doc && round?.legacyDedupeKey) {
    doc = await SiteDocument.findOne({
      docType: FORBIDDEN_DOC,
      guildId: String(guildId || "").trim(),
      userId: FORBIDDEN_EVENT_OWNER_ID,
      dedupeKey: String(round.legacyDedupeKey || "").trim(),
    })
      .lean()
      .catch(() => null);
  }
  return doc;
}

async function resolveForbiddenRoundRuntime(client, nowMs = Date.now()) {
  const cfg = resolveHogwartsEventConfig(client);
  const guildId = String(client?.config?.mainGuildId || "").trim();
  const { startMs, endMs } = resolveForbiddenBooksSchedule(client);
  const now = Number(nowMs || Date.now());
  if (!isForbiddenBooksFeatureEnabled(client)) {
    return {
      mode: "disabled",
      round: null,
      roundId: null,
      roundLabel: null,
      roundActive: false,
      roundClosed: false,
      bookIds: [],
      dedupeKey: null,
      closure: null,
      nextRound: null,
      nextRoundId: null,
      nextRoundStartMs: null,
      roundStartMs: null,
      roundEndMs: null,
      betweenRounds: false,
      open: false,
      startMs,
      endMs,
      enabled: false,
    };
  }
  const { rounds, active, next, mode } = resolveForbiddenRoundByTime(client, nowMs);
  if (mode === "legacy") {
    const dedupeKey = forbiddenEventDedupeKey(cfg);
    const closure = guildId ? await getForbiddenClosure(guildId, dedupeKey) : null;
    const closed = isForbiddenEventClosed(closure);
    const inSchedule = Number.isFinite(startMs) && Number.isFinite(endMs) && now >= startMs && now <= endMs;
    return {
      mode,
      round: null,
      roundId: null,
      roundLabel: null,
      roundActive: Boolean(inSchedule && !closed),
      roundClosed: closed,
      bookIds: DEFAULT_ROUND_BOOK_IDS,
      dedupeKey,
      closure,
      nextRound: null,
      nextRoundId: null,
      nextRoundStartMs: null,
      roundStartMs: startMs,
      roundEndMs: endMs,
      betweenRounds: false,
      open: inSchedule,
      startMs,
      endMs,
    };
  }
  if (!active) {
    return {
      mode,
      rounds,
      round: null,
      roundId: null,
      roundLabel: null,
      roundActive: false,
      roundClosed: false,
      bookIds: [],
      dedupeKey: null,
      closure: null,
      nextRound: next || null,
      nextRoundId: next?.id || null,
      nextRoundStartMs: next?.startMs ?? null,
      roundStartMs: null,
      roundEndMs: null,
      betweenRounds: true,
      open: forbiddenEventOpen(client, nowMs),
      startMs,
      endMs,
    };
  }
  const dedupeKey = forbiddenRoundDedupeKey(cfg, active);
  const closure = guildId ? await getForbiddenClosure(guildId, dedupeKey, active) : null;
  const closed = isForbiddenEventClosed(closure);
  return {
    mode,
    rounds,
    round: active,
    roundId: active.id,
    roundLabel: active.label,
    roundActive: !closed,
    roundClosed: closed,
    bookIds: active.bookIds,
    dedupeKey,
    closure,
    nextRound: next || null,
    nextRoundId: next?.id || null,
    nextRoundStartMs: next?.startMs ?? null,
    roundStartMs: active.startMs,
    roundEndMs: active.endMs,
    betweenRounds: closed && next && now < next.startMs,
    open: forbiddenEventOpen(client, nowMs),
    startMs,
    endMs,
  };
}

function buildForbiddenPublicStatusPayload(runtime) {
  if (runtime?.mode === "disabled" || runtime?.enabled === false) {
    return {
      ok: true,
      enabled: false,
      open: false,
      startMs: runtime.startMs ?? null,
      endMs: runtime.endMs ?? null,
      betweenRounds: false,
      roundId: null,
      roundLabel: null,
      roundActive: false,
      roundStartMs: null,
      roundEndMs: null,
      nextRoundId: null,
      nextRoundStartMs: null,
      bookIds: [],
      collectedBookIds: [],
      collectedCount: 0,
      requiredCount: 0,
      missingBookIds: [],
      completed: false,
      closed: true,
      closedAt: null,
      winners: [],
    };
  }
  const progressOpts = {
    roundId: runtime.roundId,
    roundLabel: runtime.roundLabel,
    roundActive: runtime.roundActive === true,
    roundStartMs: runtime.roundStartMs,
    roundEndMs: runtime.roundEndMs,
    nextRoundId: runtime.nextRoundId,
    nextRoundStartMs: runtime.nextRoundStartMs,
    bookIds: runtime.bookIds || [],
  };
  return {
    ok: true,
    enabled: true,
    open: runtime.open === true,
    startMs: runtime.startMs,
    endMs: runtime.endMs,
    betweenRounds: runtime.betweenRounds === true,
    ...forbiddenProgressPayload(null, runtime.closure, progressOpts),
  };
}

async function getForbiddenAssignedWinnersCount(client) {
  const runtime = await resolveForbiddenRoundRuntime(client);
  if (!runtime.closure) return 0;
  return Array.isArray(runtime.closure.rawWebhook?.winners) ? runtime.closure.rawWebhook.winners.length : 0;
}

async function getForbiddenUserDoc(guildId, userId, dedupeKey) {
  return SiteDocument.findOne({
    docType: FORBIDDEN_DOC,
    guildId: String(guildId || "").trim(),
    userId: String(userId || "").trim(),
    dedupeKey: String(dedupeKey || "").trim(),
  })
    .lean()
    .catch(() => null);
}

async function auditForbiddenBooksForUser(client, guildId, userId) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return { ok: false, code: "bad_input" };
  const cfg = resolveHogwartsEventConfig(client);
  const runtime = await resolveForbiddenRoundRuntime(client);
  if (!runtime.dedupeKey) {
    return {
      ok: true,
      eventKey: cfg.eventKey,
      dedupeKey: "",
      sorted: false,
      houseId: "",
      houseLabel: "",
      eventOpen: runtime.open === true,
      roundId: runtime.nextRoundId,
      roundLabel: runtime.nextRound?.label || "",
      roundActive: false,
      progress: forbiddenProgressPayload(null, null, {
        roundId: runtime.nextRoundId,
        roundLabel: runtime.nextRound?.label || "",
        roundActive: false,
        nextRoundId: runtime.nextRoundId,
        nextRoundStartMs: runtime.nextRoundStartMs,
        bookIds: runtime.nextRound?.bookIds || [],
      }),
      completedAt: null,
      lastCollectedAt: null,
    };
  }
  const sorting = await findExistingSort(gid, uid, cfg.eventKey);
  const houseId = String(sorting?.status || "").trim();
  const [doc, closure] = await Promise.all([
    getForbiddenUserDoc(gid, uid, runtime.dedupeKey),
    getForbiddenClosure(gid, runtime.dedupeKey, runtime.round),
  ]);
  const progress = forbiddenProgressPayload(doc, closure, {
    roundId: runtime.roundId,
    roundLabel: runtime.roundLabel,
    roundActive: runtime.roundActive === true,
    roundStartMs: runtime.roundStartMs,
    roundEndMs: runtime.roundEndMs,
    nextRoundId: runtime.nextRoundId,
    nextRoundStartMs: runtime.nextRoundStartMs,
    bookIds: runtime.bookIds,
  });
  const houseMeta = houseId ? getHouseMeta(houseId, cfg?.houses?.[houseId]?.crestUrl) : null;
  return {
    ok: true,
    eventKey: cfg.eventKey,
    dedupeKey: runtime.dedupeKey,
    roundId: runtime.roundId,
    roundLabel: runtime.roundLabel,
    roundActive: runtime.roundActive === true,
    sorted: Boolean(houseId),
    houseId,
    houseLabel: houseMeta?.label || houseId || "",
    eventOpen: runtime.open === true,
    progress,
    completedAt: doc?.rawWebhook?.completedAt || (progress.completed ? doc?.updatedAt : null) || null,
    lastCollectedAt: doc?.rawWebhook?.lastCollectedAt || null,
  };
}

function formatForbiddenBookList(bookIds) {
  const list = Array.isArray(bookIds) ? bookIds : [];
  if (!list.length) return "—";
  return list.map((id) => `• **${formatForbiddenBookLabel(id)}** (\`${id}\`)`).join("\n");
}

function formatForbiddenWinnersList(winners, cfg) {
  const list = Array.isArray(winners) ? winners : [];
  if (!list.length) return "—";
  return list
    .map((w) => {
      const meta = getHouseMeta(w.houseId, cfg?.houses?.[w.houseId]?.crestUrl);
      const house = meta?.label || w.houseId;
      return `• <@${w.userId}> — **${house}**`;
    })
    .join("\n");
}

async function assignForbiddenSectionWinner(client, guildId, userId, actorId) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  const actor = String(actorId || "").trim();
  if (!gid || !uid || !actor) return { ok: false, code: "bad_input" };
  if (!isForbiddenBooksFeatureEnabled(client)) return { ok: false, code: "feature_disabled" };
  const runtime = await resolveForbiddenRoundRuntime(client);
  if (!runtime.round || !runtime.dedupeKey) {
    return { ok: false, code: "round_inactive", nextRoundId: runtime.nextRoundId, nextRoundStartMs: runtime.nextRoundStartMs };
  }
  if (runtime.roundClosed) {
    return { ok: false, code: "event_closed", winners: runtime.closure?.rawWebhook?.winners || [] };
  }
  const audit = await auditForbiddenBooksForUser(client, gid, uid);
  if (!audit.ok) return { ok: false, code: "bad_input" };
  if (!audit.sorted || !audit.houseId) return { ok: false, code: "not_sorted" };
  if (!audit.progress?.completed) return { ok: false, code: "books_incomplete" };
  const guild = client?.guilds?.cache?.get(gid) || (await client?.guilds?.fetch?.(gid).catch(() => null));
  const targetMember = guild ? await getGuildMemberCached(guild, uid).catch(() => null) : null;
  if (await isUserHighStaffExcludedFromHogwartsEvent(client, uid, targetMember)) {
    return { ok: false, code: "high_staff_excluded" };
  }
  const cfg = resolveHogwartsEventConfig(client);
  const dedupeKey = runtime.dedupeKey;
  const houseId = normalizeHouseId(audit.houseId);
  const closure = await getForbiddenClosure(gid, dedupeKey, runtime.round);
  const progress = forbiddenProgressPayload(null, closure, { bookIds: runtime.bookIds });
  if (progress.closed) {
    return { ok: false, code: "event_closed", winners: progress.winners };
  }
  const winners = progress.winners;
  if (winners.some((w) => w.houseId === houseId)) {
    return {
      ok: false,
      code: "house_already_winner",
      houseId,
      houseLabel: audit.houseLabel,
      winners,
    };
  }
  if (winners.length >= FORBIDDEN_MAX_WINNERS) {
    return { ok: false, code: "max_winners", winners, maxWinners: FORBIDDEN_MAX_WINNERS };
  }
  const nowIso = new Date().toISOString();
  const entry = { userId: uid, houseId, assignedAt: nowIso, assignedBy: actor };
  const nextWinners = [...winners, entry];
  const shouldClose = nextWinners.length >= FORBIDDEN_MAX_WINNERS;
  const setFields = {
    status: shouldClose ? "closed" : "open",
    "rawWebhook.winners": nextWinners,
    "rawWebhook.roundId": runtime.roundId,
  };
  if (shouldClose) {
    setFields["rawWebhook.closedAt"] = nowIso;
    setFields["rawWebhook.closedBy"] = actor;
  }
  let saved;
  try {
    saved = await SiteDocument.findOneAndUpdate(
      {
        docType: FORBIDDEN_DOC,
        guildId: gid,
        userId: FORBIDDEN_EVENT_OWNER_ID,
        dedupeKey,
      },
      {
        $setOnInsert: {
          docType: FORBIDDEN_DOC,
          guildId: gid,
          userId: FORBIDDEN_EVENT_OWNER_ID,
          dedupeKey,
        },
        $set: setFields,
      },
      { upsert: true, new: true },
    );
  } catch (err) {
    global.logger?.error?.("[FORBIDDEN BOOKS] closure write failed:", err?.message || err);
    return { ok: false, code: "db_write_failed" };
  }
  const savedWinners = Array.isArray(saved?.rawWebhook?.winners) ? saved.rawWebhook.winners : [];
  if (!saved || savedWinners.length !== nextWinners.length) {
    global.logger?.error?.(
      "[FORBIDDEN BOOKS] closure write mismatch:",
      `expected=${nextWinners.length}`,
      `saved=${savedWinners.length}`,
    );
    return { ok: false, code: "db_write_mismatch", winners: savedWinners };
  }
  const rewards = await grantForbiddenSectionWinnerRewards(client, {
    guildId: gid,
    userId: uid,
    houseId,
    actorId: actor,
    dedupeKey,
    eventKey: cfg.eventKey,
  }).catch((err) => {
    global.logger?.warn?.("[FORBIDDEN BOOKS] winner rewards failed:", err?.message || err);
    return null;
  });
  if (shouldClose) {
    const { restoreForbiddenSectionChannelDecor } = require("./hogwartsForbiddenSectionChannelService");
    await restoreForbiddenSectionChannelDecor(client, "winners_closed").catch((err) => {
      global.logger?.warn?.("[FORBIDDEN BOOKS] channel restore failed:", err?.message || err);
    });
  }
  return {
    ok: true,
    houseId,
    houseLabel: audit.houseLabel,
    roundId: runtime.roundId,
    roundLabel: runtime.roundLabel,
    winners: nextWinners,
    closed: shouldClose,
    maxWinners: FORBIDDEN_MAX_WINNERS,
    rewards,
  };
}

module.exports = {
  FORBIDDEN_DOC,
  FORBIDDEN_BOOK_IDS,
  FORBIDDEN_BOOK_LABELS,
  FORBIDDEN_EVENT_DEDUPE,
  FORBIDDEN_EVENT_OWNER_ID,
  normalizeForbiddenBookId,
  resolveForbiddenBooksSchedule,
  forbiddenEventDedupeKey,
  forbiddenEventOpen,
  isForbiddenBooksFeatureEnabled,
  isForbiddenEventClosed,
  canPreviewForbiddenBooks,
  forbiddenProgressPayload,
  getForbiddenClosure,
  getForbiddenAssignedWinnersCount,
  getForbiddenUserDoc,
  resolveForbiddenRoundRuntime,
  buildForbiddenPublicStatusPayload,
  resolveForbiddenBooksRounds,
  FORBIDDEN_MAX_WINNERS,
  auditForbiddenBooksForUser,
  assignForbiddenSectionWinner,
  formatForbiddenBookList,
  formatForbiddenWinnersList,
  resolveForbiddenBooksRewardConfig,
  grantForbiddenSectionWinnerRewards,
};