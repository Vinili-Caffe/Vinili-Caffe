/** Suggerimenti: suggerimento e commenti come li vede il sito. */
const mongoose = require("mongoose") as typeof import("mongoose");
const { signDiscussionImageUrls } = require("../../Web/siteDiscussionImages") as typeof import("../../Web/siteDiscussionImages");
const { suggestionTopicTagOf, suggestionBoardOf, scrubDiscordDefaultAvatarUrl, avatarHashFromDiscordUrl, normalizeSuggestionKind } = require("./suggestionFields") as typeof import("./suggestionFields");
const { withSuggestionFileAccessToken } = require("./suggestionFiles") as typeof import("./suggestionFiles");

const LIST_COMMENT_CAP = 24;

function serializeComment(c?, viewerUserId?) {
  if (!c) return null;
  const upList = Array.isArray(c.upvoterUserIds) ? c.upvoterUserIds.map((x?) => String(x)) : [];
  const downList = Array.isArray(c.downvoterUserIds) ? c.downvoterUserIds.map((x?) => String(x)) : [];
  const vid = String(viewerUserId || "").trim();
  const pid = c.parentCommentId ? String(c.parentCommentId) : "";
  return {
    id: String(c._id),
    userId: String(c.userId || ""),
    authorName: String(c.authorName || ""),
    authorAvatarUrl: scrubDiscordDefaultAvatarUrl(String(c.authorAvatarUrl || "")),
    authorAvatarHash: avatarHashFromDiscordUrl(c.authorAvatarUrl),
    content: String(c.content || ""),
    imageUrls: signDiscussionImageUrls(c.imageUrls),
    parentCommentId: pid && mongoose.isValidObjectId(pid) ? pid : null,
    createdAt: c.createdAt ? new Date(c.createdAt).toISOString() : null,
    updatedAt: c.updatedAt ? new Date(c.updatedAt).toISOString() : null,
    upvoteCount: upList.length,
    downvoteCount: downList.length,
    upvotedByViewer: Boolean(vid && upList.includes(vid)),
    downvotedByViewer: Boolean(vid && downList.includes(vid)),
  };
}

function serializeSuggestion(doc?, viewerUserId?, opts: Record<string, any> = {}) {
  if (!doc) return null;
  const leanList = Boolean(opts && opts.leanList);
  const rawComments = Array.isArray(doc.comments) ? doc.comments : [];
  const commentCount = rawComments.length;
  const commentSlice = leanList
    ? rawComments.slice(Math.max(0, commentCount - LIST_COMMENT_CAP))
    : rawComments;
  const comments = commentSlice.map((c?) => serializeComment(c, viewerUserId)).filter(Boolean);
  const upList = Array.isArray(doc.upvoterUserIds) ? doc.upvoterUserIds.map((x?) => String(x)) : [];
  const downList = Array.isArray(doc.downvoterUserIds) ? doc.downvoterUserIds.map((x?) => String(x)) : [];
  const vid = String(viewerUserId || "").trim();
  const images = Array.isArray(doc.imageUrls)
    ? doc.imageUrls.map((u?) => withSuggestionFileAccessToken(String(doc._id || ""), u)).filter(Boolean)
    : [];
  return {
    id: String(doc._id),
    userId: String(doc.userId || ""),
    authorName: String(doc.authorName || ""),
    authorAvatarUrl: scrubDiscordDefaultAvatarUrl(String(doc.authorAvatarUrl || "")),
    authorAvatarHash: avatarHashFromDiscordUrl(doc.authorAvatarUrl),
    content: String(doc.content || ""),
    kind: normalizeSuggestionKind(doc.feedbackKind) || "suggestion",
    tag: suggestionTopicTagOf(doc, { forDisplay: true }),
    topic: suggestionTopicTagOf(doc, { forDisplay: true }),
    board: suggestionBoardOf(doc),
    imageUrls: images,
    status: String(doc.status || "pending"),
    staffReason: String(doc.staffReason || ""),
    staffUserId: doc.staffUserId ? String(doc.staffUserId) : null,
    decidedAt: doc.decidedAt ? new Date(doc.decidedAt).toISOString() : null,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
    comments,
    commentCount,
    upvoteCount: upList.length,
    downvoteCount: downList.length,
    upvotedByViewer: Boolean(vid && upList.includes(vid)),
    downvotedByViewer: Boolean(vid && downList.includes(vid)),
  };
}

export = { serializeSuggestion };
