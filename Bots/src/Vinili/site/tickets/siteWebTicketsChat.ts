
const mongoose = require("mongoose") as typeof import("mongoose");
const { WEB_TICKET_STATUS, SiteWebTicketMessage } = require("../../MultiGuild/tickets/data/siteWebTicketSchemas") as typeof import("../../MultiGuild/tickets/data/siteWebTicketSchemas");
const { displayNameForMember, avatarForMember, sanitizeText } = require("./ticketNames") as typeof import("./ticketNames");
const { resolveStaffRoleForMember, resolveCommunityRoleForMember, memberIsHighStaff, buildTicketPermissions } = require("./ticketStaffAccess") as typeof import("./ticketStaffAccess");
const { resolveTicketMentionScope, memberCanViewChannelId } = require("./ticketMentions") as typeof import("./ticketMentions");
const { saveTicketImages } = require("./ticketMedia") as typeof import("./ticketMedia");
const { MAX_REACTION_KINDS, MAX_REACTION_USERS, parseReactionInput, normalizeReactionUsers, buildReactionNameMap } = require("./ticketReactions") as typeof import("./ticketReactions");
const { webTicketMessageKindForActor, serializeMessage, resolveReplyTargetForTicket, serializeMessageWithStaffRating, refreshTicketLastMessageFields, previewFromContent, serializeTicketForActor } = require("./ticketSerialize") as typeof import("./ticketSerialize");
const { MAX_CONTENT, emitTicketEvent, refreshStaffTicketQueueNotif, notifyMentionedUsers, notifyTicketChatMessage, ticketBroadcastPayload } = require("./ticketNotify") as typeof import("./ticketNotify");
const { isWebTicketPrefixInput, runWebTicketPrefixCommandFlow, resolveMemberOrStaff, loadTicketForActor } = require("./ticketCommands") as typeof import("./ticketCommands");
const { memberIsHighStaffEligible } = require("../../Staff/utils/staffRoleHierarchy") as typeof import("../../Staff/utils/staffRoleHierarchy");
const { consumeWebTicketMessageRateLimit, checkWebTicketUserMessageAutomod } = require("./webTicketMessageGuard") as typeof import("./webTicketMessageGuard");
const { sendWebTicketMessageActivityLog } = require("./webTicketDiscordLog") as typeof import("./webTicketDiscordLog");
const { handleSiteWebTicketsPresencePost, handleSiteWebTicketsReadPost, handleSiteWebTicketsTypingPost, handleSiteWebTicketsEmojisGet, handleSiteWebTicketsMentionsGet, handleSiteWebTicketsResolvePost, handleSiteWebTicketsFileGet } = require("./siteWebTicketsChatExtras") as typeof import("./siteWebTicketsChatExtras");


function sanitizeWebTicketMentionsToScope(
  content?,
  { allowedUserIds = null, allowedRoleIds = null, allowRoleMentions = false } = {},
) {
  const users = allowedUserIds instanceof Set ? allowedUserIds : allowedUserIds ? new Set(allowedUserIds) : null;
  const roles = allowedRoleIds instanceof Set ? allowedRoleIds : allowedRoleIds ? new Set(allowedRoleIds) : null;
  return String(content || "")
    .replace(/<@!?(\d{5,32})>/g, (full?, id?) => {
      if (!users) return full;
      return users.has(String(id)) ? full : "";
    })
    .replace(/<@&(\d{5,32})>/g, (full?, id?) => {
      if (!allowRoleMentions) return "";
      if (!roles) return "";
      return roles.has(String(id)) ? full : "";
    })
    .replace(/@(everyone|here)\b/gi, "")
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ *\n{3,}/g, "\n\n")
    .trim();
}

function sanitizeWebTicketChannelMentions(content?, member?, guild?) {
  return String(content || "")
    .replace(/<#(\d{5,32})>/g, (full?, id?) => (memberCanViewChannelId(member, guild, id) ? full : ""))
    .replace(/[ \t]{2,}/g, " ")
    .replace(/ *\n{3,}/g, "\n\n")
    .trim();
}

async function handleSiteWebTicketsMessagePost(client?, req?, res?) {
  const actor = await resolveMemberOrStaff(client, req);
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  const loaded = await loadTicketForActor(req.params?.ticketId, actor);
  if (!loaded.ok) {
    return res.status(loaded.status).json({ ok: false, error: loaded.error, message: loaded.message });
  }
  const ticket = loaded.ticket;
  if (ticket.status === WEB_TICKET_STATUS.CLOSED) {
    return res.status(409).json({ ok: false, error: "closed", message: "Questo ticket è chiuso." });
  }

  let content = sanitizeText(req.body?.content, MAX_CONTENT);
  const imageUrls = await saveTicketImages(String(ticket._id), req.body?.images);
  if (!content && !imageUrls.length) {
    return res.status(400).json({ ok: false, error: "empty", message: "Messaggio vuoto." });
  }

  const perms = buildTicketPermissions(actor.member, ticket, actor.userId, { isOwner: loaded.isOwner, isAdded: loaded.isAdded });
  if (content && isWebTicketPrefixInput(content) && perms.canUseCommands && !imageUrls.length) {
    try {
      const result = await runWebTicketPrefixCommandFlow(client, actor, ticket, content, {
        isOwner: loaded.isOwner,
        isAdded: loaded.isAdded,
      });
      if (result && result.ok === false && result.needPartnershipForm) {
        return res.status(400).json(result);
      }
      return res.status(200).json(result);
    } catch (err) {
      global.logger?.warn?.("[WEB TICKETS] command via message:", err?.message || err);
      return res.status(500).json({ ok: false, error: "command_failed", message: "Esecuzione comando fallita." });
    }
  }

    if (!loaded.isOwner && !perms.canReply) {
    const claimer = String(ticket.claimedBy || "").trim();
    if (claimer && String(claimer) !== String(actor.userId)) {
      return res.status(403).json({
        ok: false,
        error: "claimed",
        message: `Ticket in carico a ${ticket.claimedByName || "uno staff"}. Non puoi scrivere.`,
      });
    }
    if (!claimer) {
      return res.status(403).json({
        ok: false,
        error: "unclaimed",
        message: "Devi claimare il ticket prima di scrivere.",
      });
    }
    return res.status(403).json({ ok: false, error: "forbidden", message: "Non puoi rispondere a questo ticket." });
  }
  const kind = webTicketMessageKindForActor(actor, loaded);
  {
    const scope = await resolveTicketMentionScope(client, ticket);
    content = sanitizeWebTicketMentionsToScope(content, {
      allowedUserIds: scope.allowedUserIds,
      allowedRoleIds: scope.allowedRoleIds,
      allowRoleMentions: kind === "staff",
    });
    content = sanitizeWebTicketChannelMentions(content, actor.member, scope.guild);
  }
  if (!content && !imageUrls.length) {
    return res.status(400).json({
      ok: false,
      error: "empty",
      message:
        kind !== "staff"
          ? "Messaggio vuoto (menzioni di ruolo o canali non visibili non sono consentite)."
          : "Messaggio vuoto (canali non visibili rimossi).",
    });
  }

  const rate = consumeWebTicketMessageRateLimit({
    guildId: String(ticket.guildId),
    userId: actor.userId,
    kind,
  });
  if (!rate.ok) {
    return res.status(429).json({
      ok: false,
      error: rate.error || "rate_limited",
      message: rate.message,
      retryAfterMs: rate.retryAfterMs,
    });
  }
  if (kind !== "staff" && content && !(actor.isStaff && !loaded.isAdded)) {
    const auto = checkWebTicketUserMessageAutomod({
      content,
      guildId: String(ticket.guildId),
      userId: actor.userId,
      ticketId: String(ticket._id),
    });
    if (!auto.ok) {
      return res.status(400).json({
        ok: false,
        error: auto.error || "automod",
        message: auto.message,
      });
    }
  }

  const staffRole =
    kind === "staff"
      ? resolveStaffRoleForMember(actor.member, ticket.guildId)
      : resolveCommunityRoleForMember(actor.member);

  const replyTarget = await resolveReplyTargetForTicket(ticket._id, req.body?.replyToId || req.body?.replyTo);

  const msg = await SiteWebTicketMessage.create({
    guildId: String(ticket.guildId),
    ticketId: ticket._id,
    authorId: actor.userId,
    authorName: displayNameForMember(actor.member),
    authorAvatarUrl: avatarForMember(actor.member),
    authorKind: kind,
    authorRoleId: staffRole?.id || null,
    authorRoleName: staffRole?.name || "",
    authorRoleKey: staffRole?.key || "",
    content,
    imageUrls,
    replyToId: replyTarget ? replyTarget._id : null,
  });

  ticket.lastMessageAt = msg.createdAt || new Date();
  ticket.lastMessagePreview = previewFromContent(content, imageUrls.length);
  ticket.lastAuthorKind = kind;
  ticket.messageCount = Math.max(0, Number(ticket.messageCount) || 0) + 1;
  await ticket.save();

  const serializedTicket = serializeTicketForActor(actor, ticket, {
    isOwner: loaded.isOwner,
    isAdded: loaded.isAdded,
    includeStaffFields: true,
  });
  const broadcastTicket = ticketBroadcastPayload(serializedTicket);
  const serializedMsg = await serializeMessageWithStaffRating(msg, null, ticket.guildId, client, ticket, replyTarget || undefined);
  emitTicketEvent({
    type: "web_ticket_message",
    ticketId: serializedTicket.id,
    message: serializedMsg,
    ticket: broadcastTicket,
  });
  emitTicketEvent({ type: "web_tickets_list_changed", at: new Date().toISOString() });

  void notifyMentionedUsers(
    client,
    String(ticket.guildId),
    ticket,
    actor.userId,
    displayNameForMember(actor.member),
    content,
    { allowRoleMentions: kind === "staff" },
  ).then((mentioned?) => {
    const unclaimedUserMsg = kind !== "staff" && !String(ticket.claimedBy || "").trim();
    void notifyTicketChatMessage(ticket, {
      authorId: actor.userId,
      authorName: displayNameForMember(actor.member),
      preview: previewFromContent(content, imageUrls.length),
      kind,
      messageId: String(msg._id || ""),
      skipUserIds: mentioned || [],
      client,
      /* pushDismissDedup1: staff su ticket libero → solo queue push, non anche chat */
      deferStaffToQueue: unclaimedUserMsg,
    });
    /* ticketMsgQueuePush1: utente scrive su ticket libero → push coda staff (anche stesso ticket) */
    if (unclaimedUserMsg) {
      void refreshStaffTicketQueueNotif(client, String(ticket.guildId), ticket.category, {
        push: true,
        excludeUserIds: [actor.userId],
        previewHint: previewFromContent(content, imageUrls.length),
      });
    }
  });

  return res.status(200).json({
    ok: true,
    ticket: serializedTicket,
    message: serializedMsg,
  });
}

async function handleSiteWebTicketsReactionPost(client?, req?, res?) {
  const actor = await resolveMemberOrStaff(client, req);
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  const loaded = await loadTicketForActor(req.params?.ticketId, actor);
  if (!loaded.ok) {
    return res.status(loaded.status).json({ ok: false, error: loaded.error, message: loaded.message });
  }
  const ticket = loaded.ticket;
  if (ticket.status === WEB_TICKET_STATUS.CLOSED) {
    return res.status(409).json({ ok: false, error: "closed", message: "Ticket chiuso: non puoi reagire." });
  }

  const messageId = String(req.params?.messageId || "").trim();
  if (!mongoose.isValidObjectId(messageId)) {
    return res.status(400).json({ ok: false, error: "invalid_message", message: "Messaggio non valido." });
  }

  const parsed = parseReactionInput(req.body?.emoji ?? req.body?.markup, req.body);
  if (!parsed) {
    return res.status(400).json({ ok: false, error: "invalid_emoji", message: "Emoji non valida." });
  }

  const msg = await SiteWebTicketMessage.findOne({
    _id: messageId,
    ticketId: ticket._id,
  });
  if (!msg) {
    return res.status(404).json({ ok: false, error: "not_found", message: "Messaggio non trovato." });
  }
  if (String(msg.authorKind || "") === "system") {
    return res.status(400).json({ ok: false, error: "system_message", message: "Non puoi reagire ai messaggi di sistema." });
  }

  const reactions = Array.isArray(msg.reactions)
    ? msg.reactions.map((r?) => {
        const users = normalizeReactionUsers(r);
        return {
          key: String(r?.key || "").trim(),
          emoji: String(r?.emoji || "").trim(),
          emojiId: r?.emojiId ? String(r.emojiId).trim() : null,
          name: String(r?.name || "").trim(),
          animated: Boolean(r?.animated),
          userIds: users.map((u?) => u.id),
          users,
        };
      })
    : [];
  let row = reactions.find((r?) => String(r.key) === parsed.key);
  let added = false;
  const uid = String(actor.userId);
  const uname = displayNameForMember(actor.member);

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

  const nameMap = buildReactionNameMap(ticket, [msg]);
  const serializedMsg = serializeMessage(msg, nameMap, null, null, ticket);
  const serializedTicket = serializeTicketForActor(actor, ticket, {
    isOwner: loaded.isOwner,
    isAdded: loaded.isAdded,
  });
  emitTicketEvent({
    type: "web_ticket_reaction",
    ticketId: serializedTicket.id,
    message: serializedMsg,
    ticket: serializedTicket,
    added,
    actorId: uid,
  });

  return res.status(200).json({
    ok: true,
    added,
    ticket: serializedTicket,
    message: serializedMsg,
  });
}

async function handleSiteWebTicketsMessagePatch(client?, req?, res?) {
  const actor = await resolveMemberOrStaff(client, req);
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  const loaded = await loadTicketForActor(req.params?.ticketId, actor);
  if (!loaded.ok) {
    return res.status(loaded.status).json({ ok: false, error: loaded.error, message: loaded.message });
  }
  const ticket = loaded.ticket;
  if (ticket.status === WEB_TICKET_STATUS.CLOSED) {
    return res.status(409).json({ ok: false, error: "closed", message: "Ticket chiuso: non puoi modificare messaggi." });
  }

  const messageId = String(req.params?.messageId || "").trim();
  if (!mongoose.isValidObjectId(messageId)) {
    return res.status(400).json({ ok: false, error: "invalid_message", message: "Messaggio non valido." });
  }

  const msg = await SiteWebTicketMessage.findOne({ _id: messageId, ticketId: ticket._id });
  if (!msg) {
    return res.status(404).json({ ok: false, error: "not_found", message: "Messaggio non trovato." });
  }
  if (String(msg.authorKind || "") === "system") {
    return res.status(400).json({ ok: false, error: "system_message", message: "Non puoi modificare i messaggi di sistema." });
  }
  if (String(msg.authorId) !== String(actor.userId)) {
    return res.status(403).json({ ok: false, error: "forbidden", message: "Puoi modificare solo i tuoi messaggi." });
  }

  let content = sanitizeText(req.body?.content, MAX_CONTENT);
  {
    const scope = await resolveTicketMentionScope(client, ticket);
    const allowRoles = String(msg.authorKind || "") === "staff";
    content = sanitizeWebTicketMentionsToScope(content, {
      allowedUserIds: scope.allowedUserIds,
      allowedRoleIds: scope.allowedRoleIds,
      allowRoleMentions: allowRoles,
    });
    content = sanitizeWebTicketChannelMentions(content, actor.member, scope.guild);
  }
  const imageCount = Array.isArray(msg.imageUrls) ? msg.imageUrls.length : 0;
    if (!content && !imageCount) {
    const deletedSnapshot = {
      _id: msg._id,
      authorId: msg.authorId,
      authorKind: msg.authorKind,
      authorName: msg.authorName,
      content: msg.content,
      imageUrls: Array.isArray(msg.imageUrls) ? msg.imageUrls.slice() : [],
    };
    await SiteWebTicketMessage.deleteOne({ _id: msg._id });
    ticket.messageCount = Math.max(0, (Number(ticket.messageCount) || 1) - 1);
    await refreshTicketLastMessageFields(ticket);
    const serializedTicket = serializeTicketForActor(actor, ticket, { isOwner: loaded.isOwner, isAdded: loaded.isAdded });
    emitTicketEvent({
      type: "web_ticket_message_deleted",
      ticketId: serializedTicket.id,
      messageId: String(msg._id),
      ticket: serializedTicket,
    });
    emitTicketEvent({ type: "web_tickets_list_changed", at: new Date().toISOString() });
    void sendWebTicketMessageActivityLog(client, "deleted", ticket, deletedSnapshot, {
      actorId: actor.userId,
      guildId: ticket.guildId,
    });
    return res.status(200).json({
      ok: true,
      deleted: true,
      ticket: serializedTicket,
      messageId: String(msg._id),
    });
  }

  if (String(msg.authorKind || "") !== "staff" && content && !(actor.isStaff && !loaded.isAdded)) {
    const auto = checkWebTicketUserMessageAutomod({
      content,
      guildId: String(ticket.guildId),
      userId: actor.userId,
      ticketId: String(ticket._id),
    });
    if (!auto.ok) {
      return res.status(400).json({
        ok: false,
        error: auto.error || "automod",
        message: auto.message,
      });
    }
  }

  const beforeContent = String(msg.content || "");
  const beforeImageUrls = Array.isArray(msg.imageUrls) ? msg.imageUrls.slice() : [];
  msg.content = content;
  msg.editedAt = new Date();
  await msg.save();

    const last: any = await SiteWebTicketMessage.findOne({ ticketId: ticket._id }).sort({ createdAt: -1 }).select("_id").lean();
  if (last && String(last._id) === String(msg._id)) {
    ticket.lastMessagePreview = previewFromContent(content, imageCount);
    ticket.lastMessageAt = msg.editedAt;
    await ticket.save();
  }

  const serializedMsg = serializeMessage(msg, null, null, null, ticket);
  const serializedTicket = serializeTicketForActor(actor, ticket, { isOwner: loaded.isOwner, isAdded: loaded.isAdded });
  emitTicketEvent({
    type: "web_ticket_message_updated",
    ticketId: serializedTicket.id,
    messageId: serializedMsg.id,
    message: serializedMsg,
    ticket: serializedTicket,
  });
  emitTicketEvent({ type: "web_tickets_list_changed", at: new Date().toISOString() });

  void sendWebTicketMessageActivityLog(client, "edited", ticket, msg, {
    actorId: actor.userId,
    guildId: ticket.guildId,
    beforeContent,
    beforeImageUrls,
  });

  return res.status(200).json({ ok: true, ticket: serializedTicket, message: serializedMsg });
}

async function handleSiteWebTicketsMessageDelete(client?, req?, res?) {
  const actor = await resolveMemberOrStaff(client, req);
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  const loaded = await loadTicketForActor(req.params?.ticketId, actor);
  if (!loaded.ok) {
    return res.status(loaded.status).json({ ok: false, error: loaded.error, message: loaded.message });
  }
  const ticket = loaded.ticket;
  if (ticket.status === WEB_TICKET_STATUS.CLOSED) {
    return res.status(409).json({ ok: false, error: "closed", message: "Ticket chiuso: non puoi eliminare messaggi." });
  }

  const messageId = String(req.params?.messageId || "").trim();
  if (!mongoose.isValidObjectId(messageId)) {
    return res.status(400).json({ ok: false, error: "invalid_message", message: "Messaggio non valido." });
  }

  const msg = await SiteWebTicketMessage.findOne({ _id: messageId, ticketId: ticket._id });
  if (!msg) {
        const serializedTicket = serializeTicketForActor(actor, ticket, { isOwner: loaded.isOwner, isAdded: loaded.isAdded });
    emitTicketEvent({
      type: "web_ticket_message_deleted",
      ticketId: serializedTicket.id,
      messageId,
      ticket: serializedTicket,
    });
    return res.status(200).json({ ok: true, ticket: serializedTicket, messageId, alreadyDeleted: true });
  }
  if (String(msg.authorKind || "") === "system") {
    return res.status(400).json({ ok: false, error: "system_message", message: "Non puoi eliminare i messaggi di sistema." });
  }
  const isOwner = String(msg.authorId) === String(actor.userId);
  // proprio messaggio → chiunque; altrui → solo High Staff (come UI React)
  if (!isOwner && !memberIsHighStaff(actor.member) && !memberIsHighStaffEligible(actor.member)) {
    return res.status(403).json({ ok: false, error: "forbidden", message: "Non puoi eliminare questo messaggio." });
  }

  const deletedSnapshot = {
    _id: msg._id,
    authorId: msg.authorId,
    authorKind: msg.authorKind,
    authorName: msg.authorName,
    content: msg.content,
    imageUrls: Array.isArray(msg.imageUrls) ? msg.imageUrls.slice() : [],
  };
  await SiteWebTicketMessage.deleteOne({ _id: msg._id });
  ticket.messageCount = Math.max(0, (Number(ticket.messageCount) || 1) - 1);
  await refreshTicketLastMessageFields(ticket);

  const serializedTicket = serializeTicketForActor(actor, ticket, { isOwner: loaded.isOwner, isAdded: loaded.isAdded });
  emitTicketEvent({
    type: "web_ticket_message_deleted",
    ticketId: serializedTicket.id,
    messageId: String(msg._id),
    ticket: serializedTicket,
  });
  emitTicketEvent({ type: "web_tickets_list_changed", at: new Date().toISOString() });

  void sendWebTicketMessageActivityLog(client, "deleted", ticket, deletedSnapshot, {
    actorId: actor.userId,
    guildId: ticket.guildId,
  });

  return res.status(200).json({ ok: true, ticket: serializedTicket, messageId: String(msg._id) });
}

export = { sanitizeWebTicketMentionsToScope, sanitizeWebTicketChannelMentions, handleSiteWebTicketsPresencePost, handleSiteWebTicketsReadPost, handleSiteWebTicketsTypingPost, handleSiteWebTicketsEmojisGet, handleSiteWebTicketsMentionsGet, handleSiteWebTicketsMessagePost, handleSiteWebTicketsReactionPost, handleSiteWebTicketsMessagePatch, handleSiteWebTicketsMessageDelete, handleSiteWebTicketsResolvePost, handleSiteWebTicketsFileGet };
