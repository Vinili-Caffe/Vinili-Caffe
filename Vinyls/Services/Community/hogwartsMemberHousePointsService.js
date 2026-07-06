const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas");
const { normalizeHouseInput } = require("./hogwartsManualHousePointsService");
const { resolveSortedHouseId } = require("../../Utils/Web/hogwartsSortingResolve");

const SORTING_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_SORTING;
const HOUSE_POINTS_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_HOUSE_POINTS;
const HOUSE_POINTS_OWNER_ID = "__event__";

function readMemberHousePoints(pointsDoc, userId, periodKey = "") {
  const uid = String(userId || "").trim();
  if (!uid) return { totalPoints: 0, periodPoints: 0 };
  const byMember = pointsDoc?.rawWebhook?.byMember && typeof pointsDoc.rawWebhook.byMember === "object"
    ? pointsDoc.rawWebhook.byMember
    : {};
  const row = byMember[uid] || {};
  const totalPoints = Math.max(0, Math.floor(Number(row?.total) || 0));
  const pk = String(periodKey || "").trim();
  const periodPoints = pk
    ? Math.max(0, Math.floor(Number(row?.byPeriod?.[pk]) || 0))
    : 0;
  return { totalPoints, periodPoints };
}

function formatMemberPointsProfileLabel(memberPts, periodMeta) {
  const periodPts = Number(memberPts?.periodPoints || 0).toLocaleString("it-IT");
  const totalPts = Number(memberPts?.totalPoints || 0).toLocaleString("it-IT");
  const periodShort = periodMeta?.label || "periodo in corso";
  return `**${periodPts}** pt (${periodShort}) · **${totalPts}** totali`;
}

function appendMemberHousePointsInc(inc, setFields, { userId, houseId, periodKey, points }) {
  const uid = String(userId || "").trim();
  const hid = normalizeHouseInput(houseId);
  const pts = Math.floor(Number(points) || 0);
  if (!uid || !hid || pts <= 0) return;
  const totalPath = `rawWebhook.byMember.${uid}.total`;
  const periodPath = periodKey ? `rawWebhook.byMember.${uid}.byPeriod.${String(periodKey).trim()}` : "";
  inc[totalPath] = (inc[totalPath] || 0) + pts;
  if (periodPath) inc[periodPath] = (inc[periodPath] || 0) + pts;
  setFields[`rawWebhook.byMember.${uid}.houseId`] = hid;
}

async function loadHousePointsDocLean(guildId, eventKey) {
  return SiteDocument.findOne({
    docType: HOUSE_POINTS_DOC,
    guildId: String(guildId || "").trim(),
    userId: HOUSE_POINTS_OWNER_ID,
    dedupeKey: String(eventKey || "").trim(),
  })
    .select("rawWebhook.byMember")
    .lean()
    .catch(() => null);
}

async function fetchHouseMemberPointsLeaderboard(guildId, eventKey, houseId, options = {}) {
  const gid = String(guildId || "").trim();
  const ek = String(eventKey || "").trim();
  const hid = normalizeHouseInput(houseId);
  const periodKey = String(options.periodKey || "").trim();
  if (!gid || !ek || !hid) return [];
  const [members, pointsDoc] = await Promise.all([
    SiteDocument.find({
      docType: SORTING_DOC,
      guildId: gid,
      dedupeKey: ek,
    })
      .select("userId status planKey houseId")
      .lean()
      .catch(() => []),
    loadHousePointsDocLean(gid, ek),
  ]);
  const byMember = pointsDoc?.rawWebhook?.byMember && typeof pointsDoc.rawWebhook.byMember === "object"
    ? pointsDoc.rawWebhook.byMember
    : {};
  const rows = [];
  for (const doc of Array.isArray(members) ? members : []) {
    const uid = String(doc?.userId || "").trim();
    if (!uid) continue;
    if (resolveSortedHouseId(doc) !== hid) continue;
    const row = byMember[uid] || {};
    const periodPoints = periodKey
      ? Math.max(0, Math.floor(Number(row?.byPeriod?.[periodKey]) || 0))
      : 0;
    const totalPoints = Math.max(0, Math.floor(Number(row?.total) || 0));
    rows.push({ userId: uid, periodPoints, totalPoints });
  }
  rows.sort((a, b) => {
    if (b.periodPoints !== a.periodPoints) return b.periodPoints - a.periodPoints;
    if (b.totalPoints !== a.totalPoints) return b.totalPoints - a.totalPoints;
    return a.userId.localeCompare(b.userId);
  });
  return rows;
}

function paginateMemberRows(rows, page = 0, pageSize = 18) {
  const list = Array.isArray(rows) ? rows : [];
  const size = Math.max(1, Math.min(25, Number(pageSize) || 18));
  const totalPages = Math.max(1, Math.ceil(list.length / size));
  const safePage = Math.max(0, Math.min(totalPages - 1, Math.floor(Number(page) || 0)));
  const start = safePage * size;
  return {
    page: safePage,
    pageSize: size,
    totalPages,
    totalMembers: list.length,
    slice: list.slice(start, start + size),
  };
}

function formatMemberPointsLines(slice, startIndex = 0) {
  if (!slice.length) {
    return ["_Nessuno smistato in questa casata._"];
  }
  const base = Math.max(0, Math.floor(Number(startIndex) || 0));
  return slice.map((row, index) => {
    const rank = base + index + 1;
    const periodPts = Number(row.periodPoints || 0).toLocaleString("it-IT");
    const totalPts = Number(row.totalPoints || 0).toLocaleString("it-IT");
    return `**${rank}.** <@${row.userId}> — **${periodPts}** pt periodo · **${totalPts}** totali`;
  });
}

module.exports = {
  appendMemberHousePointsInc,
  fetchHouseMemberPointsLeaderboard,
  paginateMemberRows,
  formatMemberPointsLines,
  readMemberHousePoints,
  formatMemberPointsProfileLabel,
};