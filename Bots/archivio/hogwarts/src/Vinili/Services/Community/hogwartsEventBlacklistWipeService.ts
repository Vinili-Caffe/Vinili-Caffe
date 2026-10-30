const { ActivityUserProfile, SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { resolveHogwartsEventConfig } = require("../../Utils/Web/hogwartsSortingConfig") as typeof import("../../Utils/Web/hogwartsSortingConfig");
const { HOUSES } = require("../../Utils/Web/hogwartsSortingBank") as typeof import("../../Utils/Web/hogwartsSortingBank");
const { normalizeHogwartsHouseId, findSortingDoc } = require("../../Utils/Web/hogwartsSortingResolve") as typeof import("../../Utils/Web/hogwartsSortingResolve");
const { revokeHouseSortingAnnouncesForMember } = require("./hogwartsSortingLogService") as typeof import("./hogwartsSortingLogService");
const {
  addUserHogwartsEventBlacklist,
  isUserHogwartsEventBlacklisted,
} = require("./hogwartsEventBlacklistService") as typeof import("./hogwartsEventBlacklistService");

const HOUSE_POINTS_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_HOUSE_POINTS;
const HOUSE_POINTS_OWNER_ID = "__event__";
const SORTING_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_SORTING;
const FORBIDDEN_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_FORBIDDEN_BOOKS;
const REACT_PRESS_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_REACT_PRESS;
const SPELL_HUNT_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_SPELL_LIST_HUNT;

function floorPts(value?) {
  return Math.max(0, Math.floor(Number(value) || 0));
}

function expandRoleIds(list?) {
  const raw = Array.isArray(list) ? list : [list];
  const out = [];
  for (const item of raw) {
    if (item == null) continue;
    const asId = typeof item === "object" && item.id != null ? String(item.id) : String(item);
    for (const part of asId.split(/[,\s]+/)) {
      const id = part.trim();
      if (/^\d{17,22}$/.test(id)) out.push(id);
    }
  }
  return [...new Set(out)];
}

function allHogwartsRoleIds(cfg?) {
  const ids = [];
  for (const houseId of HOUSES) {
    ids.push(...expandRoleIds(cfg?.houses?.[houseId]?.roleId));
  }
  ids.push(...expandRoleIds(cfg?.completionRoleId));
  return [...new Set(ids.filter(Boolean))];
}

async function wipeMemberHousePointsContribution(guildId?, eventKey?, userId?) {
  const gid = String(guildId || "").trim();
  const ek = String(eventKey || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !ek || !uid) return { removedTotal: 0, skipped: true };

  const doc = await SiteDocument.findOne({
    docType: HOUSE_POINTS_DOC,
    guildId: gid,
    userId: HOUSE_POINTS_OWNER_ID,
    dedupeKey: ek,
  }).catch(() => null);
  if (!doc) return { removedTotal: 0, missingDoc: true };

  const raw = doc.rawWebhook && typeof doc.rawWebhook === "object" ? { ...doc.rawWebhook } : {};
  const byMember = raw.byMember && typeof raw.byMember === "object" ? { ...raw.byMember } : {};
  const row = byMember[uid] && typeof byMember[uid] === "object" ? byMember[uid] : null;
  if (!row) return { removedTotal: 0, missingMember: true };

  const houseId = normalizeHogwartsHouseId(row.houseId) || "";
  const total = floorPts(row.total);
  const memberPeriods = row.byPeriod && typeof row.byPeriod === "object" ? row.byPeriod : {};
  const totals = raw.totals && typeof raw.totals === "object" ? { ...raw.totals } : {};
  const periods = raw.byPeriod && typeof raw.byPeriod === "object" ? { ...raw.byPeriod } : {};

  if (houseId && total > 0) {
    totals[houseId] = floorPts((totals[houseId] || 0) - total);
  }
  for (const [pk, ptsRaw] of Object.entries(memberPeriods)) {
    const pts = floorPts(ptsRaw);
    if (!pts || !houseId) continue;
    const periodRow = periods[pk] && typeof periods[pk] === "object" ? { ...periods[pk] } : {};
    periodRow[houseId] = floorPts((periodRow[houseId] || 0) - pts);
    periods[pk] = periodRow;
  }

  const unset = { [`rawWebhook.byMember.${uid}`]: "" };
  await SiteDocument.updateOne(
    { _id: doc._id },
    {
      $set: {
        "rawWebhook.totals": totals,
        "rawWebhook.byPeriod": periods,
      },
      $unset: unset,
    },
  ).catch(() => null);

  return { removedTotal: total, houseId };
}

async function scrubSpellHuntClaims(guildId?, userId?) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return { cleared: 0 };
  const docs = await SiteDocument.find({
    docType: SPELL_HUNT_DOC,
    guildId: gid,
  })
    .select("_id rawWebhook")
    .catch(() => []);
  let cleared = 0;
  for (const doc of Array.isArray(docs) ? docs : []) {
    const claims = doc?.rawWebhook?.claims;
    if (!claims || typeof claims !== "object") continue;
    let changed = false;
    const next = { ...claims };
    for (const [key, claim] of Object.entries(claims)) {
      const claimUid = String(claim?.userId || claim?.id || "").trim();
      if (claimUid === uid) {
        delete next[key];
        changed = true;
        cleared += 1;
      }
    }
    if (!changed) continue;
    await SiteDocument.updateOne({ _id: doc._id }, { $set: { "rawWebhook.claims": next } }).catch(() => null);
  }
  return { cleared };
}

async function scrubReactPressWins(guildId?, userId?) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return { deleted: 0 };
  const res = await SiteDocument.deleteMany({
    docType: REACT_PRESS_DOC,
    guildId: gid,
    $or: [{ userId: uid }, { "rawWebhook.winnerUserId": uid }],
  }).catch(() => null);
  return { deleted: Number(res?.deletedCount || 0) };
}

async function removeHogwartsRolesFromMember(member?, cfg?) {
  if (!member?.roles?.cache) return { removed: [] };
  const roleIds = allHogwartsRoleIds(cfg).filter((id?) => member.roles.cache.has(id));
  const removed = [];
  for (const id of roleIds) {
    try {
      await member.roles.remove(id, "Hogwarts event blacklist wipe");
      removed.push(id);
    } catch (err) {
      global.logger?.warn?.("[hogwarts-blacklist] role remove:", err?.message || err);
    }
  }
  return { removed };
}

async function blacklistAndWipeHogwartsUser(client?, userId?, options: Record<string, any> = {}) {
  const uid = String(userId || "").trim();
  const gid = String(options.guildId || IDs.guilds?.main || "").trim();
  const addedBy = String(options.addedBy || "staff").trim();
  const note = String(options.note || "Blacklist evento Hogwarts").slice(0, 500);
  if (!/^\d{16,22}$/.test(uid) || !gid) {
    return { ok: false, code: "bad_input" };
  }

  const cfg = resolveHogwartsEventConfig(client);
  const eventKey = String(options.eventKey || cfg?.eventKey || "").trim();

  const bl = await addUserHogwartsEventBlacklist(uid, addedBy, note);
  if (!bl.ok) return { ok: false, code: bl.reason || "blacklist_failed" };

  const sortingBefore = eventKey ? await findSortingDoc(gid, uid, eventKey).catch(() => null) : null;
  const houseBefore = normalizeHogwartsHouseId(
    sortingBefore?.status || sortingBefore?.houseId || sortingBefore?.planKey || "",
  );

  const points = eventKey
    ? await wipeMemberHousePointsContribution(gid, eventKey, uid)
    : { removedTotal: 0, skipped: true };

  const profile = await ActivityUserProfile.findOneAndUpdate(
    { guildId: gid, userId: uid },
    { $unset: { "profile.events.hogwarts": "" } },
    { new: true },
  )
    .select("userId")
    .lean()
    .catch(() => null);

  const sortingDel = await SiteDocument.deleteMany({
    docType: SORTING_DOC,
    guildId: gid,
    userId: uid,
  }).catch(() => null);

  const forbiddenDel = await SiteDocument.deleteMany({
    docType: FORBIDDEN_DOC,
    guildId: gid,
    userId: uid,
  }).catch(() => null);

  if (eventKey) {
    revokeHouseSortingAnnouncesForMember({ guildId: gid, userId: uid, eventKey });
  }

  const spell = await scrubSpellHuntClaims(gid, uid);
  const react = await scrubReactPressWins(gid, uid);

  let roles = { removed: [] };
  if (client?.guilds) {
    const guild = client.guilds.cache.get(gid) || (await client.guilds.fetch(gid).catch(() => null));
    const member = guild
      ? guild.members.cache.get(uid) || (await guild.members.fetch(uid).catch(() => null))
      : null;
    if (member) roles = await removeHogwartsRolesFromMember(member, cfg);
  }

  const stillListed = await isUserHogwartsEventBlacklisted(uid);

  return {
    ok: true,
    userId: uid,
    guildId: gid,
    eventKey,
    houseBefore: houseBefore || null,
    blacklisted: stillListed,
    pointsRemoved: Number(points.removedTotal || 0),
    profileWiped: Boolean(profile),
    sortingDeleted: Number(sortingDel?.deletedCount || 0),
    forbiddenDeleted: Number(forbiddenDel?.deletedCount || 0),
    spellClaimsCleared: Number(spell.cleared || 0),
    reactPressDeleted: Number(react.deleted || 0),
    rolesRemoved: roles.removed,
  };
}

export = {
  wipeMemberHousePointsContribution,
  blacklistAndWipeHogwartsUser,
  removeHogwartsRolesFromMember,
  allHogwartsRoleIds,
};
