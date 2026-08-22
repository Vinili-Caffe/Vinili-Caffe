const { EmbedBuilder } = require("discord.js");
const mongoose = require("mongoose");
const IDs = require("../Config/ids");
const { SiteDocument, ActivityUserProfile, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas");

const RV = SITE_DOCUMENT_TYPE.REVIEW;
const { enqueueSiteInAppNotification } = require("./siteInAppNotificationsService");
const { broadcastSiteReviewsChanged } = require("./siteSuggestionsBroadcast");
const { resolveWebsiteGuildMember } = require("./siteRoleRequestApi");
const { getLevelInfo, getTotalExpForLevel, addExpWithLevel } = require("../../Services/Community/expService");
const { syncPersistentAutoValutazioniForMember, removeAutoValutazione } = require("../../Services/Staff/staffAutoValutazioniService");
const { userAvatarUrlDynamic, guildMemberDisplayAvatarUrlDynamic, guildMemberDisplayAvatarUrlStatic } = require("../Discord/guildDiscordIdentity");
const {
  applyLiveAvatarToSuggestionLike,
  resolveSiteAvatarUrl,
  stabilizeDiscordCdnAvatarUrl,
} = require("./siteLiveAvatars");
const { TENANT_EMBED_COLOR } = require("../../MultiGuild/utils/tenantEmbedBranding");

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

/** Risposta ufficiale a nome del server: solo Admin / High Staff / owner (non staff normale). */
function memberCanReplyAsServer(member) {
  if (!member || member.user?.bot) return false;
  const hasRole = (id) => {
    const v = String(id || "").trim();
    return Boolean(v && member.roles?.cache?.has?.(v));
  };
  if (hasRole(ADMIN_ROLE_ID)) return true;
  if (hasRole(HIGH_STAFF_ROLE_ID)) return true;
  try {
    if (String(member.guild?.ownerId || "") === String(member.id)) return true;
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

  try {
    const { ensureGuildMembersLoaded } = require("./siteStaffRosterCache");
    await ensureGuildMembersLoaded(guild);
  } catch (_) {}
  const role = guild.roles.cache.get(STAFF_ROLE_ID) || (await guild.roles.fetch(STAFF_ROLE_ID).catch(() => null));
  const members = role ? Array.from(role.members.values()) : [];
  const list = members
    .filter((member) => !member.user?.bot)
    .map((member) => ({
      id: String(member.id),
      name: displayNameForMember(member),
      avatarUrl:
        stabilizeDiscordCdnAvatarUrl(
          guildMemberDisplayAvatarUrlStatic(member, { size: 128 }) ||
            guildMemberDisplayAvatarUrlDynamic(member, { size: 128 }) ||
            "",
          { size: 128 },
        ) || "",
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
  try {
    const { ensureGuildMembersLoaded } = require("./siteStaffRosterCache");
    await ensureGuildMembersLoaded(guild);
  } catch (_) {}
  const role = guild.roles.cache.get(HIGH_STAFF_ROLE_ID) || (await guild.roles.fetch(HIGH_STAFF_ROLE_ID).catch(() => null));
  const userIds = role
    ? Array.from(role.members.values())
        .filter((member) => member && !member.user?.bot)
        .map((member) => String(member.id))
    : [];
  highStaffCache = { guildId, expiresAt: Date.now() + STAFF_CACHE_TTL_MS, userIds };
  return userIds;
}

function normalizeContentLang(value) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "en" || raw.indexOf("en-") === 0) return "en";
  return "it";
}

function isPublicReviewKind(kind) {
  const k = String(kind || "").trim().toLowerCase();
  return k === "server" || k === "bot";
}

function reviewPagePathForKind(kind) {
  return String(kind || "").trim().toLowerCase() === "bot" ? "/dashboard/recensioni/" : "/recensioni";
}

function reviewNotifOpenUrl(reviewId, kind) {
  const id = String(reviewId || "").trim();
  const base = reviewPagePathForKind(kind);
  return id ? `${base}#vc-review-${id}` : base;
}

async function notifyHighStaffNewReview(guild, review, authorName) {
  const rid = String(review?._id || "").trim();
  const kind = String(review?.reviewKind || "server");
  const isBot = kind === "bot";
  const title = isBot ? "Nuova recensione bot" : "Nuova recensione community";
  const body = isBot
    ? `${authorName || "Un utente"} ha pubblicato una recensione del bot.`
    : `${authorName || "Un utente"} ha pubblicato una recensione della community.`;
  const userIds = await getHighStaffUserIds(guild);
  for (const userId of userIds) {
    try {
      await enqueueSiteInAppNotification({
        guildId: guild.id,
        userId,
        title,
        body,
        kind: "review",
        openUrl: reviewNotifOpenUrl(rid, kind),
        dedupeKey: `rev-new:${rid}:${userId}`,
        dedupeWindowMs: 86_400_000,
      });
    } catch (_) {}
  }
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
  const createdAt = raw.createdAt ? new Date(raw.createdAt) : null;
  const updatedAt = raw.updatedAt ? new Date(raw.updatedAt) : null;
  let objectCreatedMs = 0;
  if (mongoose.isValidObjectId(raw._id)) {
    const objectId = typeof raw._id?.getTimestamp === "function" ? raw._id : new mongoose.Types.ObjectId(String(raw._id));
    objectCreatedMs = Number(objectId.getTimestamp?.().getTime?.() || 0);
  }
  const createdAtMs = createdAt && Number.isFinite(createdAt.getTime()) ? createdAt.getTime() : objectCreatedMs;
  return {
    id: String(raw._id || ""),
    kind: rk,
    userId: String(raw.userId || ""),
    staffUserId: raw.staffUserId ? String(raw.staffUserId) : null,
    rating: normalizeRating(raw.rating),
    content: String(raw.content || ""),
    contentLang: normalizeContentLang(raw.contentLang || "it"),
    authorName: String(raw.authorName || "Utente"),
    authorAvatarUrl: String(raw.authorAvatarUrl || ""),
    staffName: target?.name || String(raw.staffName || ""),
    staffAvatarUrl: target?.avatarUrl || String(raw.staffAvatarUrl || ""),
    createdAt: createdAt && Number.isFinite(createdAt.getTime()) ? createdAt.toISOString() : (createdAtMs ? new Date(createdAtMs).toISOString() : null),
    createdAtMs,
    updatedAt: updatedAt && Number.isFinite(updatedAt.getTime()) ? updatedAt.toISOString() : null,
  };
}

function sortSerializedReviewsNewestFirst(list) {
  return (Array.isArray(list) ? list.slice() : []).sort((a, b) => {
    const ta = Number(a?.createdAtMs || 0);
    const tb = Number(b?.createdAtMs || 0);
    if (tb !== ta) return tb - ta;
    return String(b?.id || "").localeCompare(String(a?.id || ""));
  });
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

function enrichPublicReviewDoc(doc, staffMap, viewerUserId) {
  return enrichServerReviewDoc(doc, staffMap, viewerUserId);
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
    .setColor(TENANT_EMBED_COLOR)
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

  const wantKind = String(payload.kind || "server").trim().toLowerCase();
  const reviewKind = wantKind === "bot" ? "bot" : "server";
  const accessToken = String(payload.accessToken || "").trim();
  const staffMap = new Map();

  const docsP = SiteDocument.find({ docType: RV, guildId: guild.id, reviewKind })
    .sort({ createdAt: -1, _id: -1 })
    .limit(reviewKind === "bot" ? 120 : 80)
    .lean()
    .catch(() => []);
  const viewerP = accessToken
    ? resolveWebsiteGuildMember(client, accessToken).catch(() => null)
    : Promise.resolve(null);
  const [kindDocs, resolved] = await Promise.all([docsP, viewerP]);

  let viewer = null;
  let viewerUserId = "";
  if (resolved && resolved.ok) {
    viewerUserId = String(resolved.userId || "");
    const viewerDocs = await SiteDocument.find({
      docType: RV,
      guildId: guild.id,
      userId: resolved.userId,
      reviewKind,
    })
      .lean()
      .catch(() => []);
    viewer = {
      id: resolved.userId,
      name: displayNameForMember(resolved.member),
      canReplyAsServer: memberCanReplyAsServer(resolved.member),
      serverReview: null,
      botReview: null,
      staffReviews: [],
    };
    viewerDocs.forEach((doc) => {
      const entry = applyLiveAvatarToSuggestionLike(enrichPublicReviewDoc(doc, staffMap, viewerUserId), guild, {
        size: 128,
      });
      if (entry.kind === "server") viewer.serverReview = entry;
      if (entry.kind === "bot") viewer.botReview = entry;
    });
  }

  function enrichPublicReview(doc) {
    return applyLiveAvatarToSuggestionLike(enrichPublicReviewDoc(doc, staffMap, viewerUserId), guild, { size: 128 });
  }

  const serialized = sortSerializedReviewsNewestFirst((Array.isArray(kindDocs) ? kindDocs : []).map((doc) => enrichPublicReview(doc)));
  return {
    ok: true,
    status: 200,
    externalReviewsUrl: String(client?.config?.disboardReviews?.reviewUrl || client?.config?.reviewsUrl || "").trim(),
    staffers: [],
    reviews: {
      server: reviewKind === "server" ? serialized : [],
      staff: [],
      bot: reviewKind === "bot" ? serialized : [],
    },
    viewer,
  };
}

async function submitSiteReview(client, payload = {}) {
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

  const $set = {
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
    // Crea la val solo al primo passaggio ≥4 (nuova o upgrade). Gli edit non devono ripubblicarla.
    const crossedIntoEligible = nextRating >= 4 && (!existing || prevRating < 4);
    if (crossedIntoEligible) {
      await syncPersistentAutoValutazioniForMember(resolved.member, {
        allowCreate: true,
        createKeys: new Set(["recensione_sito_4_stelle"]),
        allowRemove: false,
        reviewUserIds: new Set([String(resolved.userId)]),
      }).catch((err) => {
        global.logger?.warn?.("[siteReviewsApi] staff auto valutazioni sync:", resolved.userId, err?.message || err);
      });
    } else if (existing && prevRating >= 4 && nextRating < 4) {
      await removeAutoValutazione(resolved.guild, resolved.userId, "recensione_sito_4_stelle").catch((err) => {
        global.logger?.warn?.("[siteReviewsApi] staff auto valutazioni on rating drop:", resolved.userId, err?.message || err);
      });
    }
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
    review:
      isPublicReviewKind(reviewKind)
        ? enrichPublicReviewDoc(nextDoc, new Map(), resolved.userId)
        : serializeReview(nextDoc, new Map()),
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
    reviewKind: { $in: ["server", "bot"] },
  };
  const deleted = await SiteDocument.findOneAndDelete(query).lean().catch(() => null);
  if (!deleted) {
    return { ok: false, status: 404, error: "review_not_found", message: "Recensione non trovata o non eliminabile." };
  }

  try {
    broadcastSiteReviewsChanged();
  } catch (_) {}

  if (String(deleted.reviewKind || "") === "server") {
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
      await removeAutoValutazione(resolved.guild, resolved.userId, "recensione_sito_4_stelle").catch((err) => {
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
    reviewKind: { $in: ["server", "bot"] },
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
  const likes = Array.isArray(review.likedUserIds) ? review.likedUserIds.map((x) => String(x)) : [];
  const has = likes.includes(uid);
  const updated = await SiteDocument.findOneAndUpdate(
    { docType: RV, _id: reviewId, guildId: resolved.guild.id, reviewKind: { $in: ["server", "bot"] } },
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
          openUrl: reviewNotifOpenUrl(reviewId, kind),
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
    reviewKind: { $in: ["server", "bot"] },
  })
    .select("_id reviewKind")
    .lean()
    .catch(() => null);
  if (!existing) {
    return { ok: false, status: 404, error: "review_not_found", message: "Recensione non trovata." };
  }

  const nextDoc = await SiteDocument.findOneAndUpdate(
    { docType: RV, _id: reviewId, guildId: resolved.guild.id, reviewKind: { $in: ["server", "bot"] } },
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
  const replyKind = String(nextDoc.reviewKind || existing.reviewKind || "server");
  if (reviewAuthorId && reviewAuthorId !== String(resolved.userId)) {
    try {
      await enqueueSiteInAppNotification({
        guildId: resolved.guild.id,
        userId: reviewAuthorId,
        title: "Risposta alla tua recensione",
        body:
          replyKind === "bot"
            ? "Lo staff ha pubblicato una risposta ufficiale alla tua recensione del bot."
            : "Lo staff ha pubblicato una risposta ufficiale alla tua recensione della community.",
        kind: "review",
        openUrl: reviewNotifOpenUrl(reviewId, replyKind),
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