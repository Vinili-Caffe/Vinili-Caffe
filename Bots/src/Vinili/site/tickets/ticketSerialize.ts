/** Ticket dal sito: come ticket e messaggi vengono mandati al sito (autore, risposte, letture, voti allo staff, anteprime, doppioni). */
const mongoose = require("mongoose") as typeof import("mongoose");
const { WEB_TICKET_STATUS, SiteWebTicketMessage } = require("../../MultiGuild/tickets/data/siteWebTicketSchemas") as typeof import("../../MultiGuild/tickets/data/siteWebTicketSchemas");
const { weakEtagFromParts } = require("../http/siteHttpEtag") as typeof import("../http/siteHttpEtag");
const { CATEGORY_LABELS, formatWebTicketDisplayName, webTicketNameTail, buildWebTicketChannelName, scrubStoredTicketAvatarUrl, sanitizeText } = require("./ticketNames") as typeof import("./ticketNames");
const { cleanStaffRoleDisplayName, buildStaffRoleMapForUserIds, listAddedUsers, ticketHasAddedUser, buildTicketPermissions } = require("./ticketStaffAccess") as typeof import("./ticketStaffAccess");
const { withTicketFileAccessToken } = require("./ticketMedia") as typeof import("./ticketMedia");
const { serializeReactions } = require("./ticketReactions") as typeof import("./ticketReactions");
const { ActivityUserProfile } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");

const webTicketsListCache = new Map();

/* ticketListDedupeSrv1: stessi criteri del client (preview/event/subject ±60s) */
function ticketPreviewCoreSrv(doc?) {
  let prev = String(doc?.lastMessagePreview || "")
    .toLowerCase()
    .replace(/\[embed[^\]]*\]/gi, " ")
    .replace(/\b(?:titolo|title|descrizione|description|footer|fields?)\s*:/gi, " ")
    .replace(/\s+/g, " ")
    .replace(/[*_#`•·:]+/g, " ")
    .replace(/@\S+/g, "@")
    .replace(/nessun contenuto[^\s]*/gi, " ")
    .replace(/\s+/g, " ")
    .trim();
  return prev.slice(0, 28);
}

function ticketEventCoreSrv(doc?) {
  const p = String(doc?.lastMessagePreview || "").toLowerCase();
  if (/__chiusura__|chiusura/.test(p) && /confermato|verr[aà] chiuso|verra chiuso/.test(p)) {
    return "ev:close_confirm";
  }
  if (/ticket claimato|__ticket claimato__/.test(p)) return "ev:claim";
  return "";
}

function ticketSubjectCoreSrv(doc?) {
  return String(doc?.subject || doc?.channelName || "")
    .toLowerCase()
    .replace(/[^\p{L}\p{N}]+/gu, " ")
    .replace(/\s+/g, " ")
    .trim()
    .slice(0, 36);
}

function ticketActivityMsSrv(doc?) {
  const raw = doc?.lastMessageAt || doc?.updatedAt || doc?.createdAt;
  const ms = raw ? new Date(raw).getTime() : 0;
  return Number.isFinite(ms) ? ms : 0;
}

function ticketDedupeScoreSrv(doc?) {
  const msgs = Math.max(0, Number(doc?.messageCount) || 0);
  const prev = ticketPreviewCoreSrv(doc);
  const prevScore = prev && !/nessun contenuto/i.test(prev) ? 1 : 0;
  const num = Math.max(0, Number(doc?.ticketNumber) || 0);
  return msgs * 1e12 + prevScore * 1e10 + num * 1e6 + ticketActivityMsSrv(doc);
}

function ticketsAreImportDupSrv(a?, b?) {
  if (!a || !b) return false;
  if (String(a.userId || "") !== String(b.userId || "")) return false;
  if (String(a.category || "").toLowerCase() !== String(b.category || "").toLowerCase()) return false;
  if (Math.abs(ticketActivityMsSrv(a) - ticketActivityMsSrv(b)) > 60_000) return false;
  const ea = ticketEventCoreSrv(a);
  const eb = ticketEventCoreSrv(b);
  if (ea && eb && ea === eb) return true;
  const pa = ticketPreviewCoreSrv(a);
  const pb = ticketPreviewCoreSrv(b);
  if (pa && pb && pa === pb) return true;
  const sa = ticketSubjectCoreSrv(a);
  const sb = ticketSubjectCoreSrv(b);
  return Boolean(sa && sb && sa === sb);
}

function dedupeTicketDocsSrv(rows?) {
  /* ticketListDedupeShape1: sempre {kept,hidden} — early-return array rompeva .length */
  if (!Array.isArray(rows) || rows.length < 2) {
    return { kept: Array.isArray(rows) ? rows.slice() : [], hidden: [] };
  }
  const kept = [];
  const hidden = [];
  for (const t of rows) {
    if (!t) continue;
    let hit = -1;
    for (let j = 0; j < kept.length; j += 1) {
      if (!ticketsAreImportDupSrv(kept[j], t)) continue;
      hit = j;
      break;
    }
    if (hit < 0) {
      kept.push(t);
      continue;
    }
    if (ticketDedupeScoreSrv(t) > ticketDedupeScoreSrv(kept[hit])) {
      hidden.push(kept[hit]);
      kept[hit] = t;
    } else {
      hidden.push(t);
    }
  }
  return { kept, hidden };
}

function webTicketsListEtag(listKey?, payload?, at?) {
  const tickets = Array.isArray(payload?.tickets) ? payload.tickets : [];
  const sig = tickets
    .map((t?) => `${t.id || t._id || ""}:${t.lastMessageAt || ""}:${t.status || ""}:${t.claimedBy || ""}`)
    .join(",")
    .slice(0, 220);
  return weakEtagFromParts(["wtl", listKey, at || 0, payload?.total || 0, tickets.length, sig]);
}

function webTicketsDetailEtag(ticket?, messages?) {
  const msgs = Array.isArray(messages) ? messages : [];
  const receiptSig = msgs
    .map((m?) => `${m?._id || ""}:${Array.isArray(m?.readBy) ? m.readBy.length : 0}`)
    .join(",")
    .slice(0, 180);
  const last = msgs.length ? msgs[msgs.length - 1] : null;
  return weakEtagFromParts([
    "wtd",
    String(ticket?._id || ""),
    ticket?.status || "",
    ticket?.claimedBy || "",
    ticket?.lastMessageAt || "",
    msgs.length,
    String(last?._id || ""),
    last?.editedAt || last?.createdAt || "",
    receiptSig,
  ]);
}
let cachedBotUserId = "";

function rememberBotUserId(client?) {
  const id = String(client?.user?.id || "").trim();
  if (id) cachedBotUserId = id;
  return cachedBotUserId;
}

function authorHasStaffSignals(doc?, staffRoles = null) {
  if (String(doc?.authorKind || "") === "staff") return true;
  const authorId = String(doc?.authorId || "").trim();
  if (!authorId || !staffRoles) return false;
  const bucket = staffRoles[authorId];
  return Boolean(bucket?.staff);
}

function resolveMessageAuthorKind(doc?, ticket = null, staffRoles = null) {
  const kind = String(doc?.authorKind || "user");
  if (kind === "bot" || kind === "system") return kind;
  const authorId = String(doc?.authorId || "");
  if (authorId === "bot") return "bot";
  if (cachedBotUserId && authorId === cachedBotUserId) return "bot";
    if (ticket && isTicketCustomerAuthor(doc, ticket)) return "user";
  if (authorHasStaffSignals(doc, staffRoles)) return "staff";
    if (authorId.startsWith("discord:")) {
    const bucket = staffRoles && staffRoles[authorId] ? staffRoles[authorId] : null;
    if (bucket?.staff) return "staff";
    return "user";
  }
  return kind;
}

function normalizePersonName(value?) {
  return String(value || "")
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .split("#")[0]
    .trim()
    .toLowerCase()
    .replace(/[<>]/g, "")
    .replace(/^_+|_+$/g, "");
}

function foldLeetPersonName(value?) {
  return normalizePersonName(value)
    .replace(/4/g, "a")
    .replace(/3/g, "e")
    .replace(/1/g, "i")
    .replace(/0/g, "o")
    .replace(/5/g, "s")
    .replace(/7/g, "t")
    .replace(/\$/g, "s")
    .replace(/@/g, "a");
}

function personNamesLooselyEqual(a?, b?) {
  const na = normalizePersonName(a);
  const nb = normalizePersonName(b);
  if (!na || !nb) return false;
  if (na === nb) return true;
  const fa = foldLeetPersonName(na);
  const fb = foldLeetPersonName(nb);
  if (fa && fb && fa === fb) return true;
  if (fa.length >= 4 && fb.length >= 4 && (fa.includes(fb) || fb.includes(fa))) return true;
  return false;
}

function isTicketCustomerAuthor(doc?, ticket?) {
  if (!doc || !ticket) return false;
  const kind = String(doc.authorKind || "");
  if (kind === "system" || kind === "bot") return false;
  const authorId = String(doc.authorId || "").trim();
  const openerId = String(ticket.userId || "").trim();
  if (openerId && authorId && openerId === authorId) return true;
  if (ticketHasAddedUser(ticket, authorId)) return true;
  const authorName = String(doc.authorName || "").trim();
  if (personNamesLooselyEqual(ticket.authorName, authorName)) return true;
  const added = listAddedUsers(ticket);
  if (added.some((u?) => u.id === authorId || personNamesLooselyEqual(u.name, authorName))) return true;
  if (authorId.startsWith("discord:")) {
    const slug = authorId.slice(8);
    if (personNamesLooselyEqual(ticket.authorName, slug)) return true;
    if (added.some((u?) => personNamesLooselyEqual(u.name, slug))) return true;
  }
  return false;
}

function webTicketMessageKindForActor(actor?, loaded: Record<string, any> = {}) {
  if (loaded.isOwner || loaded.isAdded) return "user";
  if (actor && actor.isStaff) return "staff";
  return "user";
}

function serializeReplyTo(targetDoc?, fallbackId?) {
  const id = String((targetDoc && (targetDoc._id || targetDoc.id)) || fallbackId || "").trim();
  if (!targetDoc) {
    return {
      id,
      deleted: true,
      authorId: "",
      authorName: "",
      content: "",
      hasMedia: false,
    };
  }
  const content = String(targetDoc.content || "").replace(/\s+/g, " ").trim();
  const images = Array.isArray(targetDoc.imageUrls)
    ? targetDoc.imageUrls.map((u?) => String(u || "").trim()).filter(Boolean)
    : [];
  return {
    id: String(targetDoc._id || id),
    deleted: false,
    authorId: String(targetDoc.authorId || ""),
    authorName: String(targetDoc.authorName || "").trim() || "Utente",
    content: content.slice(0, 140),
    hasMedia: images.length > 0,
  };
}

function serializeMessage(doc?, nameMap?, staffRatings?, staffRoles?, ticket = null, replyTarget = undefined) {
  if (!doc) return null;
  const authorId = String(doc.authorId || "");
  const authorKind = resolveMessageAuthorKind(doc, ticket, staffRoles);
  const out: Record<string, any> = {
    id: String(doc._id),
    ticketId: String(doc.ticketId),
    authorId,
    authorName: String(doc.authorName || "").trim() || "Utente",
    authorAvatarUrl: scrubStoredTicketAvatarUrl(doc.authorAvatarUrl),
    authorKind,
    content: String(doc.content || ""),
    imageUrls: Array.isArray(doc.imageUrls)
      ? doc.imageUrls.map((u?) => withTicketFileAccessToken(String(doc.ticketId || ticket?._id || ""), u)).filter(Boolean)
      : [],
    reactions: serializeReactions(doc.reactions, nameMap),
    editedAt: doc.editedAt ? new Date(doc.editedAt).toISOString() : null,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
  };
  const replyToId = doc.replyToId ? String(doc.replyToId) : "";
  if (replyToId) {
    if (replyTarget === null) out.replyTo = serializeReplyTo(null, replyToId);
    else if (replyTarget && typeof replyTarget === "object") out.replyTo = serializeReplyTo(replyTarget, replyToId);
    else out.replyTo = { id: replyToId, deleted: false };
  }
  if (authorKind === "staff" || authorKind === "user") {
    const bucket = staffRoles && staffRoles[authorId] ? staffRoles[authorId] : null;
    /* ticketStaffOpenTag1: staff che apre il ticket (customer/opener) tiene la tag ruolo —
       prima solo community; staffish veniva strippato se non claimer/staff-kind. */
    const live =
      authorKind === "staff"
        ? bucket?.staff || (bucket?.id ? bucket : null)
        : bucket?.community || bucket?.staff || (bucket?.id ? bucket : null);
            let roleId = String(live?.id || "").trim() || null;
    let roleKey = String(live?.key || "").trim() || null;
    let roleName = String(live?.name || "").trim();
    if (authorKind === "staff") {
      if (!roleId) roleId = String(doc.authorRoleId || "").trim() || null;
      if (!roleKey) roleKey = String(doc.authorRoleKey || "").trim() || null;
      if (!roleName) roleName = String(doc.authorRoleName || "").trim();
      roleName = roleName ? cleanStaffRoleDisplayName(roleName) : "";
      if (/^staff$/i.test(roleName) && !live?.key) roleName = "";
    } else {
      if (!roleName) roleName = String(doc.authorRoleName || "").trim();
      if (!roleKey) roleKey = String(doc.authorRoleKey || "").trim();
      if (!roleId) roleId = String(doc.authorRoleId || "").trim() || null;
      const storedKey = String(roleKey || "").toLowerCase();
      const staffish =
        /^(founder|manager|admin|director|high-staff|highstaff|senior-mod|mod|trial|pm|helper|partner-manager|community-manager|staff)$/i.test(
          storedKey,
        ) ||
        /^(founder|director|manager|admin|high.?staff|senior.?mod|moderator|^mod$|helper|partner.?manager)$/i.test(
          roleName,
        );
      if (staffish && !live) {
        /* niente bucket live → non inventare tag staff fantasma */
        roleId = null;
        roleKey = "";
        roleName = "";
      } else if (live?.name) {
        roleName = cleanStaffRoleDisplayName(String(live.name).trim()).slice(0, 48);
        if (!roleKey) roleKey = String(live.key || "").trim() || roleKey;
        if (!roleId) roleId = String(live.id || "").trim() || roleId;
        if (/^staff$/i.test(roleName) && !live?.key) roleName = "";
      } else if (/^staff$/i.test(roleName)) {
        roleName = "";
      } else {
        roleName = roleName.slice(0, 48);
      }
    }
    if (roleId) out.authorRoleId = roleId;
    if (roleName) out.authorRoleName = roleName;
    if (roleKey && roleName) out.authorRoleKey = roleKey;
  }
  if (authorKind === "staff" && staffRatings && typeof staffRatings === "object") {
    const avg = staffRatings[authorId];
    if (avg != null && Number.isFinite(Number(avg))) {
      out.authorAvgRating = Math.round(Number(avg) * 10) / 10;
    }
  }
  const receipt = messageReceiptStatus(doc);
  if (receipt) {
    out.receiptStatus = receipt;
    out.read = receipt === "read";
  }
  return out;
}

function messageReceiptStatus(doc?) {
  const kind = String(doc?.authorKind || "").toLowerCase();
  if (kind === "system" || kind === "bot") return null;
  const authorId = String(doc?.authorId || "").trim();
  if (!authorId) return null;
  const readBy = Array.isArray(doc?.readBy) ? doc.readBy : [];
  const read = readBy.some((r?) => {
    const uid = String(r?.userId || "").trim();
    return uid && uid !== authorId;
  });
  return read ? "read" : "sent";
}

async function markTicketMessagesRead(ticketId?, readerId?, messageDocs?) {
  const reader = String(readerId || "").trim();
  const tid = ticketId;
  if (!reader || !tid) return { messageIds: [], at: null };
  const at = new Date();
  const candidates = (Array.isArray(messageDocs) ? messageDocs : []).filter((m?) => {
    if (!m || !m._id) return false;
    const kind = String(m.authorKind || "").toLowerCase();
    if (kind === "system" || kind === "bot") return false;
    if (String(m.authorId || "") === reader) return false;
    const already = (Array.isArray(m.readBy) ? m.readBy : []).some(
      (r?) => String(r?.userId || "") === reader,
    );
    return !already;
  });
  const ids = candidates.map((m?) => m._id);
  if (!ids.length) return { messageIds: [], at: null };
  await SiteWebTicketMessage.updateMany(
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
  try {
    const { cancelChatDmFallback } = require("../http/siteChatDmFallback") as typeof import("../http/siteChatDmFallback");
    cancelChatDmFallback("ticket", String(tid), reader);
  } catch (_) {}
  return { messageIds: [...idSet], at: at.toISOString() };
}

function avgFromStaffRatingFields(staff?) {
  const count = Math.max(0, Math.floor(Number(staff?.webTicketRatingCount) || 0));
  const sum = Number(staff?.webTicketRatingSum) || 0;
  if (count <= 0) return null;
  return Math.round((sum / count) * 10) / 10;
}

async function staffAvgRatingMap(guildId?, userIds?) {
  const gid = String(guildId || "").trim();
  const ids = [...new Set((Array.isArray(userIds) ? userIds : []).map((id?) => String(id || "").trim()).filter(Boolean))];
  if (!gid || !ids.length) return {};
  const docs = await ActivityUserProfile.find({ guildId: gid, userId: { $in: ids } })
    .select({ userId: 1, "staff.webTicketRatingSum": 1, "staff.webTicketRatingCount": 1 })
    .lean()
    .catch(() => []);
  const map: Record<string, any> = {};
  for (const d of docs || []) {
    const avg = avgFromStaffRatingFields(d?.staff);
    if (avg != null) map[String(d.userId)] = avg;
  }
  return map;
}

async function resolveReplyTargetForTicket(ticketId?, rawId?) {
  const id = String(rawId || "").trim();
  if (!id || !mongoose.isValidObjectId(id) || !ticketId) return null;
  const target = await SiteWebTicketMessage.findOne({ _id: id, ticketId })
    .select({ authorId: 1, authorName: 1, authorKind: 1, content: 1, imageUrls: 1 })
    .lean()
    .catch(() => null);
  if (!target) return null;
  if (String(target.authorKind || "") === "system") return null;
  return target;
}

function serializeMessagesWithReplies(messages?, nameMap?, staffRatings?, staffRoles?, ticket?) {
  const list = Array.isArray(messages) ? messages : [];
  const byId = new Map(list.map((m?) => [String(m && m._id), m]));
  return list.map((m?) => {
    const rid = m && m.replyToId ? String(m.replyToId) : "";
    const target = rid ? byId.get(rid) || null : undefined;
    return serializeMessage(m, nameMap, staffRatings, staffRoles, ticket, rid ? target : undefined);
  });
}

async function serializeMessageWithStaffRating(doc?, nameMap?, guildId?, client = null, ticket = null, replyTarget = undefined) {
  const authorId = String(doc?.authorId || "").trim();
  const nameHints =
    authorId.startsWith("discord:")
      ? { [authorId]: String(doc?.authorName || authorId.slice(8) || "").trim() }
      : {};
  const roles = client
    ? await buildStaffRoleMapForUserIds(client, guildId, authorId ? [authorId] : [], { nameHints })
    : {};
  let target = replyTarget;
  if (target === undefined && doc?.replyToId) {
    const found = await SiteWebTicketMessage.findById(doc.replyToId)
      .select({ authorId: 1, authorName: 1, authorKind: 1, content: 1, imageUrls: 1 })
      .lean()
      .catch(() => null);
    target = found || null;
  }
  const kind = resolveMessageAuthorKind(doc, ticket, roles);
  if (kind !== "staff" && kind !== "user") return serializeMessage(doc, nameMap, null, null, ticket, target);
  const ratings = kind === "staff" ? await staffAvgRatingMap(guildId, [authorId]) : {};
  return serializeMessage(doc, nameMap, ratings, roles, ticket, target);
}

async function resolveRateableStaffer(ticket?) {
  if (!ticket) return null;
  const ownerId = String(ticket.userId || "").trim();
  const claimedId = String(ticket.claimedBy || "").trim();
  if (claimedId && claimedId !== ownerId) {
    return {
      id: claimedId,
      name: String(ticket.claimedByName || "").trim() || "Staff",
    };
  }
  const last = await SiteWebTicketMessage.findOne({
    ticketId: ticket._id,
    authorKind: "staff",
  })
    .sort({ createdAt: -1 })
    .select({ authorId: 1, authorName: 1 })
    .lean()
    .catch(() => null);
  const sid = String(last?.authorId || "").trim();
  if (sid && sid !== ownerId) {
    return {
      id: sid,
      name: String(last?.authorName || "").trim() || "Staff",
    };
  }
    const closedBy = String(ticket.closedBy || "").trim();
  if (closedBy && closedBy !== ownerId) {
    return {
      id: closedBy,
      name: String(ticket.closedByName || "").trim() || "Staff",
    };
  }
  return null;
}

function clampStarRating(raw?) {
  const n = Math.round(Number(raw));
  if (!Number.isFinite(n) || n < 1 || n > 5) return null;
  return n;
}

async function refreshTicketLastMessageFields(ticket?) {
  if (!ticket) return ticket;
  const last: any = await SiteWebTicketMessage.findOne({ ticketId: ticket._id })
    .sort({ createdAt: -1 })
    .lean();
  if (!last) {
    ticket.lastMessageAt = ticket.createdAt || new Date();
    ticket.lastMessagePreview = "";
    ticket.lastAuthorKind = "system";
    ticket.messageCount = 0;
  } else {
    ticket.lastMessageAt = last.createdAt || new Date();
    ticket.lastMessagePreview = previewFromContent(last.content, Array.isArray(last.imageUrls) ? last.imageUrls.length : 0);
    ticket.lastAuthorKind = String(last.authorKind || "user");
    ticket.messageCount = await SiteWebTicketMessage.countDocuments({ ticketId: ticket._id });
  }
  await ticket.save();
  return ticket;
}

function serializeTicket(doc?, { includeStaffFields = false, permissions = null, rateableStaffer = null } = {}) {
  if (!doc) return null;
  const status = String(doc.status || WEB_TICKET_STATUS.OPEN);
  const ratingTicketScore =
    doc.ratingTicketScore != null && Number.isFinite(Number(doc.ratingTicketScore))
      ? Math.max(1, Math.min(5, Math.round(Number(doc.ratingTicketScore))))
      : null;
  const ratingStafferScore =
    doc.ratingStafferScore != null && Number.isFinite(Number(doc.ratingStafferScore))
      ? Math.max(1, Math.min(5, Math.round(Number(doc.ratingStafferScore))))
      : null;
  const ratedStafferId = String(doc.ratedStafferId || "").trim() || null;
  const ratedStafferName = String(doc.ratedStafferName || "").trim() || null;
  const alreadyRated = Boolean(doc.ratingAt) || ratingStafferScore != null;
  let rateable = null;
  if (alreadyRated && ratedStafferId) {
    rateable = { id: ratedStafferId, name: ratedStafferName || "Staff" };
  } else if (rateableStaffer && rateableStaffer.id) {
    rateable = {
      id: String(rateableStaffer.id),
      name: String(rateableStaffer.name || "").trim() || "Staff",
    };
  } else if (doc.claimedBy) {
    rateable = {
      id: String(doc.claimedBy),
      name: String(doc.claimedByName || "").trim() || "Staff",
    };
  }
  const out: Record<string, any> = {
    id: String(doc._id),
    ticketNumber: Number(doc.ticketNumber) || null,
    userId: String(doc.userId || ""),
    authorName: String(doc.authorName || "").trim() || "Utente",
    authorAvatarUrl: scrubStoredTicketAvatarUrl(doc.authorAvatarUrl),
    category: String(doc.category || "supporto"),
    categoryLabel: CATEGORY_LABELS[doc.category] || "Supporto",
    subject: buildWebTicketChannelName(doc),
    channelName: buildWebTicketChannelName(doc),
    displayName: formatWebTicketDisplayName(doc),
    renameTail: webTicketNameTail(doc),
    status,
    claimedBy: doc.claimedBy ? String(doc.claimedBy) : null,
    claimedByName: String(doc.claimedByName || "").trim() || null,
    claimedAt: doc.claimedAt ? new Date(doc.claimedAt).toISOString() : null,
    closedAt: doc.closedAt ? new Date(doc.closedAt).toISOString() : null,
    closedBy: doc.closedBy ? String(doc.closedBy) : null,
    closedByName: String(doc.closedByName || "").trim() || null,
    closeReason: String(doc.closeReason || "").trim() || null,
    lastMessageAt: doc.lastMessageAt ? new Date(doc.lastMessageAt).toISOString() : null,
    lastMessagePreview: String(doc.lastMessagePreview || "").trim(),
    lastAuthorKind: String(doc.lastAuthorKind || "user"),
    messageCount: Math.max(0, Number(doc.messageCount) || 0),
    addedUsers: listAddedUsers(doc),
    closeRequestedBy: doc.closeRequestedBy ? String(doc.closeRequestedBy) : null,
    closeRequestedByName: String(doc.closeRequestedByName || "").trim() || null,
    closeRequestedAt: doc.closeRequestedAt ? new Date(doc.closeRequestedAt).toISOString() : null,
    closeRequestReason: String(doc.closeRequestReason || "").trim() || null,
    ratingTicketScore,
    ratingStafferScore,
    ratingBy: doc.ratingBy ? String(doc.ratingBy) : null,
    ratingAt: doc.ratingAt ? new Date(doc.ratingAt).toISOString() : null,
    ratedStafferId,
    ratedStafferName,
    rateableStafferId: rateable?.id || null,
    rateableStafferName: rateable?.name || null,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
  };
  const pmTier = Math.floor(Number(doc.partnerManagerShopRedeemTier) || 0);
  if (pmTier === 150 || pmTier === 200 || pmTier === 250) {
    out.partnerManagerShopRedeemTier = pmTier;
    out.partnerManagerShopRedeemAckResult = String(doc.partnerManagerShopRedeemAckResult || "").trim() || null;
    out.isPartnerManagerShopRedeem = true;
  }
  if (permissions && typeof permissions === "object") {
    const nextPerms = { ...permissions };
    nextPerms.canRate = Boolean(
      nextPerms.canRate && status === WEB_TICKET_STATUS.CLOSED && !alreadyRated && rateable?.id,
    );
    out.permissions = nextPerms;
  }
  return out;
}

function previewFromContent(content?, imageCount?) {
  let text = sanitizeText(content, 400);
  if (/nessun contenuto/i.test(text) || /^…altre \d+ messaggi/i.test(text)) {
    text = "";
  }
    if (text) {
    text = text
      .replace(/\\n/gi, " ")
      .replace(/\[Embed\s+\d+\]/gi, " ")
      .replace(/\[Embed\s+(?:image|thumb)\]\s*\S+/gi, " ")
      .replace(/\[Attachment\]\s*\S+/gi, " ")
      .replace(/\[Sticker\][^\n]*/gi, " ")
      .replace(/\b(?:Title|Titolo|Description|Descrizione|Author|Autore|Footer|Fields?|Campo)\s*:\s*/gi, " ")
      .replace(/<(a?):([a-zA-Z0-9_]+):(\d{5,32})>/g, " ")
      .replace(/<@!?&?#?\d{5,32}>/g, " ")
      .replace(/<\s*(\d{15,22})\s*>/g, " ")
      .replace(/\*?Nessun contenuto[^*\n]*/gi, " ")
      .replace(/:\w+:/g, " ")
      .replace(/https?:\/\/\S+/gi, " ")
            .replace(/\s*@utente\b/gi, " ")
      .replace(/\s*@(?:ruolo|canale)\b/gi, " ")
      .replace(/\s*#canale\b/gi, " ")
      .replace(/\s*[·•|]\s*/g, " · ")
      .replace(/(?:\s*·\s*)+/g, " · ")
      .replace(/^\s*·\s*|\s*·\s*$/g, "")
      .replace(/\s+/g, " ")
      .trim()
      .slice(0, 160);
  }
  if (/nessun contenuto/i.test(text)) text = "";
  if (text) return text;
  if (imageCount > 0) return imageCount === 1 ? "📷 Immagine" : `📷 ${imageCount} immagini`;
  return "";
}

function serializeTicketForActor(actor?, ticket?, { isOwner = false, isAdded = false, includeStaffFields = null } = {}) {
  const perms = buildTicketPermissions(actor.member, ticket, actor.userId, { isOwner, isAdded });
  return serializeTicket(ticket, {
    includeStaffFields: includeStaffFields ?? Boolean(actor.isStaff || isOwner || isAdded),
    permissions: perms,
  });
}

export = { webTicketsListCache, ticketsAreImportDupSrv, dedupeTicketDocsSrv, webTicketsListEtag, webTicketsDetailEtag, rememberBotUserId, resolveMessageAuthorKind, webTicketMessageKindForActor, serializeMessage, markTicketMessagesRead, staffAvgRatingMap, resolveReplyTargetForTicket, serializeMessagesWithReplies, serializeMessageWithStaffRating, resolveRateableStaffer, clampStarRating, refreshTicketLastMessageFields, serializeTicket, previewFromContent, serializeTicketForActor };
