const mongoose = require("mongoose");
const IDs = require("../Config/ids");
const { SiteSuggestion } = require("../../Schemas/Community/communitySchemas");
const { resolveWebsiteGuildMember } = require("./siteRoleRequestApi");
const { guildMemberDisplayAvatarUrlDynamic } = require("../Discord/guildDiscordIdentity");

const HIGH_STAFF_ROLE_ID = String(IDs?.roles?.HighStaff || "").trim();
const MAX_SUGGESTION_LEN = 2000;
const MAX_COMMENT_LEN = 1200;
const MAX_COMMENTS = 150;
const LIST_LIMIT = 60;

function displayNameForMember(member) {
  return String(member?.user?.username || "").trim() || "Utente";
}

function memberCanModerateSuggestions(member) {
  if (!member || member.user?.bot) return false;
  return Boolean(HIGH_STAFF_ROLE_ID && member.roles?.cache?.has?.(HIGH_STAFF_ROLE_ID));
}

function sanitizeBody(value, maxLen) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .slice(0, maxLen);
}

function sanitizeStaffReason(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .slice(0, 1000);
}

async function resolveGuild(client) {
  const guildId = String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
  if (!guildId) return null;
  return client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
}

function serializeComment(c) {
  if (!c) return null;
  return {
    id: String(c._id),
    userId: String(c.userId || ""),
    authorName: String(c.authorName || ""),
    authorAvatarUrl: String(c.authorAvatarUrl || ""),
    content: String(c.content || ""),
    createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : null,
  };
}

function serializeSuggestion(doc) {
  if (!doc) return null;
  const comments = Array.isArray(doc.comments) ? doc.comments.map(serializeComment).filter(Boolean) : [];
  return {
    id: String(doc._id),
    userId: String(doc.userId || ""),
    authorName: String(doc.authorName || ""),
    authorAvatarUrl: String(doc.authorAvatarUrl || ""),
    content: String(doc.content || ""),
    status: String(doc.status || "pending"),
    staffReason: String(doc.staffReason || ""),
    staffUserId: doc.staffUserId ? String(doc.staffUserId) : null,
    decidedAt: doc.decidedAt ? new Date(doc.decidedAt).toISOString() : null,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
    comments,
    commentCount: comments.length,
  };
}

async function getSiteSuggestions(client, payload = {}) {
  const guild = await resolveGuild(client);
  if (!guild) {
    return { ok: false, status: 503, error: "guild_unavailable", message: "Server Discord non disponibile." };
  }

  let viewer = null;
  const accessToken = String(payload.accessToken || "").trim();
  if (accessToken) {
    const resolved = await resolveWebsiteGuildMember(client, accessToken);
    if (resolved.ok) {
      viewer = {
        id: resolved.userId,
        name: displayNameForMember(resolved.member),
        canModerateSuggestions: memberCanModerateSuggestions(resolved.member),
      };
    }
  }

  const docs = await SiteSuggestion.find({ guildId: guild.id })
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(LIST_LIMIT)
    .lean()
    .catch(() => []);

  return {
    ok: true,
    status: 200,
    suggestions: docs.map((d) => serializeSuggestion(d)),
    viewer,
  };
}

async function createSiteSuggestion(client, payload = {}) {
  const accessToken = String(payload.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;

  const content = sanitizeBody(payload.content, MAX_SUGGESTION_LEN);
  if (content.length < 12) {
    return { ok: false, status: 400, error: "content_too_short", message: "Scrivi almeno 12 caratteri." };
  }

  const doc = await SiteSuggestion.create({
    guildId: resolved.guild.id,
    userId: resolved.userId,
    authorName: displayNameForMember(resolved.member),
    authorAvatarUrl: guildMemberDisplayAvatarUrlDynamic(resolved.member, { size: 128 }) || "",
    content,
    status: "pending",
    comments: [],
  }).catch(() => null);

  if (!doc) {
    return { ok: false, status: 500, error: "save_failed", message: "Non sono riuscito a salvare il suggerimento." };
  }

  return {
    ok: true,
    status: 200,
    suggestion: serializeSuggestion(doc.toObject ? doc.toObject() : doc),
    message: "Suggerimento pubblicato.",
  };
}

async function addSiteSuggestionComment(client, payload = {}) {
  const accessToken = String(payload.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;

  const suggestionId = String(payload.suggestionId || "").trim();
  if (!suggestionId || !mongoose.isValidObjectId(suggestionId)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID suggerimento non valido." };
  }

  const content = sanitizeBody(payload.content, MAX_COMMENT_LEN);
  if (content.length < 2) {
    return { ok: false, status: 400, error: "content_too_short", message: "Il commento è troppo breve." };
  }

  const existing = await SiteSuggestion.findOne({
    _id: suggestionId,
    guildId: resolved.guild.id,
  })
    .select("status comments")
    .lean()
    .catch(() => null);

  if (!existing) {
    return { ok: false, status: 404, error: "not_found", message: "Suggerimento non trovato." };
  }
  if (String(existing.status || "") !== "pending") {
    return {
      ok: false,
      status: 400,
      error: "thread_closed",
      message: "Questo suggerimento è stato già gestito: non è possibile aggiungere commenti.",
    };
  }
  const n = Array.isArray(existing.comments) ? existing.comments.length : 0;
  if (n >= MAX_COMMENTS) {
    return { ok: false, status: 400, error: "thread_full", message: "Limite commenti raggiunto per questo suggerimento." };
  }

  const comment = {
    userId: resolved.userId,
    authorName: displayNameForMember(resolved.member),
    authorAvatarUrl: guildMemberDisplayAvatarUrlDynamic(resolved.member, { size: 128 }) || "",
    content,
  };

  const updated = await SiteSuggestion.findOneAndUpdate(
    { _id: suggestionId, guildId: resolved.guild.id, status: "pending" },
    { $push: { comments: comment }, $set: { updatedAt: new Date() } },
    { new: true },
  )
    .lean()
    .catch(() => null);

  if (!updated) {
    return { ok: false, status: 500, error: "save_failed", message: "Impossibile salvare il commento." };
  }

  return {
    ok: true,
    status: 200,
    suggestion: serializeSuggestion(updated),
    message: "Commento pubblicato.",
  };
}

async function staffAcceptSiteSuggestion(client, payload = {}) {
  const accessToken = String(payload.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;
  if (!memberCanModerateSuggestions(resolved.member)) {
    return {
      ok: false,
      status: 403,
      error: "forbidden",
      message: "Solo l'High Staff può accettare i suggerimenti.",
    };
  }

  const suggestionId = String(payload.suggestionId || "").trim();
  if (!suggestionId || !mongoose.isValidObjectId(suggestionId)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID suggerimento non valido." };
  }

  const reason = sanitizeStaffReason(payload.reason);
  if (reason.length < 3) {
    return { ok: false, status: 400, error: "reason_required", message: "Inserisci un motivo di almeno 3 caratteri." };
  }

  const updated = await SiteSuggestion.findOneAndUpdate(
    {
      _id: suggestionId,
      guildId: resolved.guild.id,
      status: "pending",
    },
    {
      $set: {
        status: "accepted",
        staffReason: reason,
        staffUserId: resolved.userId,
        decidedAt: new Date(),
      },
    },
    { new: true },
  )
    .lean()
    .catch(() => null);

  if (!updated) {
    return {
      ok: false,
      status: 404,
      error: "not_found_or_closed",
      message: "Suggerimento non trovato o già gestito.",
    };
  }

  return {
    ok: true,
    status: 200,
    suggestion: serializeSuggestion(updated),
    message: "Suggerimento accettato.",
  };
}

async function staffRejectSiteSuggestion(client, payload = {}) {
  const accessToken = String(payload.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;
  if (!memberCanModerateSuggestions(resolved.member)) {
    return {
      ok: false,
      status: 403,
      error: "forbidden",
      message: "Solo l'High Staff può rifiutare i suggerimenti.",
    };
  }

  const suggestionId = String(payload.suggestionId || "").trim();
  if (!suggestionId || !mongoose.isValidObjectId(suggestionId)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID suggerimento non valido." };
  }

  const reason = sanitizeStaffReason(payload.reason);
  if (reason.length < 3) {
    return { ok: false, status: 400, error: "reason_required", message: "Inserisci un motivo di almeno 3 caratteri." };
  }

  const updated = await SiteSuggestion.findOneAndUpdate(
    {
      _id: suggestionId,
      guildId: resolved.guild.id,
      status: "pending",
    },
    {
      $set: {
        status: "rejected",
        staffReason: reason,
        staffUserId: resolved.userId,
        decidedAt: new Date(),
      },
    },
    { new: true },
  )
    .lean()
    .catch(() => null);

  if (!updated) {
    return {
      ok: false,
      status: 404,
      error: "not_found_or_closed",
      message: "Suggerimento non trovato o già gestito.",
    };
  }

  return {
    ok: true,
    status: 200,
    suggestion: serializeSuggestion(updated),
    message: "Suggerimento rifiutato.",
  };
}

module.exports = {
  getSiteSuggestions,
  createSiteSuggestion,
  addSiteSuggestionComment,
  staffAcceptSiteSuggestion,
  staffRejectSiteSuggestion,
};