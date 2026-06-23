const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas");
const { isValidGuildUserId } = require("../../Utils/DB/validateWriteIds");
const { HOUSES } = require("./hogwartsSortingBank");
const SORTING_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_SORTING;
const HOUSE_ID_ALIASES = Object.freeze({ gryffindor: "gryffindor", grifondoro: "gryffindor", ravenclaw: "ravenclaw", corvonero: "ravenclaw", hufflepuff: "hufflepuff", tassorosso: "hufflepuff", slytherin: "slytherin", serpeverde: "slytherin", slythrerin: "slytherin" });

function normalizeHogwartsHouseId(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (HOUSES.includes(raw)) return raw;
  if (HOUSE_ID_ALIASES[raw]) return HOUSE_ID_ALIASES[raw];
  for (const [alias, houseId] of Object.entries(HOUSE_ID_ALIASES)) {
    if (raw.includes(alias)) return houseId;
  }
  return "";
}

function resolveSortedHouseId(doc) {
  if (!doc || typeof doc !== "object") return "";
  const candidates = [
    doc.status,
    doc.planKey,
    doc.houseId,
    doc.house,
    doc.rawWebhook?.houseId,
    doc.rawWebhook?.house,
  ];
  for (const value of candidates) {
    const houseId = normalizeHogwartsHouseId(value);
    if (houseId) return houseId;
  }
  return "";
}

function resolveHouseIdFromMemberRoles(member, cfg) {
  if (!member?.roles?.cache) return "";
  for (const houseId of HOUSES) {
    const roleId = String(cfg.houses?.[houseId]?.roleId || "").trim();
    if (roleId && member.roles.cache.has(roleId)) return houseId;
  }
  return "";
}

function sortingDedupeKeys(eventKey) {
  const ek = String(eventKey || "").trim() || "hogwarts";
  return [...new Set([ek, "hogwarts_summer_2026", "hogwarts"].filter(Boolean))];
}

async function findSortingDoc(guildId, userId, eventKey) {
  const g = String(guildId || "").trim();
  const u = String(userId || "").trim();
  if (!isValidGuildUserId(g, u)) return null;
  for (const dedupeKey of sortingDedupeKeys(eventKey)) {
    const keyed = await SiteDocument.findOne({ docType: SORTING_DOC, guildId: g, userId: u, dedupeKey })
      .lean()
      .catch(() => null);
    if (resolveSortedHouseId(keyed)) return keyed;
  }
  const fallback = await SiteDocument.findOne({ docType: SORTING_DOC, guildId: g, userId: u })
    .sort({ updatedAt: -1 })
    .lean()
    .catch(() => null);
  if (resolveSortedHouseId(fallback)) return fallback;
  const byUser = await SiteDocument.findOne({ docType: SORTING_DOC, userId: u })
    .sort({ updatedAt: -1 })
    .lean()
    .catch(() => null);
  return resolveSortedHouseId(byUser) ? byUser : null;
}

async function hasSortingRecord(guildId, userId, eventKey) {
  if (await findSortingDoc(guildId, userId, eventKey)) return true;
  const u = String(userId || "").trim();
  if (!u) return false;
  const any = await SiteDocument.findOne({ docType: SORTING_DOC, userId: u }).select("_id").lean().catch(() => null);
  return Boolean(any);
}

async function shouldEnsureSortingGringott(guildId, userId, eventKey, options = {}) {
  const existing = await findExistingSort(guildId, userId, eventKey, options);
  if (existing?.status) return true;
  return hasSortingRecord(guildId, userId, eventKey);
}

async function findExistingSort(guildId, userId, eventKey, options = {}) {
  const doc = await findSortingDoc(guildId, userId, eventKey);
  const houseId = resolveSortedHouseId(doc);
  if (houseId) return { ...doc, status: houseId };
  const member = options.member;
  const cfg = options.cfg;
  if (member && cfg) {
    const roleHouse = resolveHouseIdFromMemberRoles(member, cfg);
    if (roleHouse) return { status: roleHouse, fromRole: true };
  }
  return null;
}

module.exports = {
  findExistingSort,
  findSortingDoc,
  hasSortingRecord,
  normalizeHogwartsHouseId,
  resolveHouseIdFromMemberRoles,
  resolveSortedHouseId,
  shouldEnsureSortingGringott,
  sortingDedupeKeys,
};