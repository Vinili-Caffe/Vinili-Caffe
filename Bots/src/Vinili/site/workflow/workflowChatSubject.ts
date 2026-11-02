
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { SiteWorkflowChatMessage } = require("../../Schemas/Web/siteWorkflowChatSchemas") as typeof import("../../Schemas/Web/siteWorkflowChatSchemas");
const { broadcastSiteRealtime } = require("../suggestions/siteSuggestionsBroadcast") as typeof import("../suggestions/siteSuggestionsBroadcast");
const { buildSiteLinkRow, subjectWorkflowChatPath } = require("../../site/http/discordWorkflowUiGate") as typeof import("../../site/http/discordWorkflowUiGate");
const { resolveMainGuild, displayNameForMember } = require("./workflowChatAuthors") as typeof import("./workflowChatAuthors");
const { serializeMessage } = require("./workflowChatSerialize") as typeof import("./workflowChatSerialize");

const WORKFLOW_DOC = SITE_DOCUMENT_TYPE.STAFF_WORKFLOW;
/* pauseInviteOnly1: pause come candidature/appelli — HS always; richiedente solo se aggiunto */
const INVITE_ONLY_QUEUES = new Set(["candidature", "appelli", "pause"]);
const MAX_CONTENT = 2000;

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
      const { getAppealDetail } = require("../staff/siteStaffAppealsRuntime") as typeof import("../staff/siteStaffAppealsRuntime");
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
      const { getCandidatureApplicationDetail } = require("../../site/staff/candidature/candidatureApplicationHandlers") as typeof import("../../site/staff/candidature/candidatureApplicationHandlers");
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

export = { MAX_CONTENT, loadWorkflowDoc, isInviteOnlyQueue, normalizeSubjectChat, subjectChatHasActive, subjectChatEverInvited, messageVisibleInSubjectWindows, serializeSubjectChatMeta, patchSubjectChat, sendSubjectInviteDmOnce, createSystemChatMessage, resolveSubjectDisplayName, ensurePauseWorkflowFromKey, ensureInviteQueueWorkflowFromKey, emitChatEvent, withTimeout };
