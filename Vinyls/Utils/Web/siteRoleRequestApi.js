const IDs = require("../Config/ids");
const { CustomRole, SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas");

const COOLDOWN = SITE_DOCUMENT_TYPE.ROLE_REQUEST_COOLDOWN;
const { createSiteRoleJoinRequest } = require("../../Events/interaction/customRoleHandlers");

const ROLE_REQUEST_COOLDOWN_MS = 7 * 24 * 60 * 60 * 1000;

function resolveGuildId(client) {
  return String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
}

function isExpired(doc) {
  const expiresAt = doc?.expiresAt ? new Date(doc.expiresAt).getTime() : 0;
  return Number.isFinite(expiresAt) && expiresAt > 0 && expiresAt <= Date.now();
}

function sanitizeReason(value) {
  return String(value || "").trim().replace(/\r\n/g, "\n").replace(/\r/g, "\n").slice(0, 500);
}

function formatDateTimeIt(value) {
  const date = value instanceof Date ? value : new Date(value);
  if (!Number.isFinite(date.getTime())) return "";
  try {
    return date.toLocaleString("it-IT", {
      timeZone: "Europe/Rome",
      day: "2-digit",
      month: "2-digit",
      year: "numeric",
      hour: "2-digit",
      minute: "2-digit",
    });
  } catch {
    return date.toISOString();
  }
}

async function resolveWebsiteGuildMember(client, accessToken) {
  const token = String(accessToken || "").trim();
  if (!token) {
    return { ok: false, status: 401, error: "missing_token", message: "Sessione Discord mancante: effettua il login." };
  }

  let meJson;
  try {
    const meRes = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!meRes.ok) {
      return { ok: false, status: 401, error: "invalid_token", message: "Sessione Discord non valida o scaduta: effettua di nuovo il login." };
    }
    meJson = await meRes.json();
  } catch {
    return { ok: false, status: 502, error: "discord_unreachable", message: "Impossibile contattare Discord in questo momento." };
  }

  const userId = String(meJson?.id || "").trim();
  if (!/^\d{17,20}$/.test(userId)) {
    return { ok: false, status: 401, error: "invalid_user", message: "Profilo Discord non valido." };
  }

  const guildId = resolveGuildId(client);
  if (!guildId) {
    return { ok: false, status: 503, error: "misconfigured", message: "Guild principale non configurata." };
  }
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) {
    return { ok: false, status: 503, error: "guild_unavailable", message: "Server Discord temporaneamente non disponibile." };
  }

  const member = guild.members.cache.get(userId) || (await guild.members.fetch(userId).catch(() => null));
  if (!member) {
    return {
      ok: false,
      status: 403,
      error: "not_in_guild",
      message: "Per richiedere un ruolo devi essere presente nel server Discord.",
    };
  }

  return { ok: true, status: 200, guild, member, userId };
}

async function submitSiteRoleRequest(client, payload) {
  const accessToken = String(payload?.accessToken || "").trim();
  const roleId = String(payload?.roleId || "").trim();
  const reason = sanitizeReason(payload?.reason);

  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;

  if (!/^\d{17,22}$/.test(roleId)) {
    return { ok: false, status: 400, error: "invalid_role", message: "Ruolo richiesto non valido." };
  }
  if (reason.length < 10) {
    return { ok: false, status: 400, error: "reason_too_short", message: "Scrivi una motivazione di almeno 10 caratteri." };
  }

  const doc = await CustomRole.findOne({
    guildId: resolved.guild.id,
    $or: [{ roleId }, { secondaryRoleId: roleId }],
  }).lean().catch(() => null);
  if (!doc?.roleId || isExpired(doc)) {
    return { ok: false, status: 404, error: "role_unavailable", message: "Questo ruolo custom non è più disponibile." };
  }

  const ownerId = String(doc.userId || "").trim();
  if (!/^\d{17,22}$/.test(ownerId)) {
    return { ok: false, status: 404, error: "owner_missing", message: "Non trovo più il proprietario di questo ruolo." };
  }
  if (ownerId === resolved.userId) {
    return { ok: false, status: 400, error: "self_request", message: "Sei già il proprietario di questo ruolo." };
  }

  const role = resolved.guild.roles.cache.get(roleId) || (await resolved.guild.roles.fetch(roleId).catch(() => null));
  if (!role) {
    return { ok: false, status: 404, error: "role_missing", message: "Il ruolo Discord non esiste più." };
  }
  if (resolved.member.roles.cache.has(role.id)) {
    return { ok: false, status: 409, error: "already_has_role", message: "Hai già questo ruolo." };
  }

  const ownerMember =
    resolved.guild.members.cache.get(ownerId) || (await resolved.guild.members.fetch(ownerId).catch(() => null));
  if (!ownerMember) {
    return { ok: false, status: 404, error: "owner_not_found", message: "Il proprietario del ruolo non è disponibile nel server." };
  }

  const cooldownDoc = await SiteDocument.findOne({
    docType: COOLDOWN,
    guildId: resolved.guild.id,
    requesterId: resolved.userId,
    roleId: role.id,
  }).lean().catch(() => null);
  const cooldownUntil = cooldownDoc?.cooldownUntil ? new Date(cooldownDoc.cooldownUntil) : null;
  if (cooldownUntil && Number.isFinite(cooldownUntil.getTime()) && cooldownUntil.getTime() > Date.now()) {
    return {
      ok: false,
      status: 429,
      error: "cooldown_active",
      message: `Hai già inviato una richiesta per questo ruolo di recente. Potrai inviarne una nuova dal ${formatDateTimeIt(cooldownUntil)}.`,
      cooldownUntil: cooldownUntil.toISOString(),
    };
  }

  await Promise.allSettled([
    resolved.guild.members.fetch(resolved.userId).catch(() => null),
    resolved.guild.members.fetch(ownerId).catch(() => null),
    resolved.guild.roles.fetch(role.id).catch(() => null),
  ]);

  const out = await createSiteRoleJoinRequest({
    client,
    guildId: resolved.guild.id,
    requesterId: resolved.userId,
    ownerId,
    roleId: role.id,
    reason,
    timeoutMs: 3 * 24 * 60 * 60 * 1000,
  });

  if (!out?.ok) {
    if (out?.error === "dm_closed") {
      return {
        ok: false,
        status: 409,
        error: "owner_dm_closed",
        message: "Il proprietario del ruolo ha i DM chiusi: non posso inviargli la richiesta.",
      };
    }
    if (out?.error === "already_pending") {
      return {
        ok: false,
        status: 409,
        error: "already_pending",
        message: "Hai già una richiesta in attesa per questo ruolo.",
      };
    }
    if (out?.error === "owner_not_found") {
      return {
        ok: false,
        status: 404,
        error: "owner_not_found",
        message: "Il proprietario del ruolo non è più disponibile nel server.",
      };
    }
    if (out?.error === "requester_not_found") {
      return {
        ok: false,
        status: 403,
        error: "requester_not_found",
        message: "Non riesco a trovarti nel server Discord. Rientra nel server e riprova.",
      };
    }
    if (out?.error === "role_missing") {
      return {
        ok: false,
        status: 404,
        error: "role_missing",
        message: "Il ruolo Discord non esiste più.",
      };
    }
    if (out?.error === "guild_unavailable") {
      return {
        ok: false,
        status: 503,
        error: "guild_unavailable",
        message: "Server Discord temporaneamente non disponibile. Riprova tra poco.",
      };
    }
    if (out?.error === "invalid_context") {
      return {
        ok: false,
        status: 503,
        error: "invalid_context",
        message: "Non riesco a preparare la richiesta in questo momento. Riprova tra qualche secondo.",
      };
    }
    return {
      ok: false,
      status: 500,
      error: "request_failed",
      message: "Non sono riuscito a inoltrare la richiesta all'owner del ruolo.",
    };
  }

  const now = new Date();
  const nextAllowedAt = new Date(now.getTime() + ROLE_REQUEST_COOLDOWN_MS);
  await SiteDocument.findOneAndUpdate(
    {
      docType: COOLDOWN,
      guildId: resolved.guild.id,
      requesterId: resolved.userId,
      roleId: role.id,
    },
    {
      $set: {
        ownerId,
        lastRequestedAt: now,
        cooldownUntil: nextAllowedAt,
      },
      $setOnInsert: {
        docType: COOLDOWN,
        guildId: resolved.guild.id,
        requesterId: resolved.userId,
        roleId: role.id,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);

  return {
    ok: true,
    status: 200,
    message: "Richiesta inviata in DM al proprietario del ruolo. Potrai inviarne una nuova per questo ruolo tra 7 giorni.",
    cooldownUntil: nextAllowedAt.toISOString(),
  };
}

module.exports = {
  resolveWebsiteGuildMember,
  submitSiteRoleRequest,
};