const mongoose = require("mongoose");
const IDs = require("../Config/ids");
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas");

const SG = SITE_DOCUMENT_TYPE.SUGGESTION;
const { broadcastSiteSuggestionsChanged } = require("./siteSuggestionsBroadcast");
const { resolveWebsiteGuildMember } = require("./siteRoleRequestApi");
const { guildMemberDisplayAvatarUrlDynamic, guildMemberDisplayAvatarUrlStatic } = require("../Discord/guildDiscordIdentity");
const { enqueueSiteInAppNotification, deleteSiteInAppNotifications } = require("./siteInAppNotificationsService");
const {
  applyLiveAvatarToSuggestionLike,
  collectUserIdsFromSuggestionLikeDocs,
  prefetchGuildMembersForIds,
  resolveSiteAvatarUrl,
} = require("./siteLiveAvatars");

const HIGH_STAFF_ROLE_ID = String(IDs?.roles?.HighStaff || "").trim();
const MAX_SUGGESTION_LEN = 2000;
const MAX_COMMENT_LEN = 1200;
const MAX_COMMENTS = 150;
const LIST_LIMIT = 60;
const HIGH_STAFF_CACHE_TTL_MS = 2 * 60 * 1000;

let highStaffCache = {
  guildId: "",
  expiresAt: 0,
  userIds: [],
};

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

function suggestionNotifOpenUrl(suggestionId) {
  const id = String(suggestionId || "").trim();
  if (!id || !mongoose.isValidObjectId(id)) return "/suggerimenti";
  return `/suggerimenti#vc-suggestion-${id}`;
}

async function getHighStaffUserIds(guild) {
  const guildId = String(guild?.id || "").trim();
  if (guildId && highStaffCache.guildId === guildId && highStaffCache.expiresAt > Date.now()) {
    return Array.isArray(highStaffCache.userIds) ? highStaffCache.userIds : [];
  }
  if (!guild || !HIGH_STAFF_ROLE_ID) {
    highStaffCache = { guildId, expiresAt: Date.now() + HIGH_STAFF_CACHE_TTL_MS, userIds: [] };
    return [];
  }
  await guild.members.fetch().catch(() => null);
  const role = guild.roles.cache.get(HIGH_STAFF_ROLE_ID) || (await guild.roles.fetch(HIGH_STAFF_ROLE_ID).catch(() => null));
  const userIds = role
    ? Array.from(role.members.values())
        .filter((member) => member && !member.user?.bot)
        .map((member) => String(member.id))
    : [];
  highStaffCache = { guildId, expiresAt: Date.now() + HIGH_STAFF_CACHE_TTL_MS, userIds };
  return userIds;
}

async function notifyHighStaffNewSuggestion(guild, suggestion, authorName) {
  const guildId = String(guild?.id || "").trim();
  if (!guildId) return;
  const highStaffIds = await getHighStaffUserIds(guild);
  if (!highStaffIds.length) return;
  const sid = String(suggestion?._id || suggestion?.id || "").trim();
  const authorId = String(suggestion?.userId || "").trim();
  const recipients = highStaffIds.filter((userId) => String(userId || "").trim() && String(userId) !== authorId);
  if (!recipients.length) return;
  const content = String(suggestion?.content || "")
    .replace(/\s+/g, " ")
    .trim();
  const bodyPreview = content.length > 220 ? `${content.slice(0, 219)}…` : content || "Nuovo suggerimento pubblicato.";
  const safeAuthor = String(authorName || "Un utente").trim() || "Un utente";
  await Promise.all(
    recipients.map((userId) =>
      enqueueSiteInAppNotification({
        guildId,
        userId,
        title: "Nuovo suggerimento sul sito",
        body: `${safeAuthor} ha inviato un suggerimento: ${bodyPreview}`,
        kind: "suggestion",
        openUrl: suggestionNotifOpenUrl(sid),
        dedupeKey: `suggestion:new:${sid}`,
        dedupeWindowMs: 86_400_000,
      }),
    ),
  ).catch(() => null);
}

async function deleteSuggestionNotifications(guildId, suggestionId) {
  const gid = String(guildId || "").trim();
  const sid = String(suggestionId || "").trim();
  if (!gid || !sid || !mongoose.isValidObjectId(sid)) return;
  const openUrl = suggestionNotifOpenUrl(sid);
  await deleteSiteInAppNotifications({
    guildId: gid,
    kind: "suggestion",
    $or: [{ openUrl }, { dedupeKey: `suggestion:new:${sid}` }],
  }).catch(() => null);
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

function serializeComment(c, viewerUserId) {
  if (!c) return null;
  const upList = Array.isArray(c.upvoterUserIds) ? c.upvoterUserIds.map((x) => String(x)) : [];
  const downList = Array.isArray(c.downvoterUserIds) ? c.downvoterUserIds.map((x) => String(x)) : [];
  const vid = String(viewerUserId || "").trim();
  const pid = c.parentCommentId ? String(c.parentCommentId) : "";
  return {
    id: String(c._id),
    userId: String(c.userId || ""),
    authorName: String(c.authorName || ""),
    authorAvatarUrl: String(c.authorAvatarUrl || ""),
    content: String(c.content || ""),
    parentCommentId: pid && mongoose.isValidObjectId(pid) ? pid : null,
    createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : null,
    updatedAt: c.updatedAt ? new Date(c.updatedAt).toISOString() : null,
    upvoteCount: upList.length,
    downvoteCount: downList.length,
    upvotedByViewer: Boolean(vid && upList.includes(vid)),
    downvotedByViewer: Boolean(vid && downList.includes(vid)),
  };
}

function serializeSuggestion(doc, viewerUserId) {
  if (!doc) return null;
  const comments = Array.isArray(doc.comments)
    ? doc.comments.map((c) => serializeComment(c, viewerUserId)).filter(Boolean)
    : [];
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
  const query = { docType: SG, guildId: guild.id };
  if (!canModerate) {
    if (viewerId) {
      query.$or = [{ status: { $ne: "rejected" } }, { userId: viewerId }];
    } else {
      query.status = { $ne: "rejected" };
    }
  }

  const docs = await SiteDocument.find(query)
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(LIST_LIMIT)
    .lean()
    .catch(() => []);

  await prefetchGuildMembersForIds(guild, collectUserIdsFromSuggestionLikeDocs(docs));

  const seenIds = new Set();
  const suggestions = [];
  for (const d of docs) {
    const id = String(d && d._id ? d._id : "").trim();
    if (!id || seenIds.has(id)) continue;
    seenIds.add(id);
    suggestions.push(applyLiveAvatarToSuggestionLike(serializeSuggestion(d, viewerId), guild, { size: 128 }));
  }

  return {
    ok: true,
    status: 200,
    suggestions,
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

    const duplicateWindowMs = 24 * 60 * 60 * 1000;
  const existingDup = await SiteDocument.findOne({
    docType: SG,
    guildId: resolved.guild.id,
    userId: resolved.userId,
    content,
    $or: [
      { status: "pending" },
      { createdAt: { $gte: new Date(Date.now() - duplicateWindowMs) } },
    ],
  })
    .select({ _id: 1 })
    .lean()
    .catch(() => null);

  if (existingDup) {
    return {
      ok: false,
      status: 409,
      error: "duplicate_suggestion",
      message: "Hai già inviato questo suggerimento. Attendi una decisione staff o modifica il testo.",
    };
  }

  const doc = await SiteDocument.create({
    docType: SG,
    guildId: resolved.guild.id,
    userId: resolved.userId,
    authorName: displayNameForMember(resolved.member),
    authorAvatarUrl:
      guildMemberDisplayAvatarUrlStatic(resolved.member, { size: 128 }) ||
      guildMemberDisplayAvatarUrlDynamic(resolved.member, { size: 128 }) ||
      resolveSiteAvatarUrl(resolved.guild, resolved.userId, "", { size: 128 }),
    content,
    status: "pending",
    comments: [],
  }).catch(() => null);

  if (!doc) {
    return { ok: false, status: 500, error: "save_failed", message: "Non sono riuscito a salvare il suggerimento." };
  }

  await notifyHighStaffNewSuggestion(resolved.guild, doc, displayNameForMember(resolved.member));
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

  const existing = await SiteDocument.findOne({
    docType: SG,
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
      message: "Questo suggerimento è già stato gestito: non è possibile aggiungere commenti.",
    };
  }
  const n = Array.isArray(existing.comments) ? existing.comments.length : 0;
  if (n >= MAX_COMMENTS) {
    return { ok: false, status: 400, error: "thread_full", message: "Limite commenti raggiunto per questo suggerimento." };
  }

  const rawParent = String(payload.parentCommentId || "").trim();
  let parentOid = null;
  if (rawParent) {
    if (!mongoose.isValidObjectId(rawParent)) {
      return { ok: false, status: 400, error: "invalid_parent", message: "ID commento padre non valido." };
    }
    const parent = (Array.isArray(existing.comments) ? existing.comments : []).find((x) => String(x._id) === rawParent);
    if (!parent) {
      return { ok: false, status: 404, error: "parent_not_found", message: "Il commento a cui rispondi non esiste." };
    }
    if (parent.parentCommentId) {
      return {
        ok: false,
        status: 400,
        error: "reply_depth",
        message: "Puoi rispondere solo ai commenti principali, non alle risposte.",
      };
    }
    parentOid = new mongoose.Types.ObjectId(rawParent);
  }

  const comment = {
    userId: resolved.userId,
    authorName: displayNameForMember(resolved.member),
    authorAvatarUrl:
      guildMemberDisplayAvatarUrlStatic(resolved.member, { size: 128 }) ||
      guildMemberDisplayAvatarUrlDynamic(resolved.member, { size: 128 }) ||
      resolveSiteAvatarUrl(resolved.guild, resolved.userId, "", { size: 128 }),
    content,
    ...(parentOid ? { parentCommentId: parentOid } : {}),
  };

  const updated = await SiteDocument.findOneAndUpdate(
    { docType: SG, _id: suggestionId, guildId: resolved.guild.id, status: "pending" },
    { $push: { comments: comment }, $set: { updatedAt: new Date() } },
    { new: true },
  )
    .lean()
    .catch(() => null);

  if (!updated) {
    return { ok: false, status: 500, error: "save_failed", message: "Impossibile salvare il commento." };
  }

  const ownerId = String(existing.userId || "").trim();
  const who = displayNameForMember(resolved.member);
  if (parentOid) {
    const parent = (Array.isArray(existing.comments) ? existing.comments : []).find((x) => String(x._id) === rawParent);
    const parentAuthor = parent ? String(parent.userId || "").trim() : "";
    if (parentAuthor && parentAuthor !== String(resolved.userId)) {
      await notifySuggestionAuthor(resolved.guild.id, parentAuthor, {
        title: "Risposta al tuo commento",
        body: `${who} ha risposto al tuo commento: ${clipNotifBody(content, 320)}`,
        kind: "suggestion",
        openUrl: suggestionNotifOpenUrl(suggestionId),
      });
    }
    if (ownerId && ownerId !== String(resolved.userId) && ownerId !== parentAuthor) {
      await notifySuggestionAuthor(resolved.guild.id, ownerId, {
        title: "Nuova risposta in discussione",
        body: `${who} ha risposto a un commento sul tuo suggerimento.`,
        kind: "suggestion",
        openUrl: suggestionNotifOpenUrl(suggestionId),
      });
    }
  } else if (ownerId && ownerId !== String(resolved.userId)) {
    await notifySuggestionAuthor(resolved.guild.id, ownerId, {
      title: "Nuovo commento al suggerimento",
      body: `${who} ha commentato: ${clipNotifBody(content, 360)}`,
      kind: "suggestion",
      openUrl: suggestionNotifOpenUrl(suggestionId),
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

  const fresh = await SiteDocument.findOne({
    docType: SG,
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

  const updated = await SiteDocument.findOneAndUpdate(
    { docType: SG, _id: suggestionId, guildId: resolved.guild.id, status: "pending" },
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
      openUrl: suggestionNotifOpenUrl(suggestionId),
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

  const updated = await SiteDocument.findOneAndUpdate(
    {
      docType: SG,
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
      openUrl: suggestionNotifOpenUrl(suggestionId),
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

  const updated = await SiteDocument.findOneAndUpdate(
    {
      docType: SG,
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
      openUrl: suggestionNotifOpenUrl(suggestionId),
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

async function staffSetSiteSuggestionDecision(client, payload = {}) {
  const accessToken = String(payload.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;
  if (!memberCanModerateSuggestions(resolved.member)) {
    return {
      ok: false,
      status: 403,
      error: "forbidden",
      message: "Solo l'High Staff può modificare lo stato dei suggerimenti.",
    };
  }

  const suggestionId = String(payload.suggestionId || "").trim();
  if (!suggestionId || !mongoose.isValidObjectId(suggestionId)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID suggerimento non valido." };
  }

  const nextStatusRaw = String(payload.status || "").trim().toLowerCase();
  const nextStatus = nextStatusRaw === "accepted" || nextStatusRaw === "rejected" ? nextStatusRaw : "pending";
  const reason = sanitizeStaffReason(payload.reason);

  if ((nextStatus === "accepted" || nextStatus === "rejected") && reason.length < 3) {
    return { ok: false, status: 400, error: "reason_required", message: "Inserisci un motivo di almeno 3 caratteri." };
  }

  const prev = await SiteDocument.findOne({ docType: SG, _id: suggestionId, guildId: resolved.guild.id })
    .lean()
    .catch(() => null);
  if (!prev) {
    return { ok: false, status: 404, error: "not_found", message: "Suggerimento non trovato." };
  }

  const set = { status: nextStatus, updatedAt: new Date() };
  if (nextStatus === "pending") {
    set.staffReason = "";
    set.staffUserId = "";
    set.decidedAt = null;
  } else {
    set.staffReason = reason;
    set.staffUserId = resolved.userId;
    set.decidedAt = new Date();
  }

  const updated = await SiteDocument.findOneAndUpdate(
    { docType: SG, _id: suggestionId, guildId: resolved.guild.id },
    { $set: set },
    { new: true },
  )
    .lean()
    .catch(() => null);

  if (!updated) {
    return { ok: false, status: 500, error: "update_failed", message: "Impossibile aggiornare il suggerimento." };
  }

  const authorId = String(updated.userId || "").trim();
  const prevStatus = String(prev.status || "pending");
  if (authorId) {
    if (nextStatus === "accepted") {
      await notifySuggestionAuthor(resolved.guild.id, authorId, {
        title: "Suggerimento accettato",
        body: `Lo staff ha accettato il tuo suggerimento sul sito. Motivo: ${clipNotifBody(reason, 380)}`,
        kind: "success",
        openUrl: suggestionNotifOpenUrl(suggestionId),
      });
    } else if (nextStatus === "rejected") {
      await notifySuggestionAuthor(resolved.guild.id, authorId, {
        title: "Suggerimento rifiutato",
        body: `Lo staff ha rifiutato il tuo suggerimento sul sito. Motivo: ${clipNotifBody(reason, 380)}`,
        kind: "suggestion",
        openUrl: suggestionNotifOpenUrl(suggestionId),
      });
    } else if (prevStatus !== "pending") {
      await notifySuggestionAuthor(resolved.guild.id, authorId, {
        title: "Suggerimento riaperto",
        body: "Lo staff ha rimesso il tuo suggerimento in valutazione sul sito.",
        kind: "suggestion",
        openUrl: suggestionNotifOpenUrl(suggestionId),
      });
    }
  }

  broadcastSiteSuggestionsChanged();
  return {
    ok: true,
    status: 200,
    suggestion: serializeSuggestion(updated, resolved.userId),
    message: "Suggerimento aggiornato.",
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

  const del = await SiteDocument.deleteOne({
    docType: SG,
    _id: suggestionId,
    guildId: resolved.guild.id,
  }).catch(() => null);

  const n = Number(del?.deletedCount ?? del?.n ?? 0);
  if (!del || n < 1) {
    return { ok: false, status: 404, error: "not_found", message: "Suggerimento non trovato." };
  }

  await deleteSuggestionNotifications(resolved.guild.id, suggestionId);
  broadcastSiteSuggestionsChanged();
  return { ok: true, status: 200, message: "Suggerimento eliminato definitivamente." };
}

async function updateOwnSiteSuggestion(client, payload = {}) {
  const accessToken = String(payload.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;

  const suggestionId = String(payload.suggestionId || "").trim();
  if (!suggestionId || !mongoose.isValidObjectId(suggestionId)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID suggerimento non valido." };
  }

  const content = sanitizeBody(payload.content, MAX_SUGGESTION_LEN);
  if (content.length < 12) {
    return { ok: false, status: 400, error: "content_too_short", message: "Scrivi almeno 12 caratteri." };
  }

  const updated = await SiteDocument.findOneAndUpdate(
    {
      docType: SG,
      _id: suggestionId,
      guildId: resolved.guild.id,
      userId: resolved.userId,
      status: "pending",
    },
    { $set: { content, updatedAt: new Date() } },
    { new: true },
  )
    .lean()
    .catch(() => null);

  if (!updated) {
    return {
      ok: false,
      status: 404,
      error: "not_found_or_locked",
      message: "Suggerimento non trovato, non tuo o già gestito dallo staff.",
    };
  }

  broadcastSiteSuggestionsChanged();
  return {
    ok: true,
    status: 200,
    suggestion: serializeSuggestion(updated, resolved.userId),
    message: "Suggerimento aggiornato.",
  };
}

async function deleteOwnSiteSuggestion(client, payload = {}) {
  const accessToken = String(payload.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;

  const suggestionId = String(payload.suggestionId || "").trim();
  if (!suggestionId || !mongoose.isValidObjectId(suggestionId)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID suggerimento non valido." };
  }

  const del = await SiteDocument.deleteOne({
    docType: SG,
    _id: suggestionId,
    guildId: resolved.guild.id,
    userId: resolved.userId,
    status: "pending",
  }).catch(() => null);

  const n = Number(del?.deletedCount ?? del?.n ?? 0);
  if (!del || n < 1) {
    return {
      ok: false,
      status: 404,
      error: "not_found_or_locked",
      message: "Suggerimento non trovato, non tuo o già gestito dallo staff.",
    };
  }

  await deleteSuggestionNotifications(resolved.guild.id, suggestionId);
  broadcastSiteSuggestionsChanged();
  return { ok: true, status: 200, message: "Suggerimento eliminato." };
}

async function updateSiteSuggestionComment(client, payload = {}) {
  const accessToken = String(payload.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;

  const suggestionId = String(payload.suggestionId || "").trim();
  const commentId = String(payload.commentId || "").trim();
  if (!suggestionId || !mongoose.isValidObjectId(suggestionId) || !commentId || !mongoose.isValidObjectId(commentId)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID non valido." };
  }

  const content = sanitizeBody(payload.content, MAX_COMMENT_LEN);
  if (content.length < 2) {
    return { ok: false, status: 400, error: "content_too_short", message: "Il commento è troppo breve." };
  }

  const doc = await SiteDocument.findOne({
    docType: SG,
    _id: suggestionId,
    guildId: resolved.guild.id,
    status: "pending",
  }).catch(() => null);
  if (!doc) {
    return { ok: false, status: 404, error: "not_found", message: "Suggerimento non trovato o discussione chiusa." };
  }

  const arr = Array.isArray(doc.comments) ? doc.comments : [];
  const idx = arr.findIndex((c) => String(c._id) === commentId);
  if (idx < 0) {
    return { ok: false, status: 404, error: "comment_not_found", message: "Commento non trovato." };
  }
  if (String(arr[idx].userId || "") !== String(resolved.userId)) {
    return { ok: false, status: 403, error: "forbidden", message: "Puoi modificare solo i tuoi commenti." };
  }

  arr[idx].content = content;
  doc.comments = arr;
  doc.updatedAt = new Date();
  doc.markModified("comments");
  const saved = await doc.save().catch(() => null);
  if (!saved) {
    return { ok: false, status: 500, error: "save_failed", message: "Impossibile salvare le modifiche." };
  }

  broadcastSiteSuggestionsChanged();
  return {
    ok: true,
    status: 200,
    suggestion: serializeSuggestion(saved.toObject ? saved.toObject() : saved, resolved.userId),
    message: "Commento aggiornato.",
  };
}

async function deleteSiteSuggestionComment(client, payload = {}) {
  const accessToken = String(payload.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;

  const suggestionId = String(payload.suggestionId || "").trim();
  const commentId = String(payload.commentId || "").trim();
  if (!suggestionId || !mongoose.isValidObjectId(suggestionId) || !commentId || !mongoose.isValidObjectId(commentId)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID non valido." };
  }

  const canMod = memberCanModerateSuggestions(resolved.member);
  const doc = await SiteDocument.findOne({
    docType: SG,
    _id: suggestionId,
    guildId: resolved.guild.id,
    status: "pending",
  }).catch(() => null);
  if (!doc) {
    return { ok: false, status: 404, error: "not_found", message: "Suggerimento non trovato o discussione chiusa." };
  }

  const arr = Array.isArray(doc.comments) ? doc.comments : [];
  const idx = arr.findIndex((c) => String(c._id) === commentId);
  if (idx < 0) {
    return { ok: false, status: 404, error: "comment_not_found", message: "Commento non trovato." };
  }
  const authorId = String(arr[idx].userId || "").trim();
  const isOwn = authorId === String(resolved.userId);
  if (!isOwn && !canMod) {
    return { ok: false, status: 403, error: "forbidden", message: "Non puoi eliminare questo commento." };
  }

  const removeIds = new Set([commentId]);
  arr.forEach((c) => {
    if (String(c.parentCommentId || "") === commentId) removeIds.add(String(c._id));
  });
  doc.comments = arr.filter((c) => !removeIds.has(String(c._id)));
  doc.updatedAt = new Date();
  doc.markModified("comments");
  const saved = await doc.save().catch(() => null);
  if (!saved) {
    return { ok: false, status: 500, error: "save_failed", message: "Impossibile eliminare il commento." };
  }

  broadcastSiteSuggestionsChanged();
  return {
    ok: true,
    status: 200,
    suggestion: serializeSuggestion(saved.toObject ? saved.toObject() : saved, resolved.userId),
    message: "Commento eliminato.",
  };
}

async function setSiteSuggestionCommentVote(client, payload = {}) {
  const accessToken = String(payload.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;

  const suggestionId = String(payload.suggestionId || "").trim();
  const commentId = String(payload.commentId || "").trim();
  if (!suggestionId || !mongoose.isValidObjectId(suggestionId) || !commentId || !mongoose.isValidObjectId(commentId)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID non valido." };
  }

  const direction = String(payload.direction || "").trim().toLowerCase();
  if (direction !== "up" && direction !== "down") {
    return { ok: false, status: 400, error: "invalid_direction", message: 'Indica "up" o "down".' };
  }

  const doc = await SiteDocument.findOne({
    docType: SG,
    _id: suggestionId,
    guildId: resolved.guild.id,
    status: "pending",
  }).catch(() => null);
  if (!doc) {
    return {
      ok: false,
      status: 400,
      error: "vote_not_allowed",
      message: "Puoi votare solo su suggerimenti ancora in valutazione.",
    };
  }

  const arr = Array.isArray(doc.comments) ? doc.comments : [];
  const idx = arr.findIndex((c) => String(c._id) === commentId);
  if (idx < 0) {
    return { ok: false, status: 404, error: "comment_not_found", message: "Commento non trovato." };
  }

  const c = arr[idx];
  if (String(c.userId || "") === String(resolved.userId)) {
    return { ok: false, status: 400, error: "self_vote", message: "Non puoi votare il tuo stesso commento." };
  }

  const uid = String(resolved.userId);
  const up = new Set((Array.isArray(c.upvoterUserIds) ? c.upvoterUserIds : []).map((x) => String(x)));
  const down = new Set((Array.isArray(c.downvoterUserIds) ? c.downvoterUserIds : []).map((x) => String(x)));
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

  c.upvoterUserIds = Array.from(up);
  c.downvoterUserIds = Array.from(down);
  doc.comments = arr;
  doc.updatedAt = new Date();
  doc.markModified("comments");
  const saved = await doc.save().catch(() => null);
  if (!saved) {
    return { ok: false, status: 500, error: "vote_failed", message: "Impossibile salvare il voto." };
  }

  broadcastSiteSuggestionsChanged();
  return {
    ok: true,
    status: 200,
    suggestion: serializeSuggestion(saved.toObject ? saved.toObject() : saved, uid),
    message: "Voto aggiornato.",
  };
}

module.exports = {
  getSiteSuggestions,
  createSiteSuggestion,
  updateOwnSiteSuggestion,
  deleteOwnSiteSuggestion,
  addSiteSuggestionComment,
  updateSiteSuggestionComment,
  deleteSiteSuggestionComment,
  setSiteSuggestionCommentVote,
  setSiteSuggestionVote,
  staffAcceptSiteSuggestion,
  staffRejectSiteSuggestion,
  staffSetSiteSuggestionDecision,
  staffDeleteSiteSuggestion,
};