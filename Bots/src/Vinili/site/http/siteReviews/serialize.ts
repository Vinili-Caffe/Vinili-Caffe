const mongoose = require("mongoose") as typeof import("mongoose");
const { normalizeRating, normalizeContentLang } = require("./helpers") as typeof import("./helpers");

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

export = {
  serializeReview,
  sortSerializedReviewsNewestFirst,
  enrichServerReviewDoc,
  enrichPublicReviewDoc,
};
