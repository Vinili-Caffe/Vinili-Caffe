const IDs = require("../Config/ids");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { memberHasStaffRole, getStaffListPausedUserIds } = require("../Community/staffListUtils");
const {
  resolveStaffProfileDisplayRoleId,
  buildFullProfileRoleLabelForEmbed,
  resolveStaffProfileKind,
  resolveStaffPartnerPointsDisplay,
} = require("../Staff/staffProfilePanelRuntime");
const {
  resolvePartnerPointsShown,
  resolvePartnerTotalEarned,
} = require("../Staff/partnerPointsDisplayUtils");
const {
  runProfileStaffPex,
  runProfileStaffDepex,
  runProfileStaffCompleteDepex,
  runProfileStaffWarnAdd,
  runProfileStaffWarnRemove,
  runProspectStaffPex,
  getHighestLadderRole,
} = require("../Staff/staffPanelActions");
const {
  runValutazionePositiveAddForPanel,
  runValutazioneNegativeAddForPanel,
  runValutazionePositiveRemoveForPanel,
  runValutazioneNegativeRemoveForPanel,
} = require("../Staff/valutazionePanelActions");
const { assertWebsiteStaffAccess, normalizeHeaderSecret } = require("./siteStaffAccessApi");
const { memberIsHighStaffEligible } = require("./siteStaffDashboardApi");
const {
  getCachedStaffRoster,
  identityFromMember,
  memberIsPm,
  stripDiscordDecorations,
  invalidateStaffRosterCache,
} = require("./siteStaffRosterCache");
const {
  memberIsResocontoPmReviewer,
} = require("../Ticket/ticketPartnershipStaffRoles");
const { buildStaffTrackTimeline } = require("../Staff/staffTrackHistory");
const {
  getTodayUtc,
  getCurrentYearBoundsUtc,
  computeConsumedPauseDays,
  getBasePauseLimit,
  getStaffPauseBonusDaysTotal,
  getPausePhase,
  getPauseStatusLabel,
  computePauseScaledDaysThisYear,
  getPauseTimingText,
  hasActiveAcceptedStaffPause,
} = require("../Pause/pauseHandlersUtils");
const {
  acceptPauseRequestWeb,
  rejectPauseRequestWeb,
  cancelPauseRequestWeb,
} = require("../Pause/pauseWebActionsRuntime");
const { loadStaffTrackStatsByUserIds } = require("../Staff/staffLegacyMerge");

const MANAGE_ACTIONS = new Set([
  "pex",
  "depex",
  "depex_pm",
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
const PM_GESTORE_MANAGE_ACTIONS = new Set(["pex", "depex_pm", "pause_accept", "pause_reject", "pause_cancel"]);

function cleanActionMessage(msg) {
  return stripDiscordDecorations(msg) || "Operazione non riuscita.";
}

function indexedReasonLines(list, limit = 40) {
  if (!Array.isArray(list) || !list.length) return [];
  const out = [];
  const start = Math.max(0, list.length - limit);
  for (let i = start; i < list.length; i += 1) {
    const raw = list[i];
    const text =
      typeof raw === "string"
        ? stripDiscordDecorations(raw)
        : stripDiscordDecorations(raw?.reason || raw?.text || raw?.motivo || "");
    out.push({
      id: i + 1,
      text: text || `(voce #${i + 1})`,
    });
  }
  return out.reverse();
}

function humanizeRoleKey(key) {
  return String(key || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .trim();
}

function roleNameFromId(guild, roleIdOrName) {
  const raw = String(roleIdOrName || "").trim();
  if (!raw || raw === "—" || raw === "-") return "—";
  if (!/^\d{16,22}$/.test(raw)) {
    return stripDiscordDecorations(raw) || raw;
  }
  const live = guild?.roles?.cache?.get(raw)?.name;
  if (live) return stripDiscordDecorations(live) || live;
  const roles = IDs.roles || {};
  for (const [key, val] of Object.entries(roles)) {
    if (String(val) === raw) {
      const label = humanizeRoleKey(key);
      return label || raw;
    }
  }
  return raw;
}

function serializePartnerActions(staff, limit = 16) {
  const actions = Array.isArray(staff?.partnerActions) ? staff.partnerActions : [];
  if (!actions.length) return [];
  const out = [];
  const start = Math.max(0, actions.length - limit);
  for (let i = actions.length - 1; i >= start; i -= 1) {
    const row = actions[i];
    if (!row) continue;
    out.push(serializeOnePartnerAction(row, i + 1));
  }
  return out;
}

function serializeOnePartnerAction(row, id) {
  const d = row?.date ? new Date(row.date) : null;
  const iso = d && Number.isFinite(d.getTime()) ? d.toISOString() : null;
  let dateLabel = null;
  if (iso) {
    try {
      dateLabel = d.toLocaleDateString("it-IT", {
        day: "2-digit",
        month: "short",
        year: "numeric",
        timeZone: "Europe/Rome",
      });
    } catch {
      dateLabel = iso.slice(0, 10);
    }
  }
  const action = String(row?.action || "").trim().toLowerCase() || "evento";
  const partner = stripDiscordDecorations(String(row?.partner || row?.guildName || "").trim()) || null;
  return {
    id,
    action,
    actionLabel:
      action === "create"
        ? "Partnership"
        : action === "delete"
          ? "Chiusura"
          : action === "points"
            ? "Punti"
            : action,
    partner,
    invite: String(row?.invite || "").trim() || null,
    dateIso: iso,
    dateLabel,
  };
}

function resolvePartnerActionCreditUserId(action, profileUserId) {
  const managerId = String(action?.managerId || "").trim();
  if (/^\d{16,22}$/.test(managerId)) return managerId;
  const uid = String(profileUserId || "").trim();
  return /^\d{16,22}$/.test(uid) ? uid : null;
}

async function collectRecentPartnerActionsForUser(guildId, userId, limit = 16) {
  const uid = String(userId || "").trim();
  const gid = String(guildId || "").trim();
  if (!uid || !gid) return [];
  const rows = await ActivityUserProfile.find({
    guildId: gid,
    $or: [{ userId: uid }, { "staff.partnerActions.managerId": uid }],
  })
    .select("userId staff.partnerActions")
    .lean()
    .catch(() => []);

  const items = [];
  for (const row of Array.isArray(rows) ? rows : []) {
    const actions = Array.isArray(row?.staff?.partnerActions) ? row.staff.partnerActions : [];
    for (let i = 0; i < actions.length; i += 1) {
      const action = actions[i];
      if (!action) continue;
      const credited = resolvePartnerActionCreditUserId(action, row.userId);
      const onOwn = String(row.userId) === uid;
      if (!onOwn && credited !== uid) continue;
      // Su profilo altrui: solo create attribuite come manager (evita rumore).
      if (!onOwn && String(action.action || "").toLowerCase() !== "create") continue;
      const when = action.date != null ? new Date(action.date).getTime() : 0;
      items.push({ action, when: Number.isFinite(when) ? when : 0 });
    }
  }
  items.sort((a, b) => b.when - a.when);
  return items.slice(0, limit).map((item, idx) => serializeOnePartnerAction(item.action, idx + 1));
}

function serializeRolesHistory(guild, hist, limit = 12) {
  if (!Array.isArray(hist) || !hist.length) return [];
  const out = [];
  for (let i = hist.length - 1; i >= 0 && out.length < limit; i -= 1) {
    const row = hist[i];
    if (!row) continue;
    const oldName = roleNameFromId(guild, row.oldRole);
    const newName = roleNameFromId(guild, row.newRole);
    out.push({
      from: oldName,
      to: newName,
      reason: stripDiscordDecorations(row.reason || "") || null,
      date: row.date ? new Date(row.date).toISOString() : null,
      kind: String(row.kind || "").toLowerCase() || null,
      actorId: String(row.actorId || "").trim() || null,
      actorName: String(row.actorName || "").trim() || null,
    });
  }
  return out;
}

async function buildRoster(client) {
  const roster = await getCachedStaffRoster(client);
  if (!roster?.ok) {
    return { sections: [], paused: new Set(), counts: { total: 0, onPause: 0 } };
  }
  const sections = (roster.sections || []).map((sec) => ({
    roleId: sec.roleId,
    roleLabel: sec.roleLabel,
    color: sec.color,
    members: (sec.members || []).map((m) => ({ ...m })),
  }));
  const userIds = [];
  for (const sec of sections) {
    for (const m of sec.members) userIds.push(m.userId);
  }
  const guildId = String(roster.guildId || IDs.guilds.main || "");
  const statsByUser = await loadStaffTrackStatsByUserIds(guildId, userIds);
  for (const sec of sections) {
    for (const m of sec.members) {
      const s = statsByUser.get(m.userId) || { positive: 0, negative: 0, warn: 0, pauses: [] };
      const isPmOnly = String(m.profileKind || "").toLowerCase() === "pm_only";
      m.isPmOnly = isPmOnly;
      if (isPmOnly) {
        m.positive = 0;
        m.negative = 0;
        m.warn = 0;
      } else {
        m.positive = s.positive;
        m.negative = s.negative;
        m.warn = s.warn;
      }
    }
  }
  return {
    sections,
    paused: roster.paused || new Set(),
    counts: {
      total: roster.counts?.total || 0,
      onPause: roster.counts?.onPause || 0,
    },
    guild: roster.guild,
    staffDelMese: roster.staffDelMese || null,
  };
}

function buildMemberPauseBlock(guild, targetMember, staffDoc, pausedSet) {
  const uid = String(targetMember.id);
  const pauses = Array.isArray(staffDoc?.pauses) ? staffDoc.pauses : [];
  const today = getTodayUtc();
  const yearBounds = getCurrentYearBoundsUtc(today);
  const consumed = computeConsumedPauseDays(pauses);
  const baseLimit = getBasePauseLimit(targetMember);
  const bonusDays = getStaffPauseBonusDaysTotal(targetMember, staffDoc || {});
  const maxDays = baseLimit + bonusDays;
  const daysRemaining = Math.max(0, maxDays - consumed);

  const history = [];
  for (const pause of pauses) {
    if (!pause) continue;
    const pauseId = String(pause._id || "");
    if (!pauseId) continue;
    const status = String(pause.status || "pending").trim() || "pending";
    const phase = getPausePhase(pause.dataRichiesta, pause.dataRitorno, today);
    history.push({
      id: pauseId,
      start: String(pause.dataRichiesta || ""),
      end: String(pause.dataRitorno || ""),
      motivazione: stripDiscordDecorations(String(pause.motivazione || "").trim()) || "",
      ruoloRichiesto: String(pause.ruoloRichiesto || pause.ruolo || "Staff").trim(),
      ruolo: String(pause.ruolo || "").trim(),
      status,
      statusLabel: getPauseStatusLabel(pause, today),
      phase,
      timing: getPauseTimingText(pause.dataRichiesta, pause.dataRitorno),
      giorniScalati: computePauseScaledDaysThisYear(
        pause,
        today,
        yearBounds.yearStart,
        yearBounds.yearEnd,
      ),
      createdAt: pause.createdAt ? new Date(pause.createdAt).toISOString() : null,
      canAct: status === "pending",
      canCancel: status === "accepted" && phase !== "ended",
    });
  }
  history.sort((a, b) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

  const activePause = history.find((p) => p.status === "accepted" && p.phase === "active") || null;
  const pendingPause = history.find((p) => p.status === "pending") || null;
  const featuredIds = new Set(
    [activePause?.id, pendingPause?.id].filter(Boolean).map((id) => String(id)),
  );

  return {
    onPause: Boolean(pausedSet?.has?.(uid)) || hasActiveAcceptedStaffPause(pauses, today),
    summary: {
      maxDays,
      bonusDays,
      baseLimit,
      daysUsed: consumed,
      daysRemaining,
      activePause,
      pendingPause,
    },
    history: history.filter((p) => !featuredIds.has(String(p.id))).slice(0, 24),
  };
}

async function buildMemberDetail(guild, targetMember, pausedSet) {
  const guildId = String(guild.id);
  const uid = String(targetMember.id);
  const { loadLegacyStaffByUserIds, mergeStaffEmbedded } = require("../Staff/staffLegacyMerge");
  const [doc, legacyMap] = await Promise.all([
    ActivityUserProfile.findOne({ guildId, userId: uid })
      .select("staff")
      .lean()
      .catch(() => null),
    loadLegacyStaffByUserIds(guildId, [uid]),
  ]);
  const staff = mergeStaffEmbedded(doc?.staff || {}, legacyMap.get(uid) || null);
  const displayRoleId = resolveStaffProfileDisplayRoleId(targetMember);
  let label = buildFullProfileRoleLabelForEmbed(guild, targetMember);
  label = stripDiscordDecorations(label) || "Staff";
  const ladderRoleId = getHighestLadderRole(targetMember) || null;
  const ladderRole = ladderRoleId ? guild.roles.cache.get(ladderRoleId) : null;
  const profileKind = resolveStaffProfileKind(targetMember);
  const isPmOnly = profileKind === "pm_only";

  let partnerPointsSpendable = Math.max(0, Math.floor(Number(resolvePartnerPointsShown(staff) || 0)));
  let partnerPointsEarned = Math.max(
    0,
    Math.floor(Number(resolvePartnerTotalEarned(staff) || resolveStaffPartnerPointsDisplay(staff) || 0)),
  );
  let partnerCount = Math.max(0, Math.floor(Number(staff.partnerCount || 0)));
  let recentActions = serializePartnerActions(staff, 16);

  if (memberIsPm(targetMember) || isPmOnly) {
    try {
      const { getUserPartnershipScoresForGuild } = require("../../Services/Partner/tenantLeaderboardService");
      const scores = await getUserPartnershipScoresForGuild(guildId, uid);
      partnerPointsSpendable = Math.max(0, Math.floor(Number(scores?.points ?? partnerPointsSpendable) || 0));
      partnerPointsEarned = Math.max(
        0,
        Math.floor(Number(scores?.total ?? scores?.earned ?? partnerPointsEarned) || 0),
      );
      partnerCount = Math.max(partnerCount, partnerPointsEarned);
    } catch (_) {}
    recentActions = await collectRecentPartnerActionsForUser(guildId, uid, 16);
  }

  return {
    ...identityFromMember(targetMember),
    displayRoleId: displayRoleId || null,
    displayRoleLabel: label,
    profileKind,
    isPmOnly,
    isPm: memberIsPm(targetMember),
    onPause: Boolean(pausedSet?.has?.(uid)),
    ladderRoleId,
    ladderRoleLabel: ladderRole ? stripDiscordDecorations(ladderRole.name) || ladderRole.name : null,
    canPex: Boolean(ladderRoleId),
    canPexProspect: isPmOnly && memberIsPm(targetMember),
    canDepexLadder: Boolean(ladderRoleId),
    canDepexPm: memberIsPm(targetMember),
    valutazioni: {
      positive: Math.max(0, Math.floor(Number(staff.positiveCount || 0))),
      negative: Math.max(0, Math.floor(Number(staff.negativeCount || 0))),
      positiveEntries: indexedReasonLines(staff.positiveReasons, 40),
      negativeEntries: indexedReasonLines(staff.negativeReasons, 40),
    },
    warn: {
      count: Math.max(0, Math.floor(Number(staff.warnCount || 0))),
      entries: indexedReasonLines(staff.warnReasons, 40),
    },
    partner: {
      pointsEarned: partnerPointsEarned,
      pointsSpendable: partnerPointsSpendable,
      redeemSpend: Math.max(0, Math.floor(Number(staff.partnerRedeemSpend || 0))),
      partnerCount,
      recentActions,
    },
    rolesHistory: serializeRolesHistory(guild, staff.rolesHistory, 40),
    trackHistory: buildStaffTrackTimeline(guild, staff, { limit: 400 }),
    pause: buildMemberPauseBlock(guild, targetMember, staff, pausedSet),
  };
}

async function assertManageAccess(client, req, { write = false } = {}) {
  const accessToken = normalizeHeaderSecret(req.headers.authorization);
  const access = await assertWebsiteStaffAccess(client, accessToken);
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

function filterRosterForPmGestore(roster) {
  const pmRoleId = String(IDs.roles?.PartnerManager || "").trim();
  const sections = Array.isArray(roster?.sections)
    ? roster.sections.filter((sec) => {
        if (pmRoleId && String(sec?.roleId || "") === pmRoleId) return true;
        const label = String(sec?.roleLabel || "").toLowerCase();
        return label.includes("partner");
      })
    : [];
  const members = sections.flatMap((sec) => (Array.isArray(sec.members) ? sec.members : []));
  return {
    ...roster,
    sections,
    counts: {
      ...(roster?.counts && typeof roster.counts === "object" ? roster.counts : {}),
      total: members.length,
      pm: members.length,
    },
  };
}

async function handleSiteStaffManageGet(client, req, res) {
  try {
    const access = await assertManageAccess(client, req);
    if (!access.ok) {
      return res.status(access.status).json({
        ok: false,
        error: access.error,
        message: access.message,
      });
    }

    let roster = await buildRoster(client);
    if (access.pmManageOnly) {
      roster = filterRosterForPmGestore(roster);
    }
    const guildId = String(IDs.guilds.main || "");
    const guild = roster.guild || (await client.guilds.fetch(guildId).catch(() => null));
    if (!guild) {
      return res.status(503).json({ ok: false, error: "guild_unavailable", message: "Server non disponibile." });
    }

    const targetId = String(req.query?.userId || req.query?.target || "").trim();
    let member = null;
    if (targetId) {
      if (!/^\d{16,22}$/.test(targetId)) {
        return res.status(400).json({ ok: false, error: "bad_user", message: "userId non valido." });
      }
      const targetMember =
        guild.members.cache.get(targetId) || (await guild.members.fetch(targetId).catch(() => null));
      if (!targetMember) {
        return res.status(404).json({ ok: false, error: "not_found", message: "Membro non trovato nel server." });
      }
      if (access.pmManageOnly) {
        if (!memberIsPm(targetMember)) {
          return res.status(403).json({
            ok: false,
            error: "forbidden",
            message: "Come gestore PM puoi gestire solo i Partner Manager.",
          });
        }
      } else if (!memberHasStaffRole(targetMember) && !memberIsPm(targetMember)) {
        return res.status(400).json({
          ok: false,
          error: "not_staff",
          message: "L'utente selezionato non è nello staff.",
        });
      }
      member = await buildMemberDetail(guild, targetMember, roster.paused);
    }

    const allowedActions = access.readOnly
      ? ["pause_cancel"]
      : access.pmManageOnly
        ? [...PM_GESTORE_MANAGE_ACTIONS]
        : [...MANAGE_ACTIONS];

    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({
      ok: true,
      canManage: Boolean(access.canWrite),
      readOnly: Boolean(access.readOnly),
      selfService: Boolean(access.readOnly),
      selfActions: access.readOnly ? ["pause_cancel", "neg_trade"] : [],
      pmManageOnly: Boolean(access.pmManageOnly),
      viewer: identityFromMember(access.member),
      counts: roster.counts,
      sections: roster.sections,
      member,
      actions: allowedActions,
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-manage GET:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteStaffManagePost(client, req, res) {
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
    // Chiunque nello staff può annullare le proprie pause (anche in sola lettura).
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
      // ok
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
        message: "Non puoi usare queste azioni su te stesso.",
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
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      return res.status(503).json({ ok: false, error: "guild_unavailable", message: "Server non disponibile." });
    }

    const targetMember =
      guild.members.cache.get(targetId) || (await guild.members.fetch(targetId).catch(() => null));
    if (!targetMember) {
      return res.status(404).json({ ok: false, error: "not_found", message: "Membro non trovato nel server." });
    }
    if (access.pmManageOnly && !memberIsPm(targetMember)) {
      return res.status(403).json({
        ok: false,
        error: "forbidden",
        message: "Come gestore PM puoi gestire solo i Partner Manager.",
      });
    }
    if (!memberHasStaffRole(targetMember) && !memberIsPm(targetMember) && action !== "pex") {
      return res.status(400).json({
        ok: false,
        error: "not_staff",
        message: "L'utente selezionato non è nello staff.",
      });
    }

    const actorUser = access.member.user || access.user;
    const targetUser = targetMember.user || { id: targetId };
    let result = { ok: false, message: "Azione non eseguita." };

    if (action === "pex") {
      if (getHighestLadderRole(targetMember)) {
        result = await runProfileStaffPex(guild, client, targetUser, actorUser, reason);
      } else if (memberIsPm(targetMember)) {
        result = await runProspectStaffPex(
          guild,
          client,
          targetUser,
          actorUser,
          reason,
          String(IDs.roles?.Helper || ""),
        );
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
    } else if (action === "depex") {
      result = await runProfileStaffDepex(guild, client, targetUser, actorUser, reason, "ladder");
    } else if (action === "depex_pm") {
      result = await runProfileStaffDepex(guild, client, targetUser, actorUser, reason, "partner_manager");
    } else if (action === "depex_full") {
      result = await runProfileStaffCompleteDepex(guild, client, targetUser, access.member, reason);
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
      result = await runValutazioneNegativeRemoveForPanel(
        guild,
        access.member,
        targetUser,
        removeId,
        reason || `Rimozione val − #${removeId} dal sito`,
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

    if (action === "pex" || action.startsWith("depex") || PAUSE_MANAGE_ACTIONS.has(action)) {
      invalidateStaffRosterCache();
    }

    const paused = await getStaffListPausedUserIds(guildId);
    const refreshed =
      guild.members.cache.get(targetId) || (await guild.members.fetch(targetId).catch(() => null)) || targetMember;
    const member = await buildMemberDetail(guild, refreshed, paused);

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

module.exports = {
  handleSiteStaffManageGet,
  handleSiteStaffManagePost,
  buildRoster,
  buildMemberDetail,
  MANAGE_ACTIONS,
};
