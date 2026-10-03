const IDs = require("../../Utils/Config/ids");
const { ActivityUserProfile, SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas");
const { isValidGuildUserId } = require("../../Utils/DB/validateWriteIds");
const { getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache");
const { resolveHogwartsEventConfig } = require("../../Utils/Web/hogwartsSortingConfig");
const { HOUSES, getHouseMeta } = require("../../Utils/Web/hogwartsSortingBank");
const { findSortingDoc, resolveHouseIdFromMemberRoles, resolveSortedHouseId } = require("../../Utils/Web/hogwartsSortingResolve");
const { normalizeShopInventory } = require("./hogwartsShopBoostsService");
const { getGringottBalance, formatGaleoni } = require("./gringottService");
const { SHOP_CATEGORY_LABELS } = require("../../Utils/Web/hogwartsShopCatalog");
const { housePointPeriodKey, findHousePointPeriod } = require("../../Utils/Web/hogwartsHousePointPeriods");
const { readMemberHousePoints, formatMemberPointsProfileLabel } = require("./hogwartsMemberHousePointsService");
const HOUSE_POINTS_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_HOUSE_POINTS;
const HOUSE_POINTS_OWNER_ID = "__event__";

function resolveHogwartsGuildId(client, guildId) {
  const main = String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
  const g = String(guildId || "").trim();
  return main || g;
}

function readHouseTotals(pointsDoc) {
  const totals = pointsDoc?.rawWebhook?.totals && typeof pointsDoc.rawWebhook.totals === "object"
    ? pointsDoc.rawWebhook.totals
    : {};
  const out = {};
  for (const houseId of HOUSES) {
    out[houseId] = Math.max(0, Math.floor(Number(totals[houseId]) || 0));
  }
  return out;
}

function readHousePeriodPoints(pointsDoc, houseId, periodKey) {
  const hid = String(houseId || "").trim();
  const pk = String(periodKey || "").trim();
  if (!hid || !pk || !HOUSES.includes(hid)) return 0;
  const byPeriod = pointsDoc?.rawWebhook?.byPeriod && typeof pointsDoc.rawWebhook.byPeriod === "object"
    ? pointsDoc.rawWebhook.byPeriod
    : {};
  const row = byPeriod[pk] && typeof byPeriod[pk] === "object" ? byPeriod[pk] : {};
  return Math.max(0, Math.floor(Number(row[hid]) || 0));
}

function computeHouseCupRank(totals, houseId) {
  if (!houseId || !HOUSES.includes(houseId)) return null;
  const ranked = HOUSES.map((id) => ({ id, points: totals[id] || 0 })).sort((a, b) => {
    if (b.points !== a.points) return b.points - a.points;
    return HOUSES.indexOf(a.id) - HOUSES.indexOf(b.id);
  });
  const rank = ranked.findIndex((row) => row.id === houseId) + 1;
  if (rank < 1) return null;
  return { rank, of: ranked.length, points: totals[houseId] || 0 };
}

function formatShopInventoryLines(inventory) {
  const inv = inventory && typeof inventory === "object" ? inventory : {};
  const lines = [];
  for (const category of ["wand", "broom", "pet"]) {
    const label = SHOP_CATEGORY_LABELS[category] || category;
    const item = inv[category];
    const name = item?.name ? `**${item.name}**` : "—";
    lines.push(`<:VC_Dot:1482532364222595303> **${label}:** ${name}`);
  }
  return lines;
}

function isHogwartsProfileSectionEnabled(_client) {
  /* Evento Hogwarts retired — keep finale roles, hide live event UI */
  return false;
}

function buildHogwartsProfileHomeLines(hw) {
  if (!hw?.visible) return [];
  const houseLine = hw.sorted
    ? `🏠 **Casata:** ${hw.houseLabel || hw.houseId}`
    : "🏠 **Casata:** non smistato";
  const rankLine = hw.sorted
    ? `🏆 **Coppa:** ${hw.cupRankLabel} — ${hw.houseCupPointsLabel || "0 pt"}`
    : "🏆 **Coppa:** dopo lo smistamento";
  return [
    "",
    "<:VC_Hogwarts:1508766773837693061> **Evento Hogwarts**",
    `🪙 **Galeoni:** ${hw.galeoniLabel || formatGaleoni(0)}`,
    `<:VC_Leaderboard:1482534806314287387> **Punti personali:** ${hw.memberPointsLabel || "0 pt"}`,
    houseLine,
    rankLine,
    "<:VC_Modifica:1478859646587633717> Dettagli shop e altro nel menu **Evento Hogwarts**.",
  ];
}

async function fetchHogwartsProfileSection(client, guildId, userId, member = null, guild = null) {
  if (!isHogwartsProfileSectionEnabled(client)) return { visible: false };
  const cfg = resolveHogwartsEventConfig(client);
  const g = resolveHogwartsGuildId(client, guildId);
  const u = String(userId || "").trim();
  const eventKey = String(cfg.eventKey || "").trim() || "hogwarts";
  const guildRef =
    guild ||
    client?.guilds?.cache?.get(g) ||
    (typeof client?.guilds?.fetch === "function" ? await client.guilds.fetch(g).catch(() => null) : null);
  let resolvedMember = member;
  if (guildRef && u) {
    resolvedMember =
      (await getGuildMemberCached(guildRef, u, { preferFresh: true }).catch(() => null)) || resolvedMember;
  }
  const base = {
    visible: true,
    eventKey,
    balance: 0,
    galeoniLabel: formatGaleoni(0),
    houseId: "",
    houseLabel: "",
    sorted: false,
    shopLines: formatShopInventoryLines(null),
    cupRank: null,
    cupRankLabel: "—",
    houseCupPoints: 0,
    houseCupPeriodPoints: 0,
    houseCupPointsLabel: formatMemberPointsProfileLabel({ periodPoints: 0, totalPoints: 0 }, null),
    memberPeriodPoints: 0,
    memberTotalPoints: 0,
    memberPointsLabel: formatMemberPointsProfileLabel({ periodPoints: 0, totalPoints: 0 }, null),
  };
  if (!isValidGuildUserId(g, u)) return base;

  const [gringott, profileDoc, sortingDoc, pointsDoc] = await Promise.all([
    getGringottBalance(g, u, eventKey).catch(() => null),
    ActivityUserProfile.findOne({ guildId: g, userId: u })
      .select("profile.events.hogwarts.shop")
      .lean()
      .catch(() => null),
    findSortingDoc(g, u, eventKey),
    SiteDocument.findOne({
      docType: HOUSE_POINTS_DOC,
      guildId: g,
      userId: HOUSE_POINTS_OWNER_ID,
      dedupeKey: eventKey,
    })
      .select("rawWebhook.totals rawWebhook.byMember rawWebhook.byPeriod")
      .lean()
      .catch(() => null),
  ]);

  const balance = Math.max(0, Math.floor(Number(gringott?.balance) || 0));
  const inventory = normalizeShopInventory(profileDoc?.profile?.events?.hogwarts?.shop);
  const houseId = resolveSortedHouseId(sortingDoc) || resolveHouseIdFromMemberRoles(resolvedMember, cfg);
  const crestUrl = houseId ? String(cfg.houses?.[houseId]?.crestUrl || "").trim() : "";
  const houseMeta = houseId ? getHouseMeta(houseId, crestUrl || undefined) : null;
  const totals = readHouseTotals(pointsDoc);
  const cupRank = houseId ? computeHouseCupRank(totals, houseId) : null;
  const period = housePointPeriodKey();
  const periodKey = String(period?.key || "").trim();
  const periodMeta = findHousePointPeriod(periodKey);
  const memberPts = readMemberHousePoints(pointsDoc, u, periodKey);
  const houseTotalPoints = houseId ? (cupRank?.points ?? totals[houseId] ?? 0) : 0;
  const housePeriodPoints = houseId && periodKey ? readHousePeriodPoints(pointsDoc, houseId, periodKey) : 0;
  const houseCupPointsLabel = formatMemberPointsProfileLabel(
    { periodPoints: housePeriodPoints, totalPoints: houseTotalPoints },
    periodMeta,
  );

  return {
    ...base,
    balance,
    galeoniLabel: formatGaleoni(balance),
    houseId,
    houseLabel: houseMeta?.label || (houseId ? houseId : ""),
    sorted: Boolean(houseId),
    shopLines: formatShopInventoryLines(inventory),
    cupRank,
    cupRankLabel: cupRank ? `#${cupRank.rank} su ${cupRank.of}` : "—",
    houseCupPoints: houseTotalPoints,
    houseCupPeriodPoints: housePeriodPoints,
    houseCupPointsLabel,
    memberPeriodPoints: memberPts.periodPoints,
    memberTotalPoints: memberPts.totalPoints,
    memberPointsLabel: formatMemberPointsProfileLabel(memberPts, periodMeta),
  };
}

module.exports = {
  buildHogwartsProfileHomeLines,
  computeHouseCupRank,
  fetchHogwartsProfileSection,
  isHogwartsProfileSectionEnabled,
};