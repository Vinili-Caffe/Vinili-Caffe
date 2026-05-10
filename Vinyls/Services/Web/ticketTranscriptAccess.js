const IDs = require("../../Utils/Config/ids");

function resolveMainGuildId(client) {
  return String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
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

function memberHasTicketStaffRoles(member) {
  if (!member?.roles?.cache) return false;
  const staffIds = [
    IDs.roles.Staff,
    IDs.roles.SeniorModerator,
    IDs.roles.Director,
    IDs.roles.HighStaff,
    IDs.roles.PartnerManager,
  ].filter(Boolean);
  return staffIds.some((rid) => member.roles.cache.has(rid));
}

/**
 * Opener: sempre (anche se non è più nel server). Altri: solo se membro guild con ruolo staff ticket.
 */
async function canUserViewTicketTranscript(client, userId, ticketDoc) {
  const uid = String(userId || "").trim();
  const opener = String(ticketDoc?.userId || "").trim();
  if (opener && uid === opener) {
    return { ok: true };
  }

  const guildId = resolveMainGuildId(client);
  if (!guildId) {
    return { ok: false, status: 503, message: "Server Discord non configurato." };
  }
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) {
    return { ok: false, status: 503, message: "Server Discord temporaneamente non disponibile." };
  }

  const member = guild.members.cache.get(uid) || (await guild.members.fetch(uid).catch(() => null));
  if (!member) {
    return {
      ok: false,
      status: 403,
      message: "Accesso negato: solo l'autore del ticket o lo staff del server possono aprire questo transcript.",
    };
  }
  if (memberHasTicketStaffRoles(member)) {
    return { ok: true };
  }
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

module.exports = {
  fetchDiscordUserIdFromUserAccessToken,
  canUserViewTicketTranscript,
  parseAuthorizationBearer,
};