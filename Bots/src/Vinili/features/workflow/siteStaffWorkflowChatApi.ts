const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");
const crypto = require("crypto") as typeof import("crypto");
const mongoose = require("mongoose") as typeof import("mongoose");
const { viniliPath } = require("../../core/paths") as typeof import("../../core/paths");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { assertWebsiteStaffAccess, normalizeHeaderSecret, memberCanViewResocontiInbox } = require("../staff/siteStaffAccessApi") as typeof import("../staff/siteStaffAccessApi");
const { resolveWebsiteGuildMember } = require("../../Web/siteRoleRequestApi") as typeof import("../../Web/siteRoleRequestApi");
const { memberIsHighStaffEligible, memberCanReviewAppelli } = require("../../Utils/Staff/staffRoleHierarchy") as typeof import("../../Utils/Staff/staffRoleHierarchy");
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const {
  memberHasCandidatureReviewAccess,
} = require("../../Events/interaction/candidatureApplicationHandlers") as typeof import("../../Events/interaction/candidatureApplicationHandlers");
const {
  SiteWorkflowChatMessage,
  purgeWorkflowChatByDedupe,
} = require("../../Schemas/Web/siteWorkflowChatSchemas") as typeof import("../../Schemas/Web/siteWorkflowChatSchemas");
const { broadcastSiteRealtime } = require("../suggestions/siteSuggestionsBroadcast") as typeof import("../suggestions/siteSuggestionsBroadcast");
const {
  guildMemberDisplayAvatarUrlStatic,
  userAvatarUrlStatic,
  discordDefaultAvatarUrl,
  accountUsername,
} = require("../../Utils/Discord/guildDiscordIdentity") as typeof import("../../Utils/Discord/guildDiscordIdentity");
const { buildSiteLinkRow, subjectWorkflowChatPath } = require("../../Web/discordWorkflowUiGate") as typeof import("../../Web/discordWorkflowUiGate");
const { resolveStaffProfileDisplayRoleId } = require("../../Utils/Staff/staffProfilePanelRuntime") as typeof import("../../Utils/Staff/staffProfilePanelRuntime");
const { stripDiscordDecorations } = require("../staff/siteStaffRosterCache") as typeof import("../staff/siteStaffRosterCache");
const {
  notifyWorkflowSubjectInvited,
  notifyWorkflowSubjectRemoved,
  notifyWorkflowChatNewMessage,
  notifyWorkflowMentions,
} = require("./siteStaffWorkflowNotifications") as typeof import("./siteStaffWorkflowNotifications");
const { setTyping: setChatTyping, clearTyping: clearChatTyping } = require("../../Web/siteChatTyping") as typeof import("../../Web/siteChatTyping");
const {
  listGuildMentionChannels,
  sanitizeWebTicketMentionsToScope,
  sanitizeWebTicketChannelMentions,
  memberCanViewChannelId,
} = require("../tickets/site/siteWebTicketsApi") as typeof import("../tickets/site/siteWebTicketsApi");
const { resolveMainGuild, resolveAuthorAvatarUrl, loadAuthorAvatarOverrides, loadAuthorRoleOverrides, displayNameForMember, authorRoleLabelForMember } = require("./workflowChatAuthors") as typeof import("./workflowChatAuthors");
const { MAX_IMAGES, UPLOAD_ROOT, uploadFolderKey, saveWorkflowImages } = require("./workflowChatMedia") as typeof import("./workflowChatMedia");
const { MAX_REACTION_USERS, parseReactionInput, serializeReactions, serializeMessage, markWorkflowMessagesRead } = require("./workflowChatSerialize") as typeof import("./workflowChatSerialize");
const { MAX_CONTENT, loadWorkflowDoc, isInviteOnlyQueue, normalizeSubjectChat, subjectChatHasActive, subjectChatEverInvited, messageVisibleInSubjectWindows, serializeSubjectChatMeta, patchSubjectChat, sendSubjectInviteDmOnce, createSystemChatMessage, resolveSubjectDisplayName, ensurePauseWorkflowFromKey, ensureInviteQueueWorkflowFromKey, emitChatEvent, withTimeout } = require("./workflowChatSubject") as typeof import("./workflowChatSubject");
const { bearerFromRequest, parseQueueFromDedupe, resolveWorkflowChatAccess } = require("./workflowChatAccess") as typeof import("./workflowChatAccess");
const { handleSiteStaffWorkflowChatPost, handleSiteStaffWorkflowChatReactionPost, handleSiteStaffWorkflowChatMessagePatch, handleSiteStaffWorkflowChatMessageDelete } = require("./workflowChatMessages") as typeof import("./workflowChatMessages");
const { handleSiteStaffWorkflowChatSubjectPost } = require("./workflowChatSubjectInvite") as typeof import("./workflowChatSubjectInvite");
const { handleSiteStaffWorkflowChatEmojisGet, handleSiteStaffWorkflowChatMentionsGet } = require("./workflowChatMentions") as typeof import("./workflowChatMentions");




const MAX_MESSAGES = 200;

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
    const q: Record<string, any> = { guildId: access.guild.id, dedupeKey: access.dedupeKey };
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
    if (!filePath.startsWith(UPLOAD_ROOT)) {
      return res.status(404).json({ ok: false, error: "not_found", message: "File non trovato." });
    }
    if (!fs.existsSync(filePath)) {
      const { redirectToCdnIfConfigured } = require("../../Web/siteCdnMedia") as typeof import("../../Web/siteCdnMedia");
      if (redirectToCdnIfConfigured(res, `uploads/workflow-chat/${folderKey}/${fileName}`)) return;
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

async function handleSiteStaffWorkflowChatTypingPost(client?, req?, res?) {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const dedupeKey = String(body.dedupeKey || body.key || "").trim();
    const access: any = await resolveWorkflowChatAccess(client, bearerFromRequest(req), dedupeKey, { req });
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
