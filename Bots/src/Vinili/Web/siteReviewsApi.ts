const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const mongoose = require("mongoose") as typeof import("mongoose");
const IDs = require("../Utils/Config/ids") as typeof import("../Utils/Config/ids");
const { SiteDocument, ActivityUserProfile, SITE_DOCUMENT_TYPE } = require("../Schemas/Community/communitySchemas") as typeof import("../Schemas/Community/communitySchemas");

const RV = SITE_DOCUMENT_TYPE.REVIEW;
const { enqueueSiteInAppNotification } = require("../features/notifications/siteInAppNotificationsService") as typeof import("../features/notifications/siteInAppNotificationsService");
const { broadcastSiteReviewsChanged } = require("../features/suggestions/siteSuggestionsBroadcast") as typeof import("../features/suggestions/siteSuggestionsBroadcast");
const { resolveWebsiteGuildMember } = require("./siteRoleRequestApi") as typeof import("./siteRoleRequestApi");
const { getLevelInfo, getTotalExpForLevel, addExpWithLevel } = require("../Services/Community/expService") as typeof import("../Services/Community/expService");
const { syncPersistentAutoValutazioniForMember, removeAutoValutazione } = require("../Services/Staff/staffAutoValutazioniService") as typeof import("../Services/Staff/staffAutoValutazioniService");
const {
  userAvatarUrlDynamic,
  guildMemberDisplayAvatarUrlDynamic,
  guildMemberDisplayAvatarUrlStatic,
  memberDisplayName,
} = require("../Utils/Discord/guildDiscordIdentity") as typeof import("../Utils/Discord/guildDiscordIdentity");
const {
  applyLiveAvatarToSuggestionLike,
  resolveSiteAvatarUrl,
} = require("./siteLiveAvatars") as typeof import("./siteLiveAvatars");
const { TENANT_EMBED_COLOR } = require("../MultiGuild/utils/tenantEmbedBranding") as typeof import("../MultiGuild/utils/tenantEmbedBranding");

/* boardsImportSiteServerReviews1: lazy require evita cicli con siteBoardsApi */
function mirrorSiteServerReviewToBoard(doc?) {
  try {
    const api = require("../features/boards/siteBoardsApi") as typeof import("../features/boards/siteBoardsApi");
    return Promise.resolve(api.syncSiteServerReviewToMainBoardListing(doc)).catch(() => null);
  } catch (_) {
    return Promise.resolve(null);
  }
}
function unmirrorSiteServerReviewFromBoard(userId?) {
  try {
    const api = require("../features/boards/siteBoardsApi") as typeof import("../features/boards/siteBoardsApi");
    return Promise.resolve(api.removeSiteServerReviewFromMainBoardListing(userId)).catch(() => null);
  } catch (_) {
    return Promise.resolve(null);
  }
}

const STAFF_ROLE_ID = String(IDs?.roles?.Staff || "").trim();
const ADMIN_ROLE_ID = String(IDs?.roles?.Admin || "").trim();
const HIGH_STAFF_ROLE_ID = String(IDs?.roles?.HighStaff || "").trim();
const FALLBACK_REVIEW_CHANNEL_ID = String(IDs?.channels?.supporters || "").trim();
const STAFF_CACHE_TTL_MS = 2 * 60 * 1000;
const REVIEW_REWARD_LEVELS = 5;
/** Public review list (avatars/names) — short TTL; viewer likes applied per request. */
const PUBLIC_REVIEWS_CACHE_TTL_MS = Math.max(
  8_000,
  Number(process.env.VC_SITE_REVIEWS_LIST_CACHE_MS || 20_000) || 20_000,
);
const publicReviewsListCache = new Map();
/** Bumped on invalidate so in-flight list builders cannot re-poison TTL cache after a like. */
let publicReviewsCacheGen = 0;

let staffCache = {
  guildId: "",
  expiresAt: 0,
  list: [],
  ids: new Set(),
};

function publicReviewsCacheKey(guildId?, reviewKind?) {
  return `${String(guildId || "").trim()}:${String(reviewKind || "server").trim()}`;
}

function invalidatePublicReviewsListCache(guildId = "") {
  publicReviewsCacheGen += 1;
  const gid = String(guildId || "").trim();
  if (!gid) {
    publicReviewsListCache.clear();
    return;
  }
  for (const key of [...publicReviewsListCache.keys()]) {
    if (key.startsWith(`${gid}:`)) publicReviewsListCache.delete(key);
  }
}

function readPublicReviewsListCache(guildId?, reviewKind?) {
  const key = publicReviewsCacheKey(guildId, reviewKind);
  const hit = publicReviewsListCache.get(key);
  if (!hit || Number(hit.expiresAt || 0) <= Date.now()) {
    if (hit) publicReviewsListCache.delete(key);
    return null;
  }
  return Array.isArray(hit.items) ? hit.items : null;
}

function writePublicReviewsListCache(guildId?, reviewKind?, items?) {
  publicReviewsListCache.set(publicReviewsCacheKey(guildId, reviewKind), {
    expiresAt: Date.now() + PUBLIC_REVIEWS_CACHE_TTL_MS,
    items: Array.isArray(items) ? items : [],
  });
}

function applyViewerLikesToReviews(list?, viewerUserId?) {
  const uid = String(viewerUserId || "").trim();
  return (Array.isArray(list) ? list : []).map((entry?) => {
    if (!entry || typeof entry !== "object") return entry;
    const likes = Array.isArray(entry._likedUserIds) ? entry._likedUserIds.map(String) : [];
    const next = { ...entry };
    delete next._likedUserIds;
    next.likeCount = likes.length;
    next.likedByViewer = Boolean(uid && likes.includes(uid));
    return next;
  });
}
let highStaffCache = {
  guildId: "",
  expiresAt: 0,
  userIds: [],
};

function resolveGuildId(client?) {
  return String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
}

function normalizeRating(value?) {
  const n = Math.round(Number(value) || 0);
  return Math.max(1, Math.min(5, n));
}

function sanitizeContent(value?) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .slice(0, 1200);
}

function sanitizeReplyContent(value?) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .slice(0, 800);
}

function memberCanReplyAsServer(member?) {
  if (!member || member.user?.bot) return false;
  const hasRole = (id?) => {
    const v = String(id || "").trim();
    return Boolean(v && member.roles?.cache?.has?.(v));
  };
  if (hasRole(ADMIN_ROLE_ID)) return true;
  if (hasRole(HIGH_STAFF_ROLE_ID)) return true;
  try {
    if (String(member.guild?.ownerId || "") === String(member.id)) return true;
  } catch (_) {
      }
  return false;
}

function displayNameForMember(member?) {
    return memberDisplayName(member) || "Utente";
}

async function resolveGuild(client?) {
  const guildId = resolveGuildId(client);
  if (!guildId) return null;
  return client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
}

async function getStaffTargets(client?, guild?) {
  const guildId = String(guild?.id || "").trim();
  if (
    guildId &&
    staffCache.guildId === guildId &&
    staffCache.expiresAt > Date.now() &&
    Array.isArray(staffCache.list)
  ) {
    return staffCache;
  }

  if (!guild || (!STAFF_ROLE_ID && !HIGH_STAFF_ROLE_ID)) {
    staffCache = { guildId, expiresAt: Date.now() + STAFF_CACHE_TTL_MS, list: [], ids: new Set() };
    return staffCache;
  }

  try {
    const { ensureGuildMembersLoaded } = require("../features/staff/siteStaffRosterCache") as typeof import("../features/staff/siteStaffRosterCache");
    await ensureGuildMembersLoaded(guild);
  } catch (_) {}
  const byId = new Map();
  const roleIds = [STAFF_ROLE_ID, HIGH_STAFF_ROLE_ID].filter(Boolean);
  for (const roleId of roleIds) {
    const role = guild.roles.cache.get(roleId) || (await guild.roles.fetch(roleId).catch(() => null));
    const members = role ? Array.from(role.members.values()) : [];
    for (const member of members) {
      if (!member || (member as any).user?.bot) continue;
      const id = String((member as any).id);
      if (byId.has(id)) continue;
      byId.set(id, {
        id,
        name: displayNameForMember(member),
        avatarUrl:
          resolveSiteAvatarUrl(guild, (member as any).id, "", { size: 128, preferAnimated: true }) || "",
      });
    }
  }
  const list = Array.from(byId.values()).sort((a?, b?) =>
    a.name.localeCompare(b.name, "it", { sensitivity: "base" }),
  );
  const ids = new Set(list.map((entry?) => entry.id));
  staffCache = { guildId, expiresAt: Date.now() + STAFF_CACHE_TTL_MS, list, ids };
  return staffCache;
}

async function getHighStaffUserIds(guild?) {
  const guildId = String(guild?.id || "").trim();
  if (guildId && highStaffCache.guildId === guildId && highStaffCache.expiresAt > Date.now()) {
    return Array.isArray(highStaffCache.userIds) ? highStaffCache.userIds : [];
  }
  if (!guild || !HIGH_STAFF_ROLE_ID) {
    highStaffCache = { guildId, expiresAt: Date.now() + STAFF_CACHE_TTL_MS, userIds: [] };
    return [];
  }
  try {
    const { ensureGuildMembersLoaded } = require("../features/staff/siteStaffRosterCache") as typeof import("../features/staff/siteStaffRosterCache");
    await ensureGuildMembersLoaded(guild);
  } catch (_) {}
  const role = guild.roles.cache.get(HIGH_STAFF_ROLE_ID) || (await guild.roles.fetch(HIGH_STAFF_ROLE_ID).catch(() => null));
  const userIds = role
    ? Array.from(role.members.values())
        .filter((member?: any) => member && !member.user?.bot)
        .map((member?: any) => String(member.id))
    : [];
  highStaffCache = { guildId, expiresAt: Date.now() + STAFF_CACHE_TTL_MS, userIds };
  return userIds;
}

function normalizeContentLang(value?) {
  const raw = String(value || "").trim().toLowerCase();
  if (raw === "en" || raw.indexOf("en-") === 0) return "en";
  return "it";
}

function isPublicReviewKind(kind?) {
  const k = String(kind || "").trim().toLowerCase();
  return k === "server" || k === "bot" || k === "staff";
}

function memberHasStaffOrHighStaffRole(member?) {
  if (!member?.roles?.cache) return false;
  if (STAFF_ROLE_ID && member.roles.cache.has(STAFF_ROLE_ID)) return true;
  if (HIGH_STAFF_ROLE_ID && member.roles.cache.has(HIGH_STAFF_ROLE_ID)) return true;
  return false;
}

function memberCanAccessStaffReviews(_member?) {
  // Tab Staff pubblica: leggibile da tutti (come recensioni server).
  return true;
}

function memberCanWriteStaffReview(member?) {
  // Solo membri non-staff: staff/HS non recensiscono se stessi né altri staff/HS.
  if (!member?.roles?.cache) return false;
  return !memberHasStaffOrHighStaffRole(member);
}

function reviewPagePathForKind(kind?) {
  return String(kind || "").trim().toLowerCase() === "bot" ? "/dashboard/recensioni/" : "/recensioni";
}

function reviewNotifOpenUrl(reviewId?, kind?, opts: Record<string, any> = {}) {
  const id = String(reviewId || "").trim();
  const base = reviewPagePathForKind(kind);
  const k = String(kind || "").trim().toLowerCase();
  const hash = id ? `#vc-review-${id}` : "";
  if (k === "staff") {
    const params = new URLSearchParams({ board: "staff" });
    const staffer = String(opts.stafferId || "").trim();
    if (/^\d{5,32}$/.test(staffer)) params.set("staffer", staffer);
    return `${base}?${params.toString()}${hash}`;
  }
  return id ? `${base}${hash}` : base;
}

async function notifyHighStaffNewReview(guild?, review?, authorName?) {
  const rid = String(review?._id || "").trim();
  const kind = String(review?.reviewKind || "server");
  /* staffReviewTargetOnly1: recensioni staff → solo lo staffer recensito
     (notifyReviewedStafferNewReview), niente broadcast High Staff. */
  if (kind === "staff") return;
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
        channel: "inbox",
        openUrl: reviewNotifOpenUrl(rid, kind),
        dedupeKey: `rev-new:${rid}:${userId}`,
        dedupeWindowMs: 86_400_000,
      });
    } catch (_) {}
  }
}

/** reviewsStaffReply1: the reviewed staffer gets an Inbox ping for their own review. */
async function notifyReviewedStafferNewReview(guild?, review?, authorName?) {
  const rid = String(review?._id || "").trim();
  const kind = String(review?.reviewKind || "").trim().toLowerCase();
  if (kind !== "staff") return;
  const staffUserId = String(review?.staffUserId || "").trim();
  if (!staffUserId || !/^\d{5,32}$/.test(staffUserId)) return;
  try {
    await enqueueSiteInAppNotification({
      guildId: guild.id,
      userId: staffUserId,
      title: "Nuova recensione su di te",
      body: `${authorName || "Un utente"} ti ha lasciato una recensione.`,
      kind: "review",
      channel: "inbox",
      openUrl: reviewNotifOpenUrl(rid, "staff", { stafferId: staffUserId }),
      dedupeKey: `rev-staff-target:${rid}`,
      dedupeWindowMs: 86_400_000,
    });
  } catch (_) {}
}

/* exStaffReviewsPurge1: le recensioni di chi non è più staff (depex o uscito) si cancellano.
   Ogni staffer è ricontrollato su Discord uno per uno: un elenco membri incompleto non cancella niente. */
let exStaffSweepTimer = null;
let exStaffSweepRunning = false;

async function stafferStillStaff(guild?, userId?) {
  const m = await guild.members.fetch({ user: userId, force: true }).catch((err?) => (err?.code === 10007 ? false : null));
  if (m === null) return true; // Discord non ha risposto: nel dubbio si tiene
  if (m === false) return false; // non è più nel server
  return [STAFF_ROLE_ID, HIGH_STAFF_ROLE_ID].filter(Boolean).some((r?) => m.roles.cache.has(r));
}

async function purgeExStaffReviews(client?) {
  if (exStaffSweepRunning || (!STAFF_ROLE_ID && !HIGH_STAFF_ROLE_ID)) return { removed: 0 };
  exStaffSweepRunning = true;
  try {
    const guild = await resolveGuild(client);
    if (!guild) return { removed: 0 };
    const ids = await SiteDocument.distinct("staffUserId", { docType: RV, guildId: guild.id, reviewKind: "staff" }).catch(() => []);
    let removed = 0;
    for (const raw of ids) {
      const uid = String(raw || "").trim();
      if (!/^\d{5,32}$/.test(uid)) continue;
      if (await stafferStillStaff(guild, uid)) continue;
      const res = await SiteDocument.deleteMany({ docType: RV, guildId: guild.id, reviewKind: "staff", staffUserId: uid }).catch(() => null);
      const n = Number(res?.deletedCount || 0);
      if (n) removed += n;
    }
    if (removed) {
      invalidatePublicReviewsListCache(guild.id);
      try {
        broadcastSiteReviewsChanged();
      } catch (_) {}
    }
    return { removed };
  } finally {
    exStaffSweepRunning = false;
  }
}

/** Da chiamare quando qualcuno perde lo staff o esce: aspetta un attimo (i ruoli si assestano) e pulisce. */
function scheduleExStaffReviewsPurge(client?, delayMs = 20_000) {
  if (exStaffSweepTimer) clearTimeout(exStaffSweepTimer);
  exStaffSweepTimer = setTimeout(() => {
    exStaffSweepTimer = null;
    purgeExStaffReviews(client).catch((err?) => global.logger?.warn?.("[siteReviewsApi] purge ex staff:", err?.message || err));
  }, delayMs);
  exStaffSweepTimer.unref?.();
}

async function cleanupOrphanStaffReviews(client?, guild?) {
  /* reviewsStaffOrphanSafe1: never delete on read — incomplete Discord roster
     used to wipe staff reviews ($nin / empty ids). Keep docs; UI still lists them. */
  return getStaffTargets(client, guild);
}

function serializeReview(doc?, staffMap?) {
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

function sortSerializedReviewsNewestFirst(list?) {
  return (Array.isArray(list) ? list.slice() : []).sort((a?, b?) => {
    const ta = Number(a?.createdAtMs || 0);
    const tb = Number(b?.createdAtMs || 0);
    if (tb !== ta) return tb - ta;
    return String(b?.id || "").localeCompare(String(a?.id || ""));
  });
}

function enrichServerReviewDoc(doc?, staffMap?, viewerUserId?) {
  const base: any = serializeReview(doc, staffMap);
  const likes = Array.isArray(doc.likedUserIds) ? doc.likedUserIds.map((x?) => String(x)) : [];
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

function enrichPublicReviewDoc(doc?, staffMap?, viewerUserId?) {
  return enrichServerReviewDoc(doc, staffMap, viewerUserId);
}

function computeExpForLevelReward(currentExp?, levelsToAdd?) {
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

async function awardServerReviewLevels(client?, guild?, member?) {
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

async function announceServerReview(client?, guild?, authorMember?, review?, rewardInfo?) {
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

  const cacheGenAtStart = publicReviewsCacheGen;
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
        if (cacheGenAtStart === publicReviewsCacheGen) {
          writePublicReviewsListCache(guild.id, reviewKind, cachedBase);
        }
      }),
    );
  }

  if (afterResolveTasks.length) await Promise.all(afterResolveTasks);

  if (cacheGenAtStart !== publicReviewsCacheGen) {
    const hit = readPublicReviewsListCache(guild.id, reviewKind);
    if (hit) {
      cachedBase = hit;
    } else {
      const freshDocs = await SiteDocument.find({ docType: RV, guildId: guild.id, reviewKind })
        .sort({ createdAt: -1, _id: -1 })
        .limit(reviewKind === "bot" ? 120 : reviewKind === "staff" ? 100 : 80)
        .lean()
        .catch(() => []);
      const rebuildGen = publicReviewsCacheGen;
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
      if (rebuildGen === publicReviewsCacheGen) {
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
  purgeExStaffReviews,
  scheduleExStaffReviewsPurge,
};