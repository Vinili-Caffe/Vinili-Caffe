const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");
const crypto = require("crypto") as typeof import("crypto");
const mongoose = require("mongoose") as typeof import("mongoose");
const IDs = require("../Config/ids") as typeof import("../Config/ids");
const { assertWebsiteStaffAccess, normalizeHeaderSecret, memberCanViewResocontiInbox } = require("./siteStaffAccessApi") as typeof import("./siteStaffAccessApi");
const { resolveWebsiteGuildMember } = require("./siteRoleRequestApi") as typeof import("./siteRoleRequestApi");
const { memberIsHighStaffEligible, memberCanReviewAppelli } = require("../Staff/staffRoleHierarchy") as typeof import("../Staff/staffRoleHierarchy");
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const {
  memberHasCandidatureReviewAccess,
} = require("../../Events/interaction/candidatureApplicationHandlers") as typeof import("../../Events/interaction/candidatureApplicationHandlers");
const {
  SiteWorkflowChatMessage,
  purgeWorkflowChatByDedupe,
} = require("../../Schemas/Web/siteWorkflowChatSchemas") as typeof import("../../Schemas/Web/siteWorkflowChatSchemas");
const { broadcastSiteRealtime } = require("./siteSuggestionsBroadcast") as typeof import("./siteSuggestionsBroadcast");
const {
  guildMemberDisplayAvatarUrlStatic,
  userAvatarUrlStatic,
  discordDefaultAvatarUrl,
  accountUsername,
} = require("../Discord/guildDiscordIdentity") as typeof import("../Discord/guildDiscordIdentity");
const { buildSiteLinkRow, subjectWorkflowChatPath } = require("./discordWorkflowUiGate") as typeof import("./discordWorkflowUiGate");
const { resolveStaffProfileDisplayRoleId } = require("../Staff/staffProfilePanelRuntime") as typeof import("../Staff/staffProfilePanelRuntime");
const { stripDiscordDecorations } = require("./siteStaffRosterCache") as typeof import("./siteStaffRosterCache");
const {
  notifyWorkflowSubjectInvited,
  notifyWorkflowSubjectRemoved,
  notifyWorkflowChatNewMessage,
  notifyWorkflowMentions,
} = require("./siteStaffWorkflowNotifications") as typeof import("./siteStaffWorkflowNotifications");
const { setTyping: setChatTyping, clearTyping: clearChatTyping } = require("./siteChatTyping") as typeof import("./siteChatTyping");
const {
  listGuildMentionChannels,
  sanitizeWebTicketMentionsToScope,
  sanitizeWebTicketChannelMentions,
  memberCanViewChannelId,
} = require("./siteWebTicketsApi") as typeof import("./siteWebTicketsApi");

const WORKFLOW_DOC = SITE_DOCUMENT_TYPE.STAFF_WORKFLOW;
const QUEUES = new Set(["pause", "candidature", "appelli", "resoconti", "revisione"]);
/* pauseInviteOnly1: pause come candidature/appelli — HS always; richiedente solo se aggiunto */
const INVITE_ONLY_QUEUES = new Set(["candidature", "appelli", "pause"]);
const MAX_MESSAGES = 200;
const MAX_CONTENT = 2000;
const MAX_IMAGES = 3;
const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
const MAX_REACTION_KINDS = 12;
const MAX_REACTION_USERS = 80;
const ALLOWED_MEDIA_MIME = new Set(["image/png", "image/jpeg", "image/webp", "image/gif", "video/mp4", "video/webm", "video/quicktime"]);
const UPLOAD_ROOT = path.resolve(__dirname, "../../Data/uploads/workflow-chat");

function bearerFromRequest(req?) {
  const header = normalizeHeaderSecret(req?.headers?.authorization);
  if (header) return header;
  return normalizeHeaderSecret(req?.query?.accessToken || req?.query?.token);
}

function parseQueueFromDedupe(dedupeKey?) {
  const key = String(dedupeKey || "").trim();
  /* boardsInbox: dedupe canonico = boards:revisione:<listingId> */
  if (/^boards:revisione:/i.test(key)) return "revisione";
  const q = key.split(":")[0];
  return QUEUES.has(q) ? q : "";
}

function canonicalizeWorkflowChatKey(dedupeKey?) {
  const key = String(dedupeKey || "").trim();
  if (!key) return "";
  if (/^boards:revisione:/i.test(key)) return key;
  const m = key.match(/^revisione:([a-f0-9]{24})$/i);
  if (m) return `boards:revisione:${m[1]}`;
  return key;
}

function uploadFolderKey(dedupeKey?) {
  return crypto.createHash("sha256").update(String(dedupeKey || "")).digest("hex").slice(0, 32);
}

async function resolveMainGuild(client?) {
  const guildId = String(IDs.guilds.main || "").trim();
  if (!guildId) return null;
  return client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
}

function memberCanAccessQueue(member?, guild?, queue?) {
  const q = String(queue || "").trim().toLowerCase();
  if (q === "pause") return memberIsHighStaffEligible(member);
  if (q === "appelli") return memberCanReviewAppelli(member);
  if (q === "candidature") return memberHasCandidatureReviewAccess(member, guild);
  if (q === "resoconti") {
    return memberCanViewResocontiInbox(member);
  }
  /* boardsRevHsOnly1: coda bacheca solo High Staff */
  if (q === "revisione") return memberIsHighStaffEligible(member);
  return false;
}

function avatarForMember(member?) {
  return (
    guildMemberDisplayAvatarUrlStatic(member, { size: 128 }) ||
    userAvatarUrlStatic(member?.user, { size: 128 }) ||
    userAvatarUrlStatic(member, { size: 128 }) ||
    discordDefaultAvatarUrl(member?.user || member, { size: 128 }) ||
    ""
  );
}

async function resolveAuthorAvatarUrl(client?, member?) {
  let url = avatarForMember(member);
  if (url && !/embed\/avatars\//.test(url)) return url;
  const uid = String(member?.id || member?.user?.id || "").trim();
  if (!uid || !/^\d{17,20}$/.test(uid)) return url || "";
  try {
    const cached = client?.users?.cache?.get?.(uid) || null;
    const user = cached || (await client.users.fetch(uid).catch(() => null));
    if (user) {
      const fresh =
        guildMemberDisplayAvatarUrlStatic(member, { size: 128 }) ||
        userAvatarUrlStatic(user, { size: 128 }) ||
        "";
      if (fresh && !/embed\/avatars\//.test(fresh)) return fresh;
    }
  } catch (_) {}
  return avatarForMember(member);
}

async function loadAuthorAvatarOverrides(client?, docs?) {
  const need = new Set();
  for (const d of docs || []) {
    const id = String(d?.authorId || "").trim();
    if (!id || id === "system") continue;
    const stored = String(d?.authorAvatarUrl || "").trim();
    if (!stored || /embed\/avatars\//.test(stored)) need.add(id);
  }
  if (!need.size) return new Map();
  const out = new Map();
  await Promise.all(
    [...need].map(async (id?) => {
      try {
        const user = client?.users?.cache?.get?.(id) || (await client.users.fetch(id).catch(() => null));
        if (!user) return;
        const url = userAvatarUrlStatic(user, { size: 128 }) || discordDefaultAvatarUrl(user, { size: 128 });
        if (url) out.set(id, url);
      } catch (_) {}
    }),
  );
  return out;
}

async function loadAuthorRoleOverrides(guild?, docs?) {
  const out = new Map();
  const need = new Set();
  for (const d of docs || []) {
    const id = String(d?.authorId || "").trim();
    if (!id || id === "system") continue;
    if (String(d?.authorKind || "staff").toLowerCase() !== "staff") continue;
    if (String(d?.authorRoleLabel || "").trim()) continue;
    need.add(id);
  }
  if (!need.size || !guild?.members) return out;
  await Promise.all(
    [...need].map(async (uid?) => {
      try {
        const member =
          guild.members.cache.get(uid) || (await guild.members.fetch(uid).catch(() => null));
        if (!member) return;
        const label = authorRoleLabelForMember(member, "staff");
        if (label) out.set(uid, label);
      } catch (_) {}
    }),
  );
  return out;
}

function displayNameForMember(member?) {
  return String(
    member?.displayName || member?.user?.globalName || member?.user?.username || accountUsername(member?.user) || "",
  ).trim();
}

function authorRoleLabelForMember(member?, authorKind?) {
  const kind = String(authorKind || "").toLowerCase();
  if (kind === "system") return "Sistema";
  if (kind === "user") return "";
  try {
    const roleId = resolveStaffProfileDisplayRoleId(member);
    if (roleId) {
      const role =
        member?.roles?.cache?.get?.(String(roleId)) ||
        member?.guild?.roles?.cache?.get?.(String(roleId)) ||
        null;
      const cleaned = stripDiscordDecorations(role?.name || "") || String(role?.name || "").trim();
      if (cleaned) return cleaned.slice(0, 48);
    }
  } catch (_) {}
  return "Staff";
}

function extForMime(mime?) {
  if (mime === "image/png") return "png";
  if (mime === "image/webp") return "webp";
  if (mime === "image/gif") return "gif";
  if (mime === "video/mp4") return "mp4";
  if (mime === "video/webm") return "webm";
  if (mime === "video/quicktime") return "mov";
  return "jpg";
}

function parseDataUrlMedia(raw?) {
  const s = String(raw || "").trim();
  const m = /^data:((?:image\/(?:png|jpeg|jpg|webp|gif)|video\/(?:mp4|webm|quicktime)));base64,([a-z0-9+/=\s]+)$/i.exec(s);
  if (!m) return null;
  let mime = String(m[1] || "").toLowerCase();
  if (mime === "image/jpg") mime = "image/jpeg";
  if (!ALLOWED_MEDIA_MIME.has(mime) && mime !== "image/jpeg") return null;
  let buf;
  try {
    buf = Buffer.from(String(m[2] || "").replace(/\s+/g, ""), "base64");
  } catch {
    return null;
  }
  if (!buf.length || buf.length > MAX_IMAGE_BYTES) return null;
  return { mime, buffer: buf };
}

function ensureUploadDir(dedupeKey?) {
  const dir = path.join(UPLOAD_ROOT, uploadFolderKey(dedupeKey));
  fs.mkdirSync(dir, { recursive: true });
  return dir;
}

function saveWorkflowImages(dedupeKey?, imagesInput?) {
  const list = Array.isArray(imagesInput) ? imagesInput : [];
  const urls = [];
  const folder = uploadFolderKey(dedupeKey);
  const dir = ensureUploadDir(dedupeKey);
  let idx = 0;
  for (const item of list.slice(0, MAX_IMAGES)) {
    const parsed = parseDataUrlMedia(item);
    if (!parsed) continue;
    idx += 1;
    const name = `${String(idx).padStart(2, "0")}-${crypto.randomBytes(4).toString("hex")}.${extForMime(parsed.mime)}`;
    fs.writeFileSync(path.join(dir, name), parsed.buffer);
    urls.push(
      `/webhooks/site-staff-workflow-chat/files/${encodeURIComponent(folder)}/${encodeURIComponent(name)}`,
    );
  }
  return urls;
}

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
  const out = {
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
      const { cancelChatDmFallback } = require("./siteChatDmFallback") as typeof import("./siteChatDmFallback");
      cancelChatDmFallback("workflow", key, reader);
    } catch (_) {}
  }
  return { messageIds: [...idSet], at: at.toISOString() };
}

async function loadWorkflowDoc(guildId?, dedupeKey?) {
  return SiteDocument.findOne({
    docType: WORKFLOW_DOC,
    guildId: String(guildId || ""),
    dedupeKey: String(dedupeKey || ""),
  })
    .select("status workflowQueue userId dedupeKey workflowFields workflowKind workflowType")
    .lean()
    .catch(() => null);
}

function isInviteOnlyQueue(queue?) {
  return INVITE_ONLY_QUEUES.has(String(queue || "").trim().toLowerCase());
}

function normalizeSubjectChat(raw?) {
  const src = raw && typeof raw === "object" ? raw : {};
  const windows = [];
  for (const row of Array.isArray(src.windows) ? src.windows : []) {
    if (!row || typeof row !== "object") continue;
    const joinedAt = row.joinedAt ? new Date(row.joinedAt) : null;
    if (!joinedAt || Number.isNaN(joinedAt.getTime())) continue;
    const leftRaw = row.leftAt ? new Date(row.leftAt) : null;
    const leftAt = leftRaw && !Number.isNaN(leftRaw.getTime()) ? leftRaw : null;
    windows.push({ joinedAt, leftAt });
  }
  const dmRaw = src.inviteDmSentAt ? new Date(src.inviteDmSentAt) : null;
  const dmSkipRaw = src.inviteDmUnavailableAt ? new Date(src.inviteDmUnavailableAt) : null;
  return {
    windows,
    inviteDmSentAt: dmRaw && !Number.isNaN(dmRaw.getTime()) ? dmRaw : null,
    inviteDmUnavailableAt: dmSkipRaw && !Number.isNaN(dmSkipRaw.getTime()) ? dmSkipRaw : null,
  };
}

function subjectChatHasActive(chat?) {
  return (chat?.windows || []).some((w?) => !w.leftAt);
}

function subjectChatEverInvited(chat?) {
  return (chat?.windows || []).length > 0;
}

function messageVisibleInSubjectWindows(msg?, windows?) {
  const t = new Date(msg?.createdAt).getTime();
  if (!Number.isFinite(t)) return false;
  return (windows || []).some((w?) => {
    const from = new Date(w.joinedAt).getTime();
    if (!Number.isFinite(from) || t < from) return false;
    if (!w.leftAt) return true;
    const to = new Date(w.leftAt).getTime();
    return Number.isFinite(to) && t <= to;
  });
}

function serializeSubjectChatMeta(chat, { inviteOnly, status, isStaffReviewer }) {
  const active = subjectChatHasActive(chat);
  const invited = subjectChatEverInvited(chat);
  const pending = String(status || "").toLowerCase() === "pending";
  return {
    inviteOnly: Boolean(inviteOnly),
    invited,
    active,
    canInvite: Boolean(isStaffReviewer && inviteOnly && pending && !active),
    canRemove: Boolean(isStaffReviewer && inviteOnly && active),
    windows: (chat?.windows || []).map((w?) => ({
      joinedAt: w.joinedAt ? new Date(w.joinedAt).toISOString() : null,
      leftAt: w.leftAt ? new Date(w.leftAt).toISOString() : null,
    })),
  };
}

async function patchSubjectChat(guildId?, dedupeKey?, mutator?) {
  const doc = await SiteDocument.findOne({
    docType: WORKFLOW_DOC,
    guildId: String(guildId || ""),
    dedupeKey: String(dedupeKey || ""),
  }).select("workflowFields");
  if (!doc) return null;
  const prev =
    doc.workflowFields && typeof doc.workflowFields === "object"
      ? typeof doc.workflowFields.toObject === "function"
        ? doc.workflowFields.toObject()
        : { ...doc.workflowFields }
      : {};
  const chat = normalizeSubjectChat(prev.subjectChat);
  await mutator(chat, doc);
  prev.subjectChat = {
    windows: (chat.windows || []).map((w?) => ({
      joinedAt: w.joinedAt,
      leftAt: w.leftAt || null,
    })),
    inviteDmSentAt: chat.inviteDmSentAt || null,
    inviteDmUnavailableAt: chat.inviteDmUnavailableAt || null,
  };
  doc.workflowFields = prev;
  doc.markModified("workflowFields");
  await doc.save();
  return chat;
}

function appealLabelFromWorkflow(workflow?) {
  const kind = String(workflow?.workflowKind || workflow?.workflowType || "")
    .trim()
    .toLowerCase();
  if (kind === "unmute") return "richiesta unmute";
  if (kind === "unban") return "richiesta unban";
  return "richiesta unban/unmute";
}

function subjectInviteLabel(queue?, workflow?) {
  if (String(queue || "") === "candidature") return "candidatura";
  return appealLabelFromWorkflow(workflow);
}

function isDiscordDmUnavailableError(err?) {
  const code = Number(err?.code || err?.rawError?.code || 0);
  if (code === 50007 || code === 50278) return true;
  const msg = String(err?.rawError?.message || err?.message || err || "").toLowerCase();
  return msg.includes("no mutual guild") || msg.includes("cannot send messages to this user");
}

async function resolveSubjectInviteDmTarget(access?, userId?) {
  const guild = access?.guild;
  if (!guild) return { ok: false, reason: "no_guild" };
  const member =
    guild.members?.cache?.get?.(userId) ||
    (await withTimeout(guild.members.fetch(userId).catch(() => null), 1800, "member_timeout").catch(() => null));
  if (member && typeof member.send === "function") return { ok: true, target: member };
    const ban = await guild.bans.fetch(userId).catch(() => null);
  if (ban || !member) return { ok: false, reason: "dm_unavailable" };
  return { ok: false, reason: "no_user" };
}

async function sendSubjectInviteDmOnce(client?, access?, chat?) {
  if (chat.inviteDmSentAt) return { sent: false, reason: "already_sent" };
  if (chat.inviteDmUnavailableAt) return { sent: false, reason: "dm_unavailable" };
  const userId = String(access.subjectUserId || "").trim();
  if (!userId) return { sent: false, reason: "no_user" };
  const label = subjectInviteLabel(access.queue, access.workflow);
  const path = subjectWorkflowChatPath(access.queue, access.dedupeKey);
  const payload = {
    content: `Hai un messaggio nella tua **${label}** su Vinili & Caffè.\nApri la chat per leggere e rispondere allo staff.`,
    components: [buildSiteLinkRow("Apri chat", path)],
  };

  const deliver = await resolveSubjectInviteDmTarget(access, userId);
  if (!deliver.ok) {
    if (deliver.reason === "dm_unavailable") chat.inviteDmUnavailableAt = new Date();
    return { sent: false, reason: deliver.reason || "dm_unavailable" };
  }

  try {
    await deliver.target.send(payload);
    chat.inviteDmSentAt = new Date();
    return { sent: true };
  } catch (err) {
    if (isDiscordDmUnavailableError(err)) {
      chat.inviteDmUnavailableAt = new Date();
      return { sent: false, reason: "dm_unavailable" };
    }
    const msg = String(err?.rawError?.message || err?.message || err || "");
    global.logger?.warn?.("[workflow-chat] invite DM failed:", msg);
    return { sent: false, reason: "dm_failed" };
  }
}

async function createSystemChatMessage(access?, content?) {
  const doc = await SiteWorkflowChatMessage.create({
    guildId: access.guild.id,
    dedupeKey: access.dedupeKey,
    queue: access.queue,
    subjectUserId: access.subjectUserId,
    authorId: "system",
    authorName: "Sistema",
    authorAvatarUrl: "",
    authorKind: "system",
    content: String(content || "").trim().slice(0, MAX_CONTENT) || " ",
    imageUrls: [],
  }).catch(() => null);
  if (!doc) return null;
  const message = serializeMessage(doc, new Map());
  emitChatEvent("workflow_chat_message", {
    dedupeKey: access.dedupeKey,
    queue: access.queue,
    message,
  });
  return message;
}

async function resolveSubjectDisplayName(client?, access?) {
  const uid = String(access?.subjectUserId || "").trim();
  const fields =
    access?.workflow?.workflowFields && typeof access.workflow.workflowFields === "object"
      ? access.workflow.workflowFields
      : {};
  const fromFields = String(
    fields.displayName || fields.username || fields.userName || fields.subjectName || "",
  ).trim();
  if (fromFields && !/^\d{16,22}$/.test(fromFields)) return fromFields.slice(0, 80);

  if (uid && access?.guild?.members?.cache?.get?.(uid)) {
    return displayNameForMember(access.guild.members.cache.get(uid)).slice(0, 80);
  }
  if (uid && access?.guild?.members?.fetch) {
    const m = await withTimeout(access.guild.members.fetch(uid).catch(() => null), 2500, "member_timeout").catch(
      () => null,
    );
    if (m) return displayNameForMember(m).slice(0, 80);
  }
  if (uid && client?.users?.fetch) {
    const u = await withTimeout(client.users.fetch(uid).catch(() => null), 2500, "user_timeout").catch(() => null);
    const name = String(u?.globalName || u?.username || "").trim();
    if (name) return name.slice(0, 80);
  }
  return uid ? `Utente ${uid}` : "Richiedente";
}

async function ensurePauseWorkflowFromKey(client?, guildId?, dedupeKey?) {
  try {
    const { ensurePauseWorkflowDoc } = require("./siteStaffWorkflowStore") as typeof import("./siteStaffWorkflowStore");
    return await ensurePauseWorkflowDoc(client, guildId, dedupeKey);
  } catch {
    return null;
  }
}

async function ensureInviteQueueWorkflowFromKey(client?, guildId?, dedupeKey?, queue?) {
  const q = String(queue || "").trim().toLowerCase();
  const key = String(dedupeKey || "").trim();
  const parts = key.split(":");
  if (parts[0] !== q || !parts[1]) return null;
  const messageId = String(parts[1] || "").trim();
  if (!/^\d{16,22}$/.test(messageId)) return null;
  try {
    const guild = await resolveMainGuild(client);
    if (!guild || String(guild.id) !== String(guildId || "")) return null;
    if (q === "appelli") {
      const { getAppealDetail } = require("./siteStaffAppealsRuntime") as typeof import("./siteStaffAppealsRuntime");
      const { persistAppealWorkflowFromPayload } = require("./siteStaffWorkflowStore") as typeof import("./siteStaffWorkflowStore");
      const live = await getAppealDetail(guild, messageId).catch(() => null);
      if (!live?.userId) return null;
      await persistAppealWorkflowFromPayload(guild, {
        messageId,
        channelId: live.channelId,
        userId: live.userId,
        kind: live.kind,
        status: live.status || "pending",
        title: live.title,
        body: live.body,
        createdAt: live.createdAt,
        displayName: live.displayName || "",
        avatarUrl: live.avatarUrl || "",
      }).catch(() => null);
    } else if (q === "candidature") {
      const { getCandidatureApplicationDetail } = require("../../Events/interaction/candidatureApplicationHandlers") as typeof import("../../Events/interaction/candidatureApplicationHandlers");
      const { persistCandidatureWorkflowFromPayload } = require("./siteStaffWorkflowStore") as typeof import("./siteStaffWorkflowStore");
      const live = await getCandidatureApplicationDetail(guild, messageId).catch(() => null);
      if (!live?.userId) return null;
      await persistCandidatureWorkflowFromPayload(guild, {
        messageId,
        channelId: live.channelId,
        userId: live.userId,
        type: live.type,
        status: live.status || "pending",
        title: live.title,
        body: live.body,
        createdAt: live.createdAt,
      }).catch(() => null);
    } else {
      return null;
    }
    return await loadWorkflowDoc(guildId, key);
  } catch {
    return null;
  }
}

function emitChatEvent(type?, payload?) {
  try {
    broadcastSiteRealtime({
      type,
      at: new Date().toISOString(),
      ...payload,
    });
  } catch (_) {}
}

async function withTimeout(promise?, ms?, label = "timeout") {
  let timer = null;
  try {
    return await Promise.race([
      promise,
      new Promise((_?, reject?) => {
        timer = setTimeout(() => reject(new Error(label)), Math.max(500, Number(ms) || 5000));
      }),
    ]);
  } finally {
    if (timer) clearTimeout(timer);
  }
}

async function resolveOAuthIdentity(accessToken?) {
  const token = normalizeHeaderSecret(accessToken);
  if (!token) {
    return { ok: false, status: 401, error: "missing_token", message: "Token mancante." };
  }
  try {
    const meRes = await withTimeout(
      fetch("https://discord.com/api/v10/users/@me", {
        headers: { Authorization: `Bearer ${token}` },
      }),
      8000,
      "oauth_timeout",
    );
    if (!meRes.ok) {
      return {
        ok: false,
        status: 401,
        error: "invalid_token",
        message: "Sessione Discord non valida o scaduta: effettua di nuovo il login.",
      };
    }
    const meJson: any = await meRes.json();
    const userId = String(meJson?.id || "").trim();
    if (!/^\d{17,20}$/.test(userId)) {
      return { ok: false, status: 401, error: "invalid_user", message: "Profilo Discord non valido." };
    }
    return { ok: true, userId, meJson };
  } catch (err) {
    const timedOut = /timeout/i.test(String(err?.message || err || ""));
    return {
      ok: false,
      status: timedOut ? 504 : 502,
      error: timedOut ? "oauth_timeout" : "discord_unreachable",
      message: timedOut
        ? "Verifica sessione Discord troppo lenta. Riprova."
        : "Impossibile contattare Discord.",
    };
  }
}

function syntheticMemberFromOauth(oauth?) {
  const userId = String(oauth?.userId || "").trim();
  const me = oauth?.meJson || {};
  const username = String(me.username || me.global_name || "Utente").trim() || "Utente";
  const globalName = String(me.global_name || "").trim();
  const avatar = me.avatar
    ? `https://cdn.discordapp.com/avatars/${userId}/${me.avatar}.png?size=128`
    : "";
  return {
    id: userId,
    displayName: globalName || username,
    user: {
      id: userId,
      username,
      globalName: globalName || null,
      avatar: me.avatar || null,
      displayAvatarURL: () => avatar,
    },
  };
}

async function resolveSubjectChatMember(client, guild, accessToken, { inviteOnly }) {
      if (inviteOnly) {
    const oauth = await resolveOAuthIdentity(accessToken);
    if (!oauth.ok) return oauth;
    let member = guild?.members?.cache?.get?.(oauth.userId) || null;
    if (!member) {
      member = await withTimeout(guild.members.fetch(oauth.userId).catch(() => null), 3500, "member_timeout").catch(
        () => null,
      );
    }
    return {
      ok: true,
      userId: oauth.userId,
      member: member || syntheticMemberFromOauth(oauth),
    };
  }

  const userRes = await resolveWebsiteGuildMember(client, accessToken);
  if (!userRes.ok) {
    return {
      ok: false,
      status: userRes.status || 403,
      error: userRes.error || "forbidden",
      message: userRes.message || "Non autorizzato.",
    };
  }
  return { ok: true, userId: userRes.userId, member: userRes.member };
}

async function resolveWorkflowChatAccess(client?, accessToken?, dedupeKey?, opts: Record<string, any> = {}) {
  const token = normalizeHeaderSecret(accessToken);
  if (!token) {
    return {
      ok: false,
      status: 401,
      error: "missing_token",
      message: "Header Authorization: Bearer <token> richiesto.",
    };
  }

  const guild = await resolveMainGuild(client);
  if (!guild) {
    return { ok: false, status: 503, error: "guild_unavailable", message: "Server non disponibile." };
  }

  let key = canonicalizeWorkflowChatKey(dedupeKey);
  if (!key) {
    return { ok: false, status: 400, error: "bad_key", message: "dedupeKey mancante." };
  }

  const queue = parseQueueFromDedupe(key);
  if (!queue) {
    return { ok: false, status: 400, error: "bad_key", message: "Pratica non valida." };
  }

  let workflow =
    (await loadWorkflowDoc(guild.id, key)) ||
    (queue === "pause" ? await ensurePauseWorkflowFromKey(client, guild.id, key) : null);
  if (!workflow && (queue === "appelli" || queue === "candidature")) {
    workflow = await ensureInviteQueueWorkflowFromKey(client, guild.id, key, queue);
  }
  /* staffRevChatKey1: client a volte manda revisione:<id> invece di boards:revisione:<id> */
  if (!workflow && queue === "revisione") {
    const alt = canonicalizeWorkflowChatKey(key);
    if (alt && alt !== key) {
      workflow = await loadWorkflowDoc(guild.id, alt);
      if (workflow) key = alt;
    }
    const raw = String(dedupeKey || "").trim();
    if (!workflow && raw && raw !== key && raw !== alt) {
      workflow = await loadWorkflowDoc(guild.id, raw);
      if (workflow) key = String(workflow.dedupeKey || raw);
    }
  }
  if (!workflow) {
    return { ok: false, status: 404, error: "not_found", message: "Pratica non trovata." };
  }
  if (workflow.dedupeKey) key = String(workflow.dedupeKey);

  const subjectUserId = String(workflow.userId || "").trim();
  const status = String(workflow.status || "pending").toLowerCase();
  const pending = status === "pending";
  const inviteOnly = isInviteOnlyQueue(queue);
  const subjectChat = normalizeSubjectChat(workflow?.workflowFields?.subjectChat);
  const subjectActive = subjectChatHasActive(subjectChat);
  const subjectEverInvited = subjectChatEverInvited(subjectChat);
  const subjectMayJoin = inviteOnly && subjectEverInvited;

  const staffAccess = await assertWebsiteStaffAccess(client, token, {
    req: opts.req,
    viewAs: opts.viewAs,
  });
  if (staffAccess.ok && memberCanAccessQueue(staffAccess.member, guild, queue)) {
    const memberId = String(staffAccess.member?.id || "").trim();
    const isSubject = Boolean(subjectUserId && memberId && subjectUserId === memberId);
    /* boardsRevSelfChat1: reviewer website-staff SEMPRE entra come staff.
       Prima: se eri anche mittente (es. scheda bacheca propria) →
       "Questa chat è riservata allo staff" 🤡 */
    return {
      ok: true,
      guild,
      workflow,
      queue,
      dedupeKey: key,
      member: staffAccess.member,
      isStaffReviewer: true,
      isSubject,
      authorKind: "staff",
      canSend: pending,
      status,
      subjectUserId,
      inviteOnly,
      subjectChat,
      subjectActive,
      subjectMayJoin,
    };
  }

  if (!subjectMayJoin) {
    return {
      ok: false,
      status: 403,
      error: inviteOnly ? "not_invited" : "forbidden",
      message: inviteOnly
        ? "Non sei ancora stato aggiunto a questa discussione."
        : "Questa chat è riservata allo staff.",
    };
  }

  const userRes = await resolveSubjectChatMember(client, guild, token, { inviteOnly });
  if (!userRes.ok) {
    return {
      ok: false,
      status: userRes.status || 403,
      error: userRes.error || "forbidden",
      message: userRes.message || "Non autorizzato.",
    };
  }

  if (!subjectUserId || String(userRes.userId) !== subjectUserId) {
    return { ok: false, status: 403, error: "forbidden", message: "Non autorizzato." };
  }

  return {
    ok: true,
    guild,
    workflow,
    queue,
    dedupeKey: key,
    member: userRes.member,
    isStaffReviewer: false,
    isSubject: true,
    authorKind: "user",
    canSend: pending && (!inviteOnly || subjectActive),
    status,
    subjectUserId,
    inviteOnly,
    subjectChat,
    subjectActive,
    subjectMayJoin,
  };
}

async function handleSiteStaffWorkflowChatGet(client?, req?, res?) {
  try {
    const dedupeKey = String(req.query?.dedupeKey || req.query?.key || "").trim();
    const access = await resolveWorkflowChatAccess(client, bearerFromRequest(req), dedupeKey, { req });
    if (!access.ok) {
      return res.status(access.status).json({ ok: false, error: access.error, message: access.message });
    }

    const docs = await SiteWorkflowChatMessage.find({
      guildId: access.guild.id,
      dedupeKey: access.dedupeKey,
    })
      .sort({ createdAt: 1 })
      .limit(MAX_MESSAGES)
      .lean()
      .catch(() => []);

    let visible = docs || [];
    if (access.isSubject && !access.isStaffReviewer && access.inviteOnly) {
      visible = visible.filter((d?) => messageVisibleInSubjectWindows(d, access.subjectChat?.windows));
    }

    const readerId = String(access.member?.id || "").trim();
    const marked = await markWorkflowMessagesRead(readerId, visible, { dedupeKey: access.dedupeKey });
    if (marked.messageIds.length) {
      emitChatEvent("workflow_chat_receipts", {
        dedupeKey: access.dedupeKey,
        queue: access.queue,
        readerId,
        messageIds: marked.messageIds,
        at: marked.at,
      });
    }

    const replyMap = new Map(visible.map((d?) => [String(d._id), d]));
    const avatarOverrides = await loadAuthorAvatarOverrides(client, visible);
    const roleOverrides = await loadAuthorRoleOverrides(access.guild, visible);
    const subjectChatMeta = serializeSubjectChatMeta(access.subjectChat, {
      inviteOnly: access.inviteOnly,
      status: access.status,
      isStaffReviewer: access.isStaffReviewer,
    });

    return res.status(200).json({
      ok: true,
      dedupeKey: access.dedupeKey,
      queue: access.queue,
      status: access.status,
      canSend: access.canSend,
      isSubject: access.isSubject,
      isStaffReviewer: access.isStaffReviewer,
      subjectUserId: access.subjectUserId,
      subjectChat: subjectChatMeta,
      maxImages: MAX_IMAGES,
      messages: visible.map((d?) => serializeMessage(d, replyMap, avatarOverrides, roleOverrides)),
      viewerId: readerId,
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-workflow-chat GET:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteStaffWorkflowChatReadPost(client?, req?, res?) {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const dedupeKey = String(body.dedupeKey || body.key || req.query?.dedupeKey || "").trim();
    const access = await resolveWorkflowChatAccess(client, bearerFromRequest(req), dedupeKey, { req });
    if (!access.ok) {
      return res.status(access.status).json({ ok: false, error: access.error, message: access.message });
    }
    const readerId = String(access.member?.id || "").trim();
    if (!readerId) {
      return res.status(401).json({ ok: false, error: "unauthorized", message: "Sessione non valida." });
    }
    const rawIds = Array.isArray(body.messageIds) ? body.messageIds : [];
    const wantIds = [
      ...new Set(rawIds.map((id?) => String(id || "").trim()).filter((id?) => mongoose.isValidObjectId(id))),
    ].slice(0, 120);
    const q = { guildId: access.guild.id, dedupeKey: access.dedupeKey };
    if (wantIds.length) q._id = { $in: wantIds };
    let docs = await SiteWorkflowChatMessage.find(q)
      .sort({ createdAt: -1 })
      .limit(wantIds.length ? wantIds.length : 120)
      .lean()
      .catch(() => []);
    if (access.isSubject && !access.isStaffReviewer && access.inviteOnly) {
      docs = (docs || []).filter((d?) => messageVisibleInSubjectWindows(d, access.subjectChat?.windows));
    }
    const marked = await markWorkflowMessagesRead(readerId, docs || [], { dedupeKey: access.dedupeKey });
    if (marked.messageIds.length) {
      emitChatEvent("workflow_chat_receipts", {
        dedupeKey: access.dedupeKey,
        queue: access.queue,
        readerId,
        messageIds: marked.messageIds,
        at: marked.at,
      });
    }
    return res.status(200).json({
      ok: true,
      dedupeKey: access.dedupeKey,
      messageIds: marked.messageIds,
      at: marked.at,
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-workflow-chat read:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteStaffWorkflowChatPost(client?, req?, res?) {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const dedupeKey = String(body.dedupeKey || body.key || "").trim();

    const access = await resolveWorkflowChatAccess(client, bearerFromRequest(req), dedupeKey, { req });
    if (!access.ok) {
      return res.status(access.status).json({ ok: false, error: access.error, message: access.message });
    }
    if (!access.canSend) {
      return res.status(409).json({ ok: false, error: "closed", message: "La pratica è chiusa: puoi solo leggere la chat." });
    }

    const authorId = String(access.member?.id || "").trim();
    if (!authorId) {
      return res.status(401).json({ ok: false, error: "unauthorized", message: "Sessione non valida." });
    }

    let content = String(body.content || "").trim().slice(0, MAX_CONTENT);
    const authorIds = await SiteWorkflowChatMessage.distinct("authorId", {
      guildId: access.guild.id,
      dedupeKey: access.dedupeKey,
      authorKind: { $ne: "system" },
    }).catch(() => []);
    const allowedUserIds = new Set(
      [access.subjectUserId, authorId, ...(authorIds || []).map((id?) => String(id || "").trim())].filter(Boolean),
    );
    let allowedRoleIds = new Set();
    if (access.isStaffReviewer && access.guild?.members?.cache) {
      try {
        for (const uid of allowedUserIds) {
          const m = access.guild.members.cache.get(uid);
          if (!m?.roles?.cache) continue;
          for (const rid of m.roles.cache.keys()) {
            if (String(rid) !== String(access.guild.id)) allowedRoleIds.add(String(rid));
          }
        }
      } catch (_) {
        allowedRoleIds = new Set();
      }
    }
    content = sanitizeWebTicketMentionsToScope(content, {
      allowedUserIds,
      allowedRoleIds,
      allowRoleMentions: Boolean(access.isStaffReviewer),
    });
    content = sanitizeWebTicketChannelMentions(content, access.member, access.guild);
    clearChatTyping({
      kind: "workflow",
      id: access.dedupeKey,
      userId: authorId,
      eventType: "workflow_chat_typing",
      extra: { dedupeKey: access.dedupeKey, queue: access.queue },
    });

    const authorAvatarUrl = await resolveAuthorAvatarUrl(client, access.member);
    const authorRoleLabel = authorRoleLabelForMember(access.member, access.authorKind);

    let replyToId = null;
    const rawReply = String(body.replyToId || body.replyTo || "").trim();
    if (rawReply && mongoose.isValidObjectId(rawReply)) {
      const target = await SiteWorkflowChatMessage.findOne({
        _id: rawReply,
        guildId: access.guild.id,
        dedupeKey: access.dedupeKey,
      })
        .select("_id")
        .lean()
        .catch(() => null);
      if (target) replyToId = target._id;
    }

    const imageUrls = saveWorkflowImages(dedupeKey, body.images);
    if (!content && !imageUrls.length) {
      return res.status(400).json({ ok: false, error: "empty", message: "Messaggio vuoto." });
    }

    const doc = await SiteWorkflowChatMessage.create({
      guildId: access.guild.id,
      dedupeKey: access.dedupeKey,
      queue: access.queue,
      subjectUserId: access.subjectUserId,
      authorId,
      authorName: displayNameForMember(access.member),
      authorAvatarUrl,
      authorRoleLabel,
      authorKind: access.authorKind,
      content: content || (imageUrls.length ? " " : ""),
      imageUrls,
      replyToId,
    }).catch(() => null);

    if (!doc) {
      return res.status(500).json({ ok: false, error: "save_failed", message: "Salvataggio fallito." });
    }

    const replyMap = replyToId
      ? await SiteWorkflowChatMessage.find({ _id: { $in: [replyToId] } })
          .lean()
          .then((rows?) => new Map((rows || []).map((d?) => [String(d._id), d])))
          .catch(() => new Map())
      : new Map();

    const message = serializeMessage(doc, replyMap);
    emitChatEvent("workflow_chat_message", { dedupeKey: access.dedupeKey, queue: access.queue, message });

    try {
      const subjectInChat =
        !access.inviteOnly || subjectChatHasActive(access.subjectChat);
      let participantStaffIds = [];
      try {
        const peerRows = await SiteWorkflowChatMessage.find({
          guildId: access.guild.id,
          dedupeKey: access.dedupeKey,
          authorKind: "staff",
        })
          .select("authorId")
          .lean()
          .catch(() => []);
        participantStaffIds = [
          ...new Set(
            (peerRows || [])
              .map((r?) => String(r?.authorId || "").trim())
              .filter((id?) => /^\d{16,22}$/.test(id)),
          ),
        ];
      } catch (_) {}

      const mentioned = await notifyWorkflowMentions({
        guild: access.guild,
        guildId: access.guild.id,
        queue: access.queue,
        dedupeKey: access.dedupeKey,
        subjectUserId: access.subjectUserId,
        authorId,
        authorName: displayNameForMember(access.member),
        content,
        workflow: access.workflow,
      }).catch(() => []);

      await notifyWorkflowChatNewMessage({
        client,
        guild: access.guild,
        guildId: access.guild.id,
        queue: access.queue,
        dedupeKey: access.dedupeKey,
        subjectUserId: access.subjectUserId,
        authorId,
        authorKind: access.authorKind,
        authorName: displayNameForMember(access.member),
        preview: content || (imageUrls.length ? "Allegato" : ""),
        subjectInChat,
        workflow: access.workflow,
        kind: access.workflow?.workflowKind,
        roleId: access.workflow?.workflowRoleId || access.workflow?.workflowFields?.roleId,
        participantStaffIds,
        skipUserIds: mentioned || [],
        messageId: String(doc?._id || ""),
      });
    } catch (_) {}

    return res.status(201).json({ ok: true, message });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-workflow-chat POST:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteStaffWorkflowChatReactionPost(client?, req?, res?) {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const dedupeKey = String(body.dedupeKey || req.query?.dedupeKey || "").trim();
    const messageId = String(body.messageId || req.params?.messageId || "").trim();
    const access = await resolveWorkflowChatAccess(client, bearerFromRequest(req), dedupeKey, { req });
    if (!access.ok) {
      return res.status(access.status).json({ ok: false, error: access.error, message: access.message });
    }
    if (!access.canSend) {
      return res.status(409).json({ ok: false, error: "closed", message: "La pratica è chiusa: puoi solo leggere la chat." });
    }
    if (!mongoose.isValidObjectId(messageId)) {
      return res.status(400).json({ ok: false, error: "invalid_message", message: "Messaggio non valido." });
    }

    const parsed = parseReactionInput(body.emoji ?? body.markup, body);
    if (!parsed) {
      return res.status(400).json({ ok: false, error: "invalid_emoji", message: "Emoji non valida." });
    }

    const msg = await SiteWorkflowChatMessage.findOne({
      _id: messageId,
      guildId: access.guild.id,
      dedupeKey: access.dedupeKey,
    });
    if (!msg) {
      return res.status(404).json({ ok: false, error: "not_found", message: "Messaggio non trovato." });
    }
    if (String(msg.authorKind || "") === "system") {
      return res.status(400).json({ ok: false, error: "system_message", message: "Non puoi reagire ai messaggi di sistema." });
    }

    const reactions = serializeReactions(msg.reactions);
    let row = reactions.find((r?) => String(r.key) === parsed.key);
    let added = false;
    const uid = String(access.member?.id || "");
    const uname = displayNameForMember(access.member);

    if (row) {
      const users = Array.isArray(row.users) ? row.users.slice() : [];
      const idx = users.findIndex((u?) => String(u.id) === uid);
      if (idx >= 0) {
        users.splice(idx, 1);
        row.users = users;
        row.userIds = users.map((u?) => u.id);
        if (!users.length) {
          const ri = reactions.findIndex((r?) => String(r.key) === parsed.key);
          if (ri >= 0) reactions.splice(ri, 1);
        }
        added = false;
      } else {
        if (users.length >= MAX_REACTION_USERS) {
          return res.status(429).json({ ok: false, error: "reaction_full", message: "Troppe reazioni su questa emoji." });
        }
        users.push({ id: uid, name: uname });
        row.users = users;
        row.userIds = users.map((u?) => u.id);
        added = true;
      }
    } else {
      if (reactions.length >= MAX_REACTION_KINDS) {
        return res.status(429).json({
          ok: false,
          error: "too_many_reactions",
          message: `Massimo ${MAX_REACTION_KINDS} emoji diverse per messaggio.`,
        });
      }
      reactions.push({
        key: parsed.key,
        emoji: parsed.emoji,
        emojiId: parsed.emojiId,
        name: parsed.name || "",
        animated: Boolean(parsed.animated),
        userIds: [uid],
        users: [{ id: uid, name: uname }],
      });
      added = true;
    }

    msg.reactions = reactions;
    msg.markModified("reactions");
    await msg.save();

    const replyMap = msg.replyToId
      ? await SiteWorkflowChatMessage.find({ _id: msg.replyToId })
          .lean()
          .then((rows?) => new Map((rows || []).map((d?) => [String(d._id), d])))
          .catch(() => new Map())
      : new Map();

    const message = serializeMessage(msg.toObject(), replyMap);
    emitChatEvent("workflow_chat_reaction", {
      dedupeKey: access.dedupeKey,
      queue: access.queue,
      message,
      added,
      actorId: uid,
    });

    return res.status(200).json({ ok: true, message, added });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-workflow-chat reaction:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteStaffWorkflowChatEmojisGet(client?, req?, res?) {
  try {
    const dedupeKey = String(req.query?.dedupeKey || "").trim();
    const access = await resolveWorkflowChatAccess(client, bearerFromRequest(req), dedupeKey, { req });
    if (!access.ok) {
      return res.status(access.status).json({ ok: false, error: access.error, message: access.message });
    }
    await access.guild.emojis.fetch().catch(() => null);
    const emojis = [...access.guild.emojis.cache.values()].map((e?) => ({
      id: String(e.id),
      name: String(e.name || ""),
      animated: Boolean(e.animated),
    }));
    res.setHeader("Cache-Control", "private, max-age=60");
    return res.status(200).json({ ok: true, guildId: access.guild.id, count: emojis.length, emojis });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-workflow-chat emojis:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteStaffWorkflowChatFileGet(client?, req?, res?) {
  try {
    const folderKey = String(req.params?.folderKey || "").trim();
    const fileName = path.basename(String(req.params?.fileName || "").trim());
    if (!folderKey || !fileName || !/^[a-f0-9]{32}$/.test(folderKey)) {
      return res.status(400).json({ ok: false, error: "bad_path", message: "File non valido." });
    }
    const dedupeKey = String(req.query?.dedupeKey || "").trim();
    if (!dedupeKey || uploadFolderKey(dedupeKey) !== folderKey) {
      return res.status(403).json({ ok: false, error: "forbidden", message: "Accesso negato." });
    }
    const access = await resolveWorkflowChatAccess(client, bearerFromRequest(req), dedupeKey, { req });
    if (!access.ok) {
      return res.status(access.status).json({ ok: false, error: access.error, message: access.message });
    }
    const filePath = path.join(UPLOAD_ROOT, folderKey, fileName);
    if (!filePath.startsWith(UPLOAD_ROOT) || !fs.existsSync(filePath)) {
      return res.status(404).json({ ok: false, error: "not_found", message: "File non trovato." });
    }
    const ext = path.extname(fileName).toLowerCase();
    const type =
      ext === ".png"
        ? "image/png"
        : ext === ".webp"
          ? "image/webp"
          : ext === ".gif"
            ? "image/gif"
            : ext === ".mp4"
              ? "video/mp4"
              : ext === ".webm"
                ? "video/webm"
                : ext === ".mov"
                  ? "video/quicktime"
                  : "application/octet-stream";
    res.setHeader("Cache-Control", "private, max-age=3600");
    if (type !== "application/octet-stream") res.type(type);
    return res.sendFile(filePath);
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-workflow-chat file:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteStaffWorkflowChatSubjectPost(client?, req?, res?) {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const dedupeKey = String(body.dedupeKey || body.key || req.query?.dedupeKey || "").trim();
    const action = String(body.action || body.op || "").trim().toLowerCase();
    if (action !== "invite" && action !== "remove") {
      return res.status(400).json({
        ok: false,
        error: "bad_action",
        message: 'Azione non valida (usa "invite" o "remove").',
      });
    }

    const access = await resolveWorkflowChatAccess(client, bearerFromRequest(req), dedupeKey, { req });
    if (!access.ok) {
      return res.status(access.status).json({ ok: false, error: access.error, message: access.message });
    }
    if (!access.isStaffReviewer) {
      return res.status(403).json({ ok: false, error: "forbidden", message: "Solo lo staff può gestire la chat." });
    }
    if (!access.inviteOnly) {
      return res.status(400).json({
        ok: false,
        error: "not_supported",
        message: "Questa pratica non supporta l'invito del richiedente.",
      });
    }
    if (String(access.status || "").toLowerCase() !== "pending" && action === "invite") {
      return res.status(409).json({
        ok: false,
        error: "closed",
        message: "La pratica è chiusa: non puoi più aggiungere il richiedente.",
      });
    }

    let chat = null;
    let dm = { sent: false };
    if (action === "invite") {
      if (subjectChatHasActive(access.subjectChat)) {
        return res.status(409).json({
          ok: false,
          error: "already_active",
          message: "Il richiedente è già nella discussione.",
        });
      }
      chat = await patchSubjectChat(access.guild.id, access.dedupeKey, async (next?) => {
        next.windows.push({ joinedAt: new Date(), leftAt: null });
        dm = await sendSubjectInviteDmOnce(client, access, next);
      });
      if (!chat) {
        return res.status(500).json({ ok: false, error: "save_failed", message: "Salvataggio fallito." });
      }
      const subjectName = await resolveSubjectDisplayName(client, access);
      await createSystemChatMessage(
        access,
        `${subjectName} è stato aggiunto alla discussione.`,
      );
      try {
        await notifyWorkflowSubjectInvited({
          guild: access.guild,
          queue: access.queue,
          subjectUserId: access.subjectUserId,
          dedupeKey: access.dedupeKey,
          actorId: String(access.member?.id || ""),
          actorName: displayNameForMember(access.member),
          workflow: access.workflow,
          kind: access.workflow?.workflowKind,
          roleId: access.workflow?.workflowRoleId || access.workflow?.workflowFields?.roleId,
        });
      } catch (_) {}
    } else {
      if (!subjectChatHasActive(access.subjectChat)) {
        return res.status(409).json({
          ok: false,
          error: "not_active",
          message: "Il richiedente non è nella discussione.",
        });
      }
      const subjectName = await resolveSubjectDisplayName(client, access);
      const sysMsg = await createSystemChatMessage(
        access,
        `${subjectName} è stato rimosso dalla discussione.`,
      );
      const leftAt = sysMsg?.createdAt ? new Date(sysMsg.createdAt) : new Date();
      chat = await patchSubjectChat(access.guild.id, access.dedupeKey, (next?) => {
        for (const w of next.windows) {
          if (!w.leftAt) w.leftAt = leftAt;
        }
      });
      if (!chat) {
        return res.status(500).json({ ok: false, error: "save_failed", message: "Salvataggio fallito." });
      }
      try {
        await notifyWorkflowSubjectRemoved({
          guild: access.guild,
          queue: access.queue,
          subjectUserId: access.subjectUserId,
          dedupeKey: access.dedupeKey,
          actorId: String(access.member?.id || ""),
          actorName: displayNameForMember(access.member),
          workflow: access.workflow,
          kind: access.workflow?.workflowKind,
          roleId: access.workflow?.workflowRoleId || access.workflow?.workflowFields?.roleId,
        });
      } catch (_) {}
    }

    const subjectChatMeta = serializeSubjectChatMeta(chat, {
      inviteOnly: true,
      status: access.status,
      isStaffReviewer: true,
    });
    emitChatEvent("workflow_chat_subject", {
      dedupeKey: access.dedupeKey,
      queue: access.queue,
      action,
      subjectChat: subjectChatMeta,
      subjectUserId: access.subjectUserId,
    });

    const inviteDmSent = Boolean(dm?.sent);
    let message = action === "invite" ? "Richiedente aggiunto alla chat." : "Richiedente rimosso dalla chat.";
    if (action === "invite" && !inviteDmSent) {
      message =
        dm?.reason === "dm_unavailable"
          ? "Richiedente aggiunto. DM Discord non disponibile (es. fuori server / unban): notificato sul sito."
          : "Richiedente aggiunto. DM non inviato: notificato sul sito.";
    }

    return res.status(200).json({
      ok: true,
      action,
      subjectChat: subjectChatMeta,
      inviteDmSent,
      inviteDmReason: dm?.reason || null,
      message,
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-workflow-chat subject:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteStaffWorkflowChatMessagePatch(client?, req?, res?) {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const dedupeKey = String(body.dedupeKey || req.query?.dedupeKey || "").trim();
    const messageId = String(req.params?.messageId || body.messageId || "").trim();
    const access = await resolveWorkflowChatAccess(client, bearerFromRequest(req), dedupeKey, { req });
    if (!access.ok) {
      return res.status(access.status).json({ ok: false, error: access.error, message: access.message });
    }
    if (!access.canSend) {
      return res.status(409).json({ ok: false, error: "closed", message: "La pratica è chiusa: puoi solo leggere la chat." });
    }
    if (!mongoose.isValidObjectId(messageId)) {
      return res.status(400).json({ ok: false, error: "invalid_message", message: "Messaggio non valido." });
    }
    const msg = await SiteWorkflowChatMessage.findOne({
      _id: messageId,
      guildId: access.guild.id,
      dedupeKey: access.dedupeKey,
    });
    if (!msg) {
      return res.status(404).json({ ok: false, error: "not_found", message: "Messaggio non trovato." });
    }
    if (String(msg.authorKind || "") === "system") {
      return res.status(400).json({ ok: false, error: "system_message", message: "Non puoi modificare i messaggi di sistema." });
    }
    if (String(msg.authorId || "") !== String(access.member?.id || access.userId || "")) {
      return res.status(403).json({ ok: false, error: "forbidden", message: "Puoi modificare solo i tuoi messaggi." });
    }
    const nextContentRaw = String(body.content ?? "").trim().slice(0, MAX_CONTENT);
    const imageCount = Array.isArray(msg.imageUrls) ? msg.imageUrls.length : 0;
    if (!nextContentRaw && !imageCount) {
      await SiteWorkflowChatMessage.deleteOne({ _id: msg._id });
      emitChatEvent("workflow_chat_message_deleted", {
        dedupeKey: access.dedupeKey,
        queue: access.queue,
        messageId: String(msg._id),
      });
      return res.status(200).json({ ok: true, deleted: true, messageId: String(msg._id) });
    }
    const authorIds = await SiteWorkflowChatMessage.distinct("authorId", {
      guildId: access.guild.id,
      dedupeKey: access.dedupeKey,
      authorKind: { $ne: "system" },
    }).catch(() => []);
    const allowedUserIds = new Set(
      [
        access.subjectUserId,
        String(access.member?.id || access.userId || ""),
        ...(authorIds || []).map((id?) => String(id || "").trim()),
      ].filter(Boolean),
    );
    let allowedRoleIds = new Set();
    if (access.isStaffReviewer && access.guild?.members?.cache) {
      try {
        for (const uid of allowedUserIds) {
          const m = access.guild.members.cache.get(uid);
          if (!m?.roles?.cache) continue;
          for (const rid of m.roles.cache.keys()) {
            if (String(rid) !== String(access.guild.id)) allowedRoleIds.add(String(rid));
          }
        }
      } catch (_) {
        allowedRoleIds = new Set();
      }
    }
    let nextContent = sanitizeWebTicketMentionsToScope(nextContentRaw, {
      allowedUserIds,
      allowedRoleIds,
      allowRoleMentions: Boolean(access.isStaffReviewer),
    });
    nextContent = sanitizeWebTicketChannelMentions(nextContent, access.member, access.guild);
    msg.content = nextContent || "\u200b";
    msg.editedAt = new Date();
    await msg.save();
    const replyMap = new Map();
    if (msg.replyToId) {
      const replyDoc = await SiteWorkflowChatMessage.findById(msg.replyToId).lean().catch(() => null);
      if (replyDoc) replyMap.set(String(replyDoc._id), replyDoc);
    }
    const message = serializeMessage(msg.toObject(), replyMap);
    emitChatEvent("workflow_chat_message", { dedupeKey: access.dedupeKey, queue: access.queue, message });
    return res.status(200).json({ ok: true, message });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-workflow-chat PATCH message:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteStaffWorkflowChatMessageDelete(client?, req?, res?) {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const dedupeKey = String(body.dedupeKey || req.query?.dedupeKey || "").trim();
    const messageId = String(req.params?.messageId || body.messageId || "").trim();
    const access = await resolveWorkflowChatAccess(client, bearerFromRequest(req), dedupeKey, { req });
    if (!access.ok) {
      return res.status(access.status).json({ ok: false, error: access.error, message: access.message });
    }
    if (!access.canSend) {
      return res.status(409).json({ ok: false, error: "closed", message: "La pratica è chiusa: puoi solo leggere la chat." });
    }
    if (!mongoose.isValidObjectId(messageId)) {
      return res.status(400).json({ ok: false, error: "invalid_message", message: "Messaggio non valido." });
    }
    const msg = await SiteWorkflowChatMessage.findOne({
      _id: messageId,
      guildId: access.guild.id,
      dedupeKey: access.dedupeKey,
    });
    if (!msg) {
      return res.status(404).json({ ok: false, error: "not_found", message: "Messaggio non trovato." });
    }
    if (String(msg.authorKind || "") === "system") {
      return res.status(400).json({ ok: false, error: "system_message", message: "Non puoi eliminare i messaggi di sistema." });
    }
    if (String(msg.authorId || "") !== String(access.member?.id || access.userId || "")) {
      return res.status(403).json({ ok: false, error: "forbidden", message: "Puoi eliminare solo i tuoi messaggi." });
    }
    await SiteWorkflowChatMessage.deleteOne({ _id: msg._id });
    emitChatEvent("workflow_chat_message_deleted", {
      dedupeKey: access.dedupeKey,
      queue: access.queue,
      messageId: String(msg._id),
    });
    return res.status(200).json({ ok: true, deleted: true, messageId: String(msg._id) });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-workflow-chat DELETE message:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteStaffWorkflowChatTypingPost(client?, req?, res?) {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const dedupeKey = String(body.dedupeKey || body.key || "").trim();
    const access = await resolveWorkflowChatAccess(client, bearerFromRequest(req), dedupeKey, { req });
    if (!access.ok) {
      return res.status(access.status).json({ ok: false, error: access.error, message: access.message });
    }
    if (!access.canSend) {
      return res.status(409).json({ ok: false, error: "closed", message: "Chat chiusa." });
    }
    const userId = String(access.member?.id || access.userId || "").trim();
    if (!userId) {
      return res.status(401).json({ ok: false, error: "unauthorized", message: "Sessione non valida." });
    }
    if (body.stop === true || body.clear === true) {
      clearChatTyping({
        kind: "workflow",
        id: access.dedupeKey,
        userId,
        eventType: "workflow_chat_typing",
        extra: { dedupeKey: access.dedupeKey, queue: access.queue },
      });
      return res.status(200).json({ ok: true, stopped: true });
    }
    setChatTyping({
      kind: "workflow",
      id: access.dedupeKey,
      userId,
      userName: displayNameForMember(access.member),
      eventType: "workflow_chat_typing",
      extra: { dedupeKey: access.dedupeKey, queue: access.queue },
    });
    return res.status(200).json({ ok: true });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-workflow-chat typing:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteStaffWorkflowChatMentionsGet(client?, req?, res?) {
  try {
    const dedupeKey = String(req.query?.dedupeKey || req.query?.key || "").trim();
    const access = await resolveWorkflowChatAccess(client, bearerFromRequest(req), dedupeKey, { req });
    if (!access.ok) {
      return res.status(access.status).json({ ok: false, error: access.error, message: access.message });
    }

    const q = String(req.query?.q || "")
      .trim()
      .replace(/^[@#]+/, "")
      .toLowerCase()
      .slice(0, 40);
    const kind = String(req.query?.kind || "all").trim().toLowerCase();
    const filter = String(req.query?.filter || "all").trim().toLowerCase(); // all|users|roles
    const wantChannels = kind === "channels";
    const guild = access.guild;
    const guildId = String(guild?.id || "").trim();

    if (wantChannels) {
      const all = await listGuildMentionChannels(client, guildId);
      const visible = all.filter((row?) => memberCanViewChannelId(access.member, guild, row.id));
      const channels = visible
        .filter((row?) => {
          if (!q) return true;
          const name = String(row.name || "").toLowerCase();
          const parent = String(row.parentName || "").toLowerCase();
          return name.includes(q) || parent.includes(q) || String(row.id).includes(q);
        })
        .slice(0, 80);
      return res.status(200).json({ ok: true, channels, users: [], roles: [] });
    }

    const byUserId = new Map();
    const putUser = (row?) => {
      if (!row?.id || byUserId.has(row.id)) return;
      byUserId.set(row.id, row);
    };

    const authors = await SiteWorkflowChatMessage.find({
      guildId,
      dedupeKey: access.dedupeKey,
      authorKind: { $ne: "system" },
    })
      .select("authorId authorName authorAvatarUrl")
      .lean()
      .catch(() => []);

    const seed = [
      access.subjectUserId
        ? {
            id: String(access.subjectUserId),
            name: "Utente",
            avatarUrl: "",
          }
        : null,
      ...(authors || []).map((a?) => ({
        id: String(a.authorId || ""),
        name: String(a.authorName || "Utente").trim() || "Utente",
        avatarUrl: String(a.authorAvatarUrl || ""),
      })),
    ];
    for (const s of seed) {
      if (!s?.id) continue;
      putUser({
        type: "user",
        id: s.id,
        name: s.name,
        username: null,
        avatarUrl: s.avatarUrl || "",
        markup: `<@${s.id}>`,
      });
    }

    if (access.isStaffReviewer) {
      try {
        const { getCachedStaffRoster } = require("./siteStaffRosterCache") as typeof import("./siteStaffRosterCache");
        const roster = await getCachedStaffRoster(client);
        const people = Array.isArray(roster?.sections)
          ? roster.sections.flatMap((s?) => (Array.isArray(s?.members) ? s.members : []))
          : Array.isArray(roster?.people)
            ? roster.people
            : [];
        for (const p of people) {
          const id = String(p?.userId || p?.id || "").trim();
          if (!id) continue;
          putUser({
            type: "user",
            id,
            name: String(p?.displayName || p?.username || p?.name || "Staff").trim() || "Staff",
            username: String(p?.username || "").trim() || null,
            avatarUrl: String(p?.avatarUrl || p?.avatar || ""),
            markup: `<@${id}>`,
            roleName: String(p?.roleName || p?.roleLabel || "").trim() || null,
          });
        }
      } catch (_) {}

      try {
        if (q && typeof guild.members?.search === "function") {
          const found = await guild.members.search({ query: q, limit: 12 }).catch(() => null);
          const list = found && typeof found.values === "function" ? [...found.values()] : [];
          for (const m of list) {
            const id = String(m?.id || m?.user?.id || "").trim();
            if (!id || m.user?.bot) continue;
            putUser({
              type: "user",
              id,
              name: displayNameForMember(m),
              username: String(m.user?.username || "").trim() || null,
              avatarUrl: "",
              markup: `<@${id}>`,
            });
          }
        }
      } catch (_) {}
    }

    let users = [...byUserId.values()];
    if (q) {
      users = users.filter((u?) => {
        const hay = `${u.name || ""} ${u.username || ""} ${u.id}`.toLowerCase();
        return hay.includes(q);
      });
    }
    users = users.slice(0, 24);

    let roles = [];
    if (access.isStaffReviewer && filter !== "users") {
      try {
        const { listGuildPickerData } = require("./siteDashboardPartnershipApi") as typeof import("./siteDashboardPartnershipApi");
        const pickers = await listGuildPickerData(client, guildId, { force: false });
        const allowedRoleIds = new Set();
        for (const u of users) {
          const m = guild.members?.cache?.get?.(u.id);
          if (!m?.roles?.cache) continue;
          for (const rid of m.roles.cache.keys()) {
            if (String(rid) !== guildId) allowedRoleIds.add(String(rid));
          }
        }
        roles = (Array.isArray(pickers?.roles) ? pickers.roles : [])
          .filter((r?) => r && String(r.id) !== guildId)
          .filter((r?) => !allowedRoleIds.size || allowedRoleIds.has(String(r.id)))
          .filter((r?) => {
            if (!q) return true;
            const name = String(r.name || "").toLowerCase();
            return name.includes(q) || String(r.id).includes(q);
          })
          .slice(0, 20)
          .map((r?) => ({
            type: "role",
            id: String(r.id),
            name: String(r.name || "ruolo"),
            color: r.color || null,
            markup: `<@&${r.id}>`,
          }));
      } catch (_) {
        roles = [];
      }
    }

    if (filter === "roles") users = [];
    if (filter === "users") roles = [];

    return res.status(200).json({ ok: true, users, roles, channels: [] });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-workflow-chat mentions:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

export = {
  handleSiteStaffWorkflowChatGet,
  handleSiteStaffWorkflowChatPost,
  handleSiteStaffWorkflowChatReadPost,
  handleSiteStaffWorkflowChatReactionPost,
  handleSiteStaffWorkflowChatEmojisGet,
  handleSiteStaffWorkflowChatFileGet,
  handleSiteStaffWorkflowChatSubjectPost,
  handleSiteStaffWorkflowChatMessagePatch,
  handleSiteStaffWorkflowChatMessageDelete,
  handleSiteStaffWorkflowChatTypingPost,
  handleSiteStaffWorkflowChatMentionsGet,
  purgeWorkflowChatByDedupe,
  parseQueueFromDedupe,
  resolveWorkflowChatAccess,
};
