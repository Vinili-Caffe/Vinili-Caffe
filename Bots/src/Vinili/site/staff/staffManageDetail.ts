/** Gestione staff: elenco dello staff e scheda del singolo membro. */
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { memberHasStaffRole, memberIsBlogger } = require("../../Utils/Community/staffListUtils") as typeof import("../../Utils/Community/staffListUtils");
const { resolveStaffProfileDisplayRoleId, buildFullProfileRoleLabelForEmbed, resolveStaffProfileKind, resolveStaffPartnerPointsDisplay, PROFILE_PROSPECT, PROFILE_PM_ONLY } = require("../../Staff/utils/staffProfilePanelRuntime") as typeof import("../../Staff/utils/staffProfilePanelRuntime");
const { resolvePartnerPointsShown, resolvePartnerTotalEarned } = require("../../Staff/utils/partnerPointsDisplayUtils") as typeof import("../../Staff/utils/partnerPointsDisplayUtils");
const { getHighestLadderRole, getNextLadderRoleId, peekDepexLadderTargetRoleId, assertStaffCareerHierarchy, staffLadderRankIndex, getMemberStaffLadderRank } = require("../../Staff/utils/staffPanelActions") as typeof import("../../Staff/utils/staffPanelActions");
const { viewerIsFounder } = require("../../Staff/utils/staffProfilePanelRuntime") as typeof import("../../Staff/utils/staffProfilePanelRuntime");
const { getCachedStaffRoster, identityFromMember, memberIsPm, stripDiscordDecorations } = require("./siteStaffRosterCache") as typeof import("./siteStaffRosterCache");
const { buildStaffTrackTimeline, isHiddenManualStaffCareerReason } = require("../../Staff/utils/staffTrackHistory") as typeof import("../../Staff/utils/staffTrackHistory");
const { getTodayUtc, getCurrentYearBoundsUtc, computeStaffPauseDayBudget, getPausePhase, getPauseStatusLabel, computePauseScaledDaysThisYear, getPauseTimingText, hasActiveAcceptedStaffPause } = require("../../site/staff/pause/pauseHandlersUtils") as typeof import("../../site/staff/pause/pauseHandlersUtils");
const { loadStaffTrackStatsByUserIds } = require("../../Staff/utils/staffLegacyMerge") as typeof import("../../Staff/utils/staffLegacyMerge");

function indexedReasonLines(list?, limit = 40) {
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

function humanizeRoleKey(key?) {
  return String(key || "")
    .replace(/([a-z])([A-Z])/g, "$1 $2")
    .replace(/([A-Z]+)([A-Z][a-z])/g, "$1 $2")
    .trim();
}

function roleNameFromId(guild?, roleIdOrName?) {
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

function serializePartnerActions(staff?, limit = 16) {
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

function serializeOnePartnerAction(row?, id?) {
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

function resolvePartnerActionCreditUserId(action?, profileUserId?) {
  const managerId = String(action?.managerId || "").trim();
  if (/^\d{16,22}$/.test(managerId)) return managerId;
  const uid = String(profileUserId || "").trim();
  return /^\d{16,22}$/.test(uid) ? uid : null;
}

async function collectRecentPartnerActionsForUser(guildId?, userId?, limit = 16) {
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
            if (!onOwn && String(action.action || "").toLowerCase() !== "create") continue;
      const when = action.date != null ? new Date(action.date).getTime() : 0;
      items.push({ action, when: Number.isFinite(when) ? when : 0 });
    }
  }
  items.sort((a?, b?) => b.when - a.when);
  return items.slice(0, limit).map((item?, idx?) => serializeOnePartnerAction(item.action, idx + 1));
}

function normalizeCareerRoleToken(value?) {
  let s = stripDiscordDecorations(String(value || ""))
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
  if (!s) return "";
  if (/^\d{16,22}$/.test(s)) {
    const roles = IDs.roles || {};
    for (const [key, val] of Object.entries(roles)) {
      if (String(val) === s) {
        s = humanizeRoleKey(key).toLowerCase().replace(/[^a-z0-9]+/g, " ").trim();
        break;
      }
    }
  }
  const aliases = {
    mod: "moderator",
    mods: "moderator",
    moderator: "moderator",
    "senior moderator": "senior moderator",
    "sr moderator": "senior moderator",
    srmod: "senior moderator",
    "senior mod": "senior moderator",
    helper: "helper",
    "trial helper": "helper",
    "partner manager": "partner manager",
    pm: "partner manager",
    director: "director",
    admin: "admin",
    manager: "manager",
    founder: "founder",
    member: "member",
  };
  if (aliases[s]) return aliases[s];
  if (s.endsWith("s") && aliases[s.slice(0, -1)]) return aliases[s.slice(0, -1)];
  return s;
}

function careerDayKey(iso?) {
  if (!iso) return "";
  try {
    return new Intl.DateTimeFormat("en-CA", {
      timeZone: "Europe/Rome",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    }).format(new Date(iso));
  } catch {
    return String(iso).slice(0, 10);
  }
}

function preferCareerManageRow(a?, b?) {
  const aLen = String(a?.to || "").length + String(a?.from || "").length;
  const bLen = String(b?.to || "").length + String(b?.from || "").length;
  if (bLen !== aLen) return bLen > aLen ? b : a;
  return a;
}

function dedupeCareerManageRows(rows?) {
  const out = [];
  const seen = new Map();
  for (const row of rows) {
    const day = careerDayKey(row?.date);
    const from = normalizeCareerRoleToken(row?.from);
    const to = normalizeCareerRoleToken(row?.to);
    const reason = stripDiscordDecorations(row?.reason || "")
      .toLowerCase()
      .replace(/\s+/g, " ")
      .trim();
    const key = `${day}|${from}|${to}|${reason}`;
    if (!from && !to) {
      out.push(row);
      continue;
    }
    if (seen.has(key)) {
      const idx = seen.get(key);
      out[idx] = preferCareerManageRow(out[idx], row);
      continue;
    }
    const softKey = `${day}|*|${to}|${reason}`;
    if (to && reason && seen.has(softKey)) {
      const idx = seen.get(softKey);
      out[idx] = preferCareerManageRow(out[idx], row);
      continue;
    }
    seen.set(key, out.length);
    if (to && reason) seen.set(softKey, out.length);
    out.push(row);
  }
  return out;
}

function serializeRolesHistory(guild?, hist?, limit = 12) {
  if (!Array.isArray(hist) || !hist.length) return [];
  const mapped = [];
  for (let i = hist.length - 1; i >= 0; i -= 1) {
    const row = hist[i];
    if (!row) continue;
    if (isHiddenManualStaffCareerReason(row.reason)) continue;
    const oldName = roleNameFromId(guild, row.oldRole);
    const newName = roleNameFromId(guild, row.newRole);
    mapped.push({
      from: oldName,
      to: newName,
      reason: stripDiscordDecorations(row.reason || "") || null,
      date: row.date ? new Date(row.date).toISOString() : null,
      kind: String(row.kind || "").toLowerCase() || null,
      actorId: String(row.actorId || "").trim() || null,
      actorName: String(row.actorName || "").trim() || null,
    });
  }
  return dedupeCareerManageRows(mapped).slice(0, limit);
}

async function buildRoster(client?) {
  const roster = await getCachedStaffRoster(client);
  if (!roster?.ok) {
    return { sections: [], paused: new Set(), counts: { total: 0, onPause: 0 } };
  }
  const sections = (roster.sections || []).map((sec?) => ({
    roleId: sec.roleId,
    roleLabel: sec.roleLabel,
    color: sec.color,
    members: (sec.members || []).map((m?) => ({ ...m })),
  }));
  const userIds = [];
  for (const sec of sections) {
    for (const m of sec.members) userIds.push(m.userId);
  }
  const guildId = String(roster.guildId || IDs.guilds.main || "");
  const { getStaffListNewBadgeRoleIdsByUser } = require("../../Utils/Community/staffListUtils") as typeof import("../../Utils/Community/staffListUtils");
  const [statsByUser, newBadgeByUser] = await Promise.all([
    loadStaffTrackStatsByUserIds(guildId, userIds),
    getStaffListNewBadgeRoleIdsByUser(guildId).catch(() => new Map()),
  ]);
  for (const sec of sections) {
    for (const m of sec.members) {
      const s = statsByUser.get(m.userId) || { positive: 0, negative: 0, warn: 0, pauses: [] };
      const kind = String(m.profileKind || "").toLowerCase();
      const isPmOnly = kind === "pm_only";
      const isBloggerOnly = kind === "blogger_only";
      m.isPmOnly = isPmOnly;
      m.isBloggerOnly = isBloggerOnly;
      m.isNew = Boolean(newBadgeByUser?.has?.(String(m.userId)));
      m.onPause = Boolean(m.onPause);
      if (isPmOnly || isBloggerOnly) {
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
    staffDelSettimana: roster.staffDelSettimana || null,
  };
}

function buildMemberPauseBlock(guild?, targetMember?, staffDoc?, pausedSet?) {
  const uid = String(targetMember.id);
  const pauses = Array.isArray(staffDoc?.pauses) ? staffDoc.pauses : [];
  const today = getTodayUtc();
  const yearBounds = (getCurrentYearBoundsUtc as any)(today);
  const budget = computeStaffPauseDayBudget(targetMember, { staff: staffDoc || {} }, null);
  const consumed = budget.usedDays;
  const baseLimit = budget.baseLimit;
  const bonusDays = budget.annualBonus + budget.weekRemaining;
  const maxDays = budget.maxGiorni;
  const daysRemaining = Math.max(0, budget.remaining);

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
  history.sort((a?, b?) => String(b.createdAt || "").localeCompare(String(a.createdAt || "")));

  const activePause = history.find((p?) => p.status === "accepted" && p.phase === "active") || null;
  const pendingPause = history.find((p?) => p.status === "pending") || null;
  const featuredIds = new Set(
    [activePause?.id, pendingPause?.id].filter(Boolean).map((id?) => String(id)),
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
    history: history.filter((p?) => !featuredIds.has(String(p.id))).slice(0, 24),
  };
}

function buildProspectPexChoices(viewerMember?, { fromPartnerManager = false } = {}) {
  const fromLabel = fromPartnerManager ? "Partner Manager" : "Member";
  const founder = viewerIsFounder(viewerMember);
  const viewerRank = getMemberStaffLadderRank(viewerMember);
  const out = [];
  const push = (action?, roleKey?, label?) => {
    const roleId = String(IDs.roles?.[roleKey] || "").trim();
    if (!roleId) return;
    /* staffCareerRankGuard1: solo destinazioni strettamente sotto il grado viewer */
    const destRank = staffLadderRankIndex(roleId);
    if (destRank >= 0 && !founder && (viewerRank < 0 || destRank >= viewerRank)) return;
    out.push({
      id: action,
      label: `${fromLabel} → ${label}`,
      roleId,
      roleLabel: label,
    });
  };
  push("pex_helper", "Helper", "Helper");
  if (founder) {
    push("pex_mod", "Mod", "Moderator");
    push("pex_senior_moderator", "SeniorModerator", "Senior Moderator");
    push("pex_director", "Director", "Director");
    push("pex_admin", "Admin", "Admin");
    push("pex_manager", "Manager", "Manager");
  }
  return out;
}

async function buildMemberDetail(guild?, targetMember?, pausedSet?, viewerMember = null) {
  const guildId = String(guild.id);
  const uid = String(targetMember.id);
  const { loadLegacyStaffByUserIds, mergeStaffEmbedded } = require("../../Staff/utils/staffLegacyMerge") as typeof import("../../Staff/utils/staffLegacyMerge");
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
  const isBloggerOnly = memberIsBlogger(targetMember) && !memberHasStaffRole(targetMember) && !memberIsPm(targetMember);
  const profileKind = isBloggerOnly ? "blogger_only" : resolveStaffProfileKind(targetMember);
  const isPmOnly = profileKind === PROFILE_PM_ONLY || profileKind === "pm_only";
  const isProspect = profileKind === PROFILE_PROSPECT || profileKind === "prospect";
  label = stripDiscordDecorations(label) || (isBloggerOnly ? "Blogger" : isProspect ? "Member" : "Staff");
  if (isBloggerOnly && (!label || label === "—")) label = "Blogger";
  const ladderRoleId = getHighestLadderRole(targetMember) || null;
  const ladderRole = ladderRoleId ? guild.roles.cache.get(ladderRoleId) : null;
  const roleName = (roleId?) => {
    const id = String(roleId || "").trim();
    if (!id) return null;
    const role = guild.roles.cache.get(id);
    const raw = role ? stripDiscordDecorations(role.name) || role.name : null;
    return raw || null;
  };
  let pexTargetRoleId = null;
  if (ladderRoleId) pexTargetRoleId = getNextLadderRoleId(ladderRoleId);
  else if (isPmOnly && memberIsPm(targetMember)) pexTargetRoleId = IDs.roles?.Helper || null;
  const depexTargetRoleId = ladderRoleId ? peekDepexLadderTargetRoleId(ladderRoleId) : null;
  const memberRoleLabel = roleName(IDs.roles?.Member) || "Member";
  const pexTargetLabel = roleName(pexTargetRoleId) || (pexTargetRoleId ? "Ruolo nuovo" : null);
  // pexPmRolePick1: da PM-only offri scelta grado (Helper + avanzati se Founder), come Discord.
  // prospectPexSwitch1: anche Member non-staff → scelte Member→Helper/…
  const prospectPexChoices =
    isPmOnly && memberIsPm(targetMember)
      ? buildProspectPexChoices(viewerMember, { fromPartnerManager: true })
      : isBloggerOnly ||
          isProspect ||
          (!ladderRoleId && !memberHasStaffRole(targetMember) && !memberIsPm(targetMember))
        ? buildProspectPexChoices(viewerMember, { fromPartnerManager: false })
        : [];
  const depexTargetLabel =
    depexTargetRoleId === "" || depexTargetRoleId === String(IDs.roles?.Member || "")
      ? memberRoleLabel
      : roleName(depexTargetRoleId) || (depexTargetRoleId != null ? memberRoleLabel : null);
  /* depexDupMember1: Helper/Mod — ladder già → Member: niente doppia scelta Depex→Member */
  const depexLadderIsMember =
    !depexTargetRoleId ||
    depexTargetRoleId === "" ||
    String(depexTargetRoleId) === String(IDs.roles?.Member || "");

  /* staffCareerRankGuard1: UI — nascondi pex/depex se viewer ≤ target (o destinazione ≥ viewer) */
  const rankTouch = viewerMember
    ? assertStaffCareerHierarchy(viewerMember, targetMember, {})
    : { ok: true };
  const rankPexDest = viewerMember
    ? assertStaffCareerHierarchy(viewerMember, targetMember, {
        destinationRoleId: pexTargetRoleId || null,
      })
    : { ok: true };
  const canCareerTouch = Boolean(rankTouch.ok);
  const canCareerPex = Boolean(rankPexDest.ok);

  let partnerPointsSpendable = Math.max(0, Math.floor(Number(resolvePartnerPointsShown(staff) || 0)));
  let partnerPointsEarned = Math.max(
    0,
    Math.floor(Number(resolvePartnerTotalEarned(staff) || resolveStaffPartnerPointsDisplay(staff) || 0)),
  );
  let partnerCount = Math.max(0, Math.floor(Number(staff.partnerCount || 0)));
  let recentActions = serializePartnerActions(staff, 16);

  if (memberIsPm(targetMember) || isPmOnly) {
    try {
      const { getUserPartnershipScoresForGuild } = require("../../Partner/services/tenantLeaderboardService") as typeof import("../../Partner/services/tenantLeaderboardService");
      const scores: any = await getUserPartnershipScoresForGuild(guildId, uid);
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
    isBloggerOnly: Boolean(isBloggerOnly),
    isProspect: Boolean(isProspect),
    isPm: memberIsPm(targetMember),
    isBlogger: memberIsBlogger(targetMember),
    onPause: Boolean(pausedSet?.has?.(uid)),
    ladderRoleId,
    ladderRoleLabel: ladderRole ? stripDiscordDecorations(ladderRole.name) || ladderRole.name : null,
    pexTargetRoleId: pexTargetRoleId || null,
    pexTargetLabel,
    depexTargetRoleId:
      depexTargetRoleId === ""
        ? String(IDs.roles?.Member || "") || null
        : depexTargetRoleId || null,
    depexTargetLabel,
    memberRoleLabel,
    canPex: Boolean(ladderRoleId && pexTargetRoleId && canCareerPex),
    canPexProspect: Boolean(prospectPexChoices.length && canCareerTouch),
    prospectPexChoices,
    canPexPm: Boolean(!memberIsPm(targetMember) && canCareerTouch),
    canPexBlogger: Boolean(!memberIsBlogger(targetMember) && canCareerTouch),
    canDepexLadder: Boolean(ladderRoleId && !depexLadderIsMember && canCareerTouch),
    canDepexPm: Boolean(memberIsPm(targetMember) && canCareerTouch),
    canDepexBlogger: Boolean(memberIsBlogger(targetMember) && canCareerTouch),
    canDepexFull: Boolean(
      canCareerTouch &&
        (ladderRoleId ||
          memberIsPm(targetMember) ||
          memberHasStaffRole(targetMember) ||
          memberIsBlogger(targetMember)),
    ),
    careerRankBlocked: !canCareerTouch,
    careerRankBlockMessage: canCareerTouch
      ? null
      : stripDiscordDecorations(rankTouch.message) ||
        "Non puoi pexare o depexare un membro con ruolo uguale o superiore al tuo.",
    depexLadderIsMember,
    viewerIsFounder: viewerIsFounder(viewerMember),
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

export = { buildRoster, buildMemberDetail };
