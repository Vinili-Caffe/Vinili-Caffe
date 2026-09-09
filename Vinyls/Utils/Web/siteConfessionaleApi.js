const crypto = require("crypto");
const mongoose = require("mongoose");
const IDs = require("../Config/ids");
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas");
const { assertWebsiteStaffAccess, normalizeHeaderSecret } = require("./siteStaffAccessApi");

const DOC = SITE_DOCUMENT_TYPE.CONFESSIONALE;
const MAX_CONTENT_LEN = 1500;
const MIN_CONTENT_LEN = 8;
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

function sanitizeContent(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .replace(/[\u0000-\u0008\u000B\u000C\u000E-\u001F]/g, "")
    .trim()
    .slice(0, MAX_CONTENT_LEN);
}

function memberIsHighStaff(member) {
  if (!member || member.user?.bot) return false;
  return Boolean(HIGH_STAFF_ROLE_ID && member.roles?.cache?.has?.(HIGH_STAFF_ROLE_ID));
}

function publicItem(doc) {
  return {
    id: String(doc?._id || ""),
    content: String(doc?.content || ""),
    createdAt: doc?.createdAt ? new Date(doc.createdAt).toISOString() : null,
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

    const docs = await SiteDocument.find({
      docType: DOC,
      $or: [{ status: "active" }, { status: null }, { status: { $exists: false } }],
    })
      .sort({ createdAt: -1 })
      .limit(LIST_LIMIT)
      .select({ content: 1, createdAt: 1, status: 1 })
      .lean();

    const items = (docs || [])
      .filter((d) => String(d?.status || "active") !== "deleted")
      .map(publicItem);

    return res.status(200).json({
      ok: true,
      items,
      canModerate: Boolean(auth.canModerate),
      anonymity: {
        storesUserId: false,
        storesUsername: false,
        storesIp: false,
        storesToken: false,
        rateLimit: "opaque_short_lived_hash",
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

    // Intentionally omit any staff identity. userId stays empty string (schema default).
    const doc = await SiteDocument.create({
      docType: DOC,
      guildId,
      userId: "",
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
    });

    return res.status(201).json({
      ok: true,
      item: publicItem(doc),
      message: "Messaggio inviato in anonimo.",
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-confessionale post:", err);
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

    const updated = await SiteDocument.findOneAndUpdate(
      { _id: id, docType: DOC, status: { $ne: "deleted" } },
      { $set: { status: "deleted", decidedAt: new Date() } },
      { new: true },
    )
      .select({ content: 1, createdAt: 1, status: 1 })
      .lean();

    if (!updated) {
      return res.status(404).json({ ok: false, error: "not_found", message: "Messaggio non trovato." });
    }

    return res.status(200).json({ ok: true, deleted: true, id });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-confessionale delete:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

module.exports = {
  handleSiteConfessionaleGet,
  handleSiteConfessionalePost,
  handleSiteConfessionaleDeletePost,
};
