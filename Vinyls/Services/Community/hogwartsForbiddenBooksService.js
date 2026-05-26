const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas");
const { resolveHogwartsEventConfig } = require("../../Utils/Web/hogwartsSortingConfig");
const { getHouseMeta } = require("../../Utils/Web/hogwartsSortingBank");
const { isUserHighStaffExcludedFromHogwartsEvent, hasHogwartsSortingPreviewAccess } = require("../../Utils/Web/hogwartsEventParticipation");
const { getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache");
const { resolveForbiddenBooksSchedule } = require("../../Utils/Web/hogwartsEventSchedule");

const FORBIDDEN_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_FORBIDDEN_BOOKS;
const SORTING_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_SORTING;
const FORBIDDEN_EVENT_DEDUPE = "forbidden_section_books";
const FORBIDDEN_EVENT_OWNER_ID = "__event__";
const FORBIDDEN_BOOK_IDS = Object.freeze(["home", "faq", "wiki", "regole", "donazioni", "vote", "ruoli", "sponsor"]);
const FORBIDDEN_BOOK_LABELS = Object.freeze({
  home: "Home",
  faq: "FAQ",
  wiki: "Wiki",
  regole: "Regole",
  donazioni: "Donazioni",
  vote: "Voto",
  ruoli: "Ruoli",
  sponsor: "Sponsor",
});
const FORBIDDEN_MAX_WINNERS = 2;

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

function normalizeForbiddenBookId(value) {
  const id = String(value || "").trim().toLowerCase();
  return FORBIDDEN_BOOK_IDS.includes(id) ? id : "";
}

function forbiddenEventDedupeKey(cfg) {
  return `${String(cfg?.eventKey || "").trim() || "hogwarts"}:${FORBIDDEN_EVENT_DEDUPE}`;
}

function forbiddenEventOpen(client, nowMs = Date.now()) {
  const { startMs, endMs } = resolveForbiddenBooksSchedule(client);
  const now = Number(nowMs || Date.now());
  return Number.isFinite(startMs) && Number.isFinite(endMs) && now >= startMs && now <= endMs;
}

function canPreviewForbiddenBooks(client, member, userId, nowMs = Date.now()) {
  const cfg = resolveHogwartsEventConfig(client);
  const now = Number(nowMs || Date.now());
  const { endMs } = resolveForbiddenBooksSchedule(client);
  if (Number.isFinite(endMs) && now > endMs) return false;
  return Boolean(cfg?.previewMode && !forbiddenEventOpen(client, now) && hasHogwartsSortingPreviewAccess(cfg, member, userId));
}

function forbiddenProgressPayload(doc, closureDoc = null) {
  const ids = Array.isArray(doc?.rawWebhook?.collectedBookIds)
    ? doc.rawWebhook.collectedBookIds.map(normalizeForbiddenBookId).filter(Boolean)
    : [];
  const unique = Array.from(new Set(ids));
  const completed = unique.length >= FORBIDDEN_BOOK_IDS.length;
  const missingBookIds = FORBIDDEN_BOOK_IDS.filter((id) => !unique.includes(id));
  return {
    bookIds: FORBIDDEN_BOOK_IDS,
    collectedBookIds: unique,
    collectedCount: unique.length,
    requiredCount: FORBIDDEN_BOOK_IDS.length,
    missingBookIds,
    completed,
    closed: String(closureDoc?.status || "") === "closed",
    closedAt: closureDoc?.rawWebhook?.closedAt || null,
    winners: Array.isArray(closureDoc?.rawWebhook?.winners)
      ? closureDoc.rawWebhook.winners.map(normalizeWinnerEntry).filter(Boolean)
      : [],
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

async function getForbiddenClosure(guildId, dedupeKey) {
  return SiteDocument.findOne({
    docType: FORBIDDEN_DOC,
    guildId: String(guildId || "").trim(),
    userId: FORBIDDEN_EVENT_OWNER_ID,
    dedupeKey: String(dedupeKey || "").trim(),
  })
    .lean()
    .catch(() => null);
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
  const dedupeKey = forbiddenEventDedupeKey(cfg);
  const sorting = await findExistingSort(gid, uid, cfg.eventKey);
  const houseId = String(sorting?.status || "").trim();
  const [doc, closure] = await Promise.all([
    getForbiddenUserDoc(gid, uid, dedupeKey),
    getForbiddenClosure(gid, dedupeKey),
  ]);
  const progress = forbiddenProgressPayload(doc, closure);
  const houseMeta = houseId ? getHouseMeta(houseId, cfg?.houses?.[houseId]?.crestUrl) : null;
  return {
    ok: true,
    eventKey: cfg.eventKey,
    dedupeKey,
    sorted: Boolean(houseId),
    houseId,
    houseLabel: houseMeta?.label || houseId || "",
    eventOpen: forbiddenEventOpen(client),
    progress,
    completedAt: doc?.rawWebhook?.completedAt || (progress.completed ? doc?.updatedAt : null) || null,
    lastCollectedAt: doc?.rawWebhook?.lastCollectedAt || null,
  };
}

function formatForbiddenBookList(bookIds) {
  const list = Array.isArray(bookIds) ? bookIds : [];
  if (!list.length) return "—";
  return list.map((id) => `• **${FORBIDDEN_BOOK_LABELS[id] || id}** (\`${id}\`)`).join("\n");
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
  const dedupeKey = audit.dedupeKey;
  const houseId = normalizeHouseId(audit.houseId);
  const closure = await getForbiddenClosure(gid, dedupeKey);
  const progress = forbiddenProgressPayload(null, closure);
  if (progress.closed) {
    return { ok: false, code: "event_closed", winners: progress.winners };
  }
  const winners = progress.winners;
  if (winners.some((w) => w.userId === uid)) {
    return { ok: false, code: "already_winner", houseId, winners };
  }
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
    "rawWebhook.winners": nextWinners,
  };
  if (shouldClose) {
    setFields.status = "closed";
    setFields["rawWebhook.closedAt"] = nowIso;
    setFields["rawWebhook.closedBy"] = actor;
  }
  await SiteDocument.findOneAndUpdate(
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
        status: shouldClose ? "closed" : "open",
      },
      $set: setFields,
    },
    { upsert: true },
  ).catch(() => null);
  return {
    ok: true,
    houseId,
    houseLabel: audit.houseLabel,
    winners: nextWinners,
    closed: shouldClose,
    maxWinners: FORBIDDEN_MAX_WINNERS,
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
  canPreviewForbiddenBooks,
  forbiddenProgressPayload,
  getForbiddenClosure,
  getForbiddenUserDoc,
  FORBIDDEN_MAX_WINNERS,
  auditForbiddenBooksForUser,
  assignForbiddenSectionWinner,
  formatForbiddenBookList,
  formatForbiddenWinnersList,
};