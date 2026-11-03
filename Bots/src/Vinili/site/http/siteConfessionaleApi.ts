const crypto = require("crypto") as typeof import("crypto");
const mongoose = require("mongoose") as typeof import("mongoose");
const { saveDiscussionImages, signDiscussionImageUrls } = require("./siteDiscussionImages") as typeof import("./siteDiscussionImages");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const { assertWebsiteStaffAccess, normalizeHeaderSecret, memberCanUseOpsStaffPages } = require("../staff/siteStaffAccessApi") as typeof import("../staff/siteStaffAccessApi");
const { resolveWebsiteGuildMember } = require("./siteRoleRequestApi") as typeof import("./siteRoleRequestApi");
const { broadcastSiteConfessionaleChanged } = require("../suggestions/siteSuggestionsBroadcast") as typeof import("../suggestions/siteSuggestionsBroadcast");
const { enqueueSiteInAppNotification, removeSiteInAppNotificationsMatching } = require("../notifications/siteInAppNotificationsService") as typeof import("../notifications/siteInAppNotificationsService");
const { STAFF_ROLE_IDS } = require("../../Community/utils/staffListUtils") as typeof import("../../Community/utils/staffListUtils");
const { sendJsonWithEtag, weakEtagFromJson } = require("./siteHttpEtag") as typeof import("./siteHttpEtag");

const DOC = SITE_DOCUMENT_TYPE.CONFESSIONALE;
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

/** In-memory only: opaque token hash → timestamps. Never persisted on confession docs. */
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

function confessionaleOpenUrl(id?, board?) {
  const cid = String(id || "").trim();
  const b = normalizeConfessionBoard(board || "staff");
  if (!cid) {
    return b === "community" ? "/confessionale/" : "/confessionale/?board=staff";
  }
  return b === "community"
    ? `/confessionale/#vc-conf-card-${cid}`
    : `/confessionale/?board=staff#vc-conf-card-${cid}`;
}

async function resolveConfessionaleViewer(client?, accessToken?) {
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

function normalizeConfessionStatus(raw?) {
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

function publicComment(c?) {
  if (!c) return null;
  const content = String(c.content || "").trim();
  const imageUrls = signDiscussionImageUrls(c.imageUrls);
  if (!content && !imageUrls.length) return null;
  const anon = isAnonymousComment(c);
  return {
    id: String(c._id || ""),
    authorName: anon ? ANON_LABEL : String(c.authorName || "Staff").trim() || "Staff",
    authorAvatarUrl: anon ? "" : String(c.authorAvatarUrl || "").trim(),
    anonymous: anon,
    content,
    imageUrls,
    createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : null,
  };
}

function publicItem(doc?, viewerUserId?) {
  const comments = (Array.isArray(doc?.comments) ? doc.comments : []).map(publicComment).filter(Boolean);
  const ownerId = String(doc?.userId || "").trim();
  const viewer = String(viewerUserId || "").trim();
  const status = normalizeConfessionStatus(doc?.status);
  return {
    id: String(doc?._id || ""),
    content: String(doc?.content || ""),
    createdAt: doc?.createdAt ? new Date(doc.createdAt).toISOString() : null,
    status,
    staffReason: String(doc?.staffReason || "").trim(),
    decidedAt: doc?.decidedAt ? new Date(doc.decidedAt).toISOString() : null,
    comments,
    commentCount: comments.length,
    board: confessionBoardOf(doc),
    /* Never expose ownerId — only whether the viewer wrote it. */
    isMine: Boolean(ownerId && viewer && ownerId === viewer),
  };
}

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
      message: "Il Confessionale è riservato allo staff operativo.",
    });
    return null;
  }
  return { accessToken, member: access.member, canModerate: memberIsHighStaff(access.member) };
}

async function getConfessionaleStaffUserIds(guild?) {
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

async function notifyStaffNewConfession(client?, doc?, actorUserId?) {
  try {
    const guildId = String(doc?.guildId || client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
    const guild = client?.guilds?.cache?.get?.(guildId) || (await client?.guilds?.fetch?.(guildId).catch(() => null));
    if (!guild) return;
    const cid = String(doc?._id || "").trim();
    if (!cid) return;
    const actor = String(actorUserId || "").trim();
    const recipients = (await getConfessionaleStaffUserIds(guild)).filter((uid?) => uid && uid !== actor);
    if (!recipients.length) return;
    const preview = clipNotifBody(doc.content, 220) || "Nuova confessione anonima.";
    await Promise.all(
      recipients.map((userId?) =>
        enqueueSiteInAppNotification({
          guildId,
          userId,
          title: "Nuova confessione",
          body: `È arrivata una confessione anonima: ${preview}`,
          kind: "confessionale",
          channel: "inbox",
          openUrl: confessionaleOpenUrl(cid, confessionBoardOf(doc)),
          dedupeKey: `confessionale:new:${cid}:${userId}`,
          dedupeWindowMs: 86_400_000,
        }),
      ),
    );
  } catch (err) {
    global.logger?.warn?.("[WEBHOOK] site-confessionale notify new:", err?.message || err);
  }
}

async function notifyConfessionDiscussion(client, doc, { actorUserId, actorLabel, content, anonymous }) {
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
    /* confessionaleInboxCat1 */
    await Promise.all(
      participants.map((userId?) => {
        const isOwner = userId === ownerId;
        return enqueueSiteInAppNotification({
          guildId,
          userId,
          title: isOwner ? "Nuovo commento alla tua confessione" : "Nuovo messaggio in discussione",
          body: isOwner
            ? `${who} ha commentato: ${preview}`
            : `${who} ha commentato in una discussione a cui partecipi: ${preview}`,
          kind: "confessionale",
          channel: "inbox",
          openUrl: confessionaleOpenUrl(cid, confessionBoardOf(doc)),
          dedupeKey: `confessionale:comment:${cid}:${userId}:${String(doc.comments?.length || 0)}`,
          dedupeWindowMs: 30_000,
        });
      }),
    );
  } catch (err) {
    global.logger?.warn?.("[WEBHOOK] site-confessionale notify comment:", err?.message || err);
  }
}

async function handleSiteConfessionaleGet(client?, req?, res?) {
  try {
    const board = boardFromRequest(req);
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const viewerAuth = await resolveConfessionaleViewer(client, accessToken);
    const canAccessStaffBoard = Boolean(viewerAuth.canAccessStaffBoard);
    const viewerId = String(viewerAuth.userId || "").trim();
    const viewer = viewerAuth.ok
      ? {
          id: viewerId,
          canModerate: Boolean(viewerAuth.canModerate),
          canAccessStaffBoard,
        }
      : null;

    if (board === "staff" && !canAccessStaffBoard) {
      return res.status(403).json({
        ok: false,
        error: "forbidden",
        message: "Il Confessionale staff è riservato allo staff operativo.",
        board: "staff",
        canAccessStaffBoard: false,
        canModerate: false,
        viewer,
      });
    }

    /* Include active + resolved + soft_deleted (legacy deleted). */
    const docs = await SiteDocument.find({
      docType: DOC,
      ...boardListQuery(board),
      $or: [
        { status: "active" },
        { status: "resolved" },
        { status: "soft_deleted" },
        { status: "deleted" },
        { status: null },
        { status: { $exists: false } },
      ],
    })
      .sort({ createdAt: -1 })
      .limit(LIST_LIMIT)
      .select({
        content: 1,
        createdAt: 1,
        status: 1,
        comments: 1,
        userId: 1,
        staffReason: 1,
        decidedAt: 1,
        confessionBoard: 1,
      })
      .lean();

    const items = (docs || []).map((d?) => publicItem(d, viewerId));

    /* pageTune1: ETag/304 sulla lista confessionale */
    const payload = {
      ok: true,
      board,
      items,
      canAccessStaffBoard,
      canModerate: Boolean(viewerAuth.canModerate),
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
    global.logger?.error?.("[WEBHOOK] site-confessionale get:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteConfessionalePost(client?, req?, res?) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const viewerAuth = await resolveConfessionaleViewer(client, accessToken);
    if (!viewerAuth.ok || !viewerAuth.member) {
      return res.status(401).json({
        ok: false,
        error: "unauthorized",
        message: "Accedi con Discord per inviare una confessione.",
      });
    }

    const board = boardFromRequest(req);
    if (board === "staff" && !viewerAuth.canAccessStaffBoard) {
      return res.status(403).json({
        ok: false,
        error: "forbidden",
        message: "Il Confessionale staff è riservato allo staff operativo.",
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

    const guildId = String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
    const ownerId = memberUserId(viewerAuth.member);

    const doc = await SiteDocument.create({
      docType: DOC,
      guildId,
      userId: ownerId || "",
      content,
      status: "active",
      confessionBoard: board === "staff" ? "staff" : "community",
      createdBy: "site",
      authorName: "",
      authorAvatarUrl: "",
      requesterId: "",
      ownerId: null,
      staffUserId: null,
      staffName: "",
      staffAvatarUrl: "",
      comments: [],
    });

    broadcastSiteConfessionaleChanged("created");
    void notifyStaffNewConfession(client, doc, ownerId);

    return res.status(201).json({
      ok: true,
      item: publicItem(doc, ownerId),
      message: "Messaggio inviato in anonimo.",
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-confessionale post:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteConfessionaleCommentPost(client?, req?, res?) {
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

    const status = normalizeConfessionStatus(doc.status);
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
    /* Anyone on staff can comment anonymously (not only the confession owner). */
    const anonymous = Boolean(wantAnonymous);
    const displayName = anonymous ? ANON_LABEL : memberDisplayName(auth.member);
    const displayAvatar = anonymous ? "" : memberAvatarUrl(auth.member);

    const imageUrls = wantImages ? await saveDiscussionImages("confessionale", id, req.body.images) : [];
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
      parentCommentId: null,
      upvoterUserIds: [],
      downvoterUserIds: [],
    });
    (doc as any).comments = comments;
    doc.markModified("comments");
    await doc.save();

    broadcastSiteConfessionaleChanged("commented");
    void notifyConfessionDiscussion(client, doc, {
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
    global.logger?.error?.("[WEBHOOK] site-confessionale comment:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteConfessionaleDeletePost(client?, req?, res?) {
  try {
    const auth = await requireStaff(client, req, res);
    if (!auth) return;

    if (!auth.canModerate) {
      return res.status(403).json({
        ok: false,
        error: "forbidden",
        message: "Solo High Staff può eliminare i messaggi.",
      });
    }

    const id = String(req.params?.id || "").trim();
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ ok: false, error: "invalid_id", message: "ID non valido." });
    }

    const viewerId = memberUserId(auth.member);
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
    if (ownerId && viewerId && ownerId === viewerId) {
      return res.status(403).json({
        ok: false,
        error: "cannot_delete_own",
        message: "Non puoi eliminare la tua stessa confessione.",
      });
    }

    const reason = sanitizeContent(req.body?.reason ?? req.body?.staffReason ?? "", 1000);
    const updated = await SiteDocument.findOneAndUpdate(
      { _id: id, docType: DOC },
      {
        $set: {
          status: "soft_deleted",
          staffReason: reason,
          decidedAt: new Date(),
          staffUserId: viewerId || null,
        },
      },
      { new: true },
    )
      .select({ content: 1, createdAt: 1, status: 1, comments: 1, userId: 1, staffReason: 1, decidedAt: 1 })
      .lean();

    if (!updated) {
      return res.status(404).json({ ok: false, error: "not_found", message: "Messaggio non trovato." });
    }

    /* smartNotifLifecycle1: soft-delete → via notif confessione (+ dismiss OS) */
    void removeSiteInAppNotificationsMatching({
      prefixes: [`confessionale:new:${id}:`, `confessionale:comment:${id}:`],
      openUrls: [confessionaleOpenUrl(id), confessionaleOpenUrl(id, confessionBoardOf(updated))],
      kinds: ["confessionale"],
      forceDismiss: true,
    }).catch(() => null);

    broadcastSiteConfessionaleChanged("soft_deleted");

    return res.status(200).json({
      ok: true,
      softDeleted: true,
      item: publicItem(updated, viewerId),
      message: "Confessione eliminata (resta visibile).",
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-confessionale delete:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteConfessionaleResolvePost(client?, req?, res?) {
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
      .select({ content: 1, createdAt: 1, status: 1, comments: 1, userId: 1, staffReason: 1, decidedAt: 1 })
      .lean();

    if (!updated) {
      return res.status(404).json({ ok: false, error: "not_found", message: "Messaggio non trovato." });
    }

    /* smartNotifLifecycle1: resolve → via notif confessione (+ dismiss OS) */
    void removeSiteInAppNotificationsMatching({
      prefixes: [`confessionale:new:${id}:`, `confessionale:comment:${id}:`],
      openUrls: [confessionaleOpenUrl(id), confessionaleOpenUrl(id, confessionBoardOf(updated))],
      kinds: ["confessionale"],
      forceDismiss: true,
    }).catch(() => null);

    broadcastSiteConfessionaleChanged("resolved");
    return res.status(200).json({
      ok: true,
      item: publicItem(updated, viewerId),
      message: "Confessione segnata come risolta.",
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-confessionale resolve:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteConfessionaleReopenPost(client?, req?, res?) {
  try {
    const auth = await requireStaff(client, req, res);
    if (!auth) return;

    if (!auth.canModerate) {
      return res.status(403).json({
        ok: false,
        error: "forbidden",
        message: "Solo High Staff può riaprire.",
      });
    }

    const id = String(req.params?.id || "").trim();
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ ok: false, error: "invalid_id", message: "ID non valido." });
    }

    const viewerId = memberUserId(auth.member);
    const updated = await SiteDocument.findOneAndUpdate(
      { _id: id, docType: DOC },
      {
        $set: {
          status: "active",
          staffReason: "",
          decidedAt: new Date(),
          staffUserId: viewerId || null,
        },
      },
      { new: true },
    )
      .select({ content: 1, createdAt: 1, status: 1, comments: 1, userId: 1, staffReason: 1, decidedAt: 1 })
      .lean();

    if (!updated) {
      return res.status(404).json({ ok: false, error: "not_found", message: "Messaggio non trovato." });
    }

    broadcastSiteConfessionaleChanged("reopened");
    return res.status(200).json({
      ok: true,
      item: publicItem(updated, viewerId),
      message: "Confessione riaperta.",
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-confessionale reopen:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

export = {
  handleSiteConfessionaleGet,
  handleSiteConfessionalePost,
  handleSiteConfessionaleCommentPost,
  handleSiteConfessionaleDeletePost,
  handleSiteConfessionaleResolvePost,
  handleSiteConfessionaleReopenPost,
};
