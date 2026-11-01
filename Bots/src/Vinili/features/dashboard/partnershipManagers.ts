/** Dashboard partnership: partner manager e punti. */
const { PermissionFlagsBits } = require("discord.js") as typeof import("discord.js");
const { reasonToMessage, fail, serializePartnershipManager } = require("./partnershipSerialize") as typeof import("./partnershipSerialize");
const { assertTenantPartnershipAccess } = require("./partnershipBlacklist") as typeof import("./partnershipBlacklist");

const MAX_MANAGER_POINTS_AMOUNT = 10_000;

async function resolveGuildForPartnershipApi(client?, guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid) return null;
  let guild = client?.guilds?.cache?.get(gid) || null;
    const needsHydrate =
    !guild ||
    guild.partial === true ||
    !guild.members ||
    typeof guild.members.fetch !== "function" ||
    !guild.roles ||
    typeof guild.roles.fetch !== "function";
  if (needsHydrate && typeof client?.guilds?.fetch === "function") {
    guild = (await client.guilds.fetch(gid).catch(() => null)) || guild;
  }
  if (!guild?.members || typeof guild.members.fetch !== "function") return null;
  return guild;
}

async function actorIsGuildAdministrator(guild?, userId?) {
  const uid = String(userId || "").trim();
  if (!guild || !uid) return false;
  if (!guild.members || typeof guild.members.fetch !== "function") return false;
  const member =
    guild.members.cache?.get?.(uid) ||
    (await guild.members.fetch(uid).catch(() => null));
  if (!member) return false;
  return Boolean(member.permissions?.has?.(PermissionFlagsBits.Administrator));
}

async function getDashboardPartnershipManagers(client?, accessToken?, guildId?) {
  const access = await assertTenantPartnershipAccess(client, accessToken, guildId);
  if (!access.ok) return access;

  const { getPartnerManagerRoleId } = require("../../Utils/Partner/partnershipConfigResolver") as typeof import("../../Utils/Partner/partnershipConfigResolver");
  const { getUserPartnershipScoresForGuild } = require("../../MultiGuild/services/Partner/tenantLeaderboardService") as typeof import("../../MultiGuild/services/Partner/tenantLeaderboardService");

  const guild = await resolveGuildForPartnershipApi(client, access.guildId);
  if (!guild) {
    return fail(404, "guild_unavailable", "Server non disponibile al bot in questo momento.");
  }

  const roleId = String(getPartnerManagerRoleId(access.guildId) || "").trim();
  if (!roleId) {
    return fail(400, "missing_pm_role", "Configura prima il ruolo Partner Manager.");
  }

  await guild.members.fetch().catch(() => null);
  const role =
    guild.roles?.cache?.get?.(roleId) ||
    (typeof guild.roles?.fetch === "function"
      ? await guild.roles.fetch(roleId).catch(() => null)
      : null);
  if (!role) {
    return fail(400, "missing_pm_role", "Il ruolo Partner Manager non esiste più su questo server.");
  }

  let members = role.members
    ? Array.from(role.members.values()).filter((m?: any) => m && !m.user?.bot)
    : [];
  if (!members.length && guild.members?.cache?.size) {
    members = Array.from(guild.members.cache.values()).filter(
      (m?: any) => m && !m.user?.bot && m.roles?.cache?.has?.(roleId),
    );
  }

  const managers = [];
  for (const member of members) {
    const scores = await getUserPartnershipScoresForGuild(access.guildId, (member as any).id).catch(() => ({
      points: 0,
      total: 0,
      daily: 0,
      weekly: 0,
    }));
    managers.push(serializePartnershipManager(member, scores));
  }
  managers.sort(
    (a?, b?) =>
      b.points - a.points ||
      b.total - a.total ||
      String(a.displayName).localeCompare(String(b.displayName), "it"),
  );

  const canManagePoints = await actorIsGuildAdministrator(guild, access.userId);

  return {
    ok: true,
    status: 200,
    guildId: access.guildId,
    canManagePoints,
    managers,
  };
}

async function adjustDashboardPartnershipManagerPoints(client?, accessToken?, guildId?, targetUserId?, body?) {
  const access = await assertTenantPartnershipAccess(client, accessToken, guildId);
  if (!access.ok) return access;

  const { memberHasPartnerManagerRole } = require("../../Utils/Partner/partnershipConfigResolver") as typeof import("../../Utils/Partner/partnershipConfigResolver");
  const {
    addPartnerPoints,
    removePartnerPoints,
    formatPartnerPointsChange,
  } = require("../../Utils/Staff/partnerPointsUtils") as typeof import("../../Utils/Staff/partnerPointsUtils");
  const { resolvePartnerPointsShown } = require("../../Utils/Staff/partnerPointsDisplayUtils") as typeof import("../../Utils/Staff/partnerPointsDisplayUtils");
  const {
    getUserPartnershipScoresForGuild,
    invalidateLeaderboardCache,
  } = require("../../MultiGuild/services/Partner/tenantLeaderboardService") as typeof import("../../MultiGuild/services/Partner/tenantLeaderboardService");

  const guild = await resolveGuildForPartnershipApi(client, access.guildId);
  if (!guild) {
    return fail(404, "guild_unavailable", "Server non disponibile al bot in questo momento.");
  }

  if (!(await actorIsGuildAdministrator(guild, access.userId))) {
    return fail(403, "admin_required", "Solo gli amministratori possono modificare i punti.");
  }

  const uid = String(targetUserId || "").trim();
  if (!/^\d{16,22}$/.test(uid)) {
    return fail(400, "invalid_user", "Utente non valido.");
  }

  const payload = body && typeof body === "object" ? body : {};
  const action = String(payload.action || "").trim().toLowerCase();
  if (action !== "add" && action !== "remove") {
    return fail(400, "invalid_action", "Azione non valida (add|remove).");
  }
  const amount = Number.parseInt(String(payload.amount ?? "").trim(), 10);
  if (!Number.isInteger(amount) || amount < 1 || amount > MAX_MANAGER_POINTS_AMOUNT) {
    return fail(
      400,
      "invalid_amount",
      `Inserisci un numero valido tra 1 e ${MAX_MANAGER_POINTS_AMOUNT}.`,
    );
  }

  const targetMember =
    guild.members.cache.get(uid) ||
    (await guild.members.fetch(uid).catch(() => null));
  if (!targetMember || targetMember.user?.bot) {
    return fail(404, "member_not_found", "Questo utente non è nel server.");
  }
  if (!memberHasPartnerManagerRole(targetMember, access.guildId)) {
    return fail(400, "not_partner_manager", "L’utente non ha il ruolo Partner Manager.");
  }

  let updated = null;
  if (action === "add") {
    updated = await addPartnerPoints(access.guildId, uid, amount, { client, guild });
    if (!updated) {
      return fail(500, "persist_failed", reasonToMessage("persist_failed"));
    }
  } else {
    updated = await removePartnerPoints(access.guildId, uid, amount);
    if (!updated) {
      return fail(400, "nothing_to_remove", "Nessun punto da rimuovere.");
    }
  }

  try {
    invalidateLeaderboardCache();
  } catch (_) {}

  const scores = await getUserPartnershipScoresForGuild(access.guildId, uid).catch(() => ({
    points: resolvePartnerPointsShown(updated?.staff),
    total: 0,
    daily: 0,
    weekly: 0,
  }));
  const removed = Number(updated?._partnerPointsRemoved);
  const effectiveAmount =
    action === "remove" && Number.isFinite(removed) && removed > 0 ? removed : amount;

  return {
    ok: true,
    status: 200,
    guildId: access.guildId,
    points: scores.points,
    manager: serializePartnershipManager(targetMember, scores),
    message: formatPartnerPointsChange(action, effectiveAmount).replace(/`/g, ""),
  };
}

export = { getDashboardPartnershipManagers, adjustDashboardPartnershipManagerPoints };
