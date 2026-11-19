const crypto = require("crypto") as typeof import("crypto");
const mongoose = require("mongoose") as typeof import("mongoose");
const { saveDiscussionImages, signDiscussionImageUrls } = require("./siteDiscussionImages") as typeof import("./siteDiscussionImages");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const { assertWebsiteStaffAccess, normalizeHeaderSecret, memberCanUseOpsStaffPages } = require("../staff/siteStaffAccessApi") as typeof import("../staff/siteStaffAccessApi");
const { resolveWebsiteGuildMember } = require("./siteRoleRequestApi") as typeof import("./siteRoleRequestApi");
const { broadcastSitePropositiChanged } = require("../suggestions/siteSuggestionsBroadcast") as typeof import("../suggestions/siteSuggestionsBroadcast");
const { enqueueSiteInAppNotification, removeSiteInAppNotificationsMatching } = require("../notifications/siteInAppNotificationsService") as typeof import("../notifications/siteInAppNotificationsService");
const { STAFF_ROLE_IDS } = require("../../Community/utils/staffListUtils") as typeof import("../../Community/utils/staffListUtils");
const { sendJsonWithEtag, weakEtagFromJson } = require("./siteHttpEtag") as typeof import("./siteHttpEtag");

const DOC = SITE_DOCUMENT_TYPE.PROPOSITI;
const MAX_CONTENT_LEN = 1500;
const MIN_CONTENT_LEN = 8;
const MAX_COMMENT_LEN = 1200;
const MIN_COMMENT_LEN = 2;
const MAX_COMMENTS = 80;
const LIST_LIMIT = 80;
const RATE_WINDOW_MS = 15 * 60 * 1000;
const RATE_MAX = 5;
const HIGH_STAFF_ROLE_ID = String(IDs?.roles?.HighStaff || "").trim();
const PM_ROLE_ID = String(IDs?.roles?.PartnerManager || "").trim();
const ANON_LABEL = "Anonimo";

/** In-memory only: opaque token hash → timestamps. Never persisted on Proposito docs. */
const rateBuckets = new Map();
let staffIdsCache = { guildId: "", expiresAt: 0, userIds: [] };

function opaqueRateKey(accessToken?) {
  return crypto.createHash("sha256").update(String(accessToken || "")).digest("hex").slice(0, 24);
}

function pruneRateBuckets(now?) {
  for (const [key, times] of rateBuckets) {
    const next = (Array.isArray(times) ? times : []).filter((t?) => Number(t) > now - RATE_WINDOW_MS);
    if (!next.length) rateBuckets.delete(key);
    else rateBuckets.set(key, next);
  }
  if (rateBuckets.size <= 800) return;
  const keys = [...rateBuckets.keys()];
  for (let i = 0; i < keys.length - 600; i += 1) rateBuckets.delete(keys[i]);
}

function claimRateLimit(accessToken?) {
  const now = Date.now();
  pruneRateBuckets(now);
  const key = opaqueRateKey(accessToken);
  const times = (rateBuckets.get(key) || []).filter((t?) => Number(t) > now - RATE_WINDOW_MS);
  if (times.length >= RATE_MAX) return false;
  times.push(now);
  rateBuckets.set(key, times);
  return true;
}

function sanitizeContent(value?, maxLen = MAX_CONTENT_LEN) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim()
    .slice(0, maxLen);
}

function memberIsHighStaff(member?) {
  if (!member || member.user?.bot) return false;
  return Boolean(HIGH_STAFF_ROLE_ID && member.roles?.cache?.has?.(HIGH_STAFF_ROLE_ID));
}

function memberDisplayName(member?) {
  return (
    String(member?.displayName || member?.user?.globalName || member?.user?.username || "Staff").trim() || "Staff"
  );
}

function memberAvatarUrl(member?) {
  try {
    if (typeof member?.displayAvatarURL === "function") {
      return String(member.displayAvatarURL({ size: 128, extension: "png", forceStatic: true }) || "").trim();
    }
  } catch (_) {}
  try {
    if (typeof member?.user?.displayAvatarURL === "function") {
      return String(member.user.displayAvatarURL({ size: 128, extension: "png", forceStatic: true }) || "").trim();
    }
  } catch (_) {}
  return "";
}

function memberUserId(member?) {
  return String(member?.id || member?.user?.id || "").trim();
}

function truthyFlag(value?) {
  if (value === true || value === 1) return true;
  const s = String(value == null ? "" : value)
    .trim()
    .toLowerCase();
  return s === "1" || s === "true" || s === "yes" || s === "on";
}

function clipNotifBody(text?, max = 280) {
  const s = String(text || "")
    .replace(/\s+/g, " ")
    .trim();
  if (!s) return "";
  return s.length > max ? `${s.slice(0, Math.max(1, max - 1))}…` : s;
}

function normalizeConfessionBoard(raw?) {
  const s = String(raw || "community")
    .trim()
    .toLowerCase();
  return s === "staff" ? "staff" : "community";
}

function confessionBoardOf(doc?) {
  const s = String(doc?.confessionBoard || "")
    .trim()
    .toLowerCase();
  if (s === "community") return "community";
  return "staff";
}

function boardListQuery(board?) {
  if (board === "community") {
    return { confessionBoard: "community" };
  }
  return {
    $or: [
      { confessionBoard: "staff" },
      { confessionBoard: { $exists: false } },
      { confessionBoard: null },
      { confessionBoard: "" },
    ],
  };
}

function boardFromRequest(req?) {
  const q = req.query?.board ?? req.body?.board;
  return normalizeConfessionBoard(q);
}

/** Rome parts — allineato a WebSite `isPropositiSeason` (28 dic 12 → 4 gen 00). */
function romeParts(now = new Date()) {
  try {
    const parts = new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Rome",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
      hour: "2-digit",
      hourCycle: "h23",
    }).formatToParts(now);
    return {
      y: Number(parts.find((p) => p.type === "year")?.value),
      m: Number(parts.find((p) => p.type === "month")?.value),
      d: Number(parts.find((p) => p.type === "day")?.value),
      h: Number(parts.find((p) => p.type === "hour")?.value),
    };
  } catch {
    return { y: now.getFullYear(), m: now.getMonth() + 1, d: now.getDate(), h: now.getHours() };
  }
}

function isPropositiSeasonRome(now = new Date()) {
  const { y, m, d, h } = romeParts(now);
  if (!y || !m || !d) return false;
  if (m === 12 && (d > 28 || (d === 28 && h >= 12))) return true;
  if (m === 1 && d >= 1 && d < 4) return true;
  return false;
}

function isPropositiForceEnv() {
  const env = String(process.env.VC_PROPOSITI_FORCE || process.env.WEBSITE_PROPOSITI_HTTP || "").trim().toLowerCase();
  return env === "1" || env === "true" || env === "yes" || env === "on";
}

/** Stagione aperta (calendario o force env) — write + lista live. */
function isPropositiSeason(now = new Date()) {
  if (isPropositiForceEnv()) return true;
  return isPropositiSeasonRome(now);
}

/** Calendario chiuso (ignora force): serve per burn + payload cerimonia. */
function isPropositiCalendarClosed(now = new Date()) {
  return !isPropositiSeasonRome(now);
}

/**
 * Finestra Capodanno appena chiusa (Rome): 28 dic 12:00 → 4 gen 00:00.
 * Solo i post creati lì dentro vengono bruciati — non i preview/test fuori stagione.
 */
function lastClosedPropositiWindow(now = new Date()) {
  const { y, m } = romeParts(now);
  /* Anno di chiusura (4 gen): in dic prima dell’apertura è ancora y (gen di quest’anno). */
  const endYear = m === 12 ? y : y;
  const startYear = endYear - 1;
  /* CET/CEST: Capodanno è UTC+1 → 28 dic 11:00 UTC, 3 gen 23:00 UTC. */
  const start = new Date(Date.UTC(startYear, 11, 28, 11, 0, 0));
  const end = new Date(Date.UTC(endYear, 0, 3, 23, 0, 0));
  return { start, end };
}

let burnInFlight = null;
/** Idempotente: fuori stagione marca i post della finestra Capodanno → soft_deleted + burnedAt. */
async function ensurePropositiBurned() {
  /* Non bruciare se force env (test) o se il calendario è ancora aperto. */
  if (!isPropositiCalendarClosed() || isPropositiForceEnv()) return { burned: false, count: 0 };
  if (burnInFlight) return burnInFlight;
  burnInFlight = (async () => {
    try {
      const now = new Date();
      const { start, end } = lastClosedPropositiWindow(now);
      const res = await SiteDocument.updateMany(
        {
          docType: DOC,
          status: { $nin: ["deleted", "archived"] },
          $or: [{ burnedAt: null }, { burnedAt: { $exists: false } }],
          createdAt: { $gte: start, $lt: end },
        },
        { $set: { status: "soft_deleted", burnedAt: now, decidedAt: now, staffReason: "Bruciati a Capodanno." } },
      );
      const count = Number(res?.modifiedCount || res?.nModified || 0);
      if (count > 0) broadcastSitePropositiChanged("burned");
      return { burned: count > 0, count };
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-propositi burn:", err);
      return { burned: false, count: 0 };
    } finally {
      burnInFlight = null;
    }
  })();
  return burnInFlight;
}

function propositiOpenUrl(id?) {
  const cid = String(id || "").trim();
  return cid ? `/propositi/#vc-prop-card-${cid}` : "/propositi/";
}

async function resolvePropositiViewer(client?, accessToken?) {
  const token = String(accessToken || "").trim();
  if (!token) {
    return {
      ok: false,
      member: null,
      userId: "",
      accessToken: "",
      canAccessStaffBoard: false,
      canModerate: false,
    };
  }
  const resolved = await resolveWebsiteGuildMember(client, token).catch(() => null);
  if (!resolved || !resolved.ok) {
    return {
      ok: false,
      member: null,
      userId: "",
      accessToken: token,
      canAccessStaffBoard: false,
      canModerate: false,
    };
  }
  const member = resolved.member;
  const userId = memberUserId(member);
  return {
    ok: true,
    member,
    userId,
    accessToken: token,
    canAccessStaffBoard: memberCanUseOpsStaffPages(member),
    canModerate: memberIsHighStaff(member),
  };
}

function normalizePropositoStatus(raw?) {
  const s = String(raw || "active")
    .trim()
    .toLowerCase();
  if (s === "resolved" || s === "risolto") return "resolved";
  /* Soft-delete stays visible in the feed (legacy "deleted" treated the same). */
  if (s === "soft_deleted" || s === "deleted" || s === "archived") return "soft_deleted";
  return "active";
}

function isAnonymousComment(c?) {
  if (!c) return false;
  if (c.anonymous === true) return true;
  const name = String(c.authorName || "").trim().toLowerCase();
  return name === "anonimo" && !String(c.authorAvatarUrl || "").trim();
}

function commentLikedIdsOf(c?) {
  return [...new Set((Array.isArray(c?.upvoterUserIds) ? c.upvoterUserIds : []).map((x?) => String(x || "").trim()).filter(Boolean))];
}

function publicComment(c?, viewerUserId?) {
  if (!c) return null;
  const content = String(c.content || "").trim();
  const imageUrls = signDiscussionImageUrls(c.imageUrls);
  if (!content && !imageUrls.length) return null;
  const anon = isAnonymousComment(c);
  const viewer = String(viewerUserId || "").trim();
  const ownerId = String(c.userId || "").trim();
  const likedUserIds = commentLikedIdsOf(c);
  const pid = c.parentCommentId ? String(c.parentCommentId) : "";
  return {
    id: String(c._id || ""),
    authorName: anon ? ANON_LABEL : String(c.authorName || "Staff").trim() || "Staff",
    authorAvatarUrl: anon ? "" : String(c.authorAvatarUrl || "").trim(),
    anonymous: anon,
    content,
    imageUrls,
    parentCommentId: pid && mongoose.isValidObjectId(pid) ? pid : null,
    createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : null,
    updatedAt: c.updatedAt ? new Date(c.updatedAt).toISOString() : null,
    likeCount: likedUserIds.length,
    likedByViewer: Boolean(viewer && likedUserIds.includes(viewer)),
    /* Never expose comment author id — only whether the viewer wrote it. */
    isMine: Boolean(ownerId && viewer && ownerId === viewer),
  };
}

function likedIdsOf(doc?) {
  return [...new Set((Array.isArray(doc?.likedUserIds) ? doc.likedUserIds : []).map((x?) => String(x || "").trim()).filter(Boolean))];
}

function publicItem(doc?, viewerUserId?) {
  const viewer = String(viewerUserId || "").trim();
  const comments = (Array.isArray(doc?.comments) ? doc.comments : []).map((c?) => publicComment(c, viewer)).filter(Boolean);
  const ownerId = String(doc?.userId || "").trim();
  const status = normalizePropositoStatus(doc?.status);
  const likedUserIds = likedIdsOf(doc);
  const anonymous = doc?.anonymous !== false;
  return {
    id: String(doc?._id || ""),
    content: String(doc?.content || ""),
    createdAt: doc?.createdAt ? new Date(doc.createdAt).toISOString() : null,
    status,
    staffReason: String(doc?.staffReason || "").trim(),
    decidedAt: doc?.decidedAt ? new Date(doc.decidedAt).toISOString() : null,
    comments,
    commentCount: comments.length,
    likeCount: likedUserIds.length,
    likedByViewer: Boolean(viewer && likedUserIds.includes(viewer)),
    board: confessionBoardOf(doc),
    anonymous,
    authorName: anonymous ? ANON_LABEL : String(doc?.authorName || "").trim() || ANON_LABEL,
    authorAvatarUrl: anonymous ? "" : String(doc?.authorAvatarUrl || "").trim(),
    burnedAt: doc?.burnedAt ? new Date(doc.burnedAt).toISOString() : null,
    /* Never expose ownerId — only whether the viewer wrote it. */
    isMine: Boolean(ownerId && viewer && ownerId === viewer),
  };
}

function findCommentIndex(comments?, commentId?) {
  const id = String(commentId || "").trim();
  if (!id) return -1;
  return (Array.isArray(comments) ? comments : []).findIndex((c?) => String(c?._id || "") === id);
}

async function loadActivePropositoDoc(id?) {
  const doc = await SiteDocument.findOne({ _id: id, docType: DOC });
  if (!doc) {
    return { ok: false, status: 404, error: "not_found", message: "Messaggio non trovato." };
  }
  const status = normalizePropositoStatus(doc.status);
  if (status !== "active") {
    return {
      ok: false,
      status: 400,
      error: "discussion_closed",
      message: "Discussione chiusa: non si possono modificare i commenti.",
    };
  }
  return { ok: true, doc, status };
}

const PROPOSITI_PUBLIC_SELECT = {
  content: 1,
  createdAt: 1,
  status: 1,
  comments: 1,
  userId: 1,
  staffReason: 1,
  decidedAt: 1,
  confessionBoard: 1,
  likedUserIds: 1,
  anonymous: 1,
  authorName: 1,
  authorAvatarUrl: 1,
  burnedAt: 1,
};

async function requireStaff(client?, req?, res?) {
  const accessToken = normalizeHeaderSecret(req.headers.authorization);
  const access = await assertWebsiteStaffAccess(client, accessToken, { req });
  if (!access.ok) {
    res.status(Number(access.status) || 401).json({
      ok: false,
      error: access.error || "unauthorized",
      message: access.message || "Accesso staff richiesto.",
    });
    return null;
  }
  if (!memberCanUseOpsStaffPages(access.member)) {
    res.status(403).json({
      ok: false,
      error: "forbidden",
      message: "I buoni propositi staff sono riservati allo staff operativo.",
    });
    return null;
  }
  return { accessToken, member: access.member, canModerate: memberIsHighStaff(access.member) };
}

async function getPropositiStaffUserIds(guild?) {
  const guildId = String(guild?.id || "").trim();
  if (!guildId) return [];
  if (staffIdsCache.guildId === guildId && staffIdsCache.expiresAt > Date.now()) {
    return Array.isArray(staffIdsCache.userIds) ? staffIdsCache.userIds : [];
  }
  try {
    const { ensureGuildMembersLoaded } = require("../staff/siteStaffRosterCache") as typeof import("../staff/siteStaffRosterCache");
    await ensureGuildMembersLoaded(guild);
  } catch (_) {}
  const ids = new Set();
  const roleIds = Array.isArray(STAFF_ROLE_IDS) ? STAFF_ROLE_IDS : [];
  for (const roleId of roleIds) {
    const rid = String(roleId || "").trim();
    if (!rid || (PM_ROLE_ID && rid === PM_ROLE_ID)) continue;
    const role = guild.roles.cache.get(rid) || (await guild.roles.fetch(rid).catch(() => null));
    if (!role?.members) continue;
    for (const member of role.members.values()) {
      if (!member || member.user?.bot) continue;
      if (!memberCanUseOpsStaffPages(member)) continue;
      ids.add(String(member.id));
    }
  }
  const userIds = [...ids];
  staffIdsCache = { guildId, expiresAt: Date.now() + 120_000, userIds };
  return userIds;
}

function collectDiscussionParticipantIds(doc?, { excludeUserId }: any = {}) {
  const ids = new Set();
  const ownerId = String(doc?.userId || "").trim();
  if (ownerId) ids.add(ownerId);
  for (const c of Array.isArray(doc?.comments) ? doc.comments : []) {
    const uid = String(c?.userId || "").trim();
    if (uid) ids.add(uid);
  }
  const exclude = String(excludeUserId || "").trim();
  if (exclude) ids.delete(exclude);
  return [...ids];
}

async function notifyStaffNewProposito(client?, doc?, actorUserId?) {
  try {
    const guildId = String(doc?.guildId || client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
    const guild = client?.guilds?.cache?.get?.(guildId) || (await client?.guilds?.fetch?.(guildId).catch(() => null));
    if (!guild) return;
    const cid = String(doc?._id || "").trim();
    if (!cid) return;
    const actor = String(actorUserId || "").trim();
    const recipients = (await getPropositiStaffUserIds(guild)).filter((uid?) => uid && uid !== actor);
    if (!recipients.length) return;
    const preview = clipNotifBody(doc.content, 220) || "Nuova proposito anonima.";
    await Promise.all(
      recipients.map((userId?) =>
        enqueueSiteInAppNotification({
          guildId,
          userId,
          title: "Nuova proposito",
          body: `È arrivata un proposito anonima: ${preview}`,
          kind: "propositi",
          channel: "inbox",
          openUrl: propositiOpenUrl(cid),
          dedupeKey: `propositi:new:${cid}:${userId}`,
          dedupeWindowMs: 86_400_000,
        }),
      ),
    );
  } catch (err) {
    global.logger?.warn?.("[WEBHOOK] site-propositi notify new:", err?.message || err);
  }
}

async function notifyPropositoDiscussion(client, doc, { actorUserId, actorLabel, content, anonymous }) {
  try {
    const guildId = String(doc?.guildId || client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
    if (!guildId) return;
    const cid = String(doc?._id || "").trim();
    if (!cid) return;
    const actor = String(actorUserId || "").trim();
    const who = anonymous ? ANON_LABEL : String(actorLabel || "Staff").trim() || "Staff";
    const preview = clipNotifBody(content, 280);
    const participants = collectDiscussionParticipantIds(doc, { excludeUserId: actor });
    if (!participants.length) return;
    const ownerId = String(doc?.userId || "").trim();
    /* propositiInboxCat1 */
    await Promise.all(
      participants.map((userId?) => {
        const isOwner = userId === ownerId;
        return enqueueSiteInAppNotification({
          guildId,
          userId,
          title: isOwner ? "Nuovo commento alla tuo proposito" : "Nuovo messaggio in discussione",
          body: isOwner
            ? `${who} ha commentato: ${preview}`
            : `${who} ha commentato in una discussione a cui partecipi: ${preview}`,
          kind: "propositi",
          channel: "inbox",
          openUrl: propositiOpenUrl(cid),
          dedupeKey: `propositi:comment:${cid}:${userId}:${String(doc.comments?.length || 0)}`,
          dedupeWindowMs: 30_000,
        });
      }),
    );
  } catch (err) {
    global.logger?.warn?.("[WEBHOOK] site-propositi notify comment:", err?.message || err);
  }
}

async function handleSitePropositiGet(client?, req?, res?) {
  try {
    const burn = await ensurePropositiBurned();
    const seasonOpen = isPropositiSeason();
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const viewerAuth = await resolvePropositiViewer(client, accessToken);
    const canAccessStaffBoard = Boolean(viewerAuth.canAccessStaffBoard);
    const viewerId = String(viewerAuth.userId || "").trim();
    const viewer = viewerAuth.ok
      ? {
          id: viewerId,
          canModerate: Boolean(viewerAuth.canModerate),
          canAccessStaffBoard,
        }
      : null;

    /* Unico feed pubblico (niente split community/staff). */
    const statusClause = {
      $or: [
        { status: "active" },
        { status: "resolved" },
        { status: "soft_deleted" },
        { status: "deleted" },
        { status: null },
        { status: { $exists: false } },
      ],
    };
    const liveClause = { $or: [{ burnedAt: null }, { burnedAt: { $exists: false } }] };
    const docs = await SiteDocument.find({
      docType: DOC,
      $and: [statusClause, liveClause],
    })
      .sort({ createdAt: -1 })
      .limit(LIST_LIMIT)
      .select(PROPOSITI_PUBLIC_SELECT)
      .lean();

    const items = (docs || []).map((d?) => publicItem(d, viewerId));

    /* Cerimonia first-visit: solo se calendario chiuso (anche con force env i live restano in items). */
    let burnedItems = [];
    if (isPropositiCalendarClosed()) {
      const burnedDocs = await SiteDocument.find({
        docType: DOC,
        $and: [statusClause, { burnedAt: { $ne: null } }],
      })
        .sort({ createdAt: -1 })
        .limit(LIST_LIMIT)
        .select(PROPOSITI_PUBLIC_SELECT)
        .lean();
      burnedItems = (burnedDocs || []).map((d?) => publicItem(d, viewerId));
    }

    const payload = {
      ok: true,
      board: "community",
      items,
      burnedItems,
      canAccessStaffBoard,
      canModerate: Boolean(viewerAuth.canModerate),
      seasonOpen,
      calendarClosed: isPropositiCalendarClosed(),
      burnedJustNow: Boolean(burn?.burned),
      seasonClosed: !seasonOpen,
      viewer,
      anonymity: {
        storesUserId: "private_owner_check_only",
        storesUsername: false,
        storesIp: false,
        storesToken: false,
        rateLimit: "opaque_short_lived_hash",
        commentsShowAuthor: true,
        anyoneCanCommentAnonymous: true,
        ownerIdPublic: false,
      },
    };
    return sendJsonWithEtag(req, res, payload, {
      status: 200,
      cacheControl: accessToken ? "private, max-age=15" : "public, max-age=20",
      etag: weakEtagFromJson(payload),
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-propositi get:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSitePropositiPost(client?, req?, res?) {
  try {
    await ensurePropositiBurned();

    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const viewerAuth = await resolvePropositiViewer(client, accessToken);
    if (!viewerAuth.ok || !viewerAuth.member) {
      return res.status(401).json({
        ok: false,
        error: "unauthorized",
        message: "Accedi con Discord per inviare un proposito.",
      });
    }

    /* Fuori stagione: solo High Staff (preview/test). Force env apre a tutti. */
    if (!isPropositiSeason() && !viewerAuth.canModerate) {
      return res.status(403).json({
        ok: false,
        error: "season_closed",
        message: "I buoni propositi sono chiusi. Torna a Capodanno.",
        seasonOpen: false,
      });
    }

    if (!claimRateLimit(viewerAuth.accessToken)) {
      return res.status(429).json({
        ok: false,
        error: "rate_limited",
        message: "Troppi messaggi. Riprova tra qualche minuto.",
      });
    }

    const content = sanitizeContent(req.body?.content ?? req.body?.text ?? req.body?.message);
    if (content.length < MIN_CONTENT_LEN) {
      return res.status(400).json({
        ok: false,
        error: "content_too_short",
        message: `Scrivi almeno ${MIN_CONTENT_LEN} caratteri.`,
      });
    }

    const anonymous = truthyFlag(req.body?.anonymous ?? true);
    const guildId = String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
    const ownerId = memberUserId(viewerAuth.member);
    const authorName = anonymous ? "" : memberDisplayName(viewerAuth.member);
    const authorAvatarUrl = anonymous ? "" : memberAvatarUrl(viewerAuth.member);

    const doc = await SiteDocument.create({
      docType: DOC,
      guildId,
      userId: ownerId || "",
      content,
      status: "active",
      confessionBoard: "community",
      createdBy: "site",
      anonymous,
      authorName,
      authorAvatarUrl,
      burnedAt: null,
      requesterId: "",
      ownerId: null,
      staffUserId: null,
      staffName: "",
      staffAvatarUrl: "",
      comments: [],
    });

    broadcastSitePropositiChanged("created");
    void notifyStaffNewProposito(client, doc, ownerId);

    return res.status(201).json({
      ok: true,
      item: publicItem(doc, ownerId),
      seasonOpen: true,
      message: "Proposito pubblicato.",
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-propositi post:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSitePropositiCommentPost(client?, req?, res?) {
  try {
    const auth = await requireStaff(client, req, res);
    if (!auth) return;

    const id = String(req.params?.id || "").trim();
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ ok: false, error: "invalid_id", message: "ID non valido." });
    }

    const content = sanitizeContent(req.body?.content ?? req.body?.text ?? req.body?.message, MAX_COMMENT_LEN);
    const wantImages = Array.isArray(req.body?.images) && req.body.images.length > 0;
    if (content.length < MIN_COMMENT_LEN && !wantImages) {
      return res.status(400).json({
        ok: false,
        error: "content_too_short",
        message: "Il commento è troppo breve.",
      });
    }

    const userId = memberUserId(auth.member);
    if (!userId) {
      return res.status(401).json({ ok: false, error: "unauthorized", message: "Accesso staff richiesto." });
    }

    const doc = await SiteDocument.findOne({
      _id: id,
      docType: DOC,
    });
    if (!doc) {
      return res.status(404).json({ ok: false, error: "not_found", message: "Messaggio non trovato." });
    }

    const status = normalizePropositoStatus(doc.status);
    if (status !== "active") {
      return res.status(400).json({
        ok: false,
        error: "discussion_closed",
        message: "Discussione chiusa: non si possono aggiungere commenti.",
      });
    }

    const comments = Array.isArray(doc.comments) ? doc.comments : [];
    if (comments.length >= MAX_COMMENTS) {
      return res.status(400).json({
        ok: false,
        error: "too_many_comments",
        message: "Troppi commenti su questo messaggio.",
      });
    }

    const wantAnonymous = truthyFlag(req.body?.anonymous ?? req.body?.anon);
    /* Anyone on staff can comment anonymously (not only the Proposito owner). */
    const anonymous = Boolean(wantAnonymous);
    const displayName = anonymous ? ANON_LABEL : memberDisplayName(auth.member);
    const displayAvatar = anonymous ? "" : memberAvatarUrl(auth.member);

    const rawParent = String(req.body?.parentCommentId || req.body?.parent || "").trim();
    let parentOid = null;
    if (rawParent) {
      if (!mongoose.isValidObjectId(rawParent)) {
        return res.status(400).json({ ok: false, error: "invalid_parent", message: "ID commento padre non valido." });
      }
      const parent = comments.find((x?) => String(x?._id || "") === rawParent);
      if (!parent) {
        return res.status(404).json({ ok: false, error: "parent_not_found", message: "Il commento a cui rispondi non esiste." });
      }
      /* replyToReply1: risposta a una risposta → stesso thread (root), niente 3° livello */
      const rootParentId = parent.parentCommentId ? String(parent.parentCommentId) : rawParent;
      if (!mongoose.isValidObjectId(rootParentId)) {
        return res.status(400).json({ ok: false, error: "invalid_parent", message: "ID commento padre non valido." });
      }
      parentOid = new mongoose.Types.ObjectId(rootParentId);
    }

    const imageUrls = wantImages ? await saveDiscussionImages("propositi", id, req.body.images) : [];
    if (wantImages && !imageUrls.length && content.length < MIN_COMMENT_LEN) {
      return res.status(400).json({ ok: false, error: "bad_image", message: "Immagine non valida o troppo grande (max 2,5 MB)." });
    }
    comments.push({
      userId,
      authorName: displayName,
      authorAvatarUrl: displayAvatar,
      anonymous,
      content,
      imageUrls,
      parentCommentId: parentOid,
      upvoterUserIds: [],
      downvoterUserIds: [],
    });
    (doc as any).comments = comments;
    doc.markModified("comments");
    await doc.save();

    broadcastSitePropositiChanged("commented");
    void notifyPropositoDiscussion(client, doc, {
      actorUserId: userId,
      actorLabel: displayName,
      content: content || "📷 Foto",
      anonymous,
    });

    return res.status(200).json({
      ok: true,
      item: publicItem(doc.toObject ? doc.toObject() : doc, userId),
      message: anonymous ? "Commento anonimo pubblicato." : "Commento pubblicato.",
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-propositi comment:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSitePropositiDeletePost(client?, req?, res?) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const viewerAuth = await resolvePropositiViewer(client, accessToken);
    if (!viewerAuth.ok || !viewerAuth.member) {
      return res.status(401).json({
        ok: false,
        error: "unauthorized",
        message: "Accedi con Discord per eliminare.",
      });
    }

    const id = String(req.params?.id || "").trim();
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ ok: false, error: "invalid_id", message: "ID non valido." });
    }

    const viewerId = String(viewerAuth.userId || memberUserId(viewerAuth.member) || "").trim();
    const existing: any = await SiteDocument.findOne({
      _id: id,
      docType: DOC,
    })
      .select({ userId: 1, status: 1 })
      .lean();

    if (!existing) {
      return res.status(404).json({ ok: false, error: "not_found", message: "Messaggio non trovato." });
    }

    const ownerId = String(existing.userId || "").trim();
    const isOwn = Boolean(ownerId && viewerId && ownerId === viewerId);
    if (!isOwn && !viewerAuth.canModerate) {
      return res.status(403).json({
        ok: false,
        error: "forbidden",
        message: "Puoi eliminare solo i tuoi messaggi (o moderare come High Staff).",
      });
    }

    const reason = isOwn
      ? sanitizeContent(req.body?.reason ?? "Eliminato dall’autore.", 1000) || "Eliminato dall’autore."
      : sanitizeContent(req.body?.reason ?? req.body?.staffReason ?? "", 1000);
    const updated = await SiteDocument.findOneAndUpdate(
      { _id: id, docType: DOC },
      {
        $set: {
          status: "soft_deleted",
          staffReason: reason,
          decidedAt: new Date(),
          staffUserId: isOwn ? null : viewerId || null,
        },
      },
      { new: true },
    )
      .select(PROPOSITI_PUBLIC_SELECT)
      .lean();

    if (!updated) {
      return res.status(404).json({ ok: false, error: "not_found", message: "Messaggio non trovato." });
    }

    void removeSiteInAppNotificationsMatching({
      prefixes: [`propositi:new:${id}:`, `propositi:comment:${id}:`],
      openUrls: [propositiOpenUrl(id)],
      kinds: ["propositi"],
      forceDismiss: true,
    }).catch(() => null);

    broadcastSitePropositiChanged("soft_deleted");

    return res.status(200).json({
      ok: true,
      softDeleted: true,
      item: publicItem(updated, viewerId),
      message: "Proposito eliminato (resta visibile).",
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-propositi delete:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSitePropositiResolvePost(client?, req?, res?) {
  try {
    const auth = await requireStaff(client, req, res);
    if (!auth) return;

    if (!auth.canModerate) {
      return res.status(403).json({
        ok: false,
        error: "forbidden",
        message: "Solo High Staff può segnare risolto.",
      });
    }

    const id = String(req.params?.id || "").trim();
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ ok: false, error: "invalid_id", message: "ID non valido." });
    }

    const viewerId = memberUserId(auth.member);
    const reason = sanitizeContent(req.body?.reason ?? req.body?.staffReason ?? "", 1000);
    const updated = await SiteDocument.findOneAndUpdate(
      { _id: id, docType: DOC },
      {
        $set: {
          status: "resolved",
          staffReason: reason,
          decidedAt: new Date(),
          staffUserId: viewerId || null,
        },
      },
      { new: true },
    )
      .select(PROPOSITI_PUBLIC_SELECT)
      .lean();

    if (!updated) {
      return res.status(404).json({ ok: false, error: "not_found", message: "Messaggio non trovato." });
    }

    /* smartNotifLifecycle1: resolve → via notif proposito (+ dismiss OS) */
    void removeSiteInAppNotificationsMatching({
      prefixes: [`propositi:new:${id}:`, `propositi:comment:${id}:`],
      openUrls: [propositiOpenUrl(id)],
      kinds: ["PROPOSITI"],
      forceDismiss: true,
    }).catch(() => null);

    broadcastSitePropositiChanged("resolved");
    return res.status(200).json({
      ok: true,
      item: publicItem(updated, viewerId),
      message: "proposito segnata come risolta.",
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-propositi resolve:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSitePropositiReopenPost(client?, req?, res?) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const viewerAuth = await resolvePropositiViewer(client, accessToken);
    if (!viewerAuth.ok || !viewerAuth.member) {
      return res.status(401).json({
        ok: false,
        error: "unauthorized",
        message: "Accedi con Discord per riaprire.",
      });
    }

    const id = String(req.params?.id || "").trim();
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ ok: false, error: "invalid_id", message: "ID non valido." });
    }

    const viewerId = String(viewerAuth.userId || memberUserId(viewerAuth.member) || "").trim();
    const existing: any = await SiteDocument.findOne({ _id: id, docType: DOC }).select({ userId: 1, status: 1 }).lean();
    if (!existing) {
      return res.status(404).json({ ok: false, error: "not_found", message: "Messaggio non trovato." });
    }
    const ownerId = String(existing.userId || "").trim();
    const isOwn = Boolean(ownerId && viewerId && ownerId === viewerId);
    if (!isOwn && !viewerAuth.canModerate) {
      return res.status(403).json({
        ok: false,
        error: "forbidden",
        message: "Puoi ripristinare solo i tuoi messaggi (o moderare come High Staff).",
      });
    }

    const updated = await SiteDocument.findOneAndUpdate(
      { _id: id, docType: DOC },
      {
        $set: {
          status: "active",
          staffReason: "",
          decidedAt: new Date(),
          staffUserId: isOwn ? null : viewerId || null,
        },
      },
      { new: true },
    )
      .select(PROPOSITI_PUBLIC_SELECT)
      .lean();

    if (!updated) {
      return res.status(404).json({ ok: false, error: "not_found", message: "Messaggio non trovato." });
    }

    broadcastSitePropositiChanged("reopened");
    return res.status(200).json({
      ok: true,
      item: publicItem(updated, viewerId),
      message: "proposito riaperta.",
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-propositi reopen:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSitePropositiCommentPatch(client?, req?, res?) {
  try {
    const auth = await requireStaff(client, req, res);
    if (!auth) return;

    const id = String(req.params?.id || "").trim();
    const commentId = String(req.params?.commentId || "").trim();
    if (!id || !mongoose.isValidObjectId(id) || !commentId || !mongoose.isValidObjectId(commentId)) {
      return res.status(400).json({ ok: false, error: "invalid_id", message: "ID non valido." });
    }

    const content = sanitizeContent(req.body?.content ?? req.body?.text ?? req.body?.message, MAX_COMMENT_LEN);
    if (content.length < MIN_COMMENT_LEN) {
      return res.status(400).json({
        ok: false,
        error: "content_too_short",
        message: "Il commento è troppo breve.",
      });
    }

    const userId = memberUserId(auth.member);
    if (!userId) {
      return res.status(401).json({ ok: false, error: "unauthorized", message: "Accesso staff richiesto." });
    }

    const loaded = await loadActivePropositoDoc(id);
    if (!loaded.ok) {
      return res.status(loaded.status).json({ ok: false, error: loaded.error, message: loaded.message });
    }

    const comments = Array.isArray(loaded.doc.comments) ? loaded.doc.comments : [];
    const idx = findCommentIndex(comments, commentId);
    if (idx < 0) {
      return res.status(404).json({ ok: false, error: "comment_not_found", message: "Commento non trovato." });
    }
    if (String(comments[idx].userId || "") !== userId) {
      return res.status(403).json({ ok: false, error: "forbidden", message: "Puoi modificare solo i tuoi commenti." });
    }

    comments[idx].content = content;
    (loaded.doc as any).comments = comments;
    loaded.doc.markModified("comments");
    await loaded.doc.save();

    broadcastSitePropositiChanged("comment_edited");
    return res.status(200).json({
      ok: true,
      item: publicItem(loaded.doc.toObject ? loaded.doc.toObject() : loaded.doc, userId),
      message: "Commento aggiornato.",
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-propositi comment patch:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSitePropositiCommentDelete(client?, req?, res?) {
  try {
    const auth = await requireStaff(client, req, res);
    if (!auth) return;

    const id = String(req.params?.id || "").trim();
    const commentId = String(req.params?.commentId || "").trim();
    if (!id || !mongoose.isValidObjectId(id) || !commentId || !mongoose.isValidObjectId(commentId)) {
      return res.status(400).json({ ok: false, error: "invalid_id", message: "ID non valido." });
    }

    const userId = memberUserId(auth.member);
    if (!userId) {
      return res.status(401).json({ ok: false, error: "unauthorized", message: "Accesso staff richiesto." });
    }

    const loaded = await loadActivePropositoDoc(id);
    if (!loaded.ok) {
      return res.status(loaded.status).json({ ok: false, error: loaded.error, message: loaded.message });
    }

    const comments = Array.isArray(loaded.doc.comments) ? loaded.doc.comments : [];
    const idx = findCommentIndex(comments, commentId);
    if (idx < 0) {
      return res.status(404).json({ ok: false, error: "comment_not_found", message: "Commento non trovato." });
    }

    const authorId = String(comments[idx].userId || "").trim();
    const isOwn = authorId === userId;
    if (!isOwn && !auth.canModerate) {
      return res.status(403).json({ ok: false, error: "forbidden", message: "Non puoi eliminare questo commento." });
    }

    const removeIds = new Set([commentId]);
    for (const c of comments) {
      if (String(c?.parentCommentId || "") === commentId) removeIds.add(String(c._id));
    }
    (loaded.doc as any).comments = comments.filter((c?) => !removeIds.has(String(c?._id || "")));
    loaded.doc.markModified("comments");
    await loaded.doc.save();

    broadcastSitePropositiChanged("comment_deleted");
    return res.status(200).json({
      ok: true,
      item: publicItem(loaded.doc.toObject ? loaded.doc.toObject() : loaded.doc, userId),
      message: "Commento eliminato.",
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-propositi comment delete:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSitePropositiCommentLikePost(client?, req?, res?) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const viewerAuth = await resolvePropositiViewer(client, accessToken);
    if (!viewerAuth.ok || !viewerAuth.member) {
      return res.status(401).json({
        ok: false,
        error: "unauthorized",
        message: "Accedi con Discord per mettere mi piace.",
      });
    }
    const viewerId = String(viewerAuth.userId || "").trim();
    if (!viewerId) {
      return res.status(401).json({ ok: false, error: "unauthorized", message: "Accedi con Discord per mettere mi piace." });
    }

    const id = String(req.params?.id || "").trim();
    const commentId = String(req.params?.commentId || "").trim();
    if (!id || !mongoose.isValidObjectId(id) || !commentId || !mongoose.isValidObjectId(commentId)) {
      return res.status(400).json({ ok: false, error: "invalid_id", message: "ID non valido." });
    }

    const doc = await SiteDocument.findOne({ _id: id, docType: DOC }).select(PROPOSITI_PUBLIC_SELECT);
    if (!doc) {
      return res.status(404).json({ ok: false, error: "not_found", message: "Messaggio non trovato." });
    }

    const comments = Array.isArray(doc.comments) ? doc.comments : [];
    const idx = findCommentIndex(comments, commentId);
    if (idx < 0) {
      return res.status(404).json({ ok: false, error: "comment_not_found", message: "Commento non trovato." });
    }

    const c = comments[idx];
    if (String(c.userId || "") === viewerId) {
      return res.status(403).json({
        ok: false,
        error: "cannot_like_own",
        message: "Non puoi mettere mi piace al tuo commento.",
      });
    }

    const likes = commentLikedIdsOf(c);
    const liked = likes.includes(viewerId);
    const next = liked ? likes.filter((x) => x !== viewerId) : [...likes, viewerId];
    c.upvoterUserIds = next;
    (doc as any).comments = comments;
    doc.markModified("comments");
    await doc.save();

    broadcastSitePropositiChanged(liked ? "comment_unliked" : "comment_liked");
    const item = publicItem(doc.toObject ? doc.toObject() : doc, viewerId);
    const pub = item.comments.find((x) => x.id === commentId) || null;
    return res.status(200).json({
      ok: true,
      item,
      liked: Boolean(pub?.likedByViewer),
      likeCount: Number(pub?.likeCount || 0),
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-propositi comment like:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSitePropositiLikePost(client?, req?, res?) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const viewerAuth = await resolvePropositiViewer(client, accessToken);
    if (!viewerAuth.ok || !viewerAuth.member) {
      return res.status(401).json({
        ok: false,
        error: "unauthorized",
        message: "Accedi con Discord per mettere mi piace.",
      });
    }
    const viewerId = String(viewerAuth.userId || "").trim();
    if (!viewerId) {
      return res.status(401).json({ ok: false, error: "unauthorized", message: "Accedi con Discord per mettere mi piace." });
    }

    const id = String(req.params?.id || "").trim();
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ ok: false, error: "invalid_id", message: "ID non valido." });
    }

    const doc = await SiteDocument.findOne({ _id: id, docType: DOC }).select(PROPOSITI_PUBLIC_SELECT);
    if (!doc) {
      return res.status(404).json({ ok: false, error: "not_found", message: "Messaggio non trovato." });
    }

    const ownerId = String(doc.userId || "").trim();
    if (ownerId && ownerId === viewerId) {
      return res.status(403).json({
        ok: false,
        error: "cannot_like_own",
        message: "Non puoi mettere mi piace al tuo proposito.",
      });
    }

    const likes = likedIdsOf(doc);
    const liked = likes.includes(viewerId);
    const next = liked ? likes.filter((x) => x !== viewerId) : [...likes, viewerId];
    (doc as any).likedUserIds = next;
    doc.markModified("likedUserIds");
    await doc.save();

    broadcastSitePropositiChanged(liked ? "unliked" : "liked");
    const item = publicItem(doc.toObject ? doc.toObject() : doc, viewerId);
    return res.status(200).json({
      ok: true,
      item,
      liked: item.likedByViewer,
      likeCount: item.likeCount,
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-propositi like:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

export = {
  handleSitePropositiGet,
  handleSitePropositiPost,
  handleSitePropositiCommentPost,
  handleSitePropositiCommentPatch,
  handleSitePropositiCommentDelete,
  handleSitePropositiCommentLikePost,
  handleSitePropositiDeletePost,
  handleSitePropositiResolvePost,
  handleSitePropositiReopenPost,
  handleSitePropositiLikePost,
};
