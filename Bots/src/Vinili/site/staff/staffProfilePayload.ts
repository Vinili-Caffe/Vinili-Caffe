/** Profilo staff: dati del profilo mostrati sul sito. */
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { accountUsername, memberDisplayName, userAvatarUrlDynamic, guildMemberDisplayAvatarUrlForSite, discordDefaultAvatarUrl } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");
const { summarizeModActionsByModWindows } = require("../../Moderation/utils/modCaseStore") as typeof import("../../Moderation/utils/modCaseStore");
const { getValPosTradedPauseBonusDays, computeStaffPauseDayBudget, PAUSE_ROLE_STAFF, PAUSE_ROLE_PM, roleChoiceAppliesTo } = require("../../site/staff/pause/pauseHandlersUtils") as typeof import("../../site/staff/pause/pauseHandlersUtils");
const { resolveStaffProfileKind, buildFullProfileRoleLabelForEmbed, buildStaffProfileRoleBadges, resolveStaffProfileDisplayRoleId, viewerIsFounder, targetIsFounder, PROFILE_FULL, PROFILE_PM_ONLY, PROFILE_PROSPECT } = require("../../Staff/utils/staffProfilePanelRuntime") as typeof import("../../Staff/utils/staffProfilePanelRuntime");
const { resolvePartnerPointsShown, resolvePartnerTotalEarned } = require("../../Staff/utils/partnerPointsDisplayUtils") as typeof import("../../Staff/utils/partnerPointsDisplayUtils");
const { applyPronounGenderToTextForMember } = require("../../Utils/Community/pronounGenderUtils") as typeof import("../../Utils/Community/pronounGenderUtils");
const { resolveSerataFilmAttendanceForWeek } = require("../../Staff/utils/serataFilmAttendanceUtils") as typeof import("../../Staff/utils/serataFilmAttendanceUtils");
const { loadLegacyStaffByUserIds, mergeStaffEmbedded } = require("../../Staff/utils/staffLegacyMerge") as typeof import("../../Staff/utils/staffLegacyMerge");
const { PROFILE_PAYLOAD_VERSION } = require("./staffProfileCache") as typeof import("./staffProfileCache");
const { stripDiscordDecorations, resolvePauseSnapshot, serializePauseHistory } = require("./staffProfilePauses") as typeof import("./staffProfilePauses");
const { serializeRolesHistory, resolveTenureIso, formatTenureLabel } = require("./staffProfileCareer") as typeof import("./staffProfileCareer");

const STAFF_LEGACY_SOFT_TIMEOUT_MS = 350;

function recentReasonLines(list?, limit = 5) {
  if (!Array.isArray(list) || !list.length) return [];
  const out = [];
  for (let i = list.length - 1; i >= 0 && out.length < limit; i -= 1) {
    const raw = list[i];
    const text =
      typeof raw === "string"
        ? stripDiscordDecorations(raw)
        : stripDiscordDecorations(raw?.reason || raw?.text || raw?.motivo || "");
    if (text) out.push(text);
  }
  return out;
}

function indexedReasonLines(list?, limit = 80) {
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

const MODSTATS_BUDGET_MS = 250;

async function buildModstatsWithBudget(guildId?, userId?) {
  try {
    return await Promise.race([
      buildModstats(guildId, userId),
      new Promise((resolve?) => {
        setTimeout(() => resolve(null), MODSTATS_BUDGET_MS);
      }),
    ]);
  } catch {
    return null;
  }
}

async function buildModstats(guildId?, userId?) {
  const buckets = await summarizeModActionsByModWindows(guildId, userId);
  const pack = (windowKey?) => {
    const mute = Number(buckets.MUTE?.[windowKey]) || 0;
    const ban = Number(buckets.BAN?.[windowKey]) || 0;
    const kick = Number(buckets.KICK?.[windowKey]) || 0;
    const warn = Number(buckets.WARN?.[windowKey]) || 0;
    return {
      mute,
      ban,
      kick,
      warn,
      total: mute + ban + kick + warn,
    };
  };
  return {
    d7: pack("d7"),
    d30: pack("d30"),
    all: pack("all"),
  };
}

async function resolveStaffProfileAvatarUrl(client?, guild?, member?, user?, userId?) {
  const uid = String(userId || "").trim();
  if (!uid) return discordDefaultAvatarUrl(null, { size: 256 });

  let avatarSubject = member;
  let targetUser = member?.user || user || null;

  // avatarAnimRestore1: preferisci GIF sito (guild → user), non PNG embed-static.
  const fromSite = guildMemberDisplayAvatarUrlForSite(avatarSubject || targetUser, {
    size: 256,
    preferAnimated: true,
  });
  if (fromSite) return fromSite;

  const fromMember =
    avatarSubject?.avatar != null && avatarSubject.avatar !== ""
      ? userAvatarUrlDynamic(avatarSubject, { size: 256 })
      : null;
  if (fromMember) return fromMember;

  const fromUser = userAvatarUrlDynamic(targetUser || avatarSubject, { size: 256 });
  if (fromUser) return fromUser;

  return discordDefaultAvatarUrl(targetUser || { id: uid }, { size: 256 });
}

function buildProspectPexOptions(viewerMember?) {
  const founder = viewerIsFounder(viewerMember);
  const staffRoles = [
    { action: "pex_helper", label: "Helper", hint: "Pex → Helper" },
  ];
  if (founder) {
    staffRoles.push(
      { action: "pex_mod", label: "Moderator", hint: "Pex → Moderator" },
      { action: "pex_senior_moderator", label: "Senior Moderator", hint: "Pex → Senior Moderator" },
      { action: "pex_director", label: "Director", hint: "Pex → Director" },
      { action: "pex_admin", label: "Admin", hint: "Pex → Admin" },
      { action: "pex_manager", label: "Manager", hint: "Pex → Manager" },
    );
  }
  return {
    staff: staffRoles.filter((r?) => {
      if (r.action === "pex_helper") return Boolean(IDs.roles?.Helper);
      if (r.action === "pex_mod") return Boolean(IDs.roles?.Mod);
      if (r.action === "pex_senior_moderator") return Boolean(IDs.roles?.SeniorModerator);
      if (r.action === "pex_director") return Boolean(IDs.roles?.Director);
      if (r.action === "pex_admin") return Boolean(IDs.roles?.Admin);
      if (r.action === "pex_manager") return Boolean(IDs.roles?.Manager);
      return false;
    }),
    pm: IDs.roles?.PartnerManager
      ? { action: "pex_pm", label: "Partner Manager", hint: "Member → Partner Manager" }
      : null,
    viewerIsFounder: founder,
  };
}

async function buildProspectProfilePayloadForWeb(client?, member?, user?, viewerMember?) {
  const guildId = String(IDs.guilds.main || member?.guild?.id || "").trim();
  const userId = String(member?.id || user?.id || "").trim();
  if (!guildId || !userId) {
    return { ok: false, status: 500, error: "no_guild", message: "Guild principale non configurata." };
  }
  const guild = member.guild || client.guilds.cache.get(guildId) || null;
  let targetUser = member?.user || user || null;
  if (!targetUser?.avatar && typeof targetUser?.displayAvatarURL !== "function" && client?.users?.fetch) {
    targetUser = (await client.users.fetch(userId).catch(() => null)) || targetUser;
  }
  const username = accountUsername(targetUser) || accountUsername(member) || userId;
  const displayName = memberDisplayName(member, targetUser) || username;
  const avatarUrl = await resolveStaffProfileAvatarUrl(client, guild, member, targetUser, userId);
  const avatarHash = String(targetUser?.avatar || member?.user?.avatar || "").trim();
  return {
    ok: true,
    prospect: true,
    canProspectPex: true,
    identity: {
      userId,
      username,
      displayName,
      avatarUrl,
      ...(avatarHash ? { avatar: avatarHash } : {}),
    },
    pexOptions: buildProspectPexOptions(viewerMember),
  };
}

async function buildStaffProfilePayloadForWeb(client?, member?, user?, opts: Record<string, any> = {}) {
  const guildId = String(IDs.guilds.main || member?.guild?.id || "").trim();
  const userId = String(member?.id || user?.id || "").trim();
  if (!guildId || !userId) {
    return { ok: false, status: 500, error: "no_guild", message: "Guild principale non configurata." };
  }

  const guild = member.guild || client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  let targetUser = member?.user || user || null;
    const username = accountUsername(targetUser) || accountUsername(member) || userId;
  const displayName = memberDisplayName(member, targetUser) || username;

  const profileKind = resolveStaffProfileKind(member);
  if (profileKind === PROFILE_PROSPECT) {
    if (opts.allowProspectPex && opts.viewerMember) {
      return buildProspectProfilePayloadForWeb(client, member, targetUser, opts.viewerMember);
    }
    return {
      ok: false,
      status: 403,
      error: "not_staff_profile",
      message: "Non hai un profilo staff attivo.",
    };
  }

    const showModstats = profileKind === PROFILE_FULL;
  const avatarPromise = resolveStaffProfileAvatarUrl(client, guild, member, targetUser, userId);
  const modstatsPromise = showModstats ? buildModstatsWithBudget(guildId, userId) : Promise.resolve(null);
  const activityPromise = ActivityUserProfile.findOne({ guildId, userId })
    .select("staff staffRolesHistoryRetention")
    .lean()
    .catch(() => null);
  const legacyPromise = Promise.race([
    loadLegacyStaffByUserIds(guildId, [userId]).catch(() => new Map()),
    new Promise((resolve?) => setTimeout(() => resolve(new Map()), STAFF_LEGACY_SOFT_TIMEOUT_MS)),
  ]);
  const dbPromise = Promise.all([activityPromise, legacyPromise]);

  const pmRoleId = String(IDs.roles.PartnerManager || "").trim();
  const isPm = Boolean(pmRoleId && member.roles?.cache?.has(pmRoleId));
  const isFounder = targetIsFounder(member);
  const displayRoleId = resolveStaffProfileDisplayRoleId(member);
  const displayRole = displayRoleId ? guild?.roles?.cache?.get(displayRoleId) : null;
  let roleLabel = "—";
  let roleBadges = [];
  if (profileKind === PROFILE_PM_ONLY) {
    roleLabel = displayRole?.name || guild?.roles?.cache?.get(pmRoleId)?.name || "Partner Manager";
    roleBadges = [
      {
        kind: "pm",
        icon: "fa-handshake-o",
        label: roleLabel,
        color:
          displayRole?.hexColor && displayRole.hexColor !== "#000000"
            ? displayRole.hexColor
            : "#e8c49c",
        roleId: pmRoleId || null,
      },
    ];
  } else {
    roleBadges = buildStaffProfileRoleBadges(guild, member);
    roleLabel = buildFullProfileRoleLabelForEmbed(guild, member);
  }
  roleLabel = stripDiscordDecorations(roleLabel) || roleLabel;
  roleBadges = roleBadges.map((b?) => ({
    kind: b.kind || "staff",
    icon: b.icon || "fa-shield",
    label: stripDiscordDecorations(b.label) || b.label || "—",
    color: b.color || "#d4a888",
    roleId: b.roleId || null,
  }));
  const roleColor =
    displayRole?.hexColor && displayRole.hexColor !== "#000000"
      ? displayRole.hexColor
      : "#d4a888";

  const [[doc, legacyMap], avatarUrl, modstats] = await Promise.all([
    dbPromise,
    avatarPromise,
    modstatsPromise,
  ]);
  const staff = mergeStaffEmbedded(doc?.staff || {}, (legacyMap as any).get(userId) || null);
  /* careerRetentionMerge1 */
  const careerRetentionRows = Array.isArray(doc?.staffRolesHistoryRetention)
    ? doc.staffRolesHistoryRetention
    : [];

  const pauseRole = profileKind === PROFILE_PM_ONLY ? PAUSE_ROLE_PM : PAUSE_ROLE_STAFF;
  const budget = computeStaffPauseDayBudget(member, doc || { staff }, pauseRole);
  const baseLimit = budget.baseLimit;
  const bonus = budget.annualBonus + budget.weekRemaining;
  const tradedBonus = getValPosTradedPauseBonusDays(doc || { staff });
  const weekBonus = budget.weekRemaining;
  const maxDays = Math.max(0, budget.maxGiorni);
  const usedDays = Math.max(0, budget.usedDays);
  const remainingDays = Math.max(0, budget.remaining);
  const pauseSnap = resolvePauseSnapshot(staff, profileKind);
  if (pauseSnap?.statusLine) {
    pauseSnap.statusLine = applyPronounGenderToTextForMember(pauseSnap.statusLine, member);
  }

  const pos = Math.max(0, Math.floor(Number(staff.positiveCount || 0)));
  const neg = Math.max(0, Math.floor(Number(staff.negativeCount || 0)));
  const warns = Math.max(0, Math.floor(Number(staff.warnCount || 0)));

  const careerCurrentRole =
    profileKind === PROFILE_PM_ONLY
      ? displayRole?.name || guild?.roles?.cache?.get(pmRoleId)?.name || "Partner Manager"
      : displayRole?.name || roleLabel || null;
  const tenureIso = resolveTenureIso(staff, {
    currentRole: careerCurrentRole,
    track: profileKind === PROFILE_PM_ONLY ? "pm" : "staff",
    retentionRows: careerRetentionRows,
  });

  let serataFilm = null;
  if (profileKind === PROFILE_FULL) {
    const sf = resolveSerataFilmAttendanceForWeek(staff);
    if (sf) {
      serataFilm = {
        willAttend: Boolean(sf.willAttend),
        label: sf.willAttend ? "Presente alla Serata Film di sabato" : "Non segnato / assente alla Serata Film",
        editable: Boolean(sf.editable),
        saturdayKey: sf.saturdayKey || null,
      };
    }
  }

  return {
    ok: true,
    status: 200,
    version: PROFILE_PAYLOAD_VERSION,
    identity: {
      userId,
      displayName,
      username,
      avatarUrl,
      ...(String(targetUser?.avatar || member?.user?.avatar || "").trim()
        ? { avatar: String(targetUser?.avatar || member?.user?.avatar || "").trim() }
        : {}),
    },
    role: {
      label: roleLabel,
      badges: roleBadges,
      kind: profileKind === PROFILE_PM_ONLY ? "pm_only" : "full",
      isPm,
      isFounder,
      color: roleColor,
      roleId: displayRoleId || null,
    },
    pause: {
      ...pauseSnap,
      quota: {
        used: usedDays,
        max: maxDays,
        remaining: remainingDays,
        bonus,
        base: baseLimit,
        tradedBonus,
        weekBonus,
      },
      history: serializePauseHistory(staff, profileKind, 48, { member, guild }),
      pendingCount: Math.max(
        0,
        (
          profileKind === PROFILE_PM_ONLY
            ? (Array.isArray(staff?.pauses) ? staff.pauses : []).filter((p?) =>
                roleChoiceAppliesTo(PAUSE_ROLE_PM, p?.ruolo || p?.ruoloRichiesto),
              )
            : Array.isArray(staff?.pauses)
              ? staff.pauses
              : []
        ).filter((p?) => p && String(p.status || "").toLowerCase() === "pending").length,
      ),
      calendarPath: "/staff/pause/",
    },
    valutazioni: {
      positive: pos,
      negative: neg,
      recentPositive: recentReasonLines(staff.positiveReasons, 5),
      recentNegative: recentReasonLines(staff.negativeReasons, 5),
      positiveEntries: indexedReasonLines(staff.positiveReasons, 80),
      negativeEntries: indexedReasonLines(staff.negativeReasons, 80),
    },
    warn: {
      count: warns,
      recent: recentReasonLines(staff.warnReasons, 5),
      entries: indexedReasonLines(staff.warnReasons, 80),
    },
    partner: isPm
      ? (() => {
          /* Punti PM = saldo spendibile (earned − spesi), non il totale guadagnato.
             Altrimenti rimuovi/aggiungi punti non muove la card (solo Spesi in shop). */
          const points = Math.max(0, Math.floor(Number(resolvePartnerPointsShown(staff) || 0)));
          const pointsEarned = Math.max(0, Math.floor(Number(resolvePartnerTotalEarned(staff) || 0)));
          const partnerCount = Math.max(0, Math.floor(Number(staff.partnerCount || 0)));
          const redeemSpend = Math.max(0, Math.floor(Number(staff.partnerRedeemSpend || 0)));
          const { buildPmShopCatalogForWeb } = require("./siteStaffPmShopApi") as typeof import("./siteStaffPmShopApi");
          return {
            points,
            pointsEarned,
            partnerCount,
            redeemSpend,
            shop: buildPmShopCatalogForWeb(points, { member, lean: { staff } }),
          };
        })()
      : null,
    modstats,
    serataFilm,
    career: {
      tenure: tenureIso
        ? {
            sinceIso: tenureIso,
            label: formatTenureLabel(tenureIso),
          }
        : null,
      rolesHistory: serializeRolesHistory(guild, staff, 20, {
        stillActive: profileKind === PROFILE_FULL || profileKind === PROFILE_PM_ONLY,
        currentRole: careerCurrentRole,
        track: profileKind === PROFILE_PM_ONLY ? "pm" : "staff",
        retentionRows: careerRetentionRows,
      }),
      currentRole: careerCurrentRole,
    },
  };
}

export = { buildStaffProfilePayloadForWeb };
