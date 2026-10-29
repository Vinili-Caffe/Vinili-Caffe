const { PermissionFlagsBits, Routes } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const {
  STAFF_HIGH_STAFF_ELIGIBLE_KEYS,
  memberHasAnyRoleKey,
} = require("../../Utils/Staff/staffRoleHierarchy") as typeof import("../../Utils/Staff/staffRoleHierarchy");

function resolveMainGuildId(client?) {
  return String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
}

function uniqueIds(ids?) {
  return [...new Set((Array.isArray(ids) ? ids : []).map((id?) => String(id || "").trim()).filter(Boolean))];
}

async function fetchDiscordUserIdFromUserAccessToken(accessToken?) {
  const token = String(accessToken || "").trim();
  if (!token) {
    return { ok: false, status: 401, error: "missing_token", message: "Token mancante." };
  }
  try {
    const meRes = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!meRes.ok) {
      return { ok: false, status: 401, error: "invalid_token", message: "Sessione Discord non valida o scaduta." };
    }
    const meJson: any = await meRes.json();
    const userId = String(meJson?.id || "").trim();
    if (!/^\d{17,22}$/.test(userId)) {
      return { ok: false, status: 401, error: "invalid_user", message: "Profilo Discord non valido." };
    }
    return { ok: true, userId };
  } catch {
    return { ok: false, status: 502, error: "discord_unreachable", message: "Impossibile contattare Discord." };
  }
}

function ticketStaffRoleIdsForGuild(guildId?) {
  const sponsorStaffIds = guildId && IDs.roles?.sponsorStaffRoleIds ? IDs.roles.sponsorStaffRoleIds[String(guildId)] : [];
  return uniqueIds([
    ...(Array.isArray(IDs.websiteMaintenanceBypassRoleIds) ? IDs.websiteMaintenanceBypassRoleIds : []),
    ...(Array.isArray(sponsorStaffIds) ? sponsorStaffIds : [sponsorStaffIds]),
    IDs.roles.Staff,
    IDs.roles.Helper,
    IDs.roles.Mod,
    IDs.roles.SeniorModerator,
    IDs.roles.Director,
    IDs.roles.HighStaff,
    IDs.roles.Manager,
    IDs.roles.Admin,
    IDs.roles.Founder,
    IDs.roles.CommunityManager,
    IDs.roles.PartnerManager,
  ].filter(Boolean));
}

function roleNameLooksTicketStaff(name?) {
  return /(^|[\s༄|·-])(staff|helper|mod|moderator|admin|founder|owner|partner manager)([\s༄|·-]|$)/i.test(String(name || "").toLowerCase());
}

function memberHasElevatedGuildPerms(member?) {
  if (!member?.permissions?.has) return false;
  try {
    return (
      member.permissions.has(PermissionFlagsBits.Administrator) ||
      member.permissions.has(PermissionFlagsBits.ManageGuild) ||
      member.permissions.has(PermissionFlagsBits.ManageChannels) ||
      member.permissions.has(PermissionFlagsBits.ManageMessages)
    );
  } catch {
    return false;
  }
}

function memberHasTicketStaffRoles(member?, guildId?) {
  if (!member?.roles?.cache) return false;
  if (memberHasElevatedGuildPerms(member)) return true;
  const staffIds = ticketStaffRoleIdsForGuild(guildId);
  if (uniqueIds(staffIds).some((rid?) => member.roles.cache.has(rid))) return true;
  for (const role of member.roles.cache.values()) {
    if (roleNameLooksTicketStaff(role?.name)) return true;
  }
  return false;
}

function memberHasConfiguredTicketTypeRoles(member?, guildId?, ticketType?) {
  if (!member?.roles?.cache) return false;
  try {
    const { getTicketTypeStaffRoleIds } = require("../../MultiGuild/core/tenantTicketSettings") as typeof import("../../MultiGuild/core/tenantTicketSettings");
    const ids = uniqueIds(getTicketTypeStaffRoleIds(guildId, ticketType));
    return ids.some((rid?) => member.roles.cache.has(rid));
  } catch {
    return false;
  }
}

function rawMemberHasConfiguredTicketTypeRoles(guildId?, ticketType?, rawRoleIds?) {
  try {
    const { getTicketTypeStaffRoleIds } = require("../../MultiGuild/core/tenantTicketSettings") as typeof import("../../MultiGuild/core/tenantTicketSettings");
    const ids = new Set(uniqueIds(getTicketTypeStaffRoleIds(guildId, ticketType)));
    return uniqueIds(rawRoleIds).some((rid?) => ids.has(rid));
  } catch {
    return false;
  }
}

async function resolveTicketGuildId(client?, ticketDoc?) {
  const fromTicket = String(ticketDoc?.guildId || "").trim();
  if (fromTicket) return fromTicket;
  const channelId = String(ticketDoc?.channelId || "").trim();
  if (!channelId) return "";
  let channel = client?.channels?.cache?.get(channelId) || null;
  if (!channel && typeof client?.channels?.fetch === "function") {
    channel = await client.channels.fetch(channelId).catch(() => null);
  }
  return String(channel?.guildId || channel?.guild?.id || "").trim();
}

async function findMemberInGuild(client?, guildId?, userId?) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return null;
  const guild = client.guilds.cache.get(gid) || (await client.guilds.fetch(gid).catch(() => null));
  if (!guild) return null;
  return (await guild.members.fetch({ user: uid, force: true }).catch(() => null)) || guild.members.cache.get(uid) || null;
}

async function fetchRawGuildMember(client?, guildId?, userId?) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid || !client?.rest?.get || !Routes?.guildMember) return null;
  return client.rest.get(Routes.guildMember(gid, uid)).catch(() => null);
}

async function rawMemberHasTicketStaffRoles(client?, guildId?, rawMember?, ticketType = null) {
  const rawRoleIds = uniqueIds(rawMember?.roles || []);
  if (!rawRoleIds.length) return false;
  if (rawMemberHasConfiguredTicketTypeRoles(guildId, ticketType, rawRoleIds)) return true;
  const staffIds = ticketStaffRoleIdsForGuild(guildId);
  if (staffIds.some((rid?) => rawRoleIds.includes(rid))) return true;

  const guild = client?.guilds?.cache?.get(String(guildId || "")) || null;
  if (!guild?.roles) return false;
  await guild.roles.fetch().catch(() => null);
  return rawRoleIds.some((roleId?) => {
    const role = guild.roles.cache.get(roleId);
    if (!role) return false;
    try {
      if (
        role.permissions?.has?.(PermissionFlagsBits.Administrator) ||
        role.permissions?.has?.(PermissionFlagsBits.ManageGuild) ||
        role.permissions?.has?.(PermissionFlagsBits.ManageChannels) ||
        role.permissions?.has?.(PermissionFlagsBits.ManageMessages)
      ) {
        return true;
      }
    } catch {}
    return roleNameLooksTicketStaff(role.name);
  });
}

async function userHasTicketStaffInGuild(client?, guildId?, userId?, ticketType = null) {
  const member = await findMemberInGuild(client, guildId, userId);
  if (member) {
    if (memberHasConfiguredTicketTypeRoles(member, guildId, ticketType)) return true;
    if (memberHasTicketStaffRoles(member, guildId)) return true;
    try {
      const { hasStaffTicketRole } = require("../../Utils/Ticket/ticketStaffPanelBuild") as typeof import("../../Utils/Ticket/ticketStaffPanelBuild");
      if (hasStaffTicketRole(member, ticketType)) return true;
    } catch (_) {}
  }
  const rawMember = await fetchRawGuildMember(client, guildId, userId);
  return rawMemberHasTicketStaffRoles(client, guildId, rawMember, ticketType);
}

async function userIsDashboardHighStaff(client?, userId?) {
  const mainId = resolveMainGuildId(client);
  if (!mainId) return false;
  const member = await findMemberInGuild(client, mainId, userId);
  if (member && memberHasAnyRoleKey(member, STAFF_HIGH_STAFF_ELIGIBLE_KEYS)) return true;
  const raw = await fetchRawGuildMember(client, mainId, userId);
  const rawRoleIds = uniqueIds(raw?.roles || []);
  if (!rawRoleIds.length) return false;
  const highStaffIds = uniqueIds(
    STAFF_HIGH_STAFF_ELIGIBLE_KEYS.map((key?) => IDs.roles?.[key]).filter(Boolean),
  );
  return highStaffIds.some((rid?) => rawRoleIds.includes(rid));
}

async function canUserViewTicketTranscript(client?, userId?, ticketDoc?) {
  const uid = String(userId || "").trim();
  const directUserIds = uniqueIds([
    ticketDoc?.userId,
    ticketDoc?.claimedBy,
    ticketDoc?.closedBy,
    ticketDoc?.closeRequestedBy,
  ]);
  if (directUserIds.includes(uid)) {
    return { ok: true };
  }

    if (await userIsDashboardHighStaff(client, uid)) {
    return { ok: true };
  }

  try {
    const { refreshTicketConfigCache } = require("../../MultiGuild/core/tenantTicketSettings") as typeof import("../../MultiGuild/core/tenantTicketSettings");
    await refreshTicketConfigCache().catch(() => null);
  } catch (_) {}

  const ticketGuildId = await resolveTicketGuildId(client, ticketDoc);
  if (!ticketGuildId) {
    return { ok: false, status: 503, message: "Server Discord non configurato." };
  }

  const ticketType = ticketDoc?.ticketType;
  const mainId = resolveMainGuildId(client);
  const guildIds = uniqueIds([ticketGuildId, mainId]);
  for (const guildId of guildIds) {
    if (await userHasTicketStaffInGuild(client, guildId, uid, ticketType)) return { ok: true };
  }

  global.logger?.warn?.("[TICKET TRANSCRIPT ACCESS] denied", {
    userId: uid,
    ticketGuildId,
    checkedGuildIds: guildIds,
    ticketType: String(ticketType || ""),
    ticketUserId: String(ticketDoc?.userId || ""),
    claimedBy: String(ticketDoc?.claimedBy || ""),
    closedBy: String(ticketDoc?.closedBy || ""),
  });

  return {
    ok: false,
    status: 403,
    message: "Accesso negato: solo l'autore del ticket o lo staff del server possono aprire questo transcript.",
  };
}

function parseAuthorizationBearer(req?) {
  const raw = String(req.headers.authorization || "").trim();
  const m = /^Bearer\s+(\S+)/i.exec(raw);
  return m ? String(m[1] || "").trim() : "";
}

export = { fetchDiscordUserIdFromUserAccessToken, canUserViewTicketTranscript, parseAuthorizationBearer };
