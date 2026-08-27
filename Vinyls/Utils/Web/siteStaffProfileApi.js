const IDs = require("../Config/ids");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { accountUsername, memberDisplayName, userAvatarUrlDynamic, discordDefaultAvatarUrl } = require("../Discord/guildDiscordIdentity");
const { summarizeModActionsByModWindows } = require("../Moderation/modCaseStore");
const {
  computeConsumedPauseDays,
  getBasePauseLimit,
  getStaffPauseBonusDaysTotal,
  getValPosTradedPauseBonusDays,
  getPausePhase,
  getPauseStatusLabel,
  getTodayUtc,
  parseItalianDate,
  PAUSE_ROLE_STAFF,
  PAUSE_ROLE_PM,
  roleChoiceAppliesTo,
} = require("../Pause/pauseHandlersUtils");
const {
  resolveStaffPartnerPointsDisplay,
  resolveStaffProfileKind,
  buildFullProfileRoleLabelForEmbed,
  buildStaffProfileRoleBadges,
  resolveStaffProfileDisplayRoleId,
  PROFILE_FULL,
  PROFILE_PM_ONLY,
  PROFILE_PROSPECT,
} = require("../Staff/staffProfilePanelRuntime");
const { resolveSerataFilmAttendanceForWeek } = require("../Staff/serataFilmAttendanceUtils");
const { loadLegacyStaffByUserIds, mergeStaffEmbedded } = require("../Staff/staffLegacyMerge");
const { assertWebsiteStaffAccess, normalizeHeaderSecret } = require("./siteStaffAccessApi");

const PROFILE_CACHE_TTL_MS = 120_000;
const PROFILE_CACHE_MAX = 200;
const profileCache = new Map();
const PROFILE_PAYLOAD_VERSION = 6;

function stripDiscordDecorations(text) {
  return String(text || "")
    .replace(/<a?:[\w~]+:\d+>/g, "")
    .replace(/<[@#&!]?\d+>/g, "")
    .replace(/[*_`~|]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function profileCacheKey(userId) {
  return `v${PROFILE_PAYLOAD_VERSION}:${String(IDs.guilds.main || "")}:${String(userId || "")}`;
}

function readProfileCache(userId) {
  const key = profileCacheKey(userId);
  const entry = profileCache.get(key);
  if (!entry || Number(entry.exp || 0) <= Date.now()) {
    profileCache.delete(key);
    return null;
  }
  return entry.payload;
}

function writeProfileCache(userId, payload) {
  if (profileCache.size >= PROFILE_CACHE_MAX) {
    const first = profileCache.keys().next().value;
    if (first) profileCache.delete(first);
  }
  profileCache.set(profileCacheKey(userId), {
    exp: Date.now() + PROFILE_CACHE_TTL_MS,
    payload,
  });
}

function clearStaffProfileCacheForUser(userId) {
  try {
    profileCache.delete(profileCacheKey(userId));
  } catch (e) {}
}

function recentReasonLines(list, limit = 5) {
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

function resolvePauseSnapshot(staffObj, profileKind) {
  const allPauses = Array.isArray(staffObj?.pauses) ? staffObj.pauses : [];
  const pauses =
    profileKind === PROFILE_PM_ONLY
      ? allPauses.filter((p) => roleChoiceAppliesTo(PAUSE_ROLE_PM, p?.ruolo || p?.ruoloRichiesto))
      : allPauses;

  let active = null;
  let planned = null;
  let recentlyReturned = null;
  for (const p of pauses) {
    if (!p || String(p.status || "") !== "accepted") continue;
    const phase = getPausePhase(p.dataRichiesta, p.dataRitorno);
    if (phase === "active") {
      if (!active) active = p;
      continue;
    }
    if (phase === "planned") {
      if (!planned) planned = p;
      continue;
    }
    if (phase === "ended") {
      const end = parseItalianDate(p.dataRitorno);
      if (!end) continue;
      const ageMs = Date.now() - end.getTime();
      if (ageMs >= 0 && ageMs <= 7 * 24 * 60 * 60 * 1000) {
        if (!recentlyReturned || end > parseItalianDate(recentlyReturned.dataRitorno)) {
          recentlyReturned = p;
        }
      }
    }
  }

  if (active) {
    return {
      phase: "active",
      statusLine: `In pausa fino al ${String(active.dataRitorno || "").trim()}`,
      start: String(active.dataRichiesta || "").trim() || null,
      end: String(active.dataRitorno || "").trim() || null,
      motivazione: stripDiscordDecorations(active.motivazione || "") || null,
    };
  }
  if (planned) {
    return {
      phase: "planned",
      statusLine: `Pausa programmata dal ${String(planned.dataRichiesta || "").trim()} al ${String(planned.dataRitorno || "").trim()}`,
      start: String(planned.dataRichiesta || "").trim() || null,
      end: String(planned.dataRitorno || "").trim() || null,
      motivazione: stripDiscordDecorations(planned.motivazione || "") || null,
    };
  }
  if (recentlyReturned) {
    return {
      phase: "recently_returned",
      statusLine: `Rientrato il ${String(recentlyReturned.dataRitorno || "").trim()}`,
      start: String(recentlyReturned.dataRichiesta || "").trim() || null,
      end: String(recentlyReturned.dataRitorno || "").trim() || null,
      motivazione: null,
    };
  }
  return {
    phase: "none",
    statusLine: "Nessuna pausa in corso",
    start: null,
    end: null,
    motivazione: null,
  };
}

function serializePauseHistory(staffObj, profileKind, limit = 8) {
  const today = getTodayUtc();
  const allPauses = Array.isArray(staffObj?.pauses) ? staffObj.pauses : [];
  const pauses =
    profileKind === PROFILE_PM_ONLY
      ? allPauses.filter((p) => roleChoiceAppliesTo(PAUSE_ROLE_PM, p?.ruolo || p?.ruoloRichiesto))
      : allPauses;

  const rows = pauses
    .filter((p) => p && ["accepted", "pending", "cancelled", "rejected"].includes(String(p.status || "")))
    .map((p) => {
      const start = parseItalianDate(p.dataRichiesta);
      return {
        start: String(p.dataRichiesta || "").trim(),
        end: String(p.dataRitorno || "").trim(),
        status: String(p.status || ""),
        statusLabel: getPauseStatusLabel(p, today),
        phase: getPausePhase(p.dataRichiesta, p.dataRitorno),
        motivazione: stripDiscordDecorations(p.motivazione || "") || null,
        ruolo: String(p.ruolo || p.ruoloRichiesto || "").trim() || null,
        _sort: start ? start.getTime() : 0,
      };
    })
    .sort((a, b) => b._sort - a._sort)
    .slice(0, limit)
    .map(({ _sort, ...rest }) => rest);

  return rows;
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

function serializeRolesHistory(guild, staffObj, limit = 10) {
  const hist = Array.isArray(staffObj?.rolesHistory) ? staffObj.rolesHistory : [];
  return hist
    .map((row) => {
      const d = row?.date ? new Date(row.date) : null;
      const iso = d && Number.isFinite(d.getTime()) ? d.toISOString() : null;
      return {
        oldRole: roleNameFromId(guild, row?.oldRole),
        newRole: roleNameFromId(guild, row?.newRole),
        reason: stripDiscordDecorations(row?.reason || "") || null,
        dateIso: iso,
        dateLabel: iso ? formatTenureLabel(iso) : null,
        _sort: iso ? new Date(iso).getTime() : 0,
      };
    })
    .sort((a, b) => b._sort - a._sort)
    .slice(0, limit)
    .map(({ _sort, ...rest }) => rest);
}

function resolveTenureIso(staffObj) {
  const hist = Array.isArray(staffObj?.rolesHistory) ? staffObj.rolesHistory : [];
  let earliest = null;
  for (const row of hist) {
    const d = row?.date ? new Date(row.date) : null;
    if (!d || !Number.isFinite(d.getTime())) continue;
    if (!earliest || d < earliest) earliest = d;
  }
  return earliest ? earliest.toISOString() : null;
}

function formatTenureLabel(iso) {
  if (!iso) return null;
  const d = new Date(iso);
  if (!Number.isFinite(d.getTime())) return null;
  try {
    return d.toLocaleDateString("it-IT", {
      day: "2-digit",
      month: "long",
      year: "numeric",
      timeZone: "Europe/Rome",
    });
  } catch {
    return d.toISOString().slice(0, 10);
  }
}

const MODSTATS_BUDGET_MS = 8000;

async function buildModstatsWithBudget(guildId, userId) {
  try {
    return await Promise.race([
      buildModstats(guildId, userId),
      new Promise((resolve) => {
        setTimeout(() => resolve(null), MODSTATS_BUDGET_MS);
      }),
    ]);
  } catch {
    return null;
  }
}

async function buildModstats(guildId, userId) {
  const buckets = await summarizeModActionsByModWindows(guildId, userId);
  const pack = (windowKey) => {
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

async function resolveStaffProfileAvatarUrl(client, guild, member, user, userId) {
  const uid = String(userId || "").trim();
  if (!uid) return discordDefaultAvatarUrl(null, { size: 256 });

  let avatarSubject = member;
  let targetUser = member?.user || user || null;
  const userHasAvatar = Boolean(targetUser?.avatar);
  const memberHasServerAvatar = Boolean(member?.avatar);
  const userHasDisplayFn = typeof targetUser?.displayAvatarURL === "function";

  if (!userHasAvatar && !userHasDisplayFn && client?.users?.fetch) {
    targetUser = (await client.users.fetch(uid).catch(() => null)) || targetUser;
  }

  if (guild && !memberHasServerAvatar) {
    const liveMember = guild.members?.cache?.get(uid) || (await guild.members.fetch(uid).catch(() => null));
    if (liveMember?.avatar) avatarSubject = liveMember;
    else if (liveMember?.user?.avatar && !targetUser?.avatar) targetUser = liveMember.user;
  }

  const fromMember =
    avatarSubject?.avatar != null && avatarSubject.avatar !== ""
      ? userAvatarUrlDynamic(avatarSubject, { size: 256 })
      : null;
  if (fromMember) return fromMember;

  const fromUser = userAvatarUrlDynamic(targetUser || avatarSubject, { size: 256 });
  if (fromUser) return fromUser;

  return discordDefaultAvatarUrl(targetUser || { id: uid }, { size: 256 });
}

async function buildStaffProfilePayloadForWeb(client, member, user) {
  const guildId = String(IDs.guilds.main || member?.guild?.id || "").trim();
  const userId = String(member?.id || user?.id || "").trim();
  if (!guildId || !userId) {
    return { ok: false, status: 500, error: "no_guild", message: "Guild principale non configurata." };
  }

  const guild = member.guild || client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  let targetUser = member?.user || user || null;
  if (!targetUser?.avatar && typeof targetUser?.displayAvatarURL !== "function" && client?.users?.fetch) {
    targetUser = (await client.users.fetch(userId).catch(() => null)) || targetUser;
  }
  const username = accountUsername(targetUser) || accountUsername(member) || userId;
  const displayName = memberDisplayName(member, targetUser) || username;
  const avatarUrl = await resolveStaffProfileAvatarUrl(client, guild, member, targetUser, userId);

  const profileKind = resolveStaffProfileKind(member);
  if (profileKind === PROFILE_PROSPECT) {
    return {
      ok: false,
      status: 403,
      error: "not_staff_profile",
      message: "Non hai un profilo staff attivo.",
    };
  }

  const pmRoleId = String(IDs.roles.PartnerManager || "").trim();
  const isPm = Boolean(pmRoleId && member.roles?.cache?.has(pmRoleId));
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
  roleBadges = roleBadges.map((b) => ({
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

  const [doc, legacyMap] = await Promise.all([
    ActivityUserProfile.findOne({ guildId, userId }).select("staff").lean().catch(() => null),
    loadLegacyStaffByUserIds(guildId, [userId]),
  ]);
  const staff = mergeStaffEmbedded(doc?.staff || {}, legacyMap.get(userId) || null);

  const pauseRole = profileKind === PROFILE_PM_ONLY ? PAUSE_ROLE_PM : PAUSE_ROLE_STAFF;
  const baseLimit = getBasePauseLimit(member, pauseRole);
  const bonus = getStaffPauseBonusDaysTotal(member, doc || { staff });
  const tradedBonus = getValPosTradedPauseBonusDays(doc || { staff });
  const maxDays = Math.max(0, baseLimit + bonus);
  const usedDays = Math.max(0, computeConsumedPauseDays(staff.pauses));
  const remainingDays = Math.max(0, maxDays - usedDays);
  const pauseSnap = resolvePauseSnapshot(staff, profileKind);

  const pos = Math.max(0, Math.floor(Number(staff.positiveCount || 0)));
  const neg = Math.max(0, Math.floor(Number(staff.negativeCount || 0)));
  const warns = Math.max(0, Math.floor(Number(staff.warnCount || 0)));

  const tenureIso = resolveTenureIso(staff);
  const showModstats = profileKind === PROFILE_FULL;
  const modstats = showModstats ? await buildModstatsWithBudget(guildId, userId) : null;

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
    },
    role: {
      label: roleLabel,
      badges: roleBadges,
      kind: profileKind === PROFILE_PM_ONLY ? "pm_only" : "full",
      isPm,
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
      },
      history: serializePauseHistory(staff, profileKind, 8),
      calendarPath: "/staff/pause/",
    },
    valutazioni: {
      positive: pos,
      negative: neg,
      recentPositive: recentReasonLines(staff.positiveReasons, 5),
      recentNegative: recentReasonLines(staff.negativeReasons, 5),
    },
    warn: {
      count: warns,
      recent: recentReasonLines(staff.warnReasons, 5),
    },
    partner: isPm
      ? (() => {
          const points = Math.max(0, Math.floor(Number(resolveStaffPartnerPointsDisplay(staff) || 0)));
          const partnerCount = Math.max(0, Math.floor(Number(staff.partnerCount || 0)));
          const redeemSpend = Math.max(0, Math.floor(Number(staff.partnerRedeemSpend || 0)));
          const { buildPmShopCatalogForWeb } = require("./siteStaffPmShopApi");
          return {
            points,
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
      rolesHistory: serializeRolesHistory(guild, staff, 10),
    },
  };
}

/**
 * GET Bearer — profilo staff self-only (read-only, allineato a +profile Discord).
 */
async function handleSiteStaffProfileGet(client, req, res) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const access = await assertWebsiteStaffAccess(client, accessToken);
    if (!access.ok) {
      return res.status(access.status).json({
        ok: false,
        error: access.error,
        message: access.message,
      });
    }

    const userId = String(access.member?.id || access.user?.id || "").trim();
    const cached = readProfileCache(userId);
    if (cached) {
      res.setHeader("Cache-Control", "private, max-age=15");
      return res.status(200).json({ ...cached, cached: true });
    }

    const payload = await buildStaffProfilePayloadForWeb(client, access.member, access.user);
    if (!payload.ok) {
      return res.status(Number(payload.status) || 403).json(payload);
    }

    writeProfileCache(userId, payload);
    res.setHeader("Cache-Control", "private, max-age=15");
    return res.status(200).json(payload);
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-profile:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

module.exports = {
  handleSiteStaffProfileGet,
  buildStaffProfilePayloadForWeb,
  clearStaffProfileCacheForUser,
};
