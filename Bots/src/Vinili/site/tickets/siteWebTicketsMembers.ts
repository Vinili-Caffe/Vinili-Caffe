/** Ticket dal sito, gestione: membri aggiunti, trasferimento, categoria e nome del ticket. */
const { WEB_TICKET_STATUS } = require("../../../MultiGuild/tickets/data/siteWebTicketSchemas") as typeof import("../../../MultiGuild/tickets/data/siteWebTicketSchemas");
const { CATEGORY_LABELS, displayNameForMember, looksLikeDiscordTicketName, extractTicketNameTail, webTicketNameTail, buildWebTicketChannelName, syncWebTicketChannelName, avatarForMember, sanitizeText, normalizeCategory, resolveGuildId, webCategoryFromPanelToken } = require("./ticketNames") as typeof import("./ticketNames");
const { listAddedUsers, ticketHasAddedUser, buildTicketPermissions } = require("./ticketStaffAccess") as typeof import("./ticketStaffAccess");
const { serializeMessage, resolveRateableStaffer, serializeTicket, serializeTicketForActor } = require("./ticketSerialize") as typeof import("./ticketSerialize");
const { emitTicketEvent, refreshStaffTicketQueueNotif, notifyUserTicketEvent, createSystemMessage } = require("./ticketNotify") as typeof import("./ticketNotify");
const { resolveMemberOrStaff, loadTicketForActor } = require("./ticketCommands") as typeof import("./ticketCommands");
const { canClaimTicket } = require("../../../MultiGuild/tickets/discord/ticketStaffRuntime") as typeof import("../../../MultiGuild/tickets/discord/ticketStaffRuntime");
const { sendWebTicketDiscordLog } = require("./webTicketDiscordLog") as typeof import("./webTicketDiscordLog");

const MAX_SUBJECT = 120;
const MAX_ADDED_USERS = 15;

function requireOpenStaffPanel(loaded?, actor?, extraPermKey?) {
  if (loaded.ticket.status === WEB_TICKET_STATUS.CLOSED) {
    return { ok: false, status: 409, error: "closed", message: "Ticket chiuso." };
  }
  const perms = buildTicketPermissions(actor.member, loaded.ticket, actor.userId, {
    isOwner: loaded.isOwner,
    isAdded: loaded.isAdded,
  });
  if (extraPermKey && !perms[extraPermKey]) {
    return { ok: false, status: 403, error: "forbidden", message: "Non hai i permessi per questa azione." };
  }
  return { ok: true, perms };
}

async function resolveGuildMemberById(client?, userId?) {
  const id = String(userId || "").trim();
  if (!/^\d{16,22}$/.test(id)) return null;
  const guildId = resolveGuildId(client);
  const guild =
    client?.guilds?.cache?.get?.(guildId) ||
    (await client?.guilds?.fetch?.(guildId).catch?.(() => null)) ||
    null;
  if (!guild) return null;
  const { getGuildMemberCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
  return getGuildMemberCached(guild, id).catch(() => null);
}

function parseUserIdFromBody(body?) {
  const raw = String(body?.userId || body?.id || "").trim();
  const mention = raw.match(/^<@!?(\d{16,22})>$/);
  if (mention) return mention[1];
  if (/^\d{16,22}$/.test(raw)) return raw;
  return "";
}

async function jsonTicketMutation(res?, actor?, loaded?, ticket?, sys?) {
  /* ticketMutationPersist1: createSystemMessage fa solo updateOne su lastMessage;
     senza save qui le mutazioni (close-request, rename, transfer, members…) restano
     solo in memoria → UI flash 1s poi spariscono al refresh/poll. */
  if (ticket && typeof ticket.save === "function") {
    const dirty =
      typeof ticket.isModified === "function" ? ticket.isModified() : true;
    if (dirty) {
      try {
        await ticket.save();
      } catch (err) {
        global.logger?.error?.("[WEB TICKETS] mutation save:", err?.message || err);
        return res.status(500).json({
          ok: false,
          error: "internal",
          message: "Errore nel salvataggio del ticket.",
        });
      }
    }
  }
  const perms = buildTicketPermissions(actor.member, ticket, actor.userId, {
    isOwner: loaded.isOwner,
    isAdded: loaded.isAdded || ticketHasAddedUser(ticket, actor.userId),
  });
  const rateableStaffer =
    String(ticket?.status) === WEB_TICKET_STATUS.CLOSED ? await resolveRateableStaffer(ticket) : null;
  const serialized = serializeTicket(ticket, {
    includeStaffFields: true,
    permissions: perms,
    rateableStaffer,
  });
  emitTicketEvent({ type: "web_ticket_updated", ticket: serialized });
  if (sys) {
    emitTicketEvent({
      type: "web_ticket_message",
      ticketId: serialized.id,
      message: serializeMessage(sys),
      ticket: serialized,
    });
  }
  emitTicketEvent({ type: "web_tickets_list_changed", at: new Date().toISOString() });
  return res.status(200).json({
    ok: true,
    ticket: serialized,
    message: sys ? serializeMessage(sys) : null,
  });
}

async function handleSiteWebTicketsMembersPost(client?, req?, res?) {
  const actor = await resolveMemberOrStaff(client, req);
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  const loaded = await loadTicketForActor(req.params?.ticketId, actor);
  if (!loaded.ok) {
    return res.status(loaded.status).json({ ok: false, error: loaded.error, message: loaded.message });
  }
  const gate = requireOpenStaffPanel(loaded, actor, "canAddUsers");
  if (!gate.ok) {
    return res.status(gate.status).json({ ok: false, error: gate.error, message: gate.message });
  }
  const ticket = loaded.ticket;
  const userId = parseUserIdFromBody(req.body);
  if (!userId) {
    return res.status(400).json({ ok: false, error: "invalid_user", message: "Seleziona un utente valido." });
  }
  if (userId === String(ticket.userId)) {
    return res.status(400).json({ ok: false, error: "opener", message: "L’autore del ticket è già presente." });
  }
  if (String(ticket.claimedBy || "") === userId) {
    return res.status(400).json({
      ok: false,
      error: "claimer",
      message: "Chi ha il claim è già nel ticket: non va aggiunto come utente.",
    });
  }
  if (ticketHasAddedUser(ticket, userId)) {
    return res.status(409).json({ ok: false, error: "already_added", message: "Questo utente è già nel ticket." });
  }
  const current = listAddedUsers(ticket);
  if (current.length >= MAX_ADDED_USERS) {
    return res.status(400).json({
      ok: false,
      error: "limit",
      message: `Puoi aggiungere al massimo ${MAX_ADDED_USERS} utenti.`,
    });
  }
  const member = await resolveGuildMemberById(client, userId);
  if (!member || member.user?.bot) {
    return res.status(400).json({ ok: false, error: "invalid_user", message: "Utente non valido o bot." });
  }
  current.push({
    id: userId,
    name: displayNameForMember(member),
    avatarUrl: avatarForMember(member) || "",
  });
  ticket.addedUsers = current;
  const sys = await createSystemMessage(
    ticket,
    `${displayNameForMember(actor.member)} ha aggiunto ${displayNameForMember(member)} al ticket.`,
  );
  void notifyUserTicketEvent(
    String(ticket.guildId),
    ticket,
    "Sei stato aggiunto a un ticket",
    `${displayNameForMember(actor.member)} ti ha aggiunto al ticket #${ticket.ticketNumber}.`,
    userId,
    { mode: "invite" },
  );
  void sendWebTicketDiscordLog(client, "member_added", ticket, {
    actorId: actor.userId,
    actorName: displayNameForMember(actor.member),
    targetUserId: userId,
    targetName: displayNameForMember(member),
  });
  return jsonTicketMutation(res, actor, loaded, ticket, sys);
}

async function handleSiteWebTicketsMembersRemovePost(client?, req?, res?) {
  const actor = await resolveMemberOrStaff(client, req);
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  const loaded = await loadTicketForActor(req.params?.ticketId, actor);
  if (!loaded.ok) {
    return res.status(loaded.status).json({ ok: false, error: loaded.error, message: loaded.message });
  }
  const gate = requireOpenStaffPanel(loaded, actor, "canRemoveUsers");
  if (!gate.ok) {
    return res.status(gate.status).json({ ok: false, error: gate.error, message: gate.message });
  }
  const ticket = loaded.ticket;
  const userId = parseUserIdFromBody(req.body);
  if (!userId || userId === String(ticket.userId)) {
    return res.status(400).json({ ok: false, error: "invalid_user", message: "Seleziona un utente da rimuovere." });
  }
  const before = listAddedUsers(ticket);
  const removed = before.find((u?) => u.id === userId);
  if (!removed) {
    return res.status(404).json({ ok: false, error: "not_found", message: "Questo utente non è tra gli invitati." });
  }
  ticket.addedUsers = before.filter((u?) => u.id !== userId);
  const sys = await createSystemMessage(
    ticket,
    `${displayNameForMember(actor.member)} ha rimosso ${removed.name || "un utente"} dal ticket.`,
  );
  void sendWebTicketDiscordLog(client, "member_removed", ticket, {
    actorId: actor.userId,
    actorName: displayNameForMember(actor.member),
    targetUserId: userId,
    targetName: removed.name || "",
  });
  return jsonTicketMutation(res, actor, loaded, ticket, sys);
}

async function handleSiteWebTicketsTransferPost(client?, req?, res?) {
  const actor = await resolveMemberOrStaff(client, req);
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  const loaded = await loadTicketForActor(req.params?.ticketId, actor);
  if (!loaded.ok) {
    return res.status(loaded.status).json({ ok: false, error: loaded.error, message: loaded.message });
  }
  const gate = requireOpenStaffPanel(loaded, actor, "canTransfer");
  if (!gate.ok) {
    return res.status(gate.status).json({ ok: false, error: gate.error, message: gate.message });
  }
  const ticket = loaded.ticket;
  const oldClaimer = String(ticket.claimedBy || "").trim();
  const userId = parseUserIdFromBody(req.body);
  if (!userId) {
    return res.status(400).json({ ok: false, error: "invalid_user", message: "Seleziona lo staffer a cui trasferire il claim." });
  }
  if (userId === String(ticket.userId) || userId === oldClaimer) {
    return res.status(400).json({ ok: false, error: "invalid_user", message: "Scelta non valida per il transfer." });
  }
  const member = await resolveGuildMemberById(client, userId);
  if (!member || member.user?.bot) {
    return res.status(400).json({ ok: false, error: "invalid_user", message: "Utente non nel server o bot." });
  }
  const category = loaded.category || normalizeCategory(ticket.category);
  if (!canClaimTicket(member, category, resolveGuildId(client))) {
    return res.status(403).json({
      ok: false,
      error: "role",
      message: "L’utente non ha il ruolo richiesto per gestire questo tipo di ticket.",
    });
  }
  const oldName = ticket.claimedByName || "staff";
  ticket.status = WEB_TICKET_STATUS.CLAIMED;
  ticket.claimedBy = userId;
  ticket.claimedByName = displayNameForMember(member);
  ticket.claimedAt = new Date();
  const sys = await createSystemMessage(
    ticket,
    `${displayNameForMember(actor.member)} ha trasferito il claim da ${oldName} a ${ticket.claimedByName}.`,
  );
  void notifyUserTicketEvent(
    String(ticket.guildId),
    ticket,
    "Ticket assegnato a te",
    `Ti è stato trasferito il ticket #${ticket.ticketNumber}.`,
    userId,
    { mode: "transfer", openUrl: `/tickets/?view=staff&ticketId=${String(ticket._id)}#${String(ticket._id)}` },
  );
  void sendWebTicketDiscordLog(client, "transferred", ticket, {
    actorId: actor.userId,
    actorName: displayNameForMember(actor.member),
    fromUserId: oldClaimer,
    fromName: oldName,
    toUserId: userId,
    toName: ticket.claimedByName,
  });
  return jsonTicketMutation(res, actor, loaded, ticket, sys);
}

async function handleSiteWebTicketsCategoryPost(client?, req?, res?) {
  const actor = await resolveMemberOrStaff(client, req);
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  const loaded = await loadTicketForActor(req.params?.ticketId, actor);
  if (!loaded.ok) {
    return res.status(loaded.status).json({ ok: false, error: loaded.error, message: loaded.message });
  }
  const gate = requireOpenStaffPanel(loaded, actor, "canSwitchCategory");
  if (!gate.ok) {
    return res.status(gate.status).json({ ok: false, error: gate.error, message: gate.message });
  }
  const ticket = loaded.ticket;
  const next = webCategoryFromPanelToken(req.body?.category);
  if (!next) {
    return res.status(400).json({
      ok: false,
      error: "invalid_category",
      message: "Categoria non valida. Usa: supporto, partnership, high, perks.",
    });
  }
  const prev = normalizeCategory(ticket.category) || String(ticket.category || "supporto");
  if (next === prev) {
    return res.status(200).json({
      ok: true,
      ticket: serializeTicketForActor(actor, ticket, {
        isOwner: loaded.isOwner,
        isAdded: loaded.isAdded,
        includeStaffFields: true,
      }),
      message: null,
    });
  }
  let claimRemoved = false;
  const previousClaimedBy = String(ticket.claimedBy || "").trim();
  if (previousClaimedBy) {
    const claimerMember = await resolveGuildMemberById(client, previousClaimedBy);
    const keepsClaim = Boolean(claimerMember && canClaimTicket(claimerMember, next, resolveGuildId(client)));
    if (!keepsClaim) {
      ticket.claimedBy = null;
      ticket.claimedByName = "";
      ticket.claimedAt = null;
      ticket.status = WEB_TICKET_STATUS.OPEN;
      claimRemoved = true;
    }
  }
  ticket.category = next;
  syncWebTicketChannelName(ticket);
  const label = CATEGORY_LABELS[next] || next;
  const sys = await createSystemMessage(
    ticket,
    claimRemoved
      ? `${displayNameForMember(actor.member)} ha cambiato la categoria in ${label}. Il claim è stato rimosso.`
      : `${displayNameForMember(actor.member)} ha cambiato la categoria in ${label}.`,
  );
  void sendWebTicketDiscordLog(client, "category_changed", ticket, {
    actorId: actor.userId,
    actorName: displayNameForMember(actor.member),
    beforeCategory: prev,
    claimRemoved,
  });
  if (prev !== next) {
    void refreshStaffTicketQueueNotif(client, String(ticket.guildId), prev, {
      push: false,
      excludeUserIds: [ticket.userId],
    });
    if (!String(ticket.claimedBy || "").trim()) {
      void refreshStaffTicketQueueNotif(client, String(ticket.guildId), next, {
        push: true,
        excludeUserIds: [ticket.userId, actor.userId],
      });
    }
  }
  return jsonTicketMutation(res, actor, loaded, ticket, sys);
}

async function handleSiteWebTicketsRenamePost(client?, req?, res?) {
  const actor = await resolveMemberOrStaff(client, req);
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  const loaded = await loadTicketForActor(req.params?.ticketId, actor);
  if (!loaded.ok) {
    return res.status(loaded.status).json({ ok: false, error: loaded.error, message: loaded.message });
  }
  const gate = requireOpenStaffPanel(loaded, actor, "canRename");
  if (!gate.ok) {
    return res.status(gate.status).json({ ok: false, error: gate.error, message: gate.message });
  }
  const ticket = loaded.ticket;
  const requested = sanitizeText(req.body?.subject || req.body?.name, MAX_SUBJECT);
  if (!requested) {
    return res.status(400).json({ ok: false, error: "invalid_name", message: "Inserisci un nome valido." });
  }
  const incomingTail = looksLikeDiscordTicketName(requested)
    ? extractTicketNameTail(requested, webTicketNameTail(ticket))
    : requested;
  const prev = buildWebTicketChannelName(ticket);
  const nextName = buildWebTicketChannelName(ticket, incomingTail);
  if (nextName === prev) {
    return res.status(200).json({
      ok: true,
      ticket: serializeTicketForActor(actor, ticket, {
        isOwner: loaded.isOwner,
        isAdded: loaded.isAdded,
        includeStaffFields: true,
      }),
      message: null,
    });
  }
  ticket.subject = nextName;
  const sys = await createSystemMessage(
    ticket,
    `${displayNameForMember(actor.member)} ha rinominato il ticket da “${prev}” a “${nextName}”.`,
  );
  void sendWebTicketDiscordLog(client, "renamed", ticket, {
    actorId: actor.userId,
    actorName: displayNameForMember(actor.member),
    beforeSubject: prev,
    afterSubject: nextName,
  });
  return jsonTicketMutation(res, actor, loaded, ticket, sys);
}

export = { MAX_SUBJECT, requireOpenStaffPanel, jsonTicketMutation, handleSiteWebTicketsMembersPost, handleSiteWebTicketsMembersRemovePost, handleSiteWebTicketsTransferPost, handleSiteWebTicketsCategoryPost, handleSiteWebTicketsRenamePost };
