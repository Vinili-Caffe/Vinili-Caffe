const mongoose = require("mongoose") as typeof import("mongoose");
const { SiteDocument } = require("../../../Community/schemas/communitySchemas") as typeof import("../../../Community/schemas/communitySchemas");
const { enqueueSiteInAppNotification } = require("../../notifications/siteInAppNotificationsService") as typeof import("../../notifications/siteInAppNotificationsService");
const { broadcastSiteReviewsChanged } = require("../../suggestions/siteSuggestionsBroadcast") as typeof import("../../suggestions/siteSuggestionsBroadcast");
const { resolveWebsiteGuildMember } = require("../siteRoleRequestApi") as typeof import("../siteRoleRequestApi");
const {
  guildMemberDisplayAvatarUrlDynamic,
  guildMemberDisplayAvatarUrlStatic,
} = require("../../../../shared/discord/guildDiscordIdentity") as typeof import("../../../../shared/discord/guildDiscordIdentity");
const {
  applyLiveAvatarToSuggestionLike,
  resolveSiteAvatarUrl,
} = require("../siteLiveAvatars") as typeof import("../siteLiveAvatars");
const { syncPersistentAutoValutazioniForMember, removeAutoValutazione } = require("../../../Staff/services/staffAutoValutazioniService") as typeof import("../../../Staff/services/staffAutoValutazioniService");
const {
  RV,
  mirrorSiteServerReviewToBoard,
  unmirrorSiteServerReviewFromBoard,
} = require("./constants") as typeof import("./constants");
const {
  invalidatePublicReviewsListCache,
  readPublicReviewsListCache,
  writePublicReviewsListCache,
  applyViewerLikesToReviews,
  getPublicReviewsCacheGen,
} = require("./cache") as typeof import("./cache");
const {
  resolveGuild,
  displayNameForMember,
  normalizeRating,
  sanitizeContent,
  sanitizeReplyContent,
  memberCanReplyAsServer,
  memberCanWriteStaffReview,
  normalizeContentLang,
  isPublicReviewKind,
  reviewNotifOpenUrl,
} = require("./helpers") as typeof import("./helpers");
const { cleanupOrphanStaffReviews, scheduleExStaffReviewsPurge } = require("./purge") as typeof import("./purge");
const {
  serializeReview,
  sortSerializedReviewsNewestFirst,
  enrichPublicReviewDoc,
} = require("./serialize") as typeof import("./serialize");
const { notifyHighStaffNewReview, notifyReviewedStafferNewReview } = require("./notify") as typeof import("./notify");
const { awardServerReviewLevels, announceServerReview } = require("./rewards") as typeof import("./rewards");

async function getSiteReviews(client?, payload: Record<string, any> = {}) {
  const guild = await resolveGuild(client);
  if (!guild) {
    return { ok: false, status: 503, error: "guild_unavailable", message: "Server Discord non disponibile." };
  }

  const wantKind = String(payload.kind || "server").trim().toLowerCase();
  const reviewKind = wantKind === "bot" ? "bot" : wantKind === "staff" ? "staff" : "server";
  const accessToken = String(payload.accessToken || "").trim();
  const staffMap = new Map();
  let staffersList = [];

  if (reviewKind === "staff") {
    const staff = await cleanupOrphanStaffReviews(client, guild);
    staffersList = Array.isArray(staff.list) ? staff.list.slice() : [];
    for (const entry of staffersList) {
      staffMap.set(String(entry.id), entry);
    }
  }

  const cacheGenAtStart = getPublicReviewsCacheGen();
  let cachedBase = readPublicReviewsListCache(guild.id, reviewKind);
  const docsP = cachedBase
    ? Promise.resolve(null)
    : SiteDocument.find({ docType: RV, guildId: guild.id, reviewKind })
        .sort({ createdAt: -1, _id: -1 })
        .limit(reviewKind === "bot" ? 120 : reviewKind === "staff" ? 100 : 80)
        .lean()
        .catch(() => []);
  const viewerP = accessToken
    ? resolveWebsiteGuildMember(client, accessToken).catch(() => null)
    : Promise.resolve(null);
  const [kindDocs, resolved] = await Promise.all([docsP, viewerP]);

  let viewer = null;
  let viewerUserId = "";
  let viewerDocs = [];
  const afterResolveTasks = [];
  if (resolved && resolved.ok) {
    viewerUserId = String(resolved.userId || "");
    afterResolveTasks.push(
      SiteDocument.find({
        docType: RV,
        guildId: guild.id,
        userId: resolved.userId,
        reviewKind: reviewKind === "staff" ? "staff" : reviewKind,
      })
        .lean()
        .catch(() => [])
        .then((rows?) => {
          viewerDocs = Array.isArray(rows) ? rows : [];
        }),
    );
  }

  if (!cachedBase) {
    afterResolveTasks.push(
      Promise.resolve().then(() => {
        cachedBase = sortSerializedReviewsNewestFirst(
          (Array.isArray(kindDocs) ? kindDocs : []).map((doc?) => {
            const entry = applyLiveAvatarToSuggestionLike(
              enrichPublicReviewDoc(doc, staffMap, ""),
              guild,
              { size: 128, preferAnimated: false, client },
            );
            entry._likedUserIds = Array.isArray(doc?.likedUserIds)
              ? doc.likedUserIds.map((x?) => String(x))
              : [];
            entry.likeCount = entry._likedUserIds.length;
            entry.likedByViewer = false;
            return entry;
          }),
        );
        /* voteLikeStale1: never re-poison TTL cache after a concurrent like invalidate */
        if (cacheGenAtStart === getPublicReviewsCacheGen()) {
          writePublicReviewsListCache(guild.id, reviewKind, cachedBase);
        }
      }),
    );
  }

  if (afterResolveTasks.length) await Promise.all(afterResolveTasks);

  if (cacheGenAtStart !== getPublicReviewsCacheGen()) {
    const hit = readPublicReviewsListCache(guild.id, reviewKind);
    if (hit) {
      cachedBase = hit;
    } else {
      const freshDocs = await SiteDocument.find({ docType: RV, guildId: guild.id, reviewKind })
        .sort({ createdAt: -1, _id: -1 })
        .limit(reviewKind === "bot" ? 120 : reviewKind === "staff" ? 100 : 80)
        .lean()
        .catch(() => []);
      const rebuildGen = getPublicReviewsCacheGen();
      cachedBase = sortSerializedReviewsNewestFirst(
        (Array.isArray(freshDocs) ? freshDocs : []).map((doc?) => {
          const entry = applyLiveAvatarToSuggestionLike(
            enrichPublicReviewDoc(doc, staffMap, ""),
            guild,
            { size: 128, preferAnimated: false, client },
          );
          entry._likedUserIds = Array.isArray(doc?.likedUserIds)
            ? doc.likedUserIds.map((x?) => String(x))
            : [];
          entry.likeCount = entry._likedUserIds.length;
          entry.likedByViewer = false;
          return entry;
        }),
      );
      if (rebuildGen === getPublicReviewsCacheGen()) {
        writePublicReviewsListCache(guild.id, reviewKind, cachedBase);
      }
    }
  }

  if (resolved && resolved.ok) {
    viewer = {
      id: resolved.userId,
      name: displayNameForMember(resolved.member),
      canReplyAsServer: memberCanReplyAsServer(resolved.member),
      canAccessStaffReviews: true,
      canWriteStaffReview: memberCanWriteStaffReview(resolved.member),
      serverReview: null,
      botReview: null,
      staffReviews: [],
    };
    for (const doc of viewerDocs) {
      const entry = applyLiveAvatarToSuggestionLike(
        enrichPublicReviewDoc(doc, staffMap, viewerUserId),
        guild,
        { size: 128 },
      );
      if (entry.kind === "server") viewer.serverReview = entry;
      if (entry.kind === "bot") viewer.botReview = entry;
      if (entry.kind === "staff") viewer.staffReviews.push(entry);
    }
  }

  let serialized = applyViewerLikesToReviews(cachedBase, viewerUserId);
  /* exStaffReviewsHide1: se il roster staff è carico, nascondi recensioni verso chi non è più staff
     (la purge DB resta scheduleExStaffReviewsPurge; qui evita che restino in cache/lista). */
  if (reviewKind === "staff" && staffersList.length > 0) {
    const liveIds = new Set(staffersList.map((s?) => String(s.id || "").trim()).filter(Boolean));
    const before = serialized.length;
    serialized = serialized.filter((r?) => liveIds.has(String(r?.staffUserId || "").trim()));
    if (serialized.length !== before) {
      scheduleExStaffReviewsPurge(client, 2_000);
    }
  }
  return {
    ok: true,
    status: 200,
    externalReviewsUrl: String(client?.config?.disboardReviews?.reviewUrl || client?.config?.reviewsUrl || "").trim(),
    staffers: reviewKind === "staff" ? staffersList.filter((s?) => String(s.id) !== viewerUserId) : [],
    reviews: {
      server: reviewKind === "server" ? serialized : [],
      staff: reviewKind === "staff" ? serialized : [],
      bot: reviewKind === "bot" ? serialized : [],
    },
    viewer,
  };
}

async function submitSiteReview(client?, payload: Record<string, any> = {}) {
  const accessToken = String(payload.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;

  const reviewKind = String(payload.kind || "server").trim().toLowerCase();
  if (reviewKind !== "server" && reviewKind !== "staff" && reviewKind !== "bot") {
    return { ok: false, status: 400, error: "invalid_kind", message: "Tipo recensione non valido." };
  }

  const rating = normalizeRating(payload.rating);
  const content = sanitizeContent(payload.content);
  if (content.length < 12) {
    return { ok: false, status: 400, error: "content_too_short", message: "Scrivi almeno 12 caratteri." };
  }
  const contentLang = normalizeContentLang(payload.contentLang || payload.lang);

  let staffUserId = null;
  let staffName = "";
  let staffAvatarUrl = "";
  if (reviewKind === "staff") {
    if (!memberCanWriteStaffReview(resolved.member)) {
      return {
        ok: false,
        status: 403,
        error: "forbidden",
        message: "Staff e High Staff non possono recensire se stessi o altri staffer.",
      };
    }
    const staff = await cleanupOrphanStaffReviews(client, resolved.guild);
    staffUserId = String(payload.staffUserId || "").trim();
    if (!staff.ids.has(staffUserId)) {
      return { ok: false, status: 404, error: "staff_not_found", message: "Lo staffer selezionato non è disponibile." };
    }
    if (staffUserId === resolved.userId) {
      return { ok: false, status: 400, error: "self_review", message: "Non puoi recensire te stesso." };
    }
    const target = staff.list.find((entry?) => entry.id === staffUserId) || null;
    staffName = String(target?.name || "");
    staffAvatarUrl = String(target?.avatarUrl || "");
  }

  const query = {
    docType: RV,
    guildId: resolved.guild.id,
    reviewKind,
    userId: resolved.userId,
    staffUserId: reviewKind === "staff" ? staffUserId : null,
  };
  const existing = await SiteDocument.findOne(query).lean().catch(() => null);

  const $set: Record<string, any> = {
    rating,
    content,
    authorName: displayNameForMember(resolved.member),
    authorAvatarUrl:
      guildMemberDisplayAvatarUrlStatic(resolved.member, { size: 128 }) ||
      guildMemberDisplayAvatarUrlDynamic(resolved.member, { size: 128 }) ||
      resolveSiteAvatarUrl(resolved.guild, resolved.userId, "", { size: 128 }),
    staffName,
    staffAvatarUrl,
  };
  if (reviewKind === "bot" || reviewKind === "server") {
    $set.contentLang = contentLang;
  }

  const nextDoc = await SiteDocument.findOneAndUpdate(
    query,
    {
      $setOnInsert: {
        docType: RV,
        guildId: resolved.guild.id,
        reviewKind,
        userId: resolved.userId,
        staffUserId: reviewKind === "staff" ? staffUserId : null,
      },
      $set,
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).lean().catch(() => null);

  if (!nextDoc) {
    return { ok: false, status: 500, error: "save_failed", message: "Non sono riuscito a salvare la recensione." };
  }

  if (reviewKind === "server" && !existing) {
    const rewardInfo = await awardServerReviewLevels(client, resolved.guild, resolved.member);
    await announceServerReview(client, resolved.guild, resolved.member, nextDoc, rewardInfo);
  }
  if (reviewKind === "server") {
    const prevRating = Math.floor(Number(existing?.rating || 0));
    const nextRating = Math.floor(Number(nextDoc?.rating || payload?.rating || 0));
        const crossedIntoEligible = nextRating >= 4 && (!existing || prevRating < 4);
    if (crossedIntoEligible) {
      await syncPersistentAutoValutazioniForMember(resolved.member, {
        allowCreate: true,
        createKeys: new Set(["recensione_sito_4_stelle"]),
        allowRemove: false,
        reviewUserIds: new Set([String(resolved.userId)]),
      }).catch((err?) => {
        global.logger?.warn?.("[siteReviewsApi] staff auto valutazioni sync:", resolved.userId, err?.message || err);
      });
    } else if (existing && prevRating >= 4 && nextRating < 4) {
      await removeAutoValutazione(resolved.guild, resolved.userId, "recensione_sito_4_stelle").catch((err?) => {
        global.logger?.warn?.("[siteReviewsApi] staff auto valutazioni on rating drop:", resolved.userId, err?.message || err);
      });
    }
  }
  if (!existing) {
    /* staffReviewTargetOnly1: staff → solo staffer target; server/bot → High Staff */
    if (reviewKind !== "staff") {
      await notifyHighStaffNewReview(resolved.guild, nextDoc, displayNameForMember(resolved.member));
    }
    await notifyReviewedStafferNewReview(resolved.guild, nextDoc, displayNameForMember(resolved.member));
  }

  /* compitiReviewsManual1: review_self_4 / review_server_4 non auto-submit (prove manuali) */

  if (reviewKind === "server") {
    await mirrorSiteServerReviewToBoard(nextDoc);
  }

  try {
    invalidatePublicReviewsListCache(resolved.guild.id);
    broadcastSiteReviewsChanged();
  } catch (_) {}

  return {
    ok: true,
    status: 200,
    review:
      isPublicReviewKind(reviewKind)
        ? enrichPublicReviewDoc(nextDoc, new Map(), resolved.userId)
        : serializeReview(nextDoc, new Map()),
    message: existing ? "Recensione aggiornata con successo." : "Recensione inviata con successo.",
  };
}

async function deleteSiteReview(client?, payload: Record<string, any> = {}) {
  const accessToken = String(payload.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;

  const reviewId = String(payload.reviewId || "").trim();
  if (!reviewId) {
    return { ok: false, status: 400, error: "missing_review_id", message: "ID recensione mancante." };
  }

  const query = {
    docType: RV,
    _id: reviewId,
    guildId: resolved.guild.id,
    userId: resolved.userId,
    reviewKind: { $in: ["server", "bot", "staff"] },
  };
  const deleted = await SiteDocument.findOneAndDelete(query).lean().catch(() => null);
  if (!deleted) {
    return { ok: false, status: 404, error: "review_not_found", message: "Recensione non trovata o non eliminabile." };
  }

  try {
    invalidatePublicReviewsListCache(resolved.guild.id);
    broadcastSiteReviewsChanged();
  } catch (_) {}

  if (String(deleted.reviewKind || "") === "server") {
    await unmirrorSiteServerReviewFromBoard(resolved.userId);
    const stillEligible = await SiteDocument.exists({
      docType: RV,
      guildId: resolved.guild.id,
      userId: resolved.userId,
      reviewKind: "server",
      createdBy: "site",
      provider: { $in: ["", null] },
      rating: { $gte: 4 },
    }).catch(() => null);
    if (!stillEligible) {
      await removeAutoValutazione(resolved.guild, resolved.userId, "recensione_sito_4_stelle").catch((err?) => {
        global.logger?.warn?.("[siteReviewsApi] staff auto valutazioni on delete:", resolved.userId, err?.message || err);
      });
    }
  }

  return {
    ok: true,
    status: 200,
    message: "Recensione eliminata con successo.",
  };
}

async function toggleSiteReviewLike(client?, payload: Record<string, any> = {}) {
  const accessToken = String(payload.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;

  const reviewId = String(payload.reviewId || "").trim();
  if (!reviewId || !mongoose.isValidObjectId(reviewId)) {
    return { ok: false, status: 400, error: "invalid_review_id", message: "ID recensione non valido." };
  }

  const review = await SiteDocument.findOne({
    docType: RV,
    _id: reviewId,
    guildId: resolved.guild.id,
    reviewKind: { $in: ["server", "bot", "staff"] },
  })
    .select("likedUserIds userId reviewKind")
    .lean()
    .catch(() => null);
  if (!review) {
    return { ok: false, status: 404, error: "review_not_found", message: "Recensione non trovata." };
  }
  if (String(review.userId || "") === String(resolved.userId)) {
    return { ok: false, status: 400, error: "self_like", message: "Non puoi mettere like alla tua stessa recensione." };
  }

  const uid = String(resolved.userId);
  const likes = Array.isArray(review.likedUserIds) ? review.likedUserIds.map((x?) => String(x)) : [];
  const has = likes.includes(uid);
  const updated = await SiteDocument.findOneAndUpdate(
    { docType: RV, _id: reviewId, guildId: resolved.guild.id, reviewKind: { $in: ["server", "bot", "staff"] } },
    has ? { $pull: { likedUserIds: uid } } : { $addToSet: { likedUserIds: uid } },
    { new: true },
  )
    .lean()
    .catch(() => null);
  if (!updated) {
    return { ok: false, status: 500, error: "like_failed", message: "Impossibile aggiornare il like." };
  }

  const nextLikes = Array.isArray(updated.likedUserIds) ? updated.likedUserIds.map((x?) => String(x)) : [];
  if (!has) {
    const authorId = String(review.userId || "").trim();
    const likerName = displayNameForMember(resolved.member);
    const kind = String(review.reviewKind || "server");
    if (authorId && authorId !== uid) {
      try {
        await enqueueSiteInAppNotification({
          guildId: resolved.guild.id,
          userId: authorId,
          title: "Nuovo like alla tua recensione",
          body:
            kind === "bot"
              ? `${likerName} ha messo mi piace alla tua recensione del bot.`
              : `${likerName} ha messo mi piace alla tua recensione della community.`,
          kind: "review",
          channel: "personal",
          openUrl: reviewNotifOpenUrl(reviewId, kind),
          dedupeKey: `rev-like:${reviewId}:${uid}`,
          dedupeWindowMs: 300_000,
        });
      } catch (_) {}
    }
  }
  if (String(updated.reviewKind || "") === "server") {
    await mirrorSiteServerReviewToBoard(updated);
  }

  try {
    invalidatePublicReviewsListCache(resolved.guild.id);
    broadcastSiteReviewsChanged();
  } catch (_) {}
  return {
    ok: true,
    status: 200,
    liked: !has,
    likeCount: nextLikes.length,
    message: has ? "Like rimosso." : "Like aggiunto.",
  };
}

async function upsertServerReviewReply(client?, payload: Record<string, any> = {}) {
  const accessToken = String(payload.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;

  const reviewId = String(payload.reviewId || "").trim();
  if (!reviewId || !mongoose.isValidObjectId(reviewId)) {
    return { ok: false, status: 400, error: "invalid_review_id", message: "ID recensione non valido." };
  }

  const content = sanitizeReplyContent(payload.content);
  if (content.length < 8) {
    return { ok: false, status: 400, error: "reply_too_short", message: "La risposta deve avere almeno 8 caratteri." };
  }

  const existing = await SiteDocument.findOne({
    docType: RV,
    _id: reviewId,
    guildId: resolved.guild.id,
    reviewKind: { $in: ["server", "bot", "staff"] },
  })
    .select("_id reviewKind staffUserId userId")
    .lean()
    .catch(() => null);
  if (!existing) {
    return { ok: false, status: 404, error: "review_not_found", message: "Recensione non trovata." };
  }

  const replyKind = String(existing.reviewKind || "server").trim().toLowerCase();
  const viewerId = String(resolved.userId || "").trim();
  const targetStaffId = String(existing.staffUserId || "").trim();
  /* reviewsStaffReply1: staff board → only the reviewed staffer; server/bot → HS as before */
  if (replyKind === "staff") {
    if (!targetStaffId || targetStaffId !== viewerId) {
      return {
        ok: false,
        status: 403,
        error: "forbidden",
        message: "Puoi rispondere solo alle recensioni ricevute su di te.",
      };
    }
  } else if (!memberCanReplyAsServer(resolved.member)) {
    return { ok: false, status: 403, error: "forbidden", message: "Non hai i permessi per rispondere a nome del server." };
  }

  const nextDoc = await SiteDocument.findOneAndUpdate(
    { docType: RV, _id: reviewId, guildId: resolved.guild.id, reviewKind: replyKind },
    {
      $set: {
        serverReplyContent: content,
        serverReplyAt: new Date(),
        serverReplyAuthorId: viewerId,
      },
    },
    { new: true },
  )
    .lean()
    .catch(() => null);
  if (!nextDoc) {
    return { ok: false, status: 500, error: "save_failed", message: "Impossibile salvare la risposta." };
  }

  const reviewAuthorId = String(nextDoc.userId || "").trim();
  if (reviewAuthorId && reviewAuthorId !== viewerId) {
    try {
      await enqueueSiteInAppNotification({
        guildId: resolved.guild.id,
        userId: reviewAuthorId,
        title: "Risposta alla tua recensione",
        body:
          replyKind === "bot"
            ? "Lo staff ha pubblicato una risposta ufficiale alla tua recensione del bot."
            : replyKind === "staff"
              ? "Lo staffer ha risposto alla tua recensione."
              : "Lo staff ha pubblicato una risposta ufficiale alla tua recensione della community.",
        kind: "review",
        channel: "personal",
        openUrl: reviewNotifOpenUrl(reviewId, replyKind),
        dedupeKey: `rev-reply:${reviewId}:${String(nextDoc.serverReplyAt || "")}`,
        dedupeWindowMs: 86_400_000,
      });
    } catch (_) {}
  }

  if (replyKind === "server") {
    await mirrorSiteServerReviewToBoard(nextDoc);
  }

  try {
    invalidatePublicReviewsListCache(resolved.guild.id);
    broadcastSiteReviewsChanged();
  } catch (_) {}

  return {
    ok: true,
    status: 200,
    review: enrichPublicReviewDoc(nextDoc, new Map(), resolved.userId),
    message: replyKind === "staff" ? "Risposta pubblicata." : "Risposta del server pubblicata.",
  };
}

/* apiWarmSwr2: lista pubblica server/bot/staff senza token (viewer likes per-request) */
async function warmSiteReviewsListCache(client?) {
  const kinds = ["server", "bot", "staff"];
  for (const kind of kinds) {
    try {
      await getSiteReviews(client, { kind });
    } catch (err) {
      global.logger?.warn?.("[site-reviews] warm:", kind, err?.message || err);
    }
  }
  return true;
}

export = {
  getSiteReviews,
  submitSiteReview,
  deleteSiteReview,
  toggleSiteReviewLike,
  upsertServerReviewReply,
  warmSiteReviewsListCache,
};
