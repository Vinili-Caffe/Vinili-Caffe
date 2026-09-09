const crypto = require("crypto");
const mongoose = require("mongoose");
const IDs = require("../Config/ids");
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas");
const { assertWebsiteStaffAccess, normalizeHeaderSecret } = require("./siteStaffAccessApi");
const { broadcastSiteConfessionaleChanged } = require("./siteSuggestionsBroadcast");

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

/** In-memory only: opaque token hash → timestamps. Never persisted on confession docs. */
const rateBuckets = new Map();

function opaqueRateKey(accessToken) {
  return crypto.createHash("sha256").update(String(accessToken || "")).digest("hex").slice(0, 24);
}

function pruneRateBuckets(now) {
  for (const [key, times] of rateBuckets) {
    const next = (Array.isArray(times) ? times : []).filter((t) => Number(t) > now - RATE_WINDOW_MS);
    if (!next.length) rateBuckets.delete(key);
    else rateBuckets.set(key, next);
  }
  if (rateBuckets.size <= 800) return;
  const keys = [...rateBuckets.keys()];
  for (let i = 0; i < keys.length - 600; i += 1) rateBuckets.delete(keys[i]);
}

function claimRateLimit(accessToken) {
  const now = Date.now();
  pruneRateBuckets(now);
  const key = opaqueRateKey(accessToken);
  const times = (rateBuckets.get(key) || []).filter((t) => Number(t) > now - RATE_WINDOW_MS);
  if (times.length >= RATE_MAX) return false;
  times.push(now);
  rateBuckets.set(key, times);
  return true;
}

function sanitizeContent(value, maxLen = MAX_CONTENT_LEN) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim()
    .slice(0, maxLen);
}

function memberIsHighStaff(member) {
  if (!member || member.user?.bot) return false;
  return Boolean(HIGH_STAFF_ROLE_ID && member.roles?.cache?.has?.(HIGH_STAFF_ROLE_ID));
}

function memberDisplayName(member) {
  return (
    String(member?.displayName || member?.user?.globalName || member?.user?.username || "Staff").trim() || "Staff"
  );
}

function memberAvatarUrl(member) {
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

function memberUserId(member) {
  return String(member?.id || member?.user?.id || "").trim();
}

function publicComment(c) {
  if (!c) return null;
  const content = String(c.content || "").trim();
  if (!content) return null;
  return {
    id: String(c._id || ""),
    authorName: String(c.authorName || "Staff").trim() || "Staff",
    authorAvatarUrl: String(c.authorAvatarUrl || "").trim(),
    content,
    createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : null,
  };
}

function publicItem(doc, viewerUserId) {
  const comments = (Array.isArray(doc?.comments) ? doc.comments : []).map(publicComment).filter(Boolean);
  const ownerId = String(doc?.userId || "").trim();
  const viewer = String(viewerUserId || "").trim();
  return {
    id: String(doc?._id || ""),
    content: String(doc?.content || ""),
    createdAt: doc?.createdAt ? new Date(doc.createdAt).toISOString() : null,
    comments,
    commentCount: comments.length,
    /* Never expose ownerId — only whether the viewer wrote it (for self-archive block). */
    isMine: Boolean(ownerId && viewer && ownerId === viewer),
  };
}

async function requireStaff(client, req, res) {
  const accessToken = normalizeHeaderSecret(req.headers.authorization);
  const access = await assertWebsiteStaffAccess(client, accessToken);
  if (!access.ok) {
    res.status(Number(access.status) || 401).json({
      ok: false,
      error: access.error || "unauthorized",
      message: access.message || "Accesso staff richiesto.",
    });
    return null;
  }
  return { accessToken, member: access.member, canModerate: memberIsHighStaff(access.member) };
}

async function handleSiteConfessionaleGet(client, req, res) {
  try {
    const auth = await requireStaff(client, req, res);
    if (!auth) return;

    const viewerId = memberUserId(auth.member);
    const docs = await SiteDocument.find({
      docType: DOC,
      $or: [{ status: "active" }, { status: null }, { status: { $exists: false } }],
    })
      .sort({ createdAt: -1 })
      .limit(LIST_LIMIT)
      .select({ content: 1, createdAt: 1, status: 1, comments: 1, userId: 1 })
      .lean();

    const items = (docs || [])
      .filter((d) => String(d?.status || "active") !== "deleted")
      .map((d) => publicItem(d, viewerId));

    return res.status(200).json({
      ok: true,
      items,
      canModerate: Boolean(auth.canModerate),
      anonymity: {
        storesUserId: "private_owner_check_only",
        storesUsername: false,
        storesIp: false,
        storesToken: false,
        rateLimit: "opaque_short_lived_hash",
        commentsShowAuthor: true,
        ownerIdPublic: false,
      },
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-confessionale get:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteConfessionalePost(client, req, res) {
  try {
    const auth = await requireStaff(client, req, res);
    if (!auth) return;

    if (!claimRateLimit(auth.accessToken)) {
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
    const ownerId = memberUserId(auth.member);

    // userId is private owner binding only (never returned in public payloads).
    const doc = await SiteDocument.create({
      docType: DOC,
      guildId,
      userId: ownerId || "",
      content,
      status: "active",
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

async function handleSiteConfessionaleCommentPost(client, req, res) {
  try {
    const auth = await requireStaff(client, req, res);
    if (!auth) return;

    const id = String(req.params?.id || "").trim();
    if (!id || !mongoose.isValidObjectId(id)) {
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

    const doc = await SiteDocument.findOne({
      _id: id,
      docType: DOC,
      status: { $ne: "deleted" },
    });
    if (!doc) {
      return res.status(404).json({ ok: false, error: "not_found", message: "Messaggio non trovato." });
    }

    const comments = Array.isArray(doc.comments) ? doc.comments : [];
    if (comments.length >= MAX_COMMENTS) {
      return res.status(400).json({
        ok: false,
        error: "too_many_comments",
        message: "Troppi commenti su questo messaggio.",
      });
    }

    comments.push({
      userId,
      authorName: memberDisplayName(auth.member),
      authorAvatarUrl: memberAvatarUrl(auth.member),
      content,
      parentCommentId: null,
      upvoterUserIds: [],
      downvoterUserIds: [],
    });
    doc.comments = comments;
    doc.markModified("comments");
    await doc.save();

    broadcastSiteConfessionaleChanged("commented");

    return res.status(200).json({
      ok: true,
      item: publicItem(doc.toObject ? doc.toObject() : doc, userId),
      message: "Commento pubblicato.",
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-confessionale comment:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteConfessionaleDeletePost(client, req, res) {
  try {
    const auth = await requireStaff(client, req, res);
    if (!auth) return;

    if (!auth.canModerate) {
      return res.status(403).json({
        ok: false,
        error: "forbidden",
        message: "Solo High Staff può archiviare i messaggi.",
      });
    }

    const id = String(req.params?.id || "").trim();
    if (!id || !mongoose.isValidObjectId(id)) {
      return res.status(400).json({ ok: false, error: "invalid_id", message: "ID non valido." });
    }

    const viewerId = memberUserId(auth.member);
    const existing = await SiteDocument.findOne({
      _id: id,
      docType: DOC,
      status: { $ne: "deleted" },
    })
      .select({ userId: 1 })
      .lean();

    if (!existing) {
      return res.status(404).json({ ok: false, error: "not_found", message: "Messaggio non trovato." });
    }

    const ownerId = String(existing.userId || "").trim();
    if (ownerId && viewerId && ownerId === viewerId) {
      return res.status(403).json({
        ok: false,
        error: "cannot_archive_own",
        message: "Non puoi archiviare la tua stessa confessione.",
      });
    }

    const updated = await SiteDocument.findOneAndUpdate(
      { _id: id, docType: DOC, status: { $ne: "deleted" } },
      { $set: { status: "deleted", decidedAt: new Date() } },
      { new: true },
    )
      .select({ content: 1, createdAt: 1, status: 1, comments: 1, userId: 1 })
      .lean();

    if (!updated) {
      return res.status(404).json({ ok: false, error: "not_found", message: "Messaggio non trovato." });
    }

    broadcastSiteConfessionaleChanged("archived");

    return res.status(200).json({ ok: true, deleted: true, id });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-confessionale delete:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

module.exports = {
  handleSiteConfessionaleGet,
  handleSiteConfessionalePost,
  handleSiteConfessionaleCommentPost,
  handleSiteConfessionaleDeletePost,
};
