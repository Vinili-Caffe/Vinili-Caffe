/** Ticket dal sito, gestione: presa in carico, chiusura, membri, trasferimento, categoria, nome, richiesta di chiusura, voto allo staff; pulizia quando un utente o uno staffer esce. */
const { WEB_TICKET_STATUS, SiteWebTicket } = require("../data/siteWebTicketSchemas") as typeof import("../data/siteWebTicketSchemas");
const { removeSiteInAppNotificationsForTicket } = require("../../notifications/siteInAppNotificationsService") as typeof import("../../notifications/siteInAppNotificationsService");
const { displayNameForMember, sanitizeText, resolveGuildId } = require("./ticketNames") as typeof import("./ticketNames");
const { memberCanBypassClaimedTicketManage, listAddedUsers, ticketHasAddedUser, buildTicketPermissions } = require("./ticketStaffAccess") as typeof import("./ticketStaffAccess");
const { serializeMessage, resolveRateableStaffer, clampStarRating, serializeTicket } = require("./ticketSerialize") as typeof import("./ticketSerialize");
const { emitTicketEvent, listStaffRecipientsForCategory, refreshStaffTicketQueueNotif, notifyUserTicketEvent, purgeTicketNotifications, createSystemMessage, ticketBroadcastPayload, clearTicketSlaNotifsForTicket } = require("./ticketNotify") as typeof import("./ticketNotify");
const { resolveMemberOrStaff, loadTicketForActor } = require("./ticketCommands") as typeof import("./ticketCommands");
const { canClaimTicket } = require("../discord/ticketStaffRuntime") as typeof import("../discord/ticketStaffRuntime");
const { sendWebTicketDiscordLog } = require("./webTicketDiscordLog") as typeof import("./webTicketDiscordLog");
const { MAX_SUBJECT, handleSiteWebTicketsMembersPost, handleSiteWebTicketsMembersRemovePost, handleSiteWebTicketsTransferPost, handleSiteWebTicketsCategoryPost, handleSiteWebTicketsRenamePost } = require("./siteWebTicketsMembers") as typeof import("./siteWebTicketsMembers");
const { handleSiteWebTicketsCloseRequestPost, handleSiteWebTicketsCloseRequestAcceptPost, handleSiteWebTicketsCloseRequestRejectPost, handleSiteWebTicketsRatePost } = require("./siteWebTicketsCloseRequest") as typeof import("./siteWebTicketsCloseRequest");


const MAX_CLOSE_REASON = 500;

async function handleSiteWebTicketsClaimPost(client?, req?, res?) {
  const actor = await resolveMemberOrStaff(client, req);
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  const loaded = await loadTicketForActor(req.params?.ticketId, actor);
  if (!loaded.ok) {
    return res.status(loaded.status).json({ ok: false, error: loaded.error, message: loaded.message });
  }
  const ticket = loaded.ticket;
  const guildId = resolveGuildId(client);
  if (loaded.isOwner) {
    return res.status(403).json({
      ok: false,
      error: "own_ticket",
      message: "Non puoi claimare il ticket che hai aperto tu.",
    });
  }
  if (!canClaimTicket(actor.member, loaded.category || ticket.category, guildId)) {
    return res.status(403).json({ ok: false, error: "forbidden", message: "Non puoi claimare ticket di questa categoria." });
  }
  if (ticket.status === WEB_TICKET_STATUS.CLOSED) {
    return res.status(409).json({ ok: false, error: "closed", message: "Ticket chiuso." });
  }
  if (ticket.claimedBy && String(ticket.claimedBy) !== String(actor.userId)) {
    return res.status(409).json({
      ok: false,
      error: "already_claimed",
      message: `Già claimato da ${ticket.claimedByName || "uno staff"}.`,
    });
  }

  const claimerName = displayNameForMember(actor.member);
  const claimerId = String(actor.userId);
  const claimedAt = new Date();
  // ticketClaimAtomic1: claim solo se ancora libero (o già nostro) — anti double-claim
  const claimed = await SiteWebTicket.findOneAndUpdate(
    {
      _id: ticket._id,
      status: { $ne: WEB_TICKET_STATUS.CLOSED },
      $or: [
        { claimedBy: null },
        { claimedBy: "" },
        { claimedBy: { $exists: false } },
        { claimedBy: claimerId },
      ],
    },
    {
      $set: {
        status: WEB_TICKET_STATUS.CLAIMED,
        claimedBy: claimerId,
        claimedByName: claimerName,
        claimedAt,
        addedUsers: listAddedUsers(ticket).filter((u?) => u.id !== claimerId),
      },
    },
    { new: true },
  ).catch(() => null);

  if (!claimed) {
    const latest = await SiteWebTicket.findById(ticket._id).lean().catch(() => null);
    const other = String(latest?.claimedBy || "").trim();
    if (other && other !== claimerId) {
      return res.status(409).json({
        ok: false,
        error: "already_claimed",
        message: `Già claimato da ${latest?.claimedByName || "uno staff"}.`,
      });
    }
    if (latest?.status === WEB_TICKET_STATUS.CLOSED) {
      return res.status(409).json({ ok: false, error: "closed", message: "Ticket chiuso." });
    }
    return res.status(409).json({ ok: false, error: "claim_race", message: "Claim non riuscito, riprova." });
  }

  const wasUnclaimed = !String(ticket.claimedBy || "").trim();
  /* ticketClaimHard1: usa il doc fresh da findOneAndUpdate (version corretta) */
  const live = claimed;
  let sys = null;
  try {
    sys = await createSystemMessage(live, `${live.claimedByName} ha preso in carico il ticket.`);
  } catch (err) {
    global.logger?.warn?.("[WEB TICKETS] claim system message:", err?.message || err);
  }
  const perms = buildTicketPermissions(actor.member, live, actor.userId, {
    isOwner: loaded.isOwner,
    isAdded: ticketHasAddedUser(live, actor.userId),
  });
  const serialized = serializeTicket(live, { includeStaffFields: true, permissions: perms });
  const broadcastTicket = ticketBroadcastPayload(serialized);
  emitTicketEvent({ type: "web_ticket_updated", ticket: broadcastTicket });
  if (sys) {
    emitTicketEvent({
      type: "web_ticket_message",
      ticketId: serialized.id,
      message: serializeMessage(sys),
      ticket: broadcastTicket,
    });
  }
  emitTicketEvent({ type: "web_tickets_list_changed", at: new Date().toISOString() });
  void sendWebTicketDiscordLog(client, "claimed", live, {
    actorId: actor.userId,
    actorName: live.claimedByName,
  });
  if (wasUnclaimed) {
    void notifyUserTicketEvent(
      String(live.guildId),
      live,
      "Ticket preso in carico",
      `${live.claimedByName} ha preso in carico il tuo ticket.`,
      live.userId,
      { mode: "claimed" },
    );
    /* ticketSmartNotif1: coda aggiornata per TUTTI gli staff (non solo claimer);
       agli altri staff spariscono chat/mention/SLA di quel ticket (+ dismiss push). */
    void (async () => {
      try {
        await refreshStaffTicketQueueNotif(client, String(live.guildId), live.category, {
          push: false,
          excludeUserIds: [live.userId],
        });
        await clearTicketSlaNotifsForTicket(client, live).catch(() => null);
        const staffIds = await listStaffRecipientsForCategory(
          client,
          String(live.guildId),
          live.category,
          [live.userId, claimerId],
        );
        await Promise.all(
          (staffIds || []).map((userId?) =>
            removeSiteInAppNotificationsForTicket(userId, live._id || live.id, {
              forceDismiss: true,
            }).catch(() => 0),
          ),
        );
      } catch (err) {
        global.logger?.warn?.("[WEB TICKETS] claim smart notif:", err?.message || err);
      }
    })();
  }
  return res.status(200).json({
    ok: true,
    ticket: serialized,
    message: sys ? serializeMessage(sys) : null,
  });
}

async function handleSiteWebTicketsUnclaimPost(client?, req?, res?) {
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
    return res.status(409).json({ ok: false, error: "closed", message: "Ticket chiuso." });
  }
  if (!ticket.claimedBy) {
    const perms = buildTicketPermissions(actor.member, ticket, actor.userId, { isOwner: loaded.isOwner, isAdded: loaded.isAdded });
    return res.status(200).json({ ok: true, ticket: serializeTicket(ticket, { includeStaffFields: true, permissions: perms }) });
  }
  if (String(ticket.claimedBy) !== String(actor.userId)) {
    return res.status(403).json({ ok: false, error: "not_claimer", message: "Puoi rilasciare solo i ticket che hai claimato." });
  }
  const name = ticket.claimedByName || displayNameForMember(actor.member);
  ticket.status = WEB_TICKET_STATUS.OPEN;
  ticket.claimedBy = null;
  ticket.claimedByName = "";
  ticket.claimedAt = null;
  await ticket.save();
  let sys = null;
  try {
    sys = await createSystemMessage(ticket, `${name} ha rilasciato il ticket.`);
  } catch (err) {
    global.logger?.warn?.("[WEB TICKETS] unclaim system message:", err?.message || err);
  }
  const perms = buildTicketPermissions(actor.member, ticket, actor.userId, { isOwner: loaded.isOwner, isAdded: loaded.isAdded });
  const serialized = serializeTicket(ticket, { includeStaffFields: true, permissions: perms });
  const broadcastTicket = ticketBroadcastPayload(serialized);
  emitTicketEvent({ type: "web_ticket_updated", ticket: broadcastTicket });
  if (sys) {
    emitTicketEvent({
      type: "web_ticket_message",
      ticketId: serialized.id,
      message: serializeMessage(sys),
      ticket: broadcastTicket,
    });
  }
  emitTicketEvent({ type: "web_tickets_list_changed", at: new Date().toISOString() });
  void sendWebTicketDiscordLog(client, "unclaimed", ticket, {
    actorId: actor.userId,
    actorName: name,
  });
  void refreshStaffTicketQueueNotif(client, String(ticket.guildId), ticket.category, {
    push: true,
    excludeUserIds: [ticket.userId, actor.userId],
  });
  return res.status(200).json({
    ok: true,
    ticket: serialized,
    message: sys ? serializeMessage(sys) : null,
  });
}

async function closeOpenWebTicketsForGuildUser(client?, guildId?, userId?, options: Record<string, any> = {}) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return { closed: 0 };

  const closeReason =
    sanitizeText(options.closeReason, MAX_CLOSE_REASON) || "Utente uscito dal server";
  const closedBy = String(options.closedBy || client?.user?.id || "system").trim() || "system";
  const closedByName =
    sanitizeText(options.closedByName, 80) ||
    String(client?.user?.username || "").trim() ||
    "Sistema";

  const openTickets = await SiteWebTicket.find({
    guildId: gid,
    userId: uid,
    status: { $in: [WEB_TICKET_STATUS.OPEN, WEB_TICKET_STATUS.CLAIMED] },
  })
    .limit(50)
    .catch(() => []);
  if (!Array.isArray(openTickets) || !openTickets.length) return { closed: 0 };

  let closed = 0;
  for (const ticket of openTickets) {
    try {
      if (String(ticket.status) === WEB_TICKET_STATUS.CLOSED) continue;
      ticket.status = WEB_TICKET_STATUS.CLOSED;
      ticket.closedBy = closedBy;
      ticket.closedByName = closedByName;
      ticket.closedAt = new Date();
      ticket.closeReason = closeReason;
      ticket.closeRequestedBy = null;
      ticket.closeRequestedByName = "";
      ticket.closeRequestedAt = null;
      ticket.closeRequestReason = "";
      await ticket.save();

      const sys = await createSystemMessage(
        ticket,
        `Ticket chiuso automaticamente · ${closeReason}`,
      );
      const serialized = serializeTicket(ticket, { includeStaffFields: true });
      const broadcastTicket = ticketBroadcastPayload(serialized);
      emitTicketEvent({ type: "web_ticket_updated", ticket: broadcastTicket });
      emitTicketEvent({
        type: "web_ticket_message",
        ticketId: serialized.id,
        message: serializeMessage(sys),
        ticket: broadcastTicket,
      });

      const claimerId = String(ticket.claimedBy || "").trim();
      /* ticketSmartNotif1: auto-close → purge notif + dismiss push, poi avvisa claimer */
      void (async () => {
        try {
          await purgeTicketNotifications(client, ticket, {
            includeCategoryStaff: !claimerId,
          });
          await clearTicketSlaNotifsForTicket(client, ticket).catch(() => null);
          if (claimerId && claimerId !== uid) {
            await notifyUserTicketEvent(
              gid,
              ticket,
              "Ticket chiuso",
              `Il ticket #${ticket.ticketNumber} è stato chiuso automaticamente: ${closeReason}.`,
              claimerId,
              {
                mode: "closed",
                openUrl: `/tickets/?view=staff&ticketId=${String(ticket._id)}#${String(ticket._id)}`,
              },
            );
          }
          if (!claimerId) {
            await refreshStaffTicketQueueNotif(client, gid, ticket.category, {
              push: false,
              excludeUserIds: [uid],
            });
          }
        } catch (err) {
          global.logger?.warn?.("[webTickets] auto-close smart notif:", err?.message || err);
        }
      })();

      void sendWebTicketDiscordLog(client, "closed", ticket, {
        actorId: closedBy,
        actorName: closedByName,
        reason: closeReason,
      });
      closed += 1;
    } catch (err) {
      global.logger?.warn?.(
        "[webTickets] auto-close on leave failed:",
        String(ticket?._id || ""),
        err?.message || err,
      );
    }
  }

  if (closed) {
    emitTicketEvent({ type: "web_tickets_list_changed", at: new Date().toISOString() });
  }
  return { closed };
}

async function autoUnclaimOpenWebTicketsClaimedByUser(client?, guildId?, userId?, options: Record<string, any> = {}) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return { unclaimed: 0 };

  const reasonSuffix =
    String(options.reason || "").trim() || "perché è uscito dal server";
  const claimerNameHint = sanitizeText(options.claimerName, 80);

  const claimed = await SiteWebTicket.find({
    guildId: gid,
    claimedBy: uid,
    status: WEB_TICKET_STATUS.CLAIMED,
    userId: { $ne: uid },
  })
    .limit(50)
    .catch(() => []);
  if (!Array.isArray(claimed) || !claimed.length) return { unclaimed: 0 };

  let unclaimed = 0;
  for (const ticket of claimed) {
    try {
      const name = String(ticket.claimedByName || claimerNameHint || "Staff").trim() || "Staff";
      ticket.status = WEB_TICKET_STATUS.OPEN;
      ticket.claimedBy = null;
      ticket.claimedByName = "";
      ticket.claimedAt = null;
      await ticket.save();
      const sys = await createSystemMessage(
        ticket,
        `${name} ha rilasciato il ticket automaticamente ${reasonSuffix}.`,
      );
      const serialized = serializeTicket(ticket, { includeStaffFields: true });
      const broadcastTicket = ticketBroadcastPayload(serialized);
      emitTicketEvent({ type: "web_ticket_updated", ticket: broadcastTicket });
      emitTicketEvent({
        type: "web_ticket_message",
        ticketId: serialized.id,
        message: serializeMessage(sys),
        ticket: broadcastTicket,
      });
      void sendWebTicketDiscordLog(client, "unclaimed", ticket, {
        actorId: uid,
        actorName: name,
      });
      void refreshStaffTicketQueueNotif(client, gid, ticket.category, {
        push: true,
        excludeUserIds: [ticket.userId, uid],
      });
      unclaimed += 1;
    } catch (err) {
      global.logger?.warn?.(
        "[webTickets] auto-unclaim on leave failed:",
        String(ticket?._id || ""),
        err?.message || err,
      );
    }
  }

  if (unclaimed) {
    emitTicketEvent({ type: "web_tickets_list_changed", at: new Date().toISOString() });
  }
  return { unclaimed };
}

async function removeLeftUserFromOpenWebTickets(client?, guildId?, userId?) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return { removed: 0 };

  const tickets = await SiteWebTicket.find({
    guildId: gid,
    status: { $in: [WEB_TICKET_STATUS.OPEN, WEB_TICKET_STATUS.CLAIMED] },
    "addedUsers.id": uid,
    userId: { $ne: uid },
  })
    .limit(50)
    .catch(() => []);
  if (!Array.isArray(tickets) || !tickets.length) return { removed: 0 };

  let removed = 0;
  for (const ticket of tickets) {
    try {
      const before = Array.isArray(ticket.addedUsers) ? ticket.addedUsers.length : 0;
      ticket.addedUsers = (ticket.addedUsers || []).filter((u?) => String(u?.id || "").trim() !== uid);
      if (ticket.addedUsers.length === before) continue;
      await ticket.save();
      const sys = await createSystemMessage(
        ticket,
        `Un membro aggiunto è stato rimosso automaticamente (uscita dal server).`,
      );
      const serialized = serializeTicket(ticket, { includeStaffFields: true });
      const broadcastTicket = ticketBroadcastPayload(serialized);
      emitTicketEvent({ type: "web_ticket_updated", ticket: broadcastTicket });
      emitTicketEvent({
        type: "web_ticket_message",
        ticketId: serialized.id,
        message: serializeMessage(sys),
        ticket: broadcastTicket,
      });
      void sendWebTicketDiscordLog(client, "member_removed", ticket, {
        actorId: "system",
        actorName: "Sistema",
        targetUserId: uid,
      });
      removed += 1;
    } catch (err) {
      global.logger?.warn?.(
        "[webTickets] remove added member on leave failed:",
        String(ticket?._id || ""),
        err?.message || err,
      );
    }
  }

  if (removed) {
    emitTicketEvent({ type: "web_tickets_list_changed", at: new Date().toISOString() });
  }
  return { removed };
}

async function handleSiteWebTicketsClosePost(client?, req?, res?) {
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
    const perms = buildTicketPermissions(actor.member, ticket, actor.userId, { isOwner: loaded.isOwner, isAdded: loaded.isAdded });
    return res.status(200).json({ ok: true, ticket: serializeTicket(ticket, { includeStaffFields: true, permissions: perms }) });
  }

  const perms = buildTicketPermissions(actor.member, ticket, actor.userId, { isOwner: loaded.isOwner, isAdded: loaded.isAdded });
  if (!perms.canClose) {
    if (actor.isStaff && !loaded.isOwner) {
      const claimer = String(ticket.claimedBy || "").trim();
      if (!claimer) {
        return res.status(403).json({ ok: false, error: "not_claimed", message: "Questo ticket non è claimato." });
      }
      if (claimer !== String(actor.userId) && !memberCanBypassClaimedTicketManage(actor.member, ticket)) {
        return res.status(403).json({
          ok: false,
          error: "not_claimer",
          message: "Solo chi ha claimato il ticket può chiuderlo.",
        });
      }
    }
    return res.status(403).json({ ok: false, error: "forbidden", message: "Non puoi chiudere questo ticket." });
  }

  const reason = sanitizeText(req.body?.reason, MAX_CLOSE_REASON);
  ticket.status = WEB_TICKET_STATUS.CLOSED;
  ticket.closedBy = actor.userId;
  ticket.closedByName = displayNameForMember(actor.member);
  ticket.closedAt = new Date();
  ticket.closeReason = reason;
    ticket.ratingTicketScore = clampStarRating(ticket.ratingTicketScore);
  ticket.ratingStafferScore = clampStarRating(ticket.ratingStafferScore);
  await ticket.save();

  const who = actor.isStaff && !loaded.isOwner ? "Lo staff" : "L'utente";
  const sysText = reason
    ? `${who} ha chiuso il ticket · ${reason}`
    : `${who} ha chiuso il ticket.`;
  const sys = await createSystemMessage(ticket, sysText);
  const closePerms = buildTicketPermissions(actor.member, ticket, actor.userId, { isOwner: loaded.isOwner, isAdded: loaded.isAdded });
  const rateableStaffer = await resolveRateableStaffer(ticket);
  const serialized = serializeTicket(ticket, {
    includeStaffFields: true,
    permissions: closePerms,
    rateableStaffer,
  });
  emitTicketEvent({ type: "web_ticket_updated", ticket: serialized });
  emitTicketEvent({ type: "web_ticket_message", ticketId: serialized.id, message: serializeMessage(sys), ticket: serialized });
  emitTicketEvent({ type: "web_tickets_list_changed", at: new Date().toISOString() });

  const closerId = String(actor.userId || "").trim();
  const ownerId = String(ticket.userId || "").trim();
  const claimerId = String(ticket.claimedBy || "").trim();
  const staffClosed = Boolean(actor.isStaff && !loaded.isOwner);
  const notifyClaimer =
    Boolean(claimerId) && claimerId !== closerId && claimerId !== ownerId;

  /* ticketSmartNotif1: prima purge chat/mention/SLA (+ dismiss push), poi event "chiuso" + coda */
  void (async () => {
    try {
      await purgeTicketNotifications(client, ticket, {
        includeCategoryStaff: !claimerId,
        excludeUserIds: [],
      });
      await clearTicketSlaNotifsForTicket(client, ticket).catch(() => null);
      if (staffClosed) {
        await notifyUserTicketEvent(
          String(ticket.guildId),
          ticket,
          "Ticket chiuso",
          reason || "Il tuo ticket è stato chiuso dallo staff.",
          null,
          { mode: "closed" },
        );
      }
      if (notifyClaimer) {
        await notifyUserTicketEvent(
          String(ticket.guildId),
          ticket,
          "Ticket chiuso",
          `${ticket.closedByName || "Qualcuno"} ha chiuso il ticket #${ticket.ticketNumber} che avevi in carico.`,
          claimerId,
          {
            mode: "closed",
            openUrl: `/tickets/?view=staff&ticketId=${String(ticket._id)}#${String(ticket._id)}`,
          },
        );
      }
      if (!claimerId) {
        await refreshStaffTicketQueueNotif(client, String(ticket.guildId), ticket.category, {
          push: false,
          excludeUserIds: [ticket.userId],
        });
      }
    } catch (err) {
      global.logger?.warn?.("[WEB TICKETS] close smart notif:", err?.message || err);
    }
  })();

  void sendWebTicketDiscordLog(client, "closed", ticket, {
    actorId: actor.userId,
    actorName: ticket.closedByName,
    reason,
  });

  return res.status(200).json({ ok: true, ticket: serialized, message: serializeMessage(sys) });
}

export = { MAX_SUBJECT, handleSiteWebTicketsClaimPost, handleSiteWebTicketsUnclaimPost, closeOpenWebTicketsForGuildUser, autoUnclaimOpenWebTicketsClaimedByUser, removeLeftUserFromOpenWebTickets, handleSiteWebTicketsClosePost, handleSiteWebTicketsMembersPost, handleSiteWebTicketsMembersRemovePost, handleSiteWebTicketsTransferPost, handleSiteWebTicketsCategoryPost, handleSiteWebTicketsRenamePost, handleSiteWebTicketsCloseRequestPost, handleSiteWebTicketsCloseRequestAcceptPost, handleSiteWebTicketsCloseRequestRejectPost, handleSiteWebTicketsRatePost };
