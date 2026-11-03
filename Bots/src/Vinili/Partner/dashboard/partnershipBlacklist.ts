/** Dashboard partnership: blacklist e uscita. */
const { getPartnershipConfigSync, refreshPartnershipConfigCache } = require("../../Partner/core/tenantPartnershipSettings") as typeof import("../../Partner/core/tenantPartnershipSettings");
const { verifyDashboardGuildAccess } = require("../../../MultiGuild/site/dashboard/siteDashboardApi") as typeof import("../../../MultiGuild/site/dashboard/siteDashboardApi");
const { reasonToMessage, fail, serializePartnership, serializeBlacklistEntry } = require("./partnershipSerialize") as typeof import("./partnershipSerialize");
const { listGuildPickerData } = require("./partnershipGuildPicker") as typeof import("./partnershipGuildPicker");

async function assertTenantPartnershipAccess(client?, accessToken?, guildId?) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) return access;
  if (!access.botPresent) {
    return fail(400, "bot_missing", reasonToMessage("bot_missing"));
  }
  return access;
}

async function resolveDashboardBlacklistTarget(rawInput?, ownerGuildId?) {
  const {
    normalizeTargetGuildId,
  } = require("../../Partner/services/tenantPartnershipBlacklistService") as typeof import("../../Partner/services/tenantPartnershipBlacklistService");
  const { fetchInviteGuildMeta } = require("../../Partner/runtime/partnershipBlacklistDisplay") as typeof import("../../Partner/runtime/partnershipBlacklistDisplay");
  const input = String(rawInput || "").trim();
  if (!input) return { error: "invalid" };

  const directId = normalizeTargetGuildId(input);
  if (directId) {
    if (directId === String(ownerGuildId || "").trim()) return { error: "self" };
    return { guildId: directId, meta: {} };
  }

  const meta = await fetchInviteGuildMeta(input);
  if (!meta?.guildId) return { error: "invalid" };
  if (meta.guildId === String(ownerGuildId || "").trim()) return { error: "self" };
  return {
    guildId: meta.guildId,
    meta: {
      invite: meta.invite,
      guildName: meta.guildName,
      iconUrl: meta.iconUrl,
    },
  };
}

async function getDashboardPartnershipBlacklist(client?, accessToken?, guildId?) {
  const access = await assertTenantPartnershipAccess(client, accessToken, guildId);
  if (!access.ok) return access;

  const {
    listTenantPartnershipBlacklistGuilds,
  } = require("../../Partner/services/tenantPartnershipBlacklistService") as typeof import("../../Partner/services/tenantPartnershipBlacklistService");
  const {
    resolvePartnershipBlacklistEntryDisplay,
  } = require("../../Partner/runtime/partnershipBlacklistDisplay") as typeof import("../../Partner/runtime/partnershipBlacklistDisplay");

  const rows = await listTenantPartnershipBlacklistGuilds(access.guildId, 200).catch(() => []);
  const inviteCache = new Map();
  const entries = [];
  for (const row of rows) {
    const display = await resolvePartnershipBlacklistEntryDisplay(client, row, inviteCache).catch(() => null);
    entries.push(serializeBlacklistEntry(row, display));
  }

  return {
    ok: true,
    status: 200,
    guildId: access.guildId,
    entries,
  };
}

async function addDashboardPartnershipBlacklist(client?, accessToken?, guildId?, body?) {
  const access = await assertTenantPartnershipAccess(client, accessToken, guildId);
  if (!access.ok) return access;

  const payload = body && typeof body === "object" ? body : {};
  const targetRaw = String(payload.target || payload.invite || payload.guildId || "").trim();
  const note = String(payload.note || "").trim().slice(0, 500);
  if (!targetRaw) {
    return fail(400, "invalid_blacklist_target", reasonToMessage("invalid_blacklist_target"));
  }

  const resolved = await resolveDashboardBlacklistTarget(targetRaw, access.guildId);
  if (!resolved || resolved.error === "invalid" || !resolved.guildId) {
    return fail(400, "invalid_blacklist_target", reasonToMessage("invalid_blacklist_target"));
  }
  if (resolved.error === "self") {
    return fail(400, "self_blacklist", reasonToMessage("self_blacklist"));
  }

  const {
    addTenantPartnershipBlacklistGuild,
    listTenantPartnershipBlacklistGuilds,
  } = require("../../Partner/services/tenantPartnershipBlacklistService") as typeof import("../../Partner/services/tenantPartnershipBlacklistService");
  const {
    resolvePartnershipBlacklistEntryDisplay,
  } = require("../../Partner/runtime/partnershipBlacklistDisplay") as typeof import("../../Partner/runtime/partnershipBlacklistDisplay");

  const saved = await addTenantPartnershipBlacklistGuild(
    access.guildId,
    resolved.guildId,
    access.userId,
    note,
    resolved.meta || {},
  );
  if (!saved?.ok) {
    return fail(400, saved?.reason || "persist_failed", reasonToMessage(saved?.reason || "persist_failed"));
  }

  const rows = await listTenantPartnershipBlacklistGuilds(access.guildId, 200).catch(() => []);
  const entry = rows.find((row?) => String(row.guildId) === String(resolved.guildId)) || {
    guildId: resolved.guildId,
    addedBy: access.userId,
    note,
    addedAt: new Date(),
    ...(resolved.meta || {}),
  };
  const display = await resolvePartnershipBlacklistEntryDisplay(client, entry).catch(() => null);

  return {
    ok: true,
    status: 200,
    guildId: access.guildId,
    entry: serializeBlacklistEntry(entry, display),
    message: "Server aggiunto alla blacklist.",
  };
}

async function removeDashboardPartnershipBlacklist(client?, accessToken?, guildId?, targetGuildId?) {
  const access = await assertTenantPartnershipAccess(client, accessToken, guildId);
  if (!access.ok) return access;

  const {
    normalizeTargetGuildId,
    removeTenantPartnershipBlacklistGuild,
  } = require("../../Partner/services/tenantPartnershipBlacklistService") as typeof import("../../Partner/services/tenantPartnershipBlacklistService");
  const targetId = normalizeTargetGuildId(targetGuildId);
  if (!targetId) {
    return fail(400, "invalid_id", reasonToMessage("invalid_id"));
  }

  const removed = await removeTenantPartnershipBlacklistGuild(access.guildId, targetId);
  if (!removed?.ok) {
    return fail(400, removed?.reason || "persist_failed", reasonToMessage(removed?.reason || "persist_failed"));
  }
  if (!removed.deleted) {
    return fail(404, "not_found", "Questo server non è in blacklist.");
  }

  return {
    ok: true,
    status: 200,
    guildId: access.guildId,
    targetGuildId: targetId,
    message: "Server rimosso dalla blacklist.",
  };
}

async function leaveDashboardPartnership(client?, accessToken?, guildId?) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) return access;

  if (!access.botPresent) {
    return fail(400, "bot_missing", reasonToMessage("bot_missing"));
  }

  const gid = access.guildId;
  await refreshPartnershipConfigCache().catch(() => null);

  const {
    clearTenantPartnershipGuildData,
    hasPartnershipLeaveWork,
  } = require("../../Partner/services/tenantPartnershipLeaveService") as typeof import("../../Partner/services/tenantPartnershipLeaveService");

  if (!(await hasPartnershipLeaveWork(gid))) {
    return {
      ok: true,
      status: 200,
      guildId: gid,
      cleared: false,
      partnership: serializePartnership(getPartnershipConfigSync(gid), gid),
      message: "Nessuna configurazione partnership da rimuovere.",
    };
  }

  const result: any = await clearTenantPartnershipGuildData(gid);
  if (!result?.ok) {
    return fail(400, result?.reason || "save_failed", reasonToMessage(result?.reason || "save_failed"));
  }

  await refreshPartnershipConfigCache().catch(() => null);
  const config = getPartnershipConfigSync(gid);
  let pickers = { textChannels: [], categories: [], roles: [] };
  try {
    pickers = await listGuildPickerData(client, gid, { force: true });
  } catch (err) {
    global.logger?.warn?.("[DASHBOARD] leave listGuildPickerData:", err?.message || err);
  }

  return {
    ok: true,
    status: 200,
    guildId: gid,
    cleared: true,
    result: {
      hadConfig: Boolean(result.hadConfig),
      configRemoved: Boolean(result.configRemoved),
      joinStatsCleared: Boolean(result.joinStatsCleared),
      notificationsCleared: Boolean(result.notificationsCleared),
      blacklistCleared: Boolean(result.blacklistCleared),
    },
    partnership: serializePartnership(config, gid),
    pickers,
    message: "Configurazione partnership azzerata. Puoi rifare il setup.",
  };
}

export = { assertTenantPartnershipAccess, getDashboardPartnershipBlacklist, addDashboardPartnershipBlacklist, removeDashboardPartnershipBlacklist, leaveDashboardPartnership };
