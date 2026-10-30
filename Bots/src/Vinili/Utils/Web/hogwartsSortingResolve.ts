const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { isValidGuildUserId } = require("../../Utils/DB/validateWriteIds") as typeof import("../DB/validateWriteIds");
const { HOUSES } = require("./hogwartsSortingBank") as typeof import("./hogwartsSortingBank");
const SORTING_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_SORTING;
const HOUSE_ID_ALIASES = Object.freeze({ gryffindor: "gryffindor", grifondoro: "gryffindor", ravenclaw: "ravenclaw", corvonero: "ravenclaw", hufflepuff: "hufflepuff", tassorosso: "hufflepuff", slytherin: "slytherin", serpeverde: "slytherin", slythrerin: "slytherin" });

function normalizeHogwartsHouseId(value?) {
  const raw = String(value || "").trim().toLowerCase();
  if (!raw) return "";
  if (HOUSES.includes(raw)) return raw;
  if (HOUSE_ID_ALIASES[raw]) return HOUSE_ID_ALIASES[raw];
  for (const [alias, houseId] of Object.entries(HOUSE_ID_ALIASES)) {
    if (raw.includes(alias)) return houseId;
  }
  return "";
}

function resolveSortedHouseId(doc?) {
  if (!doc || typeof doc !== "object") return "";
  const candidates = [
    doc.status,
    doc.planKey,
    doc.houseId,
    doc.house,
    doc.houseAnnounceHouseId,
    doc.rawWebhook?.houseId,
    doc.rawWebhook?.house,
  ];
  for (const value of candidates) {
    const houseId = normalizeHogwartsHouseId(value);
    if (houseId) return houseId;
  }
  return "";
}

const SORTING_DOC_HOUSE_SELECT =
  "userId guildId dedupeKey status planKey houseId house houseAnnounceHouseId rawWebhook.houseId rawWebhook.house createdAt updatedAt";

function resolveHouseIdFromMemberRoles(member?, cfg?) {
  if (!member?.roles?.cache) return "";
  for (const houseId of HOUSES) {
    const roleId = String(cfg.houses?.[houseId]?.roleId || "").trim();
    if (roleId && member.roles.cache.has(roleId)) return houseId;
  }
  return "";
}

function sortingDedupeKeys(eventKey?) {
  const ek = String(eventKey || "").trim() || "hogwarts";
  return [...new Set([ek, "hogwarts_summer_2026", "hogwarts"].filter(Boolean))];
}

async function findSortingDoc(guildId?, userId?, eventKey?) {
  const g = String(guildId || "").trim();
  const u = String(userId || "").trim();
  if (!isValidGuildUserId(g, u)) return null;
  const ek = String(eventKey || "").trim();
  if (ek) {
    const primary = await SiteDocument.findOne({ docType: SORTING_DOC, guildId: g, userId: u, dedupeKey: ek })
      .select(SORTING_DOC_HOUSE_SELECT)
      .lean()
      .catch(() => null);
    if (resolveSortedHouseId(primary)) return primary;
  }
  for (const dedupeKey of sortingDedupeKeys(eventKey)) {
    if (dedupeKey === ek) continue;
    const keyed = await SiteDocument.findOne({ docType: SORTING_DOC, guildId: g, userId: u, dedupeKey })
      .select(SORTING_DOC_HOUSE_SELECT)
      .lean()
      .catch(() => null);
    if (resolveSortedHouseId(keyed)) return keyed;
  }
  const fallback = await SiteDocument.findOne({ docType: SORTING_DOC, guildId: g, userId: u })
    .select(SORTING_DOC_HOUSE_SELECT)
    .sort({ updatedAt: -1 })
    .lean()
    .catch(() => null);
  if (resolveSortedHouseId(fallback)) return fallback;
  const byUser = await SiteDocument.findOne({ docType: SORTING_DOC, userId: u })
    .select(SORTING_DOC_HOUSE_SELECT)
    .sort({ updatedAt: -1 })
    .lean()
    .catch(() => null);
  return resolveSortedHouseId(byUser) ? byUser : null;
}

async function findSortingDocForHouseMember(guildId?, userId?, eventKey?, houseId?) {
  const hid = normalizeHogwartsHouseId(houseId);
  const u = String(userId || "").trim();
  if (!hid || !u) return null;
  const doc = await findSortingDoc(guildId, userId, eventKey);
  if (!doc) return null;
  return resolveSortedHouseId(doc) === hid ? doc : null;
}

async function hasSortingRecord(guildId?, userId?, eventKey?) {
  if (await findSortingDoc(guildId, userId, eventKey)) return true;
  const u = String(userId || "").trim();
  if (!u) return false;
  const any = await SiteDocument.findOne({ docType: SORTING_DOC, userId: u }).select("_id").lean().catch(() => null);
  return Boolean(any);
}

async function shouldEnsureSortingGringott(guildId?, userId?, eventKey?, options: Record<string, any> = {}) {
  const existing = await findExistingSort(guildId, userId, eventKey, options);
  if (existing?.status) return true;
  return hasSortingRecord(guildId, userId, eventKey);
}

async function findExistingSort(guildId?, userId?, eventKey?, options: Record<string, any> = {}) {
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

export = {
  findExistingSort,
  findSortingDoc,
  findSortingDocForHouseMember,
  hasSortingRecord,
  normalizeHogwartsHouseId,
  resolveHouseIdFromMemberRoles,
  resolveSortedHouseId,
  shouldEnsureSortingGringott,
  sortingDedupeKeys,
  SORTING_DOC_HOUSE_SELECT,
};