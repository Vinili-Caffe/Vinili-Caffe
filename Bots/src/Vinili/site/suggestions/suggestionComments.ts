/** Suggerimenti: commenti (scrivi, modifica, elimina, vota). */
const mongoose = require("mongoose") as typeof import("mongoose");
const { saveDiscussionImages } = require("../../site/http/siteDiscussionImages") as typeof import("../../site/http/siteDiscussionImages");
const { SiteDocument } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { suggestionBoardOf, sanitizeBody } = require("./suggestionFields") as typeof import("./suggestionFields");
const { broadcastSiteSuggestionsChanged } = require("./siteSuggestionsBroadcast") as typeof import("./siteSuggestionsBroadcast");
const { resolveWebsiteGuildMember } = require("../../site/http/siteRoleRequestApi") as typeof import("../../site/http/siteRoleRequestApi");
const { guildMemberDisplayAvatarUrlDynamic, guildMemberDisplayAvatarUrlStatic } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");
const { removeSiteInAppNotificationsMatching } = require("../notifications/siteInAppNotificationsService") as typeof import("../notifications/siteInAppNotificationsService");
const { resolveSiteAvatarUrl } = require("../../site/http/siteLiveAvatars") as typeof import("../../site/http/siteLiveAvatars");
const { SG, memberCanModerateSuggestions, denyStaffBoardIfNeeded } = require("./suggestionFiles") as typeof import("./suggestionFiles");
const { clipNotifBody, suggestionNotifOpenUrl, suggestionCommentContentFingerprint, notifySuggestionAuthor, collectSuggestionDiscussionParticipantIds } = require("./suggestionNotify") as typeof import("./suggestionNotify");
const { serializeSuggestion } = require("./suggestionSerialize") as typeof import("./suggestionSerialize");

const MAX_COMMENT_LEN = 1200;
const MAX_COMMENTS = 150;

function displayNameForMember(member?) {
  return String(member?.user?.username || "").trim() || "Utente";
}

async function addSiteSuggestionComment(client?, payload: Record<string, any> = {}) {
  const accessToken = String(payload.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;

  const suggestionId = String(payload.suggestionId || "").trim();
  if (!suggestionId || !mongoose.isValidObjectId(suggestionId)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID suggerimento non valido." };
  }

  const content = sanitizeBody(payload.content, MAX_COMMENT_LEN);
  const wantImages = Array.isArray(payload.images) && payload.images.length > 0;
  if (content.length < 2 && !wantImages) {
    return { ok: false, status: 400, error: "content_too_short", message: "Il commento è troppo breve." };
  }

  const existing = await SiteDocument.findOne({
    docType: SG,
    _id: suggestionId,
    guildId: resolved.guild.id,
  })
    .select("status comments userId suggestionBoard")
    .lean()
    .catch(() => null);

  if (!existing) {
    return { ok: false, status: 404, error: "not_found", message: "Suggerimento non trovato." };
  }
  {
    const denied = denyStaffBoardIfNeeded(resolved.member, existing);
    if (denied) return denied;
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
    const parent = (Array.isArray(existing.comments) ? existing.comments : []).find((x?) => String(x._id) === rawParent);
    if (!parent) {
      return { ok: false, status: 404, error: "parent_not_found", message: "Il commento a cui rispondi non esiste." };
    }
    /* replyToReply1: risposta a una risposta → stesso thread (root), niente 3° livello */
    const rootParentId = parent.parentCommentId ? String(parent.parentCommentId) : rawParent;
    if (!mongoose.isValidObjectId(rootParentId)) {
      return { ok: false, status: 400, error: "invalid_parent", message: "ID commento padre non valido." };
    }
    parentOid = new mongoose.Types.ObjectId(rootParentId);
  }

  const comment: Record<string, any> = {
    userId: resolved.userId,
    authorName: displayNameForMember(resolved.member),
    authorAvatarUrl:
      guildMemberDisplayAvatarUrlStatic(resolved.member, { size: 128 }) ||
      guildMemberDisplayAvatarUrlDynamic(resolved.member, { size: 128 }) ||
      resolveSiteAvatarUrl(resolved.guild, resolved.userId, "", { size: 128 }),
    content,
    ...(parentOid ? { parentCommentId: parentOid } : {}),
  };
  if (wantImages) {
    comment.imageUrls = await saveDiscussionImages("feedback", suggestionId, payload.images);
    if (!comment.imageUrls.length && content.length < 2) {
      return { ok: false, status: 400, error: "bad_image", message: "Immagine non valida o troppo grande (max 2,5 MB)." };
    }
  }

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
  const actorId = String(resolved.userId || "").trim();
  const who = displayNameForMember(resolved.member);
  const board = suggestionBoardOf(existing);
  const openUrl = suggestionNotifOpenUrl(suggestionId, board);
  const notifChannel = board === "staff" ? "inbox" : "personal";
  let parentAuthor = "";
  if (parentOid) {
    const parent = (Array.isArray(existing.comments) ? existing.comments : []).find((x?) => String(x._id) === rawParent);
    parentAuthor = parent ? String(parent.userId || "").trim() : "";
  }
  // discussionParticipantsFanOut1 — notify every prior participant (owner + comment authors), not only parent/owner.
  // staffFeedbackCommentInbox1: staff-board comments always channel=inbox (Inbox tab).
  // feedbackNotifDedupe1: replaceDedupe su fingerprint testo → niente doppione se stesso contenuto
  // ripubblicato (es. top-level poi reply / delete+repost entro pochi minuti).
  const participantIds = collectSuggestionDiscussionParticipantIds(existing, { excludeUserId: actorId });
  const contentFp = suggestionCommentContentFingerprint(content || (wantImages ? "photo" : ""));
  await Promise.all(
    participantIds.map((uid?) => {
      let title;
      let body;
      if (parentOid && uid === parentAuthor) {
        title = "Risposta al tuo commento";
        body = `${who} ha risposto al tuo commento: ${clipNotifBody(content || "📷 una foto", 320)}`;
      } else if (!parentOid && uid === ownerId) {
        title = "Nuovo commento al suggerimento";
        body = `${who} ha commentato: ${clipNotifBody(content || "📷 una foto", 360)}`;
      } else if (parentOid && uid === ownerId) {
        title = "Nuova risposta in discussione";
        body = `${who} ha risposto a un commento sul tuo suggerimento.`;
      } else if (parentOid) {
        title = "Nuova risposta in discussione";
        body = `${who} ha risposto in una discussione a cui partecipi.`;
      } else {
        title = "Nuovo messaggio in discussione";
        body = `${who} ha commentato in una discussione a cui partecipi: ${clipNotifBody(content || "📷 una foto", 280)}`;
      }
      return notifySuggestionAuthor(resolved.guild.id, uid, {
        title,
        body,
        kind: "suggestion",
        channel: notifChannel,
        openUrl,
        // chiave: sid + fingerprint testo + uid → replace stesso testo; delete per prefisso sid:fp:
        dedupeKey: `suggestion:discuss:${suggestionId}:${contentFp}:${uid}`,
        dedupeWindowMs: 5 * 60_000,
        replaceDedupe: true,
      });
    }),
  );

  broadcastSiteSuggestionsChanged();
  return {
    ok: true,
    status: 200,
    suggestion: serializeSuggestion(updated, resolved.userId),
    message: "Commento pubblicato.",
  };
}

async function updateSiteSuggestionComment(client?, payload: Record<string, any> = {}) {
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
  {
    const denied = denyStaffBoardIfNeeded(resolved.member, doc);
    if (denied) return denied;
  }

  const arr = Array.isArray(doc.comments) ? doc.comments : [];
  const idx = arr.findIndex((c?) => String(c._id) === commentId);
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

async function deleteSiteSuggestionComment(client?, payload: Record<string, any> = {}) {
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
  {
    const denied = denyStaffBoardIfNeeded(resolved.member, doc);
    if (denied) return denied;
  }

  const arr = Array.isArray(doc.comments) ? doc.comments : [];
  const idx = arr.findIndex((c?) => String(c._id) === commentId);
  if (idx < 0) {
    return { ok: false, status: 404, error: "comment_not_found", message: "Commento non trovato." };
  }
  const authorId = String(arr[idx].userId || "").trim();
  const isOwn = authorId === String(resolved.userId);
  if (!isOwn && !canMod) {
    return { ok: false, status: 403, error: "forbidden", message: "Non puoi eliminare questo commento." };
  }

  const removeIds = new Set([commentId]);
  arr.forEach((c?) => {
    if (String(c.parentCommentId || "") === commentId) removeIds.add(String(c._id));
  });
  const removedContents = arr
    .filter((c?) => removeIds.has(String(c._id)))
    .map((c?) => String(c.content || "").trim())
    .filter(Boolean);
  doc.comments = arr.filter((c?) => !removeIds.has(String(c._id)));
  doc.updatedAt = new Date();
  doc.markModified("comments");
  const saved = await doc.save().catch(() => null);
  if (!saved) {
    return { ok: false, status: 500, error: "save_failed", message: "Impossibile eliminare il commento." };
  }

  // feedbackNotifDedupe1: purge solo notif del testo eliminato (prefisso sid:fp:).
  try {
    const fps = [
      ...new Set(removedContents.map((txt?) => suggestionCommentContentFingerprint(txt)).filter((x?) => x && x !== "empty")),
    ];
    if (fps.length) {
      await removeSiteInAppNotificationsMatching({
        prefixes: fps.map((fp?) => `suggestion:discuss:${suggestionId}:${fp}:`),
        kinds: ["suggestion"],
        forceDismiss: true,
      }).catch(() => null);
    }
  } catch (_) {
    /* ignore */
  }

  broadcastSiteSuggestionsChanged();
  return {
    ok: true,
    status: 200,
    suggestion: serializeSuggestion(saved.toObject ? saved.toObject() : saved, resolved.userId),
    message: "Commento eliminato.",
  };
}

async function setSiteSuggestionCommentVote(client?, payload: Record<string, any> = {}) {
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
  {
    const denied = denyStaffBoardIfNeeded(resolved.member, doc);
    if (denied) return denied;
  }

  const arr = Array.isArray(doc.comments) ? doc.comments : [];
  const idx = arr.findIndex((c?) => String(c._id) === commentId);
  if (idx < 0) {
    return { ok: false, status: 404, error: "comment_not_found", message: "Commento non trovato." };
  }

  const c = arr[idx];
  if (String(c.userId || "") === String(resolved.userId)) {
    return { ok: false, status: 400, error: "self_vote", message: "Non puoi votare il tuo stesso commento." };
  }

  const uid = String(resolved.userId);
  const up = new Set((Array.isArray(c.upvoterUserIds) ? c.upvoterUserIds : []).map((x?) => String(x)));
  const down = new Set((Array.isArray(c.downvoterUserIds) ? c.downvoterUserIds : []).map((x?) => String(x)));
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

export = { displayNameForMember, addSiteSuggestionComment, updateSiteSuggestionComment, deleteSiteSuggestionComment, setSiteSuggestionCommentVote };
