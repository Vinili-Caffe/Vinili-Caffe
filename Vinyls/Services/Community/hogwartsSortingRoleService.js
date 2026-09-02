const IDs = require("../../Utils/Config/ids");
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas");
const { HOUSES } = require("../../Utils/Web/hogwartsSortingBank");
const { resolveHogwartsEventConfig } = require("../../Utils/Web/hogwartsSortingConfig");
const { normalizeHogwartsHouseId } = require("../../Utils/Web/hogwartsSortingResolve");

const SORTING_DOC = SITE_DOCUMENT_TYPE.HOGWARTS_SORTING;
const MEMBER_DELAY_MS = 120;

function sleep(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

function normalizeId(value) {
  return String(value || "").trim();
}

function isSnowflakeId(value) {
  return /^\d{17,22}$/.test(normalizeId(value));
}

function expandRoleIds(list) {
  const raw = Array.isArray(list) ? list : [list];
  const out = [];
  for (const item of raw) {
    if (item == null) continue;
    const asId =
      typeof item === "object" && item.id != null ? String(item.id) : String(item);
    for (const part of asId.split(/[,\s]+/)) {
      const id = part.trim();
      if (isSnowflakeId(id)) out.push(id);
    }
  }
  return [...new Set(out)];
}

async function applyRoleEdits(member, toAdd, toRemove, reason) {
  const removeIds = expandRoleIds(toRemove);
  const addIds = expandRoleIds(toAdd);
  for (const id of removeIds) {
    await member.roles.remove(id, reason);
  }
    for (const id of addIds) {
    await member.roles.add(id, reason);
  }
}

function resolveHouseRoleIds(cfg, houseId) {
  const hid = normalizeHogwartsHouseId(houseId);
  if (!hid) return { houseId: "", houseRoleId: "", participantRoleId: "", otherRoleIds: [] };
  const houseRoleId = expandRoleIds(cfg.houses?.[hid]?.roleId)[0] || "";
  const participantRoleId = expandRoleIds(cfg.completionRoleId)[0] || "";
  const otherRoleIds = HOUSES.map((h) => expandRoleIds(cfg.houses?.[h]?.roleId)[0] || "")
    .filter((id) => id && id !== houseRoleId);
  return { houseId: hid, houseRoleId, participantRoleId, otherRoleIds };
}

function sortingMemberNeedsRoleRepair(member, cfg, houseId) {
  if (!member?.roles?.cache) return false;
  const { houseRoleId, participantRoleId, otherRoleIds } = resolveHouseRoleIds(cfg, houseId);
  if (!houseRoleId && !participantRoleId) return false;
  const missingHouse = houseRoleId && !member.roles.cache.has(houseRoleId);
  const missingParticipant = participantRoleId && !member.roles.cache.has(participantRoleId);
  const wrongHouse = otherRoleIds.some((id) => member.roles.cache.has(id));
  return missingHouse || missingParticipant || wrongHouse;
}

async function assignHouseRoles(member, cfg, houseId) {
  if (!member?.roles) return { roleAssigned: false, roleSkippedReason: "no_member" };
  const { houseId: hid, houseRoleId, participantRoleId, otherRoleIds } = resolveHouseRoleIds(cfg, houseId);
  if (!hid) return { roleAssigned: false, roleSkippedReason: "invalid_house" };
  const toAdd = [];
  if (houseRoleId && !member.roles.cache.has(houseRoleId)) toAdd.push(houseRoleId);
  if (participantRoleId && !member.roles.cache.has(participantRoleId)) toAdd.push(participantRoleId);
  const toRemove = otherRoleIds.filter((id) => member.roles.cache.has(id));
  if (!toAdd.length && !toRemove.length) {
    return { roleAssigned: true, roleAlreadyOk: true, houseId: hid };
  }
  let notManageable = false;
  try {
    notManageable = Boolean(member.guild?.members?.me) && member.manageable === false;
  } catch {
    notManageable = false;
  }
  if (notManageable) {
    return { roleAssigned: false, roleSkippedReason: "not_manageable", houseId: hid };
  }
  try {
    await applyRoleEdits(member, toAdd, toRemove, "Smistamento Evento");
    return {
      roleAssigned: Boolean(houseRoleId),
      houseId: hid,
      roleId: houseRoleId || null,
      participantRoleAssigned: Boolean(participantRoleId && member.roles.cache.has(participantRoleId)),
      participantRoleId: participantRoleId || null,
    };
  } catch (err) {
    global.logger?.warn?.("[hogwarts-sorting] assign roles:", err?.message || err);
    return { roleAssigned: false, roleError: String(err?.message || err).slice(0, 200), houseId: hid };
  }
}

async function ensureSortedMemberHouseRoles(member, cfg, houseId) {
  if (!member || !sortingMemberNeedsRoleRepair(member, cfg, houseId)) {
    return { repaired: false, reason: "not_needed" };
  }
  const result = await assignHouseRoles(member, cfg, houseId);
  return {
    repaired: Boolean(result.roleAssigned || result.roleAlreadyOk),
    ...result,
  };
}

async function syncSortingRolesOnStartup(client) {
  if (!client) return { ok: false, reason: "no_client" };
  const cfg = resolveHogwartsEventConfig(client);
  const eventKey = normalizeId(cfg.eventKey);
  const guildId = normalizeId(client.config?.mainGuildId || IDs.guilds?.main);
  if (!eventKey || !guildId) return { ok: false, reason: "missing_config" };

  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return { ok: false, reason: "guild_missing" };

  const docs = await SiteDocument.find({
    docType: SORTING_DOC,
    guildId,
    dedupeKey: eventKey,
    status: { $in: HOUSES },
  })
    .select({ userId: 1, status: 1 })
    .lean()
    .catch(() => []);

  const stats = { scanned: docs.length, repaired: 0, alreadyOk: 0, skipped: 0, errors: 0 };
  for (const row of docs) {
    const userId = normalizeId(row?.userId);
    const houseId = normalizeHogwartsHouseId(row?.status);
    if (!userId || !houseId) {
      stats.skipped += 1;
      continue;
    }
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) {
      stats.skipped += 1;
      continue;
    }
    if (!sortingMemberNeedsRoleRepair(member, cfg, houseId)) {
      stats.alreadyOk += 1;
      continue;
    }
    const result = await assignHouseRoles(member, cfg, houseId);
    if (result.roleAssigned || result.roleAlreadyOk) stats.repaired += 1;
    else if (result.roleError) stats.errors += 1;
    else stats.skipped += 1;
    await sleep(MEMBER_DELAY_MS);
  }

  if (stats.repaired > 0 || stats.errors > 0) {
    global.logger?.info?.(
      `[HOGWARTS SORTING] role repair startup: scanned=${stats.scanned} repaired=${stats.repaired} alreadyOk=${stats.alreadyOk} skipped=${stats.skipped} errors=${stats.errors}`,
    );
  }
  return { ok: true, ...stats };
}

module.exports = {
  assignHouseRoles,
  ensureSortedMemberHouseRoles,
  sortingMemberNeedsRoleRepair,
  syncSortingRolesOnStartup,
};
