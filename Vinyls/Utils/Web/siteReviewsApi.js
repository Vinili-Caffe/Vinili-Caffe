const { EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const mongoose = require("mongoose");
const IDs = require("../Config/ids");
const { SiteDocument, ActivityUserProfile, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas");

const RV = SITE_DOCUMENT_TYPE.REVIEW;
const { enqueueSiteInAppNotification } = require("./siteInAppNotificationsService");
const { broadcastSiteReviewsChanged } = require("./siteSuggestionsBroadcast");
const { resolveWebsiteGuildMember } = require("./siteRoleRequestApi");
const { getLevelInfo, getTotalExpForLevel, addExpWithLevel } = require("../../Services/Community/expService");
const { userAvatarUrlDynamic, guildMemberDisplayAvatarUrlDynamic } = require("../Discord/guildDiscordIdentity");

const STAFF_ROLE_ID = String(IDs?.roles?.Staff || "").trim();
const ADMIN_ROLE_ID = String(IDs?.roles?.Admin || "").trim();
const HIGH_STAFF_ROLE_ID = String(IDs?.roles?.HighStaff || "").trim();
const FALLBACK_REVIEW_CHANNEL_ID = String(IDs?.channels?.supporters || "").trim();
const STAFF_CACHE_TTL_MS = 2 * 60 * 1000;
const REVIEW_REWARD_LEVELS = 5;

let staffCache = {
  guildId: "",
  expiresAt: 0,
  list: [],
  ids: new Set(),
};
let highStaffCache = {
  guildId: "",
  expiresAt: 0,
  userIds: [],
};

function resolveGuildId(client) {
  return String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
}

function normalizeRating(value) {
  const n = Math.round(Number(value) || 0);
  return Math.max(1, Math.min(5, n));
}

function sanitizeContent(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .slice(0, 1200);
}

function sanitizeReplyContent(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .slice(0, 800);
}

function memberCanReplyAsServer(member) {
  if (!member || member.user?.bot) return false;
  const hasRole = (id) => {
    const v = String(id || "").trim();
    return Boolean(v && member.roles?.cache?.has?.(v));
  };
  if (hasRole(ADMIN_ROLE_ID)) return true;
  if (hasRole(HIGH_STAFF_ROLE_ID)) return true;
  if (hasRole(STAFF_ROLE_ID)) return true;
  try {
    if (member.permissions?.has?.(PermissionFlagsBits.Administrator)) return true;
    if (member.permissions?.has?.(PermissionFlagsBits.ManageGuild)) return true;
  } catch (_) {
    /* ignore */
  }
  return false;
}

function displayNameForMember(member) {
  return String(member?.user?.username || "").trim() || "Utente";
}

async function resolveGuild(client) {
  const guildId = resolveGuildId(client);
  if (!guildId) return null;
  return client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
}

async function getStaffTargets(client, guild) {
  const guildId = String(guild?.id || "").trim();
  if (
    guildId &&
    staffCache.guildId === guildId &&
    staffCache.expiresAt > Date.now() &&
    Array.isArray(staffCache.list)
  ) {
    return staffCache;
  }

  if (!guild || !STAFF_ROLE_ID) {
    staffCache = { guildId, expiresAt: Date.now() + STAFF_CACHE_TTL_MS, list: [], ids: new Set() };
    return staffCache;
  }

  await guild.members.fetch().catch(() => null);
  const role = guild.roles.cache.get(STAFF_ROLE_ID) || (await guild.roles.fetch(STAFF_ROLE_ID).catch(() => null));
  const members = role ? Array.from(role.members.values()) : [];
  const list = members
    .filter((member) => !member.user?.bot)
    .map((member) => ({
      id: String(member.id),
      name: displayNameForMember(member),
      avatarUrl: guildMemberDisplayAvatarUrlDynamic(member, { size: 128 }) || "",
    }))
    .sort((a, b) => a.name.localeCompare(b.name, "it", { sensitivity: "base" }));
  const ids = new Set(list.map((entry) => entry.id));
  staffCache = { guildId, expiresAt: Date.now() + STAFF_CACHE_TTL_MS, list, ids };
  return staffCache;
}

async function getHighStaffUserIds(guild) {
  const guildId = String(guild?.id || "").trim();
  if (guildId && highStaffCache.guildId === guildId && highStaffCache.expiresAt > Date.now()) {
    return Array.isArray(highStaffCache.userIds) ? highStaffCache.userIds : [];
  }
  if (!guild || !HIGH_STAFF_ROLE_ID) {
    highStaffCache = { guildId, expiresAt: Date.now() + STAFF_CACHE_TTL_MS, userIds: [] };
    return [];
  }
  await guild.members.fetch().catch(() => null);
  const role = guild.roles.cache.get(HIGH_STAFF_ROLE_ID) || (await guild.roles.fetch(HIGH_STAFF_ROLE_ID).catch(() => null));
  const userIds = role
    ? Array.from(role.members.values())
        .filter((member) => member && !member.user?.bot)
        .map((member) => String(member.id))
    : [];
  highStaffCache = { guildId, expiresAt: Date.now() + STAFF_CACHE_TTL_MS, userIds };
  return userIds;
}

function reviewNotifOpenUrl(reviewId) {
  const id = String(reviewId || "").trim();
  return id ? `/recensioni#vc-review-${id}` : "/recensioni";
}

async function notifyHighStaffNewReview(guild, review, authorName) {
  const guildId = String(guild?.id || "").trim();
  if (!guildId) return;
  const highStaffIds = await getHighStaffUserIds(guild);
  if (!highStaffIds.length) return;
  const rid = String(review?._id || review?.id || "").trim();
  const rating = normalizeRating(review?.rating);
  const content = String(review?.content || "")
    .replace(/\s+/g, " ")
    .trim();
  const bodyPreview = content.length > 220 ? `${content.slice(0, 219)}…` : content || "Nuova recensione pubblicata.";
  const safeAuthor = String(authorName || "Un utente").trim() || "Un utente";
  await Promise.all(
    highStaffIds.map((userId) =>
      enqueueSiteInAppNotification({
        guildId,
        userId,
        title: "Nuova recensione sul sito",
        body: `${safeAuthor} ha pubblicato una recensione (${rating}/5): ${bodyPreview}`,
        kind: "review",
        openUrl: reviewNotifOpenUrl(rid),
        dedupeKey: `review:new:${rid}`,
        dedupeWindowMs: 86_400_000,
      }),
    ),
  ).catch(() => null);
}

async function cleanupOrphanStaffReviews(client, guild) {
  const staff = await getStaffTargets(client, guild);
  const activeIds = Array.from(staff.ids);
  if (!activeIds.length) {
    await SiteDocument.deleteMany({ docType: RV, guildId: guild.id, reviewKind: "staff" }).catch(() => null);
    return staff;
  }
  await SiteDocument.deleteMany({
    docType: RV,
    guildId: guild.id,
    reviewKind: "staff",
    staffUserId: { $nin: activeIds },
  }).catch(() => null);
  return staff;
}

function serializeReview(doc, staffMap) {
  const raw = doc && typeof doc === "object" ? doc : {};
  const rk = String(raw.reviewKind || raw.kind || "server");
  const target = rk === "staff" ? staffMap.get(String(raw.staffUserId || "")) || null : null;
  return {
    id: String(raw._id || ""),
    kind: rk,
    userId: String(raw.userId || ""),
    staffUserId: raw.staffUserId ? String(raw.staffUserId) : null,
    rating: normalizeRating(raw.rating),
    content: String(raw.content || ""),
    authorName: String(raw.authorName || "Utente"),
    authorAvatarUrl: String(raw.authorAvatarUrl || ""),
    staffName: target?.name || String(raw.staffName || ""),
    staffAvatarUrl: target?.avatarUrl || String(raw.staffAvatarUrl || ""),
    createdAt: raw.createdAt ? new Date(raw.createdAt).toISOString() : null,
    updatedAt: raw.updatedAt ? new Date(raw.updatedAt).toISOString() : null,
  };
}

function enrichServerReviewDoc(doc, staffMap, viewerUserId) {
  const base = serializeReview(doc, staffMap);
  const likes = Array.isArray(doc.likedUserIds) ? doc.likedUserIds.map((x) => String(x)) : [];
  base.likeCount = likes.length;
  base.likedByViewer = Boolean(viewerUserId && likes.includes(String(viewerUserId)));
  const replyText = String(doc.serverReplyContent || "").trim();
  base.serverReply =
    replyText.length > 0
      ? {
          content: replyText,
          updatedAt: doc.serverReplyAt ? new Date(doc.serverReplyAt).toISOString() : null,
        }
      : null;
  return base;
}

function computeExpForLevelReward(currentExp, levelsToAdd) {
  const current = Math.max(0, Number(currentExp || 0));
  const currentLevel = getLevelInfo(current).level;
  const targetLevel = currentLevel + Math.max(0, Number(levelsToAdd || 0));
  const targetExp = getTotalExpForLevel(targetLevel);
  const finalExp = Math.max(current, targetExp);
  return {
    currentLevel,
    targetLevel,
    addedExp: Math.max(0, finalExp - current),
  };
}

async function awardServerReviewLevels(client, guild, member) {
  const guildId = String(guild?.id || "").trim();
  const userId = String(member?.id || member?.user?.id || "").trim();
  if (!guildId || !userId) return null;

  const alreadyRewarded = await ActivityUserProfile.findOne({
    guildId,
    userId,
    "profile.totals.exp.bumpVoteRewards.disboard_review.rewardedAt": { $ne: null },
  })
    .select("_id")
    .lean()
    .catch(() => null);
  if (alreadyRewarded) return null;

  const profile = await ActivityUserProfile.findOne({ guildId, userId })
    .select("profile.totals.exp.totalExp")
    .lean()
    .catch(() => null);
  const currentExp = Number(profile?.profile?.totals?.exp?.totalExp || 0);
  const reward = computeExpForLevelReward(currentExp, REVIEW_REWARD_LEVELS);
  if (!reward.addedExp) return null;

  const expResult = await addExpWithLevel(guild, userId, reward.addedExp, false, false).catch(() => null);
  const finalLevel = Number(expResult?.levelInfo?.level || getLevelInfo(currentExp + reward.addedExp).level || reward.targetLevel);

  await ActivityUserProfile.updateOne(
    { guildId, userId },
    {
      $setOnInsert: { guildId, userId },
      $set: {
        "profile.totals.exp.bumpVoteRewards.disboard_review.rewardedBy": String(client?.user?.id || ""),
        "profile.totals.exp.bumpVoteRewards.disboard_review.rewardedAt": new Date(),
      },
    },
    { upsert: true },
  ).catch(() => null);

  return {
    addedLevels: Math.max(0, finalLevel - reward.currentLevel),
    finalLevel,
  };
}

async function announceServerReview(client, guild, authorMember, review, rewardInfo) {
  const announceId =
    String(client?.config?.siteReviews?.channelId || "").trim() ||
    String(client?.config?.disboardReviews?.channelId || "").trim() ||
    FALLBACK_REVIEW_CHANNEL_ID;
  if (!announceId) return;
  const channel = guild.channels.cache.get(announceId) || (await guild.channels.fetch(announceId).catch(() => null));
  if (!channel || !channel.isTextBased?.()) return;

  const authorName = displayNameForMember(authorMember);
  const avatarUrl = userAvatarUrlDynamic(authorMember, { size: 256 }) || "";
  const stars = "⭐".repeat(normalizeRating(review.rating));
  const reviewsPageUrl = String(client?.config?.siteReviews?.pageUrl || "").trim();
  const reviewLink = reviewsPageUrl || "https://www.viniliecaffe.it/recensioni/";
  const bodyText = String(review.content || "").trim().slice(0, 900) || "—";

  const relativeTs = Math.floor(Date.now() / 1000);
  const rewardLine =
    rewardInfo && Number(rewardInfo.addedLevels || 0) > 0
      ? `<a:VC_StarPink:1330194976440848500> <@${authorMember.id}>, **+${rewardInfo.addedLevels} livelli** per aver lasciato una recensione sul sito.`
      : `<a:VC_StarPink:1330194976440848500> Grazie <@${authorMember.id}> per il supporto!`;

  const embed = new EmbedBuilder()
    .setColor(0x0d9488)
    .setTitle("Nuova recensione sul sito")
    .setURL(reviewLink)
    .setAuthor({ name: authorName, iconURL: avatarUrl || undefined })
    .setThumbnail(avatarUrl || "https://disboard.org/images/no-icon.png")
    .setDescription("Un membro ha pubblicato una recensione della community.")
    .addFields(
      { name: "Valutazione", value: stars, inline: true },
      { name: "Inviata", value: `<t:${relativeTs}:R>`, inline: true },
      { name: "Testo", value: bodyText.length > 1020 ? `${bodyText.slice(0, 1017)}…` : bodyText, inline: false },
      {
        name: "Link",
        value: `[Apri la pagina recensioni](<${reviewLink}>)`,
        inline: false,
      },
      {
        name: "Ricompensa",
        value: rewardLine,
        inline: false,
      },
    )
    .setFooter({
      text: "viniliecaffe.it · Feedback community",
      iconURL: userAvatarUrlDynamic(client.user, { size: 64 }) || undefined,
    })
    .setTimestamp();

  await channel.send({
    content: `<@${authorMember.id}>`,
    embeds: [embed],
    allowedMentions: { users: [authorMember.id] },
  }).catch(() => null);
}

async function getSiteReviews(client, payload = {}) {
  const guild = await resolveGuild(client);
  if (!guild) {
    return { ok: false, status: 503, error: "guild_unavailable", message: "Server Discord non disponibile." };
  }

  const staff = await cleanupOrphanStaffReviews(client, guild);
  const staffMap = new Map(staff.list.map((entry) => [entry.id, entry]));
  const [serverDocs, staffDocs] = await Promise.all([
    SiteDocument.find({ docType: RV, guildId: guild.id, reviewKind: "server" }).sort({ createdAt: -1, _id: -1 }).limit(80).lean().catch(() => []),
    SiteDocument.find({ docType: RV, guildId: guild.id, reviewKind: "staff" }).sort({ createdAt: -1, _id: -1 }).limit(80).lean().catch(() => []),
  ]);

  let viewer = null;
  let viewerUserId = "";
  const accessToken = String(payload.accessToken || "").trim();
  if (accessToken) {
    const resolved = await resolveWebsiteGuildMember(client, accessToken);
    if (resolved.ok) {
      viewerUserId = String(resolved.userId || "");
      const viewerDocs = await SiteDocument.find({
        docType: RV,
        guildId: guild.id,
        userId: resolved.userId,
      }).lean().catch(() => []);
      viewer = {
        id: resolved.userId,
        name: displayNameForMember(resolved.member),
        canReplyAsServer: memberCanReplyAsServer(resolved.member),
        serverReview: null,
        staffReviews: [],
      };
      viewerDocs.forEach((doc) => {
        const rk = doc.reviewKind || doc.kind;
        const entry =
          rk === "server" ? enrichServerReviewDoc(doc, staffMap, viewerUserId) : serializeReview(doc, staffMap);
        if (entry.kind === "server") viewer.serverReview = entry;
        else viewer.staffReviews.push(entry);
      });
    }
  }

  function enrichServerReview(doc) {
    const base = serializeReview(doc, staffMap);
    const likes = Array.isArray(doc.likedUserIds) ? doc.likedUserIds.map((x) => String(x)) : [];
    base.likeCount = likes.length;
    base.likedByViewer = Boolean(viewerUserId && likes.includes(viewerUserId));
    const replyText = String(doc.serverReplyContent || "").trim();
    base.serverReply =
      replyText.length > 0
        ? {
            content: replyText,
            updatedAt: doc.serverReplyAt ? new Date(doc.serverReplyAt).toISOString() : null,
          }
        : null;
    return base;
  }

  return {
    ok: true,
    status: 200,
    externalReviewsUrl: String(client?.config?.disboardReviews?.reviewUrl || client?.config?.reviewsUrl || "").trim(),
    staffers: staff.list,
    reviews: {
      server: serverDocs.map((doc) => enrichServerReview(doc)),
      staff: staffDocs.map((doc) => serializeReview(doc, staffMap)),
    },
    viewer,
  };
}

async function submitSiteReview(client, payload = {}) {
  const accessToken = String(payload.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;

  const reviewKind = String(payload.kind || "server").trim().toLowerCase();
  if (reviewKind !== "server" && reviewKind !== "staff") {
    return { ok: false, status: 400, error: "invalid_kind", message: "Tipo recensione non valido." };
  }

  const rating = normalizeRating(payload.rating);
  const content = sanitizeContent(payload.content);
  if (content.length < 12) {
    return { ok: false, status: 400, error: "content_too_short", message: "Scrivi almeno 12 caratteri." };
  }

  let staffUserId = null;
  let staffName = "";
  let staffAvatarUrl = "";
  if (reviewKind === "staff") {
    const staff = await cleanupOrphanStaffReviews(client, resolved.guild);
    staffUserId = String(payload.staffUserId || "").trim();
    if (!staff.ids.has(staffUserId)) {
      return { ok: false, status: 404, error: "staff_not_found", message: "Lo staffer selezionato non è disponibile." };
    }
    if (staffUserId === resolved.userId) {
      return { ok: false, status: 400, error: "self_review", message: "Non puoi recensire te stesso." };
    }
    const target = staff.list.find((entry) => entry.id === staffUserId) || null;
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
      $set: {
        rating,
        content,
        authorName: displayNameForMember(resolved.member),
        authorAvatarUrl: guildMemberDisplayAvatarUrlDynamic(resolved.member, { size: 128 }) || "",
        staffName,
        staffAvatarUrl,
      },
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
  if (!existing) {
    await notifyHighStaffNewReview(resolved.guild, nextDoc, displayNameForMember(resolved.member));
  }

  try {
    broadcastSiteReviewsChanged();
  } catch (_) {}

  return {
    ok: true,
    status: 200,
    review: serializeReview(nextDoc, new Map()),
    message: existing ? "Recensione aggiornata con successo." : "Recensione inviata con successo.",
  };
}

async function deleteSiteReview(client, payload = {}) {
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
    reviewKind: "server",
  };
  const deleted = await SiteDocument.findOneAndDelete(query).lean().catch(() => null);
  if (!deleted) {
    return { ok: false, status: 404, error: "review_not_found", message: "Recensione non trovata o non eliminabile." };
  }

  try {
    broadcastSiteReviewsChanged();
  } catch (_) {}

  return {
    ok: true,
    status: 200,
    message: "Recensione eliminata con successo.",
  };
}

async function toggleSiteReviewLike(client, payload = {}) {
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
    reviewKind: "server",
  })
    .select("likedUserIds userId")
    .lean()
    .catch(() => null);
  if (!review) {
    return { ok: false, status: 404, error: "review_not_found", message: "Recensione non trovata." };
  }
  if (String(review.userId || "") === String(resolved.userId)) {
    return { ok: false, status: 400, error: "self_like", message: "Non puoi mettere like alla tua stessa recensione." };
  }

  const uid = String(resolved.userId);
  const likes = Array.isArray(review.likedUserIds) ? review.likedUserIds.map((x) => String(x)) : [];
  const has = likes.includes(uid);
  const updated = await SiteDocument.findOneAndUpdate(
    { docType: RV, _id: reviewId, guildId: resolved.guild.id, reviewKind: "server" },
    has ? { $pull: { likedUserIds: uid } } : { $addToSet: { likedUserIds: uid } },
    { new: true },
  )
    .lean()
    .catch(() => null);
  if (!updated) {
    return { ok: false, status: 500, error: "like_failed", message: "Impossibile aggiornare il like." };
  }

  const nextLikes = Array.isArray(updated.likedUserIds) ? updated.likedUserIds.map((x) => String(x)) : [];
  if (!has) {
    const authorId = String(review.userId || "").trim();
    const likerName = displayNameForMember(resolved.member);
    if (authorId && authorId !== uid) {
      try {
        await enqueueSiteInAppNotification({
          guildId: resolved.guild.id,
          userId: authorId,
          title: "Nuovo like alla tua recensione",
          body: `${likerName} ha messo mi piace alla tua recensione della community.`,
          kind: "review",
          openUrl: `/recensioni#vc-review-${reviewId}`,
          dedupeKey: `rev-like:${reviewId}:${uid}`,
          dedupeWindowMs: 300_000,
        });
      } catch (_) {}
    }
  }
  try {
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

async function upsertServerReviewReply(client, payload = {}) {
  const accessToken = String(payload.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;
  if (!memberCanReplyAsServer(resolved.member)) {
    return { ok: false, status: 403, error: "forbidden", message: "Non hai i permessi per rispondere a nome del server." };
  }

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
    reviewKind: "server",
  })
    .select("_id")
    .lean()
    .catch(() => null);
  if (!existing) {
    return { ok: false, status: 404, error: "review_not_found", message: "Recensione non trovata." };
  }

  const nextDoc = await SiteDocument.findOneAndUpdate(
    { docType: RV, _id: reviewId, guildId: resolved.guild.id, reviewKind: "server" },
    {
      $set: {
        serverReplyContent: content,
        serverReplyAt: new Date(),
        serverReplyAuthorId: String(resolved.userId),
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
  if (reviewAuthorId && reviewAuthorId !== String(resolved.userId)) {
    try {
      await enqueueSiteInAppNotification({
        guildId: resolved.guild.id,
        userId: reviewAuthorId,
        title: "Risposta alla tua recensione",
        body: "Lo staff ha pubblicato una risposta ufficiale alla tua recensione della community.",
        kind: "review",
        openUrl: `/recensioni#vc-review-${reviewId}`,
        dedupeKey: `rev-reply:${reviewId}:${String(nextDoc.serverReplyAt || "")}`,
        dedupeWindowMs: 86_400_000,
      });
    } catch (_) {}
  }

  try {
    broadcastSiteReviewsChanged();
  } catch (_) {}

  return {
    ok: true,
    status: 200,
    review: enrichServerReviewDoc(nextDoc, new Map(), resolved.userId),
    message: "Risposta del server pubblicata.",
  };
}

module.exports = {
  getSiteReviews,
  submitSiteReview,
  deleteSiteReview,
  toggleSiteReviewLike,
  upsertServerReviewReply,
};