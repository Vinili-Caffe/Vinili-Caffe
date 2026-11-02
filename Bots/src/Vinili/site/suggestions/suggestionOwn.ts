/** Suggerimenti: crea, modifica ed elimina i propri, vota. */
const mongoose = require("mongoose") as typeof import("mongoose");
const { SiteDocument } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { normalizeSuggestionBoard, validateSuggestionTopicTag, suggestionBoardOf, boardListQuery, scrubDiscordDefaultAvatarUrl, sanitizeBody, normalizeSuggestionKind } = require("./suggestionFields") as typeof import("./suggestionFields");
const { broadcastSiteSuggestionsChanged } = require("./siteSuggestionsBroadcast") as typeof import("./siteSuggestionsBroadcast");
const { resolveWebsiteGuildMember } = require("../../site/http/siteRoleRequestApi") as typeof import("../../site/http/siteRoleRequestApi");
const { guildMemberDisplayAvatarUrlDynamic, guildMemberDisplayAvatarUrlStatic } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");
const { recordTenantBugReport } = require("../../Partner/services/tenantObjectiveService") as typeof import("../../Partner/services/tenantObjectiveService");
const { resolveSiteAvatarUrl } = require("../../site/http/siteLiveAvatars") as typeof import("../../site/http/siteLiveAvatars");
const { SG, denyStaffBoardIfNeeded, saveSuggestionImages, deleteSuggestionFiles } = require("./suggestionFiles") as typeof import("./suggestionFiles");
const { suggestionNotifOpenUrl, notifyHighStaffNewSuggestion, deleteSuggestionNotifications, notifySuggestionAuthor } = require("./suggestionNotify") as typeof import("./suggestionNotify");
const { serializeSuggestion } = require("./suggestionSerialize") as typeof import("./suggestionSerialize");
const { displayNameForMember } = require("./suggestionComments") as typeof import("./suggestionComments");
const { memberCanAccessStaffFeedbackBoard } = require("../../Staff/utils/staffGuideAccess") as typeof import("../../Staff/utils/staffGuideAccess");

const MAX_SUGGESTION_LEN = 2000;

async function createSiteSuggestion(client?, payload: Record<string, any> = {}) {
  const accessToken = String(payload.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;

  const board = normalizeSuggestionBoard(payload.board);
  if (board === "staff" && !memberCanAccessStaffFeedbackBoard(resolved.member)) {
    return {
      ok: false,
      status: 403,
      error: "forbidden",
      message: "La bacheca Staff è riservata allo staff (Partner Manager esclusi).",
    };
  }

  const kind = normalizeSuggestionKind(payload.kind) || "suggestion";
  if (!kind) {
    return {
      ok: false,
      status: 400,
      error: "invalid_kind",
      message: "Scegli tra idea o segnalazione bug.",
    };
  }

  const tagCheck = validateSuggestionTopicTag(payload.tag != null ? payload.tag : payload.topic, kind);
  if (!tagCheck.ok) return tagCheck;
  const topicTag = tagCheck.tag;

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
    $and: [
      boardListQuery(board),
      {
        $or: [
          { status: "pending" },
          { createdAt: { $gte: new Date(Date.now() - duplicateWindowMs) } },
        ],
      },
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

  const avatarRaw =
    guildMemberDisplayAvatarUrlStatic(resolved.member, { size: 128 }) ||
    guildMemberDisplayAvatarUrlDynamic(resolved.member, { size: 128, allowDefault: false }) ||
    resolveSiteAvatarUrl(resolved.guild, resolved.userId, "", {
      size: 128,
      preferAnimated: false,
      allowDefault: false,
    });

  const doc = await SiteDocument.create({
    docType: SG,
    guildId: resolved.guild.id,
    userId: resolved.userId,
    authorName: displayNameForMember(resolved.member),
    authorAvatarUrl: scrubDiscordDefaultAvatarUrl(avatarRaw),
    content,
    feedbackKind: kind,
    topicTag,
    suggestionBoard: board === "staff" ? "staff" : "community",
    imageUrls: [],
    status: "pending",
    comments: [],
  }).catch(() => null);

  if (!doc) {
    return { ok: false, status: 500, error: "save_failed", message: "Non sono riuscito a salvare il suggerimento." };
  }

  const imageUrls = await saveSuggestionImages(String(doc._id), payload.images);
  if (imageUrls.length) {
    doc.imageUrls = imageUrls;
    await doc.save().catch(() => null);
  }

  if (kind === "bug") {
    const claimed = await SiteDocument.findOneAndUpdate(
      {
        docType: SG,
        _id: doc._id,
        guildId: resolved.guild.id,
        $or: [{ missionRewardGrantedAt: null }, { missionRewardGrantedAt: { $exists: false } }],
      },
      { $set: { missionRewardGrantedAt: new Date() } },
      { new: true },
    )
      .select("_id")
      .lean()
      .catch(() => null);
    if (claimed) {
      void recordTenantBugReport(client, resolved.guild.id, resolved.userId).catch(() => null);
    }
  }

  await notifyHighStaffNewSuggestion(resolved.guild, doc, displayNameForMember(resolved.member));
  broadcastSiteSuggestionsChanged();
  return {
    ok: true,
    status: 200,
    suggestion: serializeSuggestion(doc.toObject ? doc.toObject() : doc, resolved.userId),
    message: kind === "bug" ? "Segnalazione pubblicata." : "Suggerimento pubblicato.",
  };
}

async function setSiteSuggestionVote(client?, payload: Record<string, any> = {}) {
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
    .select("upvoterUserIds downvoterUserIds userId suggestionBoard")
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
  {
    const denied = denyStaffBoardIfNeeded(resolved.member, fresh);
    if (denied) return denied;
  }

  const uid = String(resolved.userId);
  const up = new Set((Array.isArray(fresh.upvoterUserIds) ? fresh.upvoterUserIds : []).map((x?) => String(x)));
  const down = new Set((Array.isArray(fresh.downvoterUserIds) ? fresh.downvoterUserIds : []).map((x?) => String(x)));
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
      openUrl: suggestionNotifOpenUrl(suggestionId, suggestionBoardOf(fresh)),
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

async function updateOwnSiteSuggestion(client?, payload: Record<string, any> = {}) {
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

  const kindRaw = payload.kind != null ? normalizeSuggestionKind(payload.kind) : "";
  const existingForKind = await SiteDocument.findOne({
    docType: SG,
    _id: suggestionId,
    guildId: resolved.guild.id,
    userId: resolved.userId,
    status: "pending",
  })
    .select("feedbackKind")
    .lean()
    .catch(() => null);
  const kind = kindRaw || normalizeSuggestionKind(existingForKind?.feedbackKind) || "suggestion";

  const tagCheck = validateSuggestionTopicTag(payload.tag != null ? payload.tag : payload.topic, kind);
  if (!tagCheck.ok) return tagCheck;

  const $set: Record<string, any> = { content, updatedAt: new Date(), topicTag: tagCheck.tag };
  if (kindRaw) $set.feedbackKind = kindRaw;

  const updated = await SiteDocument.findOneAndUpdate(
    {
      docType: SG,
      _id: suggestionId,
      guildId: resolved.guild.id,
      userId: resolved.userId,
      status: "pending",
    },
    { $set },
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

async function deleteOwnSiteSuggestion(client?, payload: Record<string, any> = {}) {
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
  deleteSuggestionFiles(suggestionId);
  broadcastSiteSuggestionsChanged();
  return { ok: true, status: 200, message: "Suggerimento eliminato." };
}

export = { createSiteSuggestion, setSiteSuggestionVote, updateOwnSiteSuggestion, deleteOwnSiteSuggestion };
