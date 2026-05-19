const { PermissionFlagsBits, Routes } = require("discord.js");
const IDs = require("../../Utils/Config/ids");

function resolveMainGuildId(client) {
  return String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
}

function uniqueIds(ids) {
  return [...new Set((Array.isArray(ids) ? ids : []).map((id) => String(id || "").trim()).filter(Boolean))];
}

async function fetchDiscordUserIdFromUserAccessToken(accessToken) {
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
    const meJson = await meRes.json();
    const userId = String(meJson?.id || "").trim();
    if (!/^\d{17,22}$/.test(userId)) {
      return { ok: false, status: 401, error: "invalid_user", message: "Profilo Discord non valido." };
    }
    return { ok: true, userId };
  } catch {
    return { ok: false, status: 502, error: "discord_unreachable", message: "Impossibile contattare Discord." };
  }
}

function ticketStaffRoleIdsForGuild(guildId) {
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
    IDs.roles.Admin,
    IDs.roles.Founder,
    IDs.roles.CommunityManager,
    IDs.roles.PartnerManager,
  ].filter(Boolean));
}

function roleNameLooksTicketStaff(name) {
  return /(^|[\s༄|·-])(staff|helper|mod|moderator|admin|founder|owner|partner manager)([\s༄|·-]|$)/i.test(String(name || "").toLowerCase());
}

function memberHasTicketStaffRoles(member, guildId) {
  if (!member?.roles?.cache) return false;
  try {
    if (
      member.permissions?.has?.(PermissionFlagsBits.Administrator) ||
      member.permissions?.has?.(PermissionFlagsBits.ManageGuild) ||
      member.permissions?.has?.(PermissionFlagsBits.ManageChannels) ||
      member.permissions?.has?.(PermissionFlagsBits.ManageMessages)
    ) {
      return true;
    }
  } catch {}
  const staffIds = ticketStaffRoleIdsForGuild(guildId);
  if (uniqueIds(staffIds).some((rid) => member.roles.cache.has(rid))) return true;
  for (const role of member.roles.cache.values()) {
    if (roleNameLooksTicketStaff(role?.name)) return true;
  }
  return false;
}

async function resolveTicketGuildId(client, ticketDoc) {
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

async function findMemberInGuild(client, guildId, userId) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return null;
  const guild = client.guilds.cache.get(gid) || (await client.guilds.fetch(gid).catch(() => null));
  if (!guild) return null;
  return (await guild.members.fetch({ user: uid, force: true }).catch(() => null)) || guild.members.cache.get(uid) || null;
}

function resolveVisibleGuildIds(client) {
  const cacheIds = client?.guilds?.cache ? [...client.guilds.cache.keys()] : [];
  return uniqueIds(cacheIds);
}

async function fetchRawGuildMember(client, guildId, userId) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid || !client?.rest?.get || !Routes?.guildMember) return null;
  return client.rest.get(Routes.guildMember(gid, uid)).catch(() => null);
}

async function rawMemberHasTicketStaffRoles(client, guildId, rawMember) {
  const rawRoleIds = uniqueIds(rawMember?.roles || []);
  if (!rawRoleIds.length) return false;
  const staffIds = ticketStaffRoleIdsForGuild(guildId);
  if (staffIds.some((rid) => rawRoleIds.includes(rid))) return true;

  const guild = client?.guilds?.cache?.get(String(guildId || "")) || null;
  if (!guild?.roles) return false;
  await guild.roles.fetch().catch(() => null);
  return rawRoleIds.some((roleId) => {
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

async function userHasTicketStaffInGuild(client, guildId, userId) {
  const member = await findMemberInGuild(client, guildId, userId);
  if (memberHasTicketStaffRoles(member, guildId)) return true;
  const rawMember = await fetchRawGuildMember(client, guildId, userId);
  return rawMemberHasTicketStaffRoles(client, guildId, rawMember);
}

async function canUserViewTicketTranscript(client, userId, ticketDoc) {
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

  const ticketGuildId = await resolveTicketGuildId(client, ticketDoc);
  const guildIds = uniqueIds([ticketGuildId, resolveMainGuildId(client), ...resolveVisibleGuildIds(client)]);
  if (!guildIds.length) {
    return { ok: false, status: 503, message: "Server Discord non configurato." };
  }

  for (const guildId of guildIds) {
    if (await userHasTicketStaffInGuild(client, guildId, uid)) return { ok: true };
  }

  global.logger?.warn?.("[TICKET TRANSCRIPT ACCESS] denied", {
    userId: uid,
    ticketGuildId,
    checkedGuildIds: guildIds,
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

function parseAuthorizationBearer(req) {
  const raw = String(req.headers.authorization || "").trim();
  const m = /^Bearer\s+(\S+)/i.exec(raw);
  return m ? String(m[1] || "").trim() : "";
}

module.exports = { fetchDiscordUserIdFromUserAccessToken, canUserViewTicketTranscript, parseAuthorizationBearer };