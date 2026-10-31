/** Suggerimenti: decisioni dello staff (accetta, rifiuta, decisione, elimina). */
const mongoose = require("mongoose") as typeof import("mongoose");
const { SiteDocument } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { suggestionBoardOf, sanitizeStaffReason } = require("./suggestionFields") as typeof import("./suggestionFields");
const { broadcastSiteSuggestionsChanged } = require("./siteSuggestionsBroadcast") as typeof import("./siteSuggestionsBroadcast");
const { resolveWebsiteGuildMember } = require("../../Web/siteRoleRequestApi") as typeof import("../../Web/siteRoleRequestApi");
const { SG, memberCanModerateSuggestions, denyStaffBoardIfNeeded, deleteSuggestionFiles } = require("./suggestionFiles") as typeof import("./suggestionFiles");
const { clipNotifBody, suggestionNotifOpenUrl, deleteSuggestionNotifications, notifySuggestionAuthor } = require("./suggestionNotify") as typeof import("./suggestionNotify");
const { serializeSuggestion } = require("./suggestionSerialize") as typeof import("./suggestionSerialize");

async function staffAcceptSiteSuggestion(client?, payload: Record<string, any> = {}) {
  const accessToken = String(payload.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;
  if (!memberCanModerateSuggestions(resolved.member)) {
    return {
      ok: false,
      status: 403,
      error: "forbidden",
      message: "Solo l'High Staff può accettare i suggerimenti.",
    };
  }

  const suggestionId = String(payload.suggestionId || "").trim();
  if (!suggestionId || !mongoose.isValidObjectId(suggestionId)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID suggerimento non valido." };
  }

  const reason = sanitizeStaffReason(payload.reason);
  if (reason.length < 3) {
    return { ok: false, status: 400, error: "reason_required", message: "Inserisci un motivo di almeno 3 caratteri." };
  }

  const updated = await SiteDocument.findOneAndUpdate(
    {
      docType: SG,
      _id: suggestionId,
      guildId: resolved.guild.id,
      status: "pending",
    },
    {
      $set: {
        status: "accepted",
        staffReason: reason,
        staffUserId: resolved.userId,
        decidedAt: new Date(),
      },
    },
    { new: true },
  )
    .lean()
    .catch(() => null);

  if (!updated) {
    return {
      ok: false,
      status: 404,
      error: "not_found_or_closed",
      message: "Suggerimento non trovato o già gestito.",
    };
  }

  const authorAccept = String(updated.userId || "").trim();
  if (authorAccept) {
    await notifySuggestionAuthor(resolved.guild.id, authorAccept, {
      title: "Suggerimento accettato",
      body: `Lo staff ha accettato il tuo suggerimento sul sito. Motivo: ${clipNotifBody(reason, 380)}`,
      kind: "success",
      openUrl: suggestionNotifOpenUrl(suggestionId, suggestionBoardOf(updated)),
    });
    /* compitiAutoPickKeep1: anche /accept (non solo /decision) deve triggerare suggestion_kept */
    try {
      const { tryAutoSubmitCompito } = require("../staff/siteStaffCompitiAutoComplete") as typeof import("../staff/siteStaffCompitiAutoComplete");
      await tryAutoSubmitCompito(client, {
        guildId: resolved.guild.id,
        userId: authorAccept,
        taskId: "suggestion_kept",
        evidence: `Suggerimento accettato (${suggestionId})`,
      });
    } catch (errAuto) {
      global.logger?.warn?.("[siteSuggestionsApi] compiti auto accept:", errAuto?.message || errAuto);
    }
  }

  broadcastSiteSuggestionsChanged();
  return {
    ok: true,
    status: 200,
    suggestion: serializeSuggestion(updated, resolved.userId),
    message: "Suggerimento accettato.",
  };
}

async function staffRejectSiteSuggestion(client?, payload: Record<string, any> = {}) {
  const accessToken = String(payload.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;
  if (!memberCanModerateSuggestions(resolved.member)) {
    return {
      ok: false,
      status: 403,
      error: "forbidden",
      message: "Solo l'High Staff può rifiutare i suggerimenti.",
    };
  }

  const suggestionId = String(payload.suggestionId || "").trim();
  if (!suggestionId || !mongoose.isValidObjectId(suggestionId)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID suggerimento non valido." };
  }

  const reason = sanitizeStaffReason(payload.reason);
  if (reason.length < 3) {
    return { ok: false, status: 400, error: "reason_required", message: "Inserisci un motivo di almeno 3 caratteri." };
  }

  const updated = await SiteDocument.findOneAndUpdate(
    {
      docType: SG,
      _id: suggestionId,
      guildId: resolved.guild.id,
      status: "pending",
    },
    {
      $set: {
        status: "rejected",
        staffReason: reason,
        staffUserId: resolved.userId,
        decidedAt: new Date(),
      },
    },
    { new: true },
  )
    .lean()
    .catch(() => null);

  if (!updated) {
    return {
      ok: false,
      status: 404,
      error: "not_found_or_closed",
      message: "Suggerimento non trovato o già gestito.",
    };
  }

  const authorReject = String(updated.userId || "").trim();
  if (authorReject) {
    await notifySuggestionAuthor(resolved.guild.id, authorReject, {
      title: "Suggerimento rifiutato",
      body: `Lo staff ha rifiutato il tuo suggerimento sul sito. Motivo: ${clipNotifBody(reason, 380)}`,
      kind: "suggestion",
      openUrl: suggestionNotifOpenUrl(suggestionId, suggestionBoardOf(updated)),
    });
  }

  broadcastSiteSuggestionsChanged();
  return {
    ok: true,
    status: 200,
    suggestion: serializeSuggestion(updated, resolved.userId),
    message: "Suggerimento rifiutato.",
  };
}

async function staffSetSiteSuggestionDecision(client?, payload: Record<string, any> = {}) {
  const accessToken = String(payload.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;
  if (!memberCanModerateSuggestions(resolved.member)) {
    return {
      ok: false,
      status: 403,
      error: "forbidden",
      message: "Solo l'High Staff può modificare lo stato dei suggerimenti.",
    };
  }

  const suggestionId = String(payload.suggestionId || "").trim();
  if (!suggestionId || !mongoose.isValidObjectId(suggestionId)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID suggerimento non valido." };
  }

  const nextStatusRaw = String(payload.status || "").trim().toLowerCase();
  const nextStatus = nextStatusRaw === "accepted" || nextStatusRaw === "rejected" ? nextStatusRaw : "pending";
  const reason = sanitizeStaffReason(payload.reason);

  if ((nextStatus === "accepted" || nextStatus === "rejected") && reason.length < 3) {
    return { ok: false, status: 400, error: "reason_required", message: "Inserisci un motivo di almeno 3 caratteri." };
  }

  const prev = await SiteDocument.findOne({ docType: SG, _id: suggestionId, guildId: resolved.guild.id })
    .lean()
    .catch(() => null);
  if (!prev) {
    return { ok: false, status: 404, error: "not_found", message: "Suggerimento non trovato." };
  }
  {
    const denied = denyStaffBoardIfNeeded(resolved.member, prev);
    if (denied) return denied;
  }

  const set: Record<string, any> = { status: nextStatus, updatedAt: new Date() };
  if (nextStatus === "pending") {
    set.staffReason = "";
    set.staffUserId = "";
    set.decidedAt = null;
  } else {
    set.staffReason = reason;
    set.staffUserId = resolved.userId;
    set.decidedAt = new Date();
  }

  const updated = await SiteDocument.findOneAndUpdate(
    { docType: SG, _id: suggestionId, guildId: resolved.guild.id },
    { $set: set },
    { new: true },
  )
    .lean()
    .catch(() => null);

  if (!updated) {
    return { ok: false, status: 500, error: "update_failed", message: "Impossibile aggiornare il suggerimento." };
  }

  const authorId = String(updated.userId || "").trim();
  const prevStatus = String(prev.status || "pending");
  const boardUrl = suggestionBoardOf(updated);
  /* smartNotifLifecycle1: accept/reject → via notif staff "nuovo suggerimento" */
  if (nextStatus === "accepted" || nextStatus === "rejected") {
    void deleteSuggestionNotifications(resolved.guild.id, suggestionId);
  }
  if (authorId) {
    if (nextStatus === "accepted") {
      await notifySuggestionAuthor(resolved.guild.id, authorId, {
        title: "Suggerimento accettato",
        body: `Lo staff ha accettato il tuo suggerimento sul sito. Motivo: ${clipNotifBody(reason, 380)}`,
        kind: "success",
        openUrl: suggestionNotifOpenUrl(suggestionId, boardUrl),
      });
      try {
        const { tryAutoSubmitCompito } = require("../staff/siteStaffCompitiAutoComplete") as typeof import("../staff/siteStaffCompitiAutoComplete");
        await tryAutoSubmitCompito(client, {
          guildId: resolved.guild.id,
          userId: authorId,
          taskId: "suggestion_kept",
          evidence: `Suggerimento accettato (${suggestionId})`,
        });
      } catch (errAuto) {
        global.logger?.warn?.("[siteSuggestionsApi] compiti auto:", errAuto?.message || errAuto);
      }
    } else if (nextStatus === "rejected") {
      await notifySuggestionAuthor(resolved.guild.id, authorId, {
        title: "Suggerimento rifiutato",
        body: `Lo staff ha rifiutato il tuo suggerimento sul sito. Motivo: ${clipNotifBody(reason, 380)}`,
        kind: "suggestion",
        openUrl: suggestionNotifOpenUrl(suggestionId, boardUrl),
      });
    } else if (prevStatus !== "pending") {
      await notifySuggestionAuthor(resolved.guild.id, authorId, {
        title: "Suggerimento riaperto",
        body: "Lo staff ha rimesso il tuo suggerimento in valutazione sul sito.",
        kind: "suggestion",
        openUrl: suggestionNotifOpenUrl(suggestionId, boardUrl),
      });
    }
  }

  broadcastSiteSuggestionsChanged();
  return {
    ok: true,
    status: 200,
    suggestion: serializeSuggestion(updated, resolved.userId),
    message: "Suggerimento aggiornato.",
  };
}

async function staffDeleteSiteSuggestion(client?, payload: Record<string, any> = {}) {
  const accessToken = String(payload.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;
  if (!memberCanModerateSuggestions(resolved.member)) {
    return {
      ok: false,
      status: 403,
      error: "forbidden",
      message: "Solo l'High Staff può eliminare definitivamente i suggerimenti.",
    };
  }

  const suggestionId = String(payload.suggestionId || "").trim();
  if (!suggestionId || !mongoose.isValidObjectId(suggestionId)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID suggerimento non valido." };
  }

  const del = await SiteDocument.deleteOne({
    docType: SG,
    _id: suggestionId,
    guildId: resolved.guild.id,
  }).catch(() => null);

  const n = Number(del?.deletedCount ?? del?.n ?? 0);
  if (!del || n < 1) {
    return { ok: false, status: 404, error: "not_found", message: "Suggerimento non trovato." };
  }

  await deleteSuggestionNotifications(resolved.guild.id, suggestionId);
  deleteSuggestionFiles(suggestionId);
  broadcastSiteSuggestionsChanged();
  return { ok: true, status: 200, message: "Suggerimento eliminato definitivamente." };
}

export = { staffAcceptSiteSuggestion, staffRejectSiteSuggestion, staffSetSiteSuggestionDecision, staffDeleteSiteSuggestion };
