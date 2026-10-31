/** Chat del workflow: invio, reazioni, modifica ed eliminazione dei messaggi. */
const mongoose = require("mongoose") as typeof import("mongoose");
const { SiteWorkflowChatMessage } = require("../../Schemas/Web/siteWorkflowChatSchemas") as typeof import("../../Schemas/Web/siteWorkflowChatSchemas");
const { notifyWorkflowChatNewMessage, notifyWorkflowMentions } = require("./siteStaffWorkflowNotifications") as typeof import("./siteStaffWorkflowNotifications");
const { clearTyping: clearChatTyping } = require("../../Web/siteChatTyping") as typeof import("../../Web/siteChatTyping");
const { sanitizeWebTicketMentionsToScope, sanitizeWebTicketChannelMentions } = require("../tickets/site/siteWebTicketsApi") as typeof import("../tickets/site/siteWebTicketsApi");
const { resolveAuthorAvatarUrl, displayNameForMember, authorRoleLabelForMember } = require("./workflowChatAuthors") as typeof import("./workflowChatAuthors");
const { saveWorkflowImages } = require("./workflowChatMedia") as typeof import("./workflowChatMedia");
const { MAX_REACTION_USERS, parseReactionInput, serializeReactions, serializeMessage } = require("./workflowChatSerialize") as typeof import("./workflowChatSerialize");
const { MAX_CONTENT, subjectChatHasActive, emitChatEvent } = require("./workflowChatSubject") as typeof import("./workflowChatSubject");
const { bearerFromRequest, resolveWorkflowChatAccess } = require("./workflowChatAccess") as typeof import("./workflowChatAccess");

const MAX_REACTION_KINDS = 12;

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

    const imageUrls = await saveWorkflowImages(dedupeKey, body.images);
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

    (msg as any).reactions = reactions;
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

async function handleSiteStaffWorkflowChatMessagePatch(client?, req?, res?) {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const dedupeKey = String(body.dedupeKey || req.query?.dedupeKey || "").trim();
    const messageId = String(req.params?.messageId || body.messageId || "").trim();
    const access: any = await resolveWorkflowChatAccess(client, bearerFromRequest(req), dedupeKey, { req });
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
    const access: any = await resolveWorkflowChatAccess(client, bearerFromRequest(req), dedupeKey, { req });
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

export = { handleSiteStaffWorkflowChatPost, handleSiteStaffWorkflowChatReactionPost, handleSiteStaffWorkflowChatMessagePatch, handleSiteStaffWorkflowChatMessageDelete };
