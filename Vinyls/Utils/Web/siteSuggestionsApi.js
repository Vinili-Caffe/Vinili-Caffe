const mongoose = require("mongoose");
const IDs = require("../Config/ids");
const { SiteSuggestion } = require("../../Schemas/Community/communitySchemas");
const { broadcastSiteSuggestionsChanged } = require("./siteSuggestionsBroadcast");
const { resolveWebsiteGuildMember } = require("./siteRoleRequestApi");
const { guildMemberDisplayAvatarUrlDynamic } = require("../Discord/guildDiscordIdentity");
const { enqueueSiteInAppNotification } = require("./siteInAppNotificationsService");

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

function clipNotifBody(text, maxLen) {
  const s = String(text || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/\s+/g, " ")
    .trim();
  if (s.length <= maxLen) return s;
  return `${s.slice(0, Math.max(0, maxLen - 1))}…`;
}

async function notifySuggestionAuthor(guildId, authorUserId, payload) {
  const gid = String(guildId || "").trim();
  const aid = String(authorUserId || "").trim();
  if (!gid || !aid) return;
  const opts = {
    guildId: gid,
    userId: aid,
    title: String(payload.title || "").trim().slice(0, 120),
    body: String(payload.body || "").trim().slice(0, 500),
    kind: payload.kind || "suggestion",
    openUrl: String(payload.openUrl || "/suggerimenti").trim().slice(0, 400),
  };
  if (payload.dedupeKey != null && String(payload.dedupeKey).trim()) {
    opts.dedupeKey = String(payload.dedupeKey).trim().slice(0, 120);
    opts.dedupeWindowMs = Number(payload.dedupeWindowMs) || 60_000;
  }
  try {
    await enqueueSiteInAppNotification(opts);
  } catch (e) {
    global.logger?.warn?.("[siteSuggestions] in-app notification:", e?.message || e);
  }
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

function serializeSuggestion(doc, viewerUserId) {
  if (!doc) return null;
  const comments = Array.isArray(doc.comments) ? doc.comments.map(serializeComment).filter(Boolean) : [];
  const upList = Array.isArray(doc.upvoterUserIds) ? doc.upvoterUserIds.map((x) => String(x)) : [];
  const downList = Array.isArray(doc.downvoterUserIds) ? doc.downvoterUserIds.map((x) => String(x)) : [];
  const vid = String(viewerUserId || "").trim();
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
    upvoteCount: upList.length,
    downvoteCount: downList.length,
    upvotedByViewer: Boolean(vid && upList.includes(vid)),
    downvotedByViewer: Boolean(vid && downList.includes(vid)),
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

  const viewerId = viewer && viewer.id ? String(viewer.id) : "";
  const canModerate = Boolean(viewer && viewer.canModerateSuggestions);
  const query = { guildId: guild.id };
  if (!canModerate) {
    if (viewerId) {
      query.$or = [{ status: { $ne: "rejected" } }, { userId: viewerId }];
    } else {
      query.status = { $ne: "rejected" };
    }
  }

  const docs = await SiteSuggestion.find(query)
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(LIST_LIMIT)
    .lean()
    .catch(() => []);

  return {
    ok: true,
    status: 200,
    suggestions: docs.map((d) => serializeSuggestion(d, viewerId)),
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

  broadcastSiteSuggestionsChanged();
  return {
    ok: true,
    status: 200,
    suggestion: serializeSuggestion(doc.toObject ? doc.toObject() : doc, resolved.userId),
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
    .select("status comments userId")
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

  const ownerId = String(existing.userId || "").trim();
  if (ownerId && ownerId !== String(resolved.userId)) {
    const who = displayNameForMember(resolved.member);
    await notifySuggestionAuthor(resolved.guild.id, ownerId, {
      title: "Nuovo commento al suggerimento",
      body: `${who} ha commentato: ${clipNotifBody(content, 360)}`,
      kind: "suggestion",
      openUrl: "/suggerimenti",
    });
  }

  broadcastSiteSuggestionsChanged();
  return {
    ok: true,
    status: 200,
    suggestion: serializeSuggestion(updated, resolved.userId),
    message: "Commento pubblicato.",
  };
}

async function setSiteSuggestionVote(client, payload = {}) {
  const accessToken = String(payload.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;

  const suggestionId = String(payload.suggestionId || "").trim();
  if (!suggestionId || !mongoose.isValidObjectId(suggestionId)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID suggerimento non valido." };
  }

  const direction = String(payload.direction || "").trim().toLowerCase();
  if (direction !== "up" && direction !== "down") {
    return { ok: false, status: 400, error: "invalid_direction", message: 'Indica "up" o "down".' };
  }

  const fresh = await SiteSuggestion.findOne({
    _id: suggestionId,
    guildId: resolved.guild.id,
    status: "pending",
  })
    .select("upvoterUserIds downvoterUserIds userId")
    .lean()
    .catch(() => null);

  if (!fresh) {
    return {
      ok: false,
      status: 400,
      error: "vote_not_allowed",
      message: "Puoi votare solo su suggerimenti ancora in valutazione.",
    };
  }

  const uid = String(resolved.userId);
  const up = new Set((Array.isArray(fresh.upvoterUserIds) ? fresh.upvoterUserIds : []).map((x) => String(x)));
  const down = new Set((Array.isArray(fresh.downvoterUserIds) ? fresh.downvoterUserIds : []).map((x) => String(x)));
  const hadUpvote = up.has(uid);

  if (direction === "up") {
    if (hadUpvote) up.delete(uid);
    else {
      down.delete(uid);
      up.add(uid);
    }
  } else if (down.has(uid)) {
    down.delete(uid);
  } else {
    up.delete(uid);
    down.add(uid);
  }

  const updated = await SiteSuggestion.findOneAndUpdate(
    { _id: suggestionId, guildId: resolved.guild.id, status: "pending" },
    {
      $set: {
        upvoterUserIds: Array.from(up),
        downvoterUserIds: Array.from(down),
        updatedAt: new Date(),
      },
    },
    { new: true },
  )
    .lean()
    .catch(() => null);

  if (!updated) {
    return { ok: false, status: 500, error: "vote_failed", message: "Impossibile salvare il voto." };
  }

  const authorId = String(fresh.userId || "").trim();
  const addedUpvote = direction === "up" && !hadUpvote && up.has(uid);
  if (addedUpvote && authorId && authorId !== uid) {
    const voterName = displayNameForMember(resolved.member);
    await notifySuggestionAuthor(resolved.guild.id, authorId, {
      title: "Mi piace al tuo suggerimento",
      body: `${voterName} ha messo mi piace al tuo suggerimento sul sito.`,
      kind: "suggestion",
      openUrl: "/suggerimenti",
    });
  }

  broadcastSiteSuggestionsChanged();
  return {
    ok: true,
    status: 200,
    suggestion: serializeSuggestion(updated, uid),
    message: "Voto aggiornato.",
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

  const authorAccept = String(updated.userId || "").trim();
  if (authorAccept) {
    await notifySuggestionAuthor(resolved.guild.id, authorAccept, {
      title: "Suggerimento accettato",
      body: `Lo staff ha accettato il tuo suggerimento sul sito. Motivo: ${clipNotifBody(reason, 380)}`,
      kind: "success",
      openUrl: "/suggerimenti",
    });
  }

  broadcastSiteSuggestionsChanged();
  return {
    ok: true,
    status: 200,
    suggestion: serializeSuggestion(updated, resolved.userId),
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

  const authorReject = String(updated.userId || "").trim();
  if (authorReject) {
    await notifySuggestionAuthor(resolved.guild.id, authorReject, {
      title: "Suggerimento rifiutato",
      body: `Lo staff ha rifiutato il tuo suggerimento sul sito. Motivo: ${clipNotifBody(reason, 380)}`,
      kind: "suggestion",
      openUrl: "/suggerimenti",
    });
  }

  broadcastSiteSuggestionsChanged();
  return {
    ok: true,
    status: 200,
    suggestion: serializeSuggestion(updated, resolved.userId),
    message: "Suggerimento rifiutato.",
  };
}

async function staffDeleteSiteSuggestion(client, payload = {}) {
  const accessToken = String(payload.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;
  if (!memberCanModerateSuggestions(resolved.member)) {
    return {
      ok: false,
      status: 403,
      error: "forbidden",
      message: "Solo l'High Staff può eliminare definitivamente i suggerimenti.",
    };
  }

  const suggestionId = String(payload.suggestionId || "").trim();
  if (!suggestionId || !mongoose.isValidObjectId(suggestionId)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID suggerimento non valido." };
  }

  const del = await SiteSuggestion.deleteOne({
    _id: suggestionId,
    guildId: resolved.guild.id,
  }).catch(() => null);

  const n = Number(del?.deletedCount ?? del?.n ?? 0);
  if (!del || n < 1) {
    return { ok: false, status: 404, error: "not_found", message: "Suggerimento non trovato." };
  }

  broadcastSiteSuggestionsChanged();
  return { ok: true, status: 200, message: "Suggerimento eliminato definitivamente." };
}

module.exports = {
  getSiteSuggestions,
  createSiteSuggestion,
  addSiteSuggestionComment,
  setSiteSuggestionVote,
  staffAcceptSiteSuggestion,
  staffRejectSiteSuggestion,
  staffDeleteSiteSuggestion,
};