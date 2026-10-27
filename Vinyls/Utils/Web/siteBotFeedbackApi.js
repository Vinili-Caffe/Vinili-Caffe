const fs = require("node:fs");
const path = require("node:path");
const crypto = require("node:crypto");
const mongoose = require("mongoose");
const IDs = require("../Config/ids");
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas");
const { resolveWebsiteGuildMember } = require("./siteRoleRequestApi");
const { normalizeHeaderSecret } = require("./siteStaffAccessApi");
const { guildMemberDisplayAvatarUrlDynamic, guildMemberDisplayAvatarUrlStatic } = require("../Discord/guildDiscordIdentity");
const { enqueueSiteInAppNotification } = require("./siteInAppNotificationsService");
const { recordTenantBugReport } = require("../../Services/Partner/tenantObjectiveService");
const {
  applyLiveAvatarToSuggestionLike,
  collectUserIdsFromSuggestionLikeDocs,
  prefetchGuildMembersForIds,
  prefetchUsersForIds,
  resolveSiteAvatarUrl,
} = require("./siteLiveAvatars");

const BF = SITE_DOCUMENT_TYPE.BOT_FEEDBACK;
const HIGH_STAFF_ROLE_ID = String(IDs?.roles?.HighStaff || "").trim();
const MAX_CONTENT_LEN = 2000;
const MAX_COMMENT_LEN = 1200;
const MAX_COMMENTS = 150;
const LIST_LIMIT = 60;
const MAX_IMAGES = 4;
const MAX_IMAGE_BYTES = 2.5 * 1024 * 1024;
const ALLOWED_IMAGE_MIME = new Set(["image/png", "image/jpeg", "image/jpg", "image/webp", "image/gif"]);
const UPLOAD_ROOT = path.resolve(__dirname, "../../../Data/uploads/bot-feedback");
const FEEDBACK_FILE_TOKEN_TTL_MS = 4 * 60 * 60 * 1000;

function feedbackFileAccessSecret() {
  return String(process.env.VC_SITE_UPLOAD_FILE_SECRET || process.env.SITE_WEBHOOK_SECRET || "").trim();
}

function createFeedbackFileAccessToken(feedbackId, fileName) {
  const fid = String(feedbackId || "").trim();
  const name = String(fileName || "").trim();
  if (!fid || !name) return "";
  const exp = Date.now() + FEEDBACK_FILE_TOKEN_TTL_MS;
  const payload = `${fid}:${name}:${exp}`;
  const sig = crypto.createHmac("sha256", feedbackFileAccessSecret()).update(payload).digest("base64url");
  return Buffer.from(`${payload}:${sig}`).toString("base64url");
}

function verifyFeedbackFileAccessToken(st, feedbackId, fileName) {
  try {
    const fid = String(feedbackId || "").trim();
    const name = String(fileName || "").trim();
    const raw = Buffer.from(String(st || ""), "base64url").toString("utf8");
    const parts = raw.split(":");
    if (parts.length !== 4) return false;
    const [tokenFid, tokenName, expStr, sig] = parts;
    if (tokenFid !== fid || tokenName !== name) return false;
    const exp = Number(expStr);
    if (!Number.isFinite(exp) || Date.now() > exp) return false;
    const payload = `${tokenFid}:${tokenName}:${expStr}`;
    const expect = crypto.createHmac("sha256", feedbackFileAccessSecret()).update(payload).digest("base64url");
    return sig === expect;
  } catch (_) {
    return false;
  }
}

function withFeedbackFileAccessToken(feedbackId, rawUrl) {
  const url = String(rawUrl || "").trim();
  if (!url || !url.includes("/webhooks/site-bot-feedback/files/")) return url;
  const m = /\/files\/[^/]+\/([^/?#]+)/.exec(url);
  if (!m) return url;
  let fileName = "";
  try {
    fileName = decodeURIComponent(m[1]);
  } catch (_) {
    fileName = m[1];
  }
  const st = createFeedbackFileAccessToken(feedbackId, fileName);
  if (!st) return url;
  const base = url.split("?")[0];
  return `${base}?st=${encodeURIComponent(st)}`;
}

function displayNameForMember(member) {
  return String(member?.user?.username || "").trim() || "Utente";
}

function memberCanModerate(member) {
  if (!member || member.user?.bot) return false;
  return Boolean(HIGH_STAFF_ROLE_ID && member.roles?.cache?.has?.(HIGH_STAFF_ROLE_ID));
}

function sanitizeBody(value, maxLen) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .slice(0, maxLen);
}

function sanitizeStaffReason(value) {
  return String(value || "")
    .replace(/\r\n/g, "\n")
    .replace(/\r/g, "\n")
    .trim()
    .slice(0, 1000);
}

function normalizeFeedbackKind(value) {
  const k = String(value || "")
    .trim()
    .toLowerCase();
  if (k === "bug" || k === "bugs") return "bug";
  if (k === "suggestion" || k === "suggerimento" || k === "suggerimenti") return "suggestion";
  return "";
}

async function resolveGuild(client) {
  const guildId = String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
  if (!guildId) return null;
  return client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
}

function feedbackNotifOpenUrl(feedbackId) {
  const id = String(feedbackId || "").trim();
  if (!id || !mongoose.isValidObjectId(id)) return "/dashboard/feedback/";
  return `/dashboard/feedback/#vc-bot-feedback-${id}`;
}

function ensureUploadDir(feedbackId) {
  const dir = path.join(UPLOAD_ROOT, String(feedbackId));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function extForMime(mime) {
  const m = String(mime || "").toLowerCase();
  if (m === "image/png") return "png";
  if (m === "image/webp") return "webp";
  if (m === "image/gif") return "gif";
  return "jpg";
}

function parseDataUrlImage(raw) {
  const s = String(raw || "").trim();
  const m = /^data:(image\/(?:png|jpeg|jpg|webp|gif));base64,([a-z0-9+/=\s]+)$/i.exec(s);
  if (!m) return null;
  let mime = String(m[1] || "").toLowerCase();
  if (mime === "image/jpg") mime = "image/jpeg";
  if (!ALLOWED_IMAGE_MIME.has(mime) && mime !== "image/jpeg") return null;
  let buf;
  try {
    buf = Buffer.from(String(m[2] || "").replace(/\s+/g, ""), "base64");
  } catch {
    return null;
  }
  if (!buf.length || buf.length > MAX_IMAGE_BYTES) return null;
  return { mime, buffer: buf };
}

function saveFeedbackImages(feedbackId, imagesInput) {
  const list = Array.isArray(imagesInput) ? imagesInput : [];
  const urls = [];
  const dir = ensureUploadDir(feedbackId);
  let idx = 0;
  for (const item of list.slice(0, MAX_IMAGES)) {
    const parsed = parseDataUrlImage(item);
    if (!parsed) continue;
    idx += 1;
    const name = `${String(idx).padStart(2, "0")}-${crypto.randomBytes(4).toString("hex")}.${extForMime(parsed.mime)}`;
    fs.writeFileSync(path.join(dir, name), parsed.buffer);
    urls.push(`/webhooks/site-bot-feedback/files/${encodeURIComponent(String(feedbackId))}/${encodeURIComponent(name)}`);
  }
  return urls;
}

function deleteFeedbackFiles(feedbackId) {
  const dir = path.join(UPLOAD_ROOT, String(feedbackId || "").trim());
  if (!dir.startsWith(UPLOAD_ROOT)) return;
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
      }
}

function resolveStoredFile(feedbackId, fileName) {
  const id = String(feedbackId || "").trim();
  const name = String(fileName || "").trim();
  if (!id || !mongoose.isValidObjectId(id) || !/^[a-z0-9._-]+$/i.test(name)) return null;
  const full = path.join(UPLOAD_ROOT, id, name);
  if (!full.startsWith(path.join(UPLOAD_ROOT, id))) return null;
  if (!fs.existsSync(full) || !fs.statSync(full).isFile()) return null;
  return full;
}

function mimeFromFileName(fileName) {
  const ext = path.extname(String(fileName || "")).toLowerCase();
  if (ext === ".png") return "image/png";
  if (ext === ".webp") return "image/webp";
  if (ext === ".gif") return "image/gif";
  return "image/jpeg";
}

function serializeComment(c, viewerUserId) {
  if (!c) return null;
  const upList = Array.isArray(c.upvoterUserIds) ? c.upvoterUserIds.map((x) => String(x)) : [];
  const downList = Array.isArray(c.downvoterUserIds) ? c.downvoterUserIds.map((x) => String(x)) : [];
  const vid = String(viewerUserId || "").trim();
  const pid = c.parentCommentId ? String(c.parentCommentId) : "";
  return {
    id: String(c._id),
    userId: String(c.userId || ""),
    authorName: String(c.authorName || ""),
    authorAvatarUrl: String(c.authorAvatarUrl || ""),
    content: String(c.content || ""),
    parentCommentId: pid && mongoose.isValidObjectId(pid) ? pid : null,
    createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : null,
    updatedAt: c.updatedAt ? new Date(c.updatedAt).toISOString() : null,
    upvoteCount: upList.length,
    downvoteCount: downList.length,
    upvotedByViewer: Boolean(vid && upList.includes(vid)),
    downvotedByViewer: Boolean(vid && downList.includes(vid)),
  };
}

function serializeFeedback(doc, viewerUserId) {
  if (!doc) return null;
  const comments = Array.isArray(doc.comments)
    ? doc.comments.map((c) => serializeComment(c, viewerUserId)).filter(Boolean)
    : [];
  const upList = Array.isArray(doc.upvoterUserIds) ? doc.upvoterUserIds.map((x) => String(x)) : [];
  const downList = Array.isArray(doc.downvoterUserIds) ? doc.downvoterUserIds.map((x) => String(x)) : [];
  const vid = String(viewerUserId || "").trim();
  const images = Array.isArray(doc.imageUrls)
    ? doc.imageUrls.map((u) => withFeedbackFileAccessToken(String(doc._id || ""), u)).filter(Boolean)
    : [];
  return {
    id: String(doc._id),
    userId: String(doc.userId || ""),
    authorName: String(doc.authorName || ""),
    authorAvatarUrl: String(doc.authorAvatarUrl || ""),
    content: String(doc.content || ""),
    kind: normalizeFeedbackKind(doc.feedbackKind) || "suggestion",
    imageUrls: images,
    status: String(doc.status || "pending"),
    staffReason: String(doc.staffReason || ""),
    staffUserId: doc.staffUserId ? String(doc.staffUserId) : null,
    decidedAt: doc.decidedAt ? new Date(doc.decidedAt).toISOString() : null,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
    comments,
    commentCount: comments.length,
    upvoteCount: upList.length,
    downvoteCount: downList.length,
    upvotedByViewer: Boolean(vid && upList.includes(vid)),
    downvotedByViewer: Boolean(vid && downList.includes(vid)),
  };
}

async function getBotFeedbackList(client, payload = {}) {
  const guild = await resolveGuild(client);
  if (!guild) {
    return { ok: false, status: 503, error: "guild_unavailable", message: "Server Discord non disponibile." };
  }

  let viewer = null;
  const accessToken = String(payload.accessToken || "").trim();
  if (accessToken) {
    const resolved = await resolveWebsiteGuildMember(client, accessToken);
    if (resolved.ok) {
      viewer = {
        id: resolved.userId,
        name: displayNameForMember(resolved.member),
        canModerate: memberCanModerate(resolved.member),
      };
    }
  }

  const viewerId = viewer && viewer.id ? String(viewer.id) : "";
  const canModerate = Boolean(viewer && viewer.canModerate);
  const query = { docType: BF, guildId: guild.id };
  if (!canModerate) {
    if (viewerId) {
      query.$or = [{ status: { $ne: "rejected" } }, { userId: viewerId }];
    } else {
      query.status = { $ne: "rejected" };
    }
  }

  const docs = await SiteDocument.find(query)
    .sort({ updatedAt: -1, createdAt: -1 })
    .limit(LIST_LIMIT)
    .lean()
    .catch(() => []);

  const authorIds = collectUserIdsFromSuggestionLikeDocs(docs);
  await prefetchGuildMembersForIds(guild, authorIds);
  const missingMembers = authorIds
    .map((id) => String(id || "").trim())
    .filter((id) => id && !guild.members?.cache?.has?.(id));
  await prefetchUsersForIds(client, missingMembers);

  return {
    ok: true,
    status: 200,
    items: docs.map((d) =>
      applyLiveAvatarToSuggestionLike(serializeFeedback(d, viewerId), guild, { size: 128, client }),
    ),
    viewer,
  };
}

async function createBotFeedback(client, payload = {}) {
  const accessToken = String(payload.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;

  const kind = normalizeFeedbackKind(payload.kind);
  if (!kind) {
    return {
      ok: false,
      status: 400,
      error: "invalid_kind",
      message: "Scegli tra suggerimento o segnalazione bug.",
    };
  }

  const content = sanitizeBody(payload.content, MAX_CONTENT_LEN);
  if (content.length < 12) {
    return { ok: false, status: 400, error: "content_too_short", message: "Scrivi almeno 12 caratteri." };
  }

  const doc = await SiteDocument.create({
    docType: BF,
    guildId: resolved.guild.id,
    userId: resolved.userId,
    authorName: displayNameForMember(resolved.member),
    authorAvatarUrl:
      guildMemberDisplayAvatarUrlStatic(resolved.member, { size: 128 }) ||
      guildMemberDisplayAvatarUrlDynamic(resolved.member, { size: 128 }) ||
      resolveSiteAvatarUrl(resolved.guild, resolved.userId, "", { size: 128 }),
    content,
    feedbackKind: kind,
    imageUrls: [],
    status: "pending",
    comments: [],
  }).catch(() => null);

  if (!doc) {
    return { ok: false, status: 500, error: "save_failed", message: "Non sono riuscito a salvare il feedback." };
  }

  const imageUrls = saveFeedbackImages(String(doc._id), payload.images);
  if (imageUrls.length) {
    doc.imageUrls = imageUrls;
    await doc.save().catch(() => null);
  }

  if (HIGH_STAFF_ROLE_ID) {
    try {
      await resolved.guild.members.fetch().catch(() => null);
      const role =
        resolved.guild.roles.cache.get(HIGH_STAFF_ROLE_ID) ||
        (await resolved.guild.roles.fetch(HIGH_STAFF_ROLE_ID).catch(() => null));
      const recipients = role
        ? Array.from(role.members.values())
            .filter((m) => m && !m.user?.bot && String(m.id) !== String(resolved.userId))
            .map((m) => String(m.id))
        : [];
      const label = kind === "bug" ? "bug" : "suggerimento";
      const preview = content.length > 220 ? `${content.slice(0, 219)}…` : content;
      await Promise.all(
        recipients.map((userId) =>
          enqueueSiteInAppNotification({
            guildId: resolved.guild.id,
            userId,
            title: kind === "bug" ? "Nuovo bug bot" : "Nuovo suggerimento bot",
            body: `${displayNameForMember(resolved.member)} ha inviato un ${label}: ${preview}`,
            kind: "suggestion",
            channel: "inbox",
            openUrl: feedbackNotifOpenUrl(doc._id),
            dedupeKey: `bot_feedback_new:${doc._id}:${userId}`,
          }).catch(() => null),
        ),
      );
    } catch {
          }
  }

    if (kind === "bug") {
    const claimed = await SiteDocument.findOneAndUpdate(
      {
        docType: BF,
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

  return {
    ok: true,
    status: 200,
    item: serializeFeedback(doc.toObject ? doc.toObject() : doc, resolved.userId),
    message: kind === "bug" ? "Bug segnalato." : "Suggerimento pubblicato.",
  };
}

async function updateOwnBotFeedback(client, payload = {}) {
  const accessToken = String(payload.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;

  const feedbackId = String(payload.feedbackId || "").trim();
  if (!feedbackId || !mongoose.isValidObjectId(feedbackId)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID non valido." };
  }

  const content = sanitizeBody(payload.content, MAX_CONTENT_LEN);
  if (content.length < 12) {
    return { ok: false, status: 400, error: "content_too_short", message: "Scrivi almeno 12 caratteri." };
  }

  const kindRaw = payload.kind != null ? normalizeFeedbackKind(payload.kind) : "";
  const $set = { content, updatedAt: new Date() };
  if (kindRaw) $set.feedbackKind = kindRaw;

  const updated = await SiteDocument.findOneAndUpdate(
    {
      docType: BF,
      _id: feedbackId,
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
      message: "Feedback non trovato, non tuo o già gestito dallo staff.",
    };
  }

  return {
    ok: true,
    status: 200,
    item: serializeFeedback(updated, resolved.userId),
    message: "Feedback aggiornato.",
  };
}

async function deleteOwnBotFeedback(client, payload = {}) {
  const accessToken = String(payload.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;

  const feedbackId = String(payload.feedbackId || "").trim();
  if (!feedbackId || !mongoose.isValidObjectId(feedbackId)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID non valido." };
  }

  const del = await SiteDocument.deleteOne({
    docType: BF,
    _id: feedbackId,
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
      message: "Feedback non trovato, non tuo o già gestito.",
    };
  }
  deleteFeedbackFiles(feedbackId);
  return { ok: true, status: 200, message: "Feedback eliminato." };
}

async function addBotFeedbackComment(client, payload = {}) {
  const accessToken = String(payload.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;

  const feedbackId = String(payload.feedbackId || "").trim();
  if (!feedbackId || !mongoose.isValidObjectId(feedbackId)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID non valido." };
  }

  const content = sanitizeBody(payload.content, MAX_COMMENT_LEN);
  if (content.length < 2) {
    return { ok: false, status: 400, error: "content_too_short", message: "Il commento è troppo breve." };
  }

  const doc = await SiteDocument.findOne({
    docType: BF,
    _id: feedbackId,
    guildId: resolved.guild.id,
  }).catch(() => null);

  if (!doc) {
    return { ok: false, status: 404, error: "not_found", message: "Feedback non trovato." };
  }
  if (String(doc.status || "") !== "pending" && !memberCanModerate(resolved.member)) {
    return { ok: false, status: 403, error: "locked", message: "Non puoi più commentare questo feedback." };
  }

  const comments = Array.isArray(doc.comments) ? doc.comments : [];
  if (comments.length >= MAX_COMMENTS) {
    return { ok: false, status: 400, error: "too_many_comments", message: "Troppi commenti su questo feedback." };
  }

  let parentCommentId = null;
  const parentRaw = String(payload.parentCommentId || "").trim();
  if (parentRaw) {
    if (!mongoose.isValidObjectId(parentRaw) || !comments.some((c) => String(c._id) === parentRaw)) {
      return { ok: false, status: 400, error: "invalid_parent", message: "Commento padre non valido." };
    }
    parentCommentId = parentRaw;
  }

  comments.push({
    userId: resolved.userId,
    authorName: displayNameForMember(resolved.member),
    authorAvatarUrl:
      guildMemberDisplayAvatarUrlStatic(resolved.member, { size: 128 }) ||
      guildMemberDisplayAvatarUrlDynamic(resolved.member, { size: 128 }) ||
      resolveSiteAvatarUrl(resolved.guild, resolved.userId, "", { size: 128 }),
    content,
    parentCommentId,
    upvoterUserIds: [],
    downvoterUserIds: [],
  });
  doc.comments = comments;
  doc.updatedAt = new Date();
  doc.markModified("comments");
  const saved = await doc.save().catch(() => null);
  if (!saved) {
    return { ok: false, status: 500, error: "save_failed", message: "Impossibile salvare il commento." };
  }

  return {
    ok: true,
    status: 200,
    item: serializeFeedback(saved.toObject ? saved.toObject() : saved, resolved.userId),
    message: "Commento pubblicato.",
  };
}

async function setBotFeedbackVote(client, payload = {}) {
  const accessToken = String(payload.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;

  const feedbackId = String(payload.feedbackId || "").trim();
  if (!feedbackId || !mongoose.isValidObjectId(feedbackId)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID non valido." };
  }

  const direction = String(payload.direction || "").trim().toLowerCase();
  if (direction !== "up" && direction !== "down") {
    return { ok: false, status: 400, error: "invalid_direction", message: "Direzione voto non valida." };
  }

  const doc = await SiteDocument.findOne({
    docType: BF,
    _id: feedbackId,
    guildId: resolved.guild.id,
  }).catch(() => null);

  if (!doc) {
    return { ok: false, status: 404, error: "not_found", message: "Feedback non trovato." };
  }
  if (String(doc.status || "") !== "pending") {
    return { ok: false, status: 403, error: "locked", message: "Votazione chiusa." };
  }

  const uid = String(resolved.userId);
  const up = new Set((Array.isArray(doc.upvoterUserIds) ? doc.upvoterUserIds : []).map(String));
  const down = new Set((Array.isArray(doc.downvoterUserIds) ? doc.downvoterUserIds : []).map(String));
  if (direction === "up") {
    if (up.has(uid)) up.delete(uid);
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
  doc.upvoterUserIds = Array.from(up);
  doc.downvoterUserIds = Array.from(down);
  doc.updatedAt = new Date();
  const saved = await doc.save().catch(() => null);
  if (!saved) {
    return { ok: false, status: 500, error: "vote_failed", message: "Impossibile salvare il voto." };
  }
  return {
    ok: true,
    status: 200,
    item: serializeFeedback(saved.toObject ? saved.toObject() : saved, uid),
    message: "Voto aggiornato.",
  };
}

async function staffSetBotFeedbackDecision(client, payload = {}) {
  const accessToken = String(payload.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;
  if (!memberCanModerate(resolved.member)) {
    return { ok: false, status: 403, error: "forbidden", message: "Solo l'High Staff può decidere." };
  }

  const feedbackId = String(payload.feedbackId || "").trim();
  if (!feedbackId || !mongoose.isValidObjectId(feedbackId)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID non valido." };
  }

  const nextStatus = String(payload.status || "").trim().toLowerCase();
  if (!["pending", "accepted", "rejected"].includes(nextStatus)) {
    return { ok: false, status: 400, error: "invalid_status", message: "Stato non valido." };
  }

  const reason = sanitizeStaffReason(payload.reason);
  if (nextStatus !== "pending" && reason.length < 3) {
    return { ok: false, status: 400, error: "reason_required", message: "Motivo obbligatorio (minimo 3 caratteri)." };
  }

  const existing = await SiteDocument.findOne({
    docType: BF,
    _id: feedbackId,
    guildId: resolved.guild.id,
  })
    .select("userId status feedbackKind missionRewardGrantedAt")
    .lean()
    .catch(() => null);
  if (!existing) {
    return { ok: false, status: 404, error: "not_found", message: "Feedback non trovato." };
  }

  const updated = await SiteDocument.findOneAndUpdate(
    { docType: BF, _id: feedbackId, guildId: resolved.guild.id },
    {
      $set: {
        status: nextStatus,
        staffReason: nextStatus === "pending" ? "" : reason,
        staffUserId: nextStatus === "pending" ? null : resolved.userId,
        decidedAt: nextStatus === "pending" ? null : new Date(),
        updatedAt: new Date(),
      },
    },
    { new: true },
  )
    .lean()
    .catch(() => null);

  if (!updated) {
    return { ok: false, status: 500, error: "save_failed", message: "Impossibile aggiornare lo stato." };
  }

  const authorId = String(existing.userId || "").trim();
  if (authorId && authorId !== String(resolved.userId)) {
    if (nextStatus === "accepted") {
      await enqueueSiteInAppNotification({
        guildId: resolved.guild.id,
        userId: authorId,
        title: "Feedback bot accettato",
        body: `Lo staff ha accettato il tuo feedback. Motivo: ${reason.slice(0, 380)}`,
        kind: "success",
        channel: "personal",
        openUrl: feedbackNotifOpenUrl(feedbackId),
      }).catch(() => null);
    } else if (nextStatus === "rejected") {
      await enqueueSiteInAppNotification({
        guildId: resolved.guild.id,
        userId: authorId,
        title: "Feedback bot rifiutato",
        body: `Lo staff ha rifiutato il tuo feedback. Motivo: ${reason.slice(0, 380)}`,
        kind: "suggestion",
        channel: "personal",
        openUrl: feedbackNotifOpenUrl(feedbackId),
      }).catch(() => null);
    }
  }

    if (
    nextStatus === "accepted" &&
    authorId &&
    normalizeFeedbackKind(existing.feedbackKind) === "bug" &&
    !existing.missionRewardGrantedAt
  ) {
    const claimed = await SiteDocument.findOneAndUpdate(
      {
        docType: BF,
        _id: feedbackId,
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
      try {
        const { refreshPartnershipConfigCache } = require("../../MultiGuild/core/tenantPartnershipSettings");
        await refreshPartnershipConfigCache().catch(() => null);
      } catch (_) {}
      void recordTenantBugReport(client, resolved.guild.id, authorId).catch(() => null);
    }
  }

  return {
    ok: true,
    status: 200,
    item: serializeFeedback(updated, resolved.userId),
    message: "Feedback aggiornato.",
  };
}

async function staffDeleteBotFeedback(client, payload = {}) {
  const accessToken = String(payload.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;
  if (!memberCanModerate(resolved.member)) {
    return { ok: false, status: 403, error: "forbidden", message: "Solo l'High Staff può eliminare." };
  }

  const feedbackId = String(payload.feedbackId || "").trim();
  if (!feedbackId || !mongoose.isValidObjectId(feedbackId)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID non valido." };
  }

  const del = await SiteDocument.deleteOne({
    docType: BF,
    _id: feedbackId,
    guildId: resolved.guild.id,
  }).catch(() => null);
  const n = Number(del?.deletedCount ?? del?.n ?? 0);
  if (!del || n < 1) {
    return { ok: false, status: 404, error: "not_found", message: "Feedback non trovato." };
  }
  deleteFeedbackFiles(feedbackId);
  return { ok: true, status: 200, message: "Feedback eliminato definitivamente." };
}

async function serveBotFeedbackFile(client, req, res) {
  const feedbackId = String(req.params?.feedbackId || "").trim();
  const fileName = String(req.params?.fileName || "").trim();
  const st = String(req.query?.st || "").trim();
  let allowed = verifyFeedbackFileAccessToken(st, feedbackId, fileName);
  if (!allowed) {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const resolved = await resolveWebsiteGuildMember(client, accessToken);
    if (!resolved.ok) {
      res.status(Number(resolved.status) || 401).json({
        ok: false,
        error: resolved.error || "unauthorized",
        message: resolved.message || "Accesso negato.",
      });
      return;
    }
    const doc = await SiteDocument.findOne({
      docType: BF,
      _id: feedbackId,
      guildId: resolved.guild.id,
    })
      .select({ userId: 1 })
      .lean();
    if (!doc) {
      res.status(404).json({ ok: false, error: "not_found" });
      return;
    }
    const isOwner = String(doc.userId || "") === String(resolved.userId || "");
    const isStaff = memberCanModerate(resolved.member);
    if (!isOwner && !isStaff) {
      res.status(403).json({ ok: false, error: "forbidden", message: "Accesso negato." });
      return;
    }
    allowed = true;
  }
  if (!allowed) {
    res.status(401).json({ ok: false, error: "unauthorized" });
    return;
  }
  const full = resolveStoredFile(feedbackId, fileName);
  if (!full) {
    res.status(404).json({ ok: false, error: "not_found" });
    return;
  }
  res.setHeader("Cache-Control", "private, no-store");
  res.setHeader("Content-Type", mimeFromFileName(req.params?.fileName));
  fs.createReadStream(full).pipe(res);
}

module.exports = {
  getBotFeedbackList,
  createBotFeedback,
  updateOwnBotFeedback,
  deleteOwnBotFeedback,
  addBotFeedbackComment,
  setBotFeedbackVote,
  staffSetBotFeedbackDecision,
  staffDeleteBotFeedback,
  serveBotFeedbackFile,
  MAX_IMAGES,
};
