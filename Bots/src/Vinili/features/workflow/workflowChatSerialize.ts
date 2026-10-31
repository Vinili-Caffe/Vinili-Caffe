/** Chat del workflow: messaggi, reazioni e conferme di lettura. */
const { SiteWorkflowChatMessage } = require("../../Schemas/Web/siteWorkflowChatSchemas") as typeof import("../../Schemas/Web/siteWorkflowChatSchemas");
const { discordDefaultAvatarUrl } = require("../../Utils/Discord/guildDiscordIdentity") as typeof import("../../Utils/Discord/guildDiscordIdentity");

const MAX_REACTION_USERS = 80;

function normalizeReactionUsers(row?) {
  const users = Array.isArray(row?.users) ? row.users : [];
  const out = [];
  const seen = new Set();
  for (const u of users) {
    const id = String(u?.id || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: String(u?.name || "").trim().slice(0, 80) });
  }
  const ids = Array.isArray(row?.userIds) ? row.userIds : [];
  for (const raw of ids) {
    const id = String(raw || "").trim();
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push({ id, name: "" });
  }
  return out.slice(0, MAX_REACTION_USERS);
}

function parseReactionInput(raw?, body?) {
  const fromBody = body && typeof body === "object" ? body : {};
  let s = String(raw != null ? raw : fromBody.emoji || fromBody.markup || "").trim().slice(0, 80);
  if (!s && fromBody.emojiId) {
    const id = String(fromBody.emojiId || "").trim();
    const name = String(fromBody.name || "emoji")
      .trim()
      .replace(/[^a-zA-Z0-9_]/g, "")
      .slice(0, 64) || "emoji";
    const animated = fromBody.animated === true;
    if (!/^\d{5,32}$/.test(id)) return null;
    s = `<${animated ? "a" : ""}:${name}:${id}>`;
  }
  const custom = /^<(a?):([a-zA-Z0-9_]+):(\d{5,32})>$/.exec(s);
  if (custom) {
    return {
      key: `c:${custom[3]}`,
      emoji: s,
      emojiId: custom[3],
      name: custom[2],
      animated: custom[1] === "a",
    };
  }
  if (!s || s.length > 16 || /[<>\n\r]/.test(s)) return null;
  return {
    key: `u:${s}`,
    emoji: s,
    emojiId: null,
    name: "",
    animated: false,
  };
}

function serializeReactions(rows?) {
  return (Array.isArray(rows) ? rows : []).map((row?) => {
    const users = normalizeReactionUsers(row);
    return {
      key: String(row?.key || "").trim(),
      emoji: String(row?.emoji || "").trim(),
      emojiId: row?.emojiId ? String(row.emojiId).trim() : null,
      name: String(row?.name || "").trim(),
      animated: Boolean(row?.animated),
      userIds: users.map((u?) => u.id),
      users,
    };
  });
}

function replyPreview(content?) {
  const plain = String(content || "")
    .replace(/<(a?):[\w~-]+:\d+>/g, ":$2:")
    .replace(/\s+/g, " ")
    .trim();
  if (!plain) return "Allegato";
  return plain.length > 120 ? `${plain.slice(0, 117)}…` : plain;
}

function serializeMessage(doc?, replyMap?, avatarOverrides?, roleOverrides?) {
  const replyToId = doc?.replyToId ? String(doc.replyToId) : null;
  const replyDoc = replyToId && replyMap ? replyMap.get(replyToId) : null;
  const authorId = String(doc?.authorId || "");
  let authorAvatarUrl = String(doc?.authorAvatarUrl || "").trim();
  if (!authorAvatarUrl && avatarOverrides && avatarOverrides.get(authorId)) {
    authorAvatarUrl = String(avatarOverrides.get(authorId) || "").trim();
  }
  if (!authorAvatarUrl && authorId && authorId !== "system") {
    authorAvatarUrl = discordDefaultAvatarUrl({ id: authorId }, { size: 128 });
  }
  let authorRoleLabel = String(doc?.authorRoleLabel || "").trim();
  if (!authorRoleLabel && roleOverrides && roleOverrides.get(authorId)) {
    authorRoleLabel = String(roleOverrides.get(authorId) || "").trim();
  }
  const out: Record<string, any> = {
    id: String(doc?._id || ""),
    dedupeKey: String(doc?.dedupeKey || ""),
    queue: String(doc?.queue || ""),
    subjectUserId: String(doc?.subjectUserId || ""),
    authorId,
    authorName: String(doc?.authorName || ""),
    authorAvatarUrl,
    authorRoleLabel,
    authorKind: String(doc?.authorKind || "staff"),
    content: String(doc?.content || ""),
    imageUrls: Array.isArray(doc?.imageUrls) ? doc.imageUrls.map(String) : [],
    replyToId,
    replyTo: replyDoc
      ? {
          id: String(replyDoc._id || ""),
          authorName: String(replyDoc.authorName || ""),
          content: replyPreview(replyDoc.content),
        }
      : null,
    reactions: serializeReactions(doc?.reactions),
    editedAt: doc?.editedAt ? new Date(doc.editedAt).toISOString() : null,
    createdAt: doc?.createdAt ? new Date(doc.createdAt).toISOString() : null,
  };
  const receipt = messageReceiptStatus(doc);
  if (receipt) {
    out.receiptStatus = receipt;
    out.read = receipt === "read";
  }
  return out;
}

function messageReceiptStatus(doc?) {
  const kind = String(doc?.authorKind || "").toLowerCase();
  if (kind === "system") return null;
  const authorId = String(doc?.authorId || "").trim();
  if (!authorId) return null;
  const readBy = Array.isArray(doc?.readBy) ? doc.readBy : [];
  const read = readBy.some((r?) => {
    const uid = String(r?.userId || "").trim();
    return uid && uid !== authorId;
  });
  return read ? "read" : "sent";
}

async function markWorkflowMessagesRead(readerId?, messageDocs?, { dedupeKey = "" } = {}) {
  const reader = String(readerId || "").trim();
  if (!reader) return { messageIds: [], at: null };
  const at = new Date();
  const candidates = (Array.isArray(messageDocs) ? messageDocs : []).filter((m?) => {
    if (!m || !m._id) return false;
    if (String(m.authorKind || "").toLowerCase() === "system") return false;
    if (String(m.authorId || "") === reader) return false;
    const already = (Array.isArray(m.readBy) ? m.readBy : []).some(
      (r?) => String(r?.userId || "") === reader,
    );
    return !already;
  });
  const ids = candidates.map((m?) => m._id);
  if (!ids.length) return { messageIds: [], at: null };
  await SiteWorkflowChatMessage.updateMany(
    {
      _id: { $in: ids },
      readBy: { $not: { $elemMatch: { userId: reader } } },
    },
    { $push: { readBy: { userId: reader, at } } },
  ).catch(() => null);
  const idSet = new Set(ids.map((id?) => String(id)));
  for (const m of messageDocs || []) {
    if (!idSet.has(String(m?._id || ""))) continue;
    if (!Array.isArray(m.readBy)) m.readBy = [];
    m.readBy.push({ userId: reader, at });
  }
  const key = String(dedupeKey || "").trim();
  if (key) {
    try {
      const { cancelChatDmFallback } = require("../../Web/siteChatDmFallback") as typeof import("../../Web/siteChatDmFallback");
      cancelChatDmFallback("workflow", key, reader);
    } catch (_) {}
  }
  return { messageIds: [...idSet], at: at.toISOString() };
}

export = { MAX_REACTION_USERS, parseReactionInput, serializeReactions, serializeMessage, markWorkflowMessagesRead };
