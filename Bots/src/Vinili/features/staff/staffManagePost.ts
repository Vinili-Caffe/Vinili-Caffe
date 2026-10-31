/** Gestione staff: azioni sul membro (pex, depex, pause, avvisi). */
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { memberHasStaffRole, memberIsBlogger, getStaffListPausedUserIds } = require("../../Utils/Community/staffListUtils") as typeof import("../../Utils/Community/staffListUtils");
const { runProfileStaffPex, runProfileStaffDepex, runProfileStaffCompleteDepex, runProfileStaffWarnAdd, runProfileStaffWarnRemove, runProspectStaffPex, runProspectStaffPexToPartnerManager, runProspectStaffPexToBlogger, getHighestLadderRole, getNextLadderRoleId, assertStaffCareerHierarchy } = require("../../Utils/Staff/staffPanelActions") as typeof import("../../Utils/Staff/staffPanelActions");
const { viewerIsFounder } = require("../../Utils/Staff/staffProfilePanelRuntime") as typeof import("../../Utils/Staff/staffProfilePanelRuntime");
const { clearStaffProfileCacheForUser } = require("./siteStaffProfileApi") as typeof import("./siteStaffProfileApi");
const { clearWebsiteMemberCaches, fetchWebsiteGuildMember, ensureWebsiteGuild } = require("../../Web/websiteGuildMemberFetch") as typeof import("../../Web/websiteGuildMemberFetch");
const { runValutazionePositiveAddForPanel, runValutazioneNegativeAddForPanel, runValutazionePositiveRemoveForPanel, runValutazioneNegativeRemoveForPanel } = require("../../Utils/Staff/valutazionePanelActions") as typeof import("../../Utils/Staff/valutazionePanelActions");
const { assertWebsiteStaffAccess, normalizeHeaderSecret } = require("./siteStaffAccessApi") as typeof import("./siteStaffAccessApi");
const { memberIsHighStaffEligible } = require("./siteStaffDashboardApi") as typeof import("./siteStaffDashboardApi");
const { memberIsPm, stripDiscordDecorations, invalidateStaffRosterCache } = require("./siteStaffRosterCache") as typeof import("./siteStaffRosterCache");
const { memberIsResocontoPmReviewer } = require("../tickets/discord/ticketPartnershipStaffRoles") as typeof import("../tickets/discord/ticketPartnershipStaffRoles");
const { acceptPauseRequestWeb, rejectPauseRequestWeb, cancelPauseRequestWeb } = require("../../Utils/Pause/pauseWebActionsRuntime") as typeof import("../../Utils/Pause/pauseWebActionsRuntime");
const { buildMemberDetail } = require("./staffManageDetail") as typeof import("./staffManageDetail");

const MANAGE_ACTIONS = new Set([
  "pex",
  "pex_pm",
  "pex_blogger",
  "pex_helper",
  "pex_mod",
  "pex_senior_moderator",
  "pex_director",
  "pex_admin",
  "pex_manager",
  "depex",
  "depex_pm",
  "depex_blogger",
  "depex_full",
  "val_pos",
  "val_neg",
  "val_pos_rm",
  "val_neg_rm",
  "warn_add",
  "warn_rm",
  "pause_accept",
  "pause_reject",
  "pause_cancel",
]);

const PAUSE_MANAGE_ACTIONS = new Set(["pause_accept", "pause_reject", "pause_cancel"]);
const PM_GESTORE_MANAGE_ACTIONS = new Set([
  "pex",
  "pex_pm",
  "pex_helper",
  "depex_pm",
  "pause_accept",
  "pause_reject",
  "pause_cancel",
]);

const FOUNDER_ONLY_PROSPECT_PEX = new Set([
  "pex_mod",
  "pex_senior_moderator",
  "pex_director",
  "pex_admin",
  "pex_manager",
]);

const PROSPECT_PEX_ROLE_BY_ACTION = {
  pex_helper: () => IDs.roles?.Helper,
  pex_mod: () => IDs.roles?.Mod,
  pex_senior_moderator: () => IDs.roles?.SeniorModerator,
  pex_director: () => IDs.roles?.Director,
  pex_admin: () => IDs.roles?.Admin,
  pex_manager: () => IDs.roles?.Manager,
};

function cleanActionMessage(msg?) {
  return stripDiscordDecorations(msg) || "Operazione non riuscita.";
}

async function assertManageAccess(client?, req?, { write = false } = {}) {
  const accessToken = normalizeHeaderSecret(req.headers.authorization);
  const access = await assertWebsiteStaffAccess(client, accessToken, { req });
  if (!access.ok) return access;
  const isHighStaff = memberIsHighStaffEligible(access.member);
  const isPmGestore = memberIsResocontoPmReviewer(access.member);
  const canWrite = Boolean(isHighStaff || isPmGestore);
  if (write && !canWrite) {
    return {
      ok: false,
      status: 403,
      error: "forbidden",
      message: "Solo High Staff o gestore PM può modificare dalla gestione staff.",
    };
  }
  return {
    ...access,
    pmManageOnly: Boolean(!isHighStaff && isPmGestore),
    readOnly: Boolean(!canWrite),
    canWrite,
  };
}

async function resolveManageTargetMember(client?, guild?, targetId?, { force = false } = {}) {
  const uid = String(targetId || "").trim();
  if (!uid) return { guild: guild || null, member: null, unavailable: false };
  let g = guild || null;
  if (!g) {
    const guildId = String(IDs.guilds.main || "");
    g =
      (await ensureWebsiteGuild(client, guildId).catch(() => null)) ||
      (await client.guilds.fetch(guildId).catch(() => null));
  }
  if (!g) return { guild: null, member: null, unavailable: true };
  if (!force) {
    const hit = g.members?.cache?.get?.(uid) || null;
    if (hit) return { guild: g, member: hit, unavailable: false };
  }
  const member = await fetchWebsiteGuildMember(g, uid, {
    force: Boolean(force),
    timeoutMs: force ? 18_000 : 12_000,
  }).catch(() => null);
  if (member) return { guild: g, member, unavailable: false };
  return { guild: g, member: null, unavailable: true };
}

async function handleSiteStaffManagePost(client?, req?, res?) {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const action = String(body.action || "").trim().toLowerCase();
    const targetId = String(body.userId || body.target || "").trim();

    const accessBase = await assertManageAccess(client, req, { write: false });
    if (!accessBase.ok) {
      return res.status(accessBase.status).json({
        ok: false,
        error: accessBase.error,
        message: accessBase.message,
      });
    }

    const viewerId = String(accessBase.member?.id || "").trim();
    const actingOnSelf = Boolean(viewerId && /^\d{16,22}$/.test(targetId) && targetId === viewerId);
        const selfPauseCancel = Boolean(actingOnSelf && action === "pause_cancel");

    let access = accessBase;
    if (!selfPauseCancel) {
      if (accessBase.readOnly || !accessBase.canWrite) {
        return res.status(403).json({
          ok: false,
          error: "forbidden",
          message: "Solo High Staff o gestore PM può modificare dalla gestione staff.",
        });
      }
    }

    const reason = String(body.reason || "").trim().slice(0, 500);
    const removeId = Math.floor(Number(body.removeId || body.index || 0));
    const pauseId = String(body.pauseId || body.id || "").trim();

    if (!MANAGE_ACTIONS.has(action)) {
      return res.status(400).json({ ok: false, error: "bad_action", message: "Azione non valida." });
    }
    if (selfPauseCancel) {
          } else if (access.pmManageOnly && !PM_GESTORE_MANAGE_ACTIONS.has(action)) {
      return res.status(403).json({
        ok: false,
        error: "forbidden",
        message: "Come gestore PM puoi usare solo azioni sui Partner Manager.",
      });
    }
    if (!/^\d{16,22}$/.test(targetId)) {
      return res.status(400).json({ ok: false, error: "bad_user", message: "userId non valido." });
    }
    if (actingOnSelf && !selfPauseCancel) {
      return res.status(400).json({
        ok: false,
        error: "self",
        message:
          action === "warn_rm"
            ? "Non puoi toglierti i warn da solo: serve High Staff."
            : action === "val_neg_rm"
              ? "Sul tuo profilo puoi togliere una val − solo con Compensa 3+ (scambio obbligatorio)."
              : "Non puoi usare queste azioni su te stesso.",
      });
    }

    const needsReason = !action.endsWith("_rm") && !PAUSE_MANAGE_ACTIONS.has(action);
    if (needsReason && reason.length < 3) {
      return res.status(400).json({
        ok: false,
        error: "bad_reason",
        message: "Inserisci un motivo (almeno 3 caratteri).",
      });
    }
    if (action.endsWith("_rm") && (!Number.isInteger(removeId) || removeId < 1)) {
      return res.status(400).json({
        ok: false,
        error: "bad_index",
        message: "Indica l'ID della voce da rimuovere.",
      });
    }

    const guildId = String(IDs.guilds.main || "");
    const resolved = await resolveManageTargetMember(client, null, targetId, { force: true });
    const guild = resolved.guild;
    if (!guild) {
      return res.status(503).json({ ok: false, error: "guild_unavailable", message: "Server non disponibile." });
    }

    const targetMember = resolved.member;
    if (!targetMember) {
      return res.status(resolved.unavailable ? 503 : 404).json({
        ok: false,
        error: resolved.unavailable ? "member_unavailable" : "not_found",
        message: resolved.unavailable
          ? "Membro non raggiungibile (Discord lento). Riprova tra poco."
          : "Membro non trovato nel server.",
      });
    }
    if (access.pmManageOnly && !memberIsPm(targetMember)) {
      return res.status(403).json({
        ok: false,
        error: "forbidden",
        message: "Come gestore PM puoi gestire solo i Partner Manager.",
      });
    }
    const isProspectPexAction =
      action === "pex" ||
      action === "pex_pm" ||
      action === "pex_blogger" ||
      Object.prototype.hasOwnProperty.call(PROSPECT_PEX_ROLE_BY_ACTION, action);
    if (
      !memberHasStaffRole(targetMember) &&
      !memberIsPm(targetMember) &&
      !memberIsBlogger(targetMember) &&
      !isProspectPexAction
    ) {
      return res.status(400).json({
        ok: false,
        error: "not_staff",
        message: "L'utente selezionato non è nello staff.",
      });
    }

    /* staffCareerRankGuard1: blocco API precoce (oltre al check nelle run*) */
    const isCareerAction =
      action === "pex" ||
      action === "pex_pm" ||
      action === "pex_blogger" ||
      action === "depex" ||
      action === "depex_pm" ||
      action === "depex_blogger" ||
      action === "depex_full" ||
      Object.prototype.hasOwnProperty.call(PROSPECT_PEX_ROLE_BY_ACTION, action);
    if (isCareerAction) {
      let destinationRoleId = null;
      if (action === "pex") {
        const cur = getHighestLadderRole(targetMember);
        destinationRoleId = cur
          ? getNextLadderRoleId(cur)
          : String(IDs.roles?.Helper || "").trim() || null;
      } else if (Object.prototype.hasOwnProperty.call(PROSPECT_PEX_ROLE_BY_ACTION, action)) {
        destinationRoleId = String(PROSPECT_PEX_ROLE_BY_ACTION[action]() || "").trim() || null;
      }
      const rankGate = assertStaffCareerHierarchy(access.member, targetMember, {
        destinationRoleId,
      });
      if (!rankGate.ok) {
        return res.status(403).json({
          ok: false,
          error: "rank_forbidden",
          message:
            stripDiscordDecorations(rankGate.message) ||
            "Non puoi pexare o depexare un membro con ruolo uguale o superiore al tuo.",
        });
      }
    }

    const actorUser = access.member.user || access.user;
    const targetUser = targetMember.user || { id: targetId };
    let result: any = { ok: false, message: "Azione non eseguita." };

    if (action === "pex") {
      if (getHighestLadderRole(targetMember)) {
        result = await runProfileStaffPex(guild, client, targetUser, actorUser, reason);
      } else {
        result = await runProspectStaffPex(
          guild,
          client,
          targetUser,
          actorUser,
          reason,
          String(IDs.roles?.Helper || ""),
        );
      }
    } else if (action === "pex_pm") {
      result = await runProspectStaffPexToPartnerManager(guild, client, targetUser, actorUser, reason);
    } else if (action === "pex_blogger") {
      result = await runProspectStaffPexToBlogger(guild, client, targetUser, actorUser, reason);
    } else if (Object.prototype.hasOwnProperty.call(PROSPECT_PEX_ROLE_BY_ACTION, action)) {
      if (FOUNDER_ONLY_PROSPECT_PEX.has(action) && !viewerIsFounder(access.member)) {
        return res.status(403).json({
          ok: false,
          error: "forbidden",
          message: "Solo i Founder possono pexare direttamente a questo ruolo.",
        });
      }
      const roleId = String(PROSPECT_PEX_ROLE_BY_ACTION[action]() || "").trim();
      if (!roleId) {
        return res.status(500).json({
          ok: false,
          error: "role_missing",
          message: "Ruolo non configurato.",
        });
      }
      if (getHighestLadderRole(targetMember)) {
        result = await runProfileStaffPex(guild, client, targetUser, actorUser, reason);
      } else {
        result = await runProspectStaffPex(guild, client, targetUser, actorUser, reason, roleId);
      }
    } else if (action === "depex") {
      result = await runProfileStaffDepex(guild, client, targetUser, actorUser, reason, "ladder");
    } else if (action === "depex_pm") {
      result = await runProfileStaffDepex(guild, client, targetUser, actorUser, reason, "partner_manager");
    } else if (action === "depex_blogger") {
      result = await runProfileStaffDepex(guild, client, targetUser, actorUser, reason, "blogger");
    } else if (action === "depex_full") {
      /* depexPmOnlyFullFix1: senza scala ma con PM → depex_pm (evita 400 not staff ladder) */
      if (!getHighestLadderRole(targetMember) && memberIsPm(targetMember)) {
        result = await runProfileStaffDepex(guild, client, targetUser, actorUser, reason, "partner_manager");
      } else if (!getHighestLadderRole(targetMember) && !memberIsPm(targetMember) && memberIsBlogger(targetMember)) {
        result = await runProfileStaffDepex(guild, client, targetUser, actorUser, reason, "blogger");
      } else {
        result = await runProfileStaffCompleteDepex(guild, client, targetUser, access.member, reason);
      }
    } else if (action === "val_pos") {
      result = await runValutazionePositiveAddForPanel(guild, access.member, targetUser, reason);
    } else if (action === "val_neg") {
      result = await runValutazioneNegativeAddForPanel(guild, access.member, targetUser, reason);
    } else if (action === "val_pos_rm") {
      result = await runValutazionePositiveRemoveForPanel(
        guild,
        access.member,
        targetUser,
        removeId,
        reason || `Rimozione val + #${removeId} dal sito`,
      );
    } else if (action === "val_neg_rm") {
      const tradeRawNeg = Math.floor(Number(body.positiveTradeCount || body.tradePos || 0));
      const positiveTradeCountNeg =
        Number.isFinite(tradeRawNeg) && tradeRawNeg > 0 ? tradeRawNeg : 0;
      result = await runValutazioneNegativeRemoveForPanel(
        guild,
        access.member,
        targetUser,
        removeId,
        reason ||
          (positiveTradeCountNeg
            ? `Scambio ${positiveTradeCountNeg} valutazioni positive → rimozione negativa #${removeId}`
            : `Rimozione val − #${removeId} dal sito`),
        { positiveTradeCount: positiveTradeCountNeg },
      );
    } else if (action === "warn_add") {
      result = await runProfileStaffWarnAdd(guild, client, targetUser, actorUser, reason);
    } else if (action === "warn_rm") {
      const tradeRaw = Math.floor(Number(body.positiveTradeCount || body.tradePos || 0));
      const positiveTradeCount =
        Number.isFinite(tradeRaw) && tradeRaw > 0 ? tradeRaw : 0;
      result = await runProfileStaffWarnRemove(
        guild,
        client,
        targetUser,
        actorUser,
        removeId,
        reason ||
          (positiveTradeCount
            ? `Scambio ${positiveTradeCount} val + → rimozione warn #${removeId}`
            : `Rimozione warn #${removeId} dal sito`),
        { positiveTradeCount },
      );
    } else if (PAUSE_MANAGE_ACTIONS.has(action)) {
      if (!pauseId) {
        return res.status(400).json({
          ok: false,
          error: "bad_pause",
          message: "pauseId richiesto per le azioni pausa.",
        });
      }
      if (action === "pause_accept") {
        result = await acceptPauseRequestWeb(client, guild, access.member, targetId, pauseId);
      } else if (action === "pause_reject") {
        result = await rejectPauseRequestWeb(client, guild, access.member, targetId, pauseId);
      } else if (action === "pause_cancel") {
        const confirmCancel =
          body.confirmCancel === true ||
          body.confirmCancel === "true" ||
          String(body.confirmCancel || "").trim() === "1";
        if (!confirmCancel) {
          return res.status(400).json({
            ok: false,
            error: "confirm_required",
            message: "Conferma l'annullamento della pausa.",
          });
        }
        result = await cancelPauseRequestWeb(client, guild, access.member, targetId, pauseId);
      }
    }

    if (!result?.ok) {
      return res.status(400).json({
        ok: false,
        error: "action_failed",
        message: cleanActionMessage(result?.message),
      });
    }

        try {
      /* staffProfLiveAll1: clear → broadcast WS (warn/val/pause/pex/…) */
      clearStaffProfileCacheForUser(targetId, { action });
    } catch (_) {}
    try {
      clearWebsiteMemberCaches(targetId);
    } catch (_) {}

    if (
      action === "pex" ||
      action === "pex_pm" ||
      action === "pex_blogger" ||
      Object.prototype.hasOwnProperty.call(PROSPECT_PEX_ROLE_BY_ACTION, action) ||
      action.startsWith("depex") ||
      PAUSE_MANAGE_ACTIONS.has(action)
    ) {
      invalidateStaffRosterCache();
    }

    const paused = await getStaffListPausedUserIds(guildId);
    let refreshed = null;
    try {
      refreshed = await guild.members.fetch({ user: targetId, force: true });
    } catch (_) {
      refreshed = guild.members.cache.get(targetId) || targetMember;
    }
    const member = await buildMemberDetail(
      guild,
      refreshed || targetMember,
      paused,
      access.member,
    );

    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({
      ok: true,
      action,
      message: cleanActionMessage(result.message) || "Operazione completata.",
      member,
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-manage POST:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

export = { MANAGE_ACTIONS, PM_GESTORE_MANAGE_ACTIONS, assertManageAccess, resolveManageTargetMember, handleSiteStaffManagePost };
