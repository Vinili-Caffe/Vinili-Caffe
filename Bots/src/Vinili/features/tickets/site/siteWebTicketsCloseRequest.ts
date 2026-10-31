/** Ticket dal sito, gestione: richiesta di chiusura (manda, accetta, rifiuta) e voto allo staff. */
const { WEB_TICKET_STATUS } = require("../data/siteWebTicketSchemas") as typeof import("../data/siteWebTicketSchemas");
const { displayNameForMember, sanitizeText } = require("./ticketNames") as typeof import("./ticketNames");
const { buildTicketPermissions } = require("./ticketStaffAccess") as typeof import("./ticketStaffAccess");
const { staffAvgRatingMap, resolveRateableStaffer, clampStarRating, serializeTicket } = require("./ticketSerialize") as typeof import("./ticketSerialize");
const { emitTicketEvent, notifyUserTicketEvent, createSystemMessage } = require("./ticketNotify") as typeof import("./ticketNotify");
const { resolveMemberOrStaff, loadTicketForActor } = require("./ticketCommands") as typeof import("./ticketCommands");
const { ActivityUserProfile } = require("../../../Schemas/Community/communitySchemas") as typeof import("../../../Schemas/Community/communitySchemas");
const { getOrCreateStaffDoc } = require("../../../Utils/Staff/staffDocUtils") as typeof import("../../../Utils/Staff/staffDocUtils");
const { sendWebTicketDiscordLog } = require("./webTicketDiscordLog") as typeof import("./webTicketDiscordLog");
const { requireOpenStaffPanel, jsonTicketMutation } = require("./siteWebTicketsMembers") as typeof import("./siteWebTicketsMembers");

const MAX_CLOSE_REQUEST_REASON = 1800;

async function handleSiteWebTicketsCloseRequestPost(client?, req?, res?) {
  const actor = await resolveMemberOrStaff(client, req);
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  const loaded = await loadTicketForActor(req.params?.ticketId, actor);
  if (!loaded.ok) {
    return res.status(loaded.status).json({ ok: false, error: loaded.error, message: loaded.message });
  }
  const gate = requireOpenStaffPanel(loaded, actor, "canCloseRequest");
  if (!gate.ok) {
    return res.status(gate.status).json({ ok: false, error: gate.error, message: gate.message });
  }
  const ticket = loaded.ticket;
  const reason = sanitizeText(req.body?.reason, MAX_CLOSE_REQUEST_REASON);
  ticket.closeRequestedBy = actor.userId;
  ticket.closeRequestedByName = displayNameForMember(actor.member);
  ticket.closeRequestedAt = new Date();
  ticket.closeRequestReason = reason;
  const reasonLine = reason ? ` Motivo: ${reason}` : "";
  const sys = await createSystemMessage(
    ticket,
    `${displayNameForMember(actor.member)} ha richiesto di chiudere il ticket.${reasonLine}`,
  );
  void notifyUserTicketEvent(
    String(ticket.guildId),
    ticket,
    "Richiesta di chiusura ticket",
    reason || `${displayNameForMember(actor.member)} ha chiesto di chiudere il ticket #${ticket.ticketNumber}.`,
    null,
    { mode: "close-request" },
  );
  void sendWebTicketDiscordLog(client, "close_requested", ticket, {
    actorId: actor.userId,
    actorName: displayNameForMember(actor.member),
    reason,
  });
  return jsonTicketMutation(res, actor, loaded, ticket, sys);
}

function clearCloseRequestFields(ticket?) {
  ticket.closeRequestedBy = null;
  ticket.closeRequestedByName = "";
  ticket.closeRequestedAt = null;
  ticket.closeRequestReason = "";
}

async function handleSiteWebTicketsCloseRequestAcceptPost(client?, req?, res?) {
  const actor = await resolveMemberOrStaff(client, req);
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  const loaded = await loadTicketForActor(req.params?.ticketId, actor);
  if (!loaded.ok) {
    return res.status(loaded.status).json({ ok: false, error: loaded.error, message: loaded.message });
  }
  const ticket = loaded.ticket;
  const perms = buildTicketPermissions(actor.member, ticket, actor.userId, {
    isOwner: loaded.isOwner,
    isAdded: loaded.isAdded,
  });
  if (!perms.canRespondCloseRequest) {
    return res.status(403).json({ ok: false, error: "forbidden", message: "Solo l’autore può accettare la chiusura." });
  }
  const reason = String(ticket.closeRequestReason || "").trim();
  clearCloseRequestFields(ticket);
  ticket.status = WEB_TICKET_STATUS.CLOSED;
  ticket.closedBy = actor.userId;
  ticket.closedByName = displayNameForMember(actor.member);
  ticket.closedAt = new Date();
  ticket.closeReason = reason;
  const sys = await createSystemMessage(
    ticket,
    reason ? `L'utente ha accettato la chiusura · ${reason}` : "L'utente ha accettato la chiusura del ticket.",
  );
  void sendWebTicketDiscordLog(client, "closed", ticket, {
    actorId: actor.userId,
    actorName: ticket.closedByName,
    reason,
  });
  const claimerId = String(ticket.claimedBy || "").trim();
  if (claimerId && claimerId !== String(actor.userId)) {
    void notifyUserTicketEvent(
      String(ticket.guildId),
      ticket,
      "Ticket chiuso",
      `L'utente ha accettato la chiusura del ticket #${ticket.ticketNumber}.`,
      claimerId,
      { mode: "closed", openUrl: `/tickets/?view=staff&ticketId=${String(ticket._id)}#${String(ticket._id)}` },
    );
  }
  return jsonTicketMutation(res, actor, loaded, ticket, sys);
}

async function handleSiteWebTicketsCloseRequestRejectPost(client?, req?, res?) {
  const actor = await resolveMemberOrStaff(client, req);
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  const loaded = await loadTicketForActor(req.params?.ticketId, actor);
  if (!loaded.ok) {
    return res.status(loaded.status).json({ ok: false, error: loaded.error, message: loaded.message });
  }
  const ticket = loaded.ticket;
  const perms = buildTicketPermissions(actor.member, ticket, actor.userId, {
    isOwner: loaded.isOwner,
    isAdded: loaded.isAdded,
  });
  if (!perms.canRespondCloseRequest) {
    return res.status(403).json({ ok: false, error: "forbidden", message: "Solo l’autore può rifiutare la chiusura." });
  }
  const requestedBy = String(ticket.closeRequestedBy || "").trim();
  clearCloseRequestFields(ticket);
  const sys = await createSystemMessage(
    ticket,
    "L'utente ha rifiutato la richiesta di chiusura. Il ticket resta aperto.",
  );
  void sendWebTicketDiscordLog(client, "close_request_rejected", ticket, {
    actorId: actor.userId,
    actorName: displayNameForMember(actor.member),
  });
  if (requestedBy && requestedBy !== String(actor.userId)) {
    void notifyUserTicketEvent(
      String(ticket.guildId),
      ticket,
      "Chiusura rifiutata",
      `L'utente ha rifiutato la chiusura del ticket #${ticket.ticketNumber}. Il ticket resta aperto.`,
      requestedBy,
      { mode: "close-rejected", openUrl: `/tickets/?view=staff&ticketId=${String(ticket._id)}#${String(ticket._id)}` },
    );
  }
  return jsonTicketMutation(res, actor, loaded, ticket, sys);
}

async function handleSiteWebTicketsRatePost(client?, req?, res?) {
  const actor = await resolveMemberOrStaff(client, req);
  if (!actor.ok) {
    return res.status(actor.status).json({ ok: false, error: actor.error, message: actor.message });
  }
  const loaded = await loadTicketForActor(req.params?.ticketId, actor);
  if (!loaded.ok) {
    return res.status(loaded.status).json({ ok: false, error: loaded.error, message: loaded.message });
  }
  if (!loaded.isOwner) {
    return res.status(403).json({
      ok: false,
      error: "forbidden",
      message: "Solo il proprietario del ticket può lasciare una valutazione.",
    });
  }
  const ticket = loaded.ticket;
  if (String(ticket.status) !== WEB_TICKET_STATUS.CLOSED) {
    return res.status(409).json({
      ok: false,
      error: "not_closed",
      message: "Puoi valutare solo un ticket chiuso.",
    });
  }
  if (ticket.ratingAt || ticket.ratingStafferScore != null) {
    return res.status(409).json({
      ok: false,
      error: "already_rated",
      message: "Hai già valutato questo ticket.",
    });
  }

  const ticketScore = clampStarRating(req.body?.ticketRating ?? req.body?.ratingTicketScore);
  const stafferScore = clampStarRating(req.body?.stafferRating ?? req.body?.ratingStafferScore);
  if (!ticketScore || !stafferScore) {
    return res.status(400).json({
      ok: false,
      error: "invalid_rating",
      message: "Indica un voto da 1 a 5 stelle per il ticket e per lo staffer.",
    });
  }

  const staffer = await resolveRateableStaffer(ticket);
  if (!staffer?.id) {
    return res.status(409).json({
      ok: false,
      error: "no_staffer",
      message: "Nessuno staffer da valutare su questo ticket.",
    });
  }

  ticket.ratingTicketScore = ticketScore;
  ticket.ratingStafferScore = stafferScore;
  ticket.ratingBy = actor.userId;
  ticket.ratingAt = new Date();
  ticket.ratedStafferId = staffer.id;
  ticket.ratedStafferName = staffer.name;
  await ticket.save();

  try {
    await getOrCreateStaffDoc(String(ticket.guildId), staffer.id);
    await ActivityUserProfile.updateOne(
      { guildId: String(ticket.guildId), userId: staffer.id },
      {
        $inc: {
          "staff.webTicketRatingSum": stafferScore,
          "staff.webTicketRatingCount": 1,
        },
      },
    );
  } catch (err) {
    global.logger?.warn?.("[WEB TICKETS] rate staff aggregate:", err?.message || err);
  }

  const perms = buildTicketPermissions(actor.member, ticket, actor.userId, {
    isOwner: true,
    isAdded: loaded.isAdded,
  });
  const serialized = serializeTicket(ticket, {
    includeStaffFields: true,
    permissions: perms,
    rateableStaffer: staffer,
  });
  const staffAvgMap = await staffAvgRatingMap(ticket.guildId, [staffer.id]);
  emitTicketEvent({ type: "web_ticket_updated", ticket: serialized });
  emitTicketEvent({ type: "web_tickets_list_changed", at: new Date().toISOString() });

  void sendWebTicketDiscordLog(client, "rated", ticket, {
    actorId: actor.userId,
    actorName: displayNameForMember(actor.member),
    stafferId: staffer.id,
    stafferName: staffer.name,
    ticketScore,
    stafferScore,
  });

  return res.status(200).json({
    ok: true,
    ticket: serialized,
    staffer: {
      id: staffer.id,
      name: staffer.name,
      avgRating: staffAvgMap[staffer.id] != null ? staffAvgMap[staffer.id] : stafferScore,
    },
  });
}

export = { handleSiteWebTicketsCloseRequestPost, handleSiteWebTicketsCloseRequestAcceptPost, handleSiteWebTicketsCloseRequestRejectPost, handleSiteWebTicketsRatePost };
