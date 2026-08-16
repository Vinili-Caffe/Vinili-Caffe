const IDs = require("../Config/ids");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { accountUsername, userAvatarUrlDynamic } = require("../Discord/guildDiscordIdentity");
const { countModActionsByMod } = require("../Moderation/modCaseStore");
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
  resolveStaffProfileDisplayRoleId,
  PROFILE_FULL,
  PROFILE_PM_ONLY,
  PROFILE_PROSPECT,
} = require("../Staff/staffProfilePanelRuntime");
const { resolveSerataFilmAttendanceForWeek } = require("../Staff/serataFilmAttendanceUtils");
const { assertWebsiteStaffAccess, normalizeHeaderSecret } = require("./siteStaffAccessApi");

const PROFILE_CACHE_TTL_MS = 20_000;
const PROFILE_CACHE_MAX = 200;
const profileCache = new Map();
const PROFILE_PAYLOAD_VERSION = 2;

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

function serializeRolesHistory(staffObj, limit = 10) {
  const hist = Array.isArray(staffObj?.rolesHistory) ? staffObj.rolesHistory : [];
  return hist
    .map((row) => {
      const d = row?.date ? new Date(row.date) : null;
      const iso = d && Number.isFinite(d.getTime()) ? d.toISOString() : null;
      return {
        oldRole: stripDiscordDecorations(row?.oldRole || "") || "—",
        newRole: stripDiscordDecorations(row?.newRole || "") || "—",
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

async function buildModstats(guildId, userId) {
  const now = Date.now();
  const d7 = new Date(now - 7 * 24 * 60 * 60 * 1000);
  const d30 = new Date(now - 30 * 24 * 60 * 60 * 1000);
  const count = (action, since = null) => countModActionsByMod(guildId, userId, action, since);
  const [m7, m30, mall, b7, b30, ball, k7, k30, kall, w7, w30, wall] = await Promise.all([
    count("MUTE", d7),
    count("MUTE", d30),
    count("MUTE"),
    count("BAN", d7),
    count("BAN", d30),
    count("BAN"),
    count("KICK", d7),
    count("KICK", d30),
    count("KICK"),
    count("WARN", d7),
    count("WARN", d30),
    count("WARN"),
  ]);
  const pack = (mute, ban, kick, warn) => ({
    mute: Number(mute) || 0,
    ban: Number(ban) || 0,
    kick: Number(kick) || 0,
    warn: Number(warn) || 0,
    total: (Number(mute) || 0) + (Number(ban) || 0) + (Number(kick) || 0) + (Number(warn) || 0),
  });
  return {
    d7: pack(m7, b7, k7, w7),
    d30: pack(m30, b30, k30, w30),
    all: pack(mall, ball, kall, wall),
  };
}

async function buildStaffProfilePayloadForWeb(client, member, user) {
  const guildId = String(IDs.guilds.main || member?.guild?.id || "").trim();
  const userId = String(member?.id || user?.id || "").trim();
  if (!guildId || !userId) {
    return { ok: false, status: 500, error: "no_guild", message: "Guild principale non configurata." };
  }

  const guild = member.guild || client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  const targetUser = member.user || user || (await client.users.fetch(userId).catch(() => null));
  const displayName = accountUsername(member) || accountUsername(targetUser) || userId;
  const username = String(targetUser?.username || member?.user?.username || "").trim() || displayName;
  const avatarUrl = userAvatarUrlDynamic(targetUser || member, { size: 256 }) || null;

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
  if (profileKind === PROFILE_PM_ONLY) {
    roleLabel = displayRole?.name || guild?.roles?.cache?.get(pmRoleId)?.name || "Partner Manager";
  } else {
    roleLabel = buildFullProfileRoleLabelForEmbed(guild, member);
  }
  roleLabel = stripDiscordDecorations(roleLabel) || roleLabel;
  const roleColor =
    displayRole?.hexColor && displayRole.hexColor !== "#000000"
      ? displayRole.hexColor
      : "#d4a888";

  const doc = await ActivityUserProfile.findOne({ guildId, userId })
    .select("staff")
    .lean()
    .catch(() => null);
  const staff = doc?.staff || {};

  const pauseRole = profileKind === PROFILE_PM_ONLY ? PAUSE_ROLE_PM : PAUSE_ROLE_STAFF;
  const baseLimit = getBasePauseLimit(member, pauseRole);
  const bonus = getStaffPauseBonusDaysTotal(member, doc);
  const tradedBonus = getValPosTradedPauseBonusDays(doc);
  const maxDays = Math.max(0, baseLimit + bonus);
  const usedDays = Math.max(0, computeConsumedPauseDays(staff.pauses));
  const remainingDays = Math.max(0, maxDays - usedDays);
  const pauseSnap = resolvePauseSnapshot(staff, profileKind);

  const pos = Math.max(0, Math.floor(Number(staff.positiveCount || 0)));
  const neg = Math.max(0, Math.floor(Number(staff.negativeCount || 0)));
  const warns = Math.max(0, Math.floor(Number(staff.warnCount || 0)));

  const tenureIso = resolveTenureIso(staff);
  const showModstats = profileKind === PROFILE_FULL;
  const modstats = showModstats ? await buildModstats(guildId, userId) : null;

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
      ? {
          points: Math.max(0, Math.floor(Number(resolveStaffPartnerPointsDisplay(staff) || 0))),
          partnerCount: Math.max(0, Math.floor(Number(staff.partnerCount || 0))),
          redeemSpend: Math.max(0, Math.floor(Number(staff.partnerRedeemSpend || 0))),
        }
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
      rolesHistory: serializeRolesHistory(staff, 10),
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
};
