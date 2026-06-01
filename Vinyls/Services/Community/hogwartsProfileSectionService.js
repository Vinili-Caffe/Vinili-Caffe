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

function isHogwartsProfileSectionEnabled(client) {
  const cfg = resolveHogwartsEventConfig(client);
  return cfg?.enabled !== false;
}

function buildHogwartsProfileHomeLines(hw) {
  if (!hw?.visible) return [];
  const houseLine = hw.sorted
    ? `🏠 **Casata:** ${hw.houseLabel || hw.houseId}`
    : "🏠 **Casata:** non smistato";
  const rankLine = hw.sorted
    ? `🏆 **Coppa:** ${hw.cupRankLabel} (${Number(hw.houseCupPoints || 0).toLocaleString("it-IT")} pt.)`
    : "🏆 **Coppa:** dopo lo smistamento";
  return [
    "",
    "<:VC_Hogwarts:1508766773837693061> **Evento Hogwarts**",
    `🪙 **Galeoni:** ${hw.galeoniLabel || formatGaleoni(0)}`,
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
      .select("rawWebhook.totals")
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
    houseCupPoints: cupRank?.points || 0,
  };
}

module.exports = {
  buildHogwartsProfileHomeLines,
  computeHouseCupRank,
  fetchHogwartsProfileSection,
  isHogwartsProfileSectionEnabled,
};