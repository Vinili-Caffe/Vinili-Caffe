const IDs = require("../Config/ids");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const Ticket = require("../../Schemas/Ticket/ticketSchema");
const {
  memberHasStaffRole,
  getStaffListPausedUserIds,
} = require("../Community/staffListUtils");
const {
  resolveStaffProfileKind,
  resolveStaffPartnerPointsDisplay,
  PROFILE_PM_ONLY,
} = require("../Staff/staffProfilePanelRuntime");
const {
  resolvePartnerPointsShown,
  resolvePartnerTotalEarned,
} = require("../Staff/partnerPointsDisplayUtils");
const {
  TOP_LIMIT,
  fetchSortedPartners,
  pickTopPartnerRowsInGuild,
} = require("../Partner/partnerLeaderboardRuntime");
const { listPartnershipBlacklistGuilds } = require("../../Services/Partner/partnershipBlacklistService");
const {
  resolveSerataFilmAttendanceForWeek,
  setSerataFilmWillAttend,
  canEditSerataFilmAttendance,
} = require("../Staff/serataFilmAttendanceUtils");
const {
  STAFF_HIGH_STAFF_ELIGIBLE_KEYS,
  memberHasAnyRoleKey,
} = require("../Staff/staffRoleHierarchy");
const { assertWebsiteStaffAccess, normalizeHeaderSecret } = require("./siteStaffAccessApi");
const { getCachedStaffRoster, identityFromMember, memberIsPm } = require("./siteStaffRosterCache");

const DIRECTORY_CACHE_TTL_MS = 45_000;
let directoryCache = null;

function stripDiscordDecorations(text) {
  return String(text || "")
    .replace(/<a?:[\w~]+:\d+>/g, "")
    .replace(/<[@#&!]?\d+>/g, "")
    .replace(/[*_`~|]+/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

function memberIsHighStaff(member) {
  return memberHasAnyRoleKey(member, STAFF_HIGH_STAFF_ELIGIBLE_KEYS);
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

async function buildDirectoryPayload(client) {
  const roster = await getCachedStaffRoster(client);
  if (!roster?.ok) {
    return roster || { ok: false, status: 503, error: "guild_unavailable", message: "Server non disponibile." };
  }
  return {
    ok: true,
    status: 200,
    guildId: roster.guildId,
    sections: roster.sections,
    counts: { total: roster.counts.total, onPause: roster.counts.onPause },
  };
}

async function handleSiteStaffDirectoryGet(client, req, res) {
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
    const now = Date.now();
    if (directoryCache && directoryCache.exp > now) {
      res.setHeader("Cache-Control", "private, max-age=15");
      return res.status(200).json(directoryCache.payload);
    }
    const payload = await buildDirectoryPayload(client);
    if (!payload.ok) {
      return res.status(payload.status || 500).json(payload);
    }
    directoryCache = { exp: now + DIRECTORY_CACHE_TTL_MS, payload };
    res.setHeader("Cache-Control", "private, max-age=15");
    return res.status(200).json(payload);
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-directory:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteStaffPmHubGet(client, req, res) {
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
    const guildId = String(IDs.guilds.main || "");
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      return res.status(503).json({ ok: false, error: "guild_unavailable", message: "Server non disponibile." });
    }
    const member = access.member;
    const isPm = memberIsPm(member);
    const isHighStaff = memberIsHighStaff(member);
    const modeRaw = String(req.query?.lb || req.query?.mode || "totale").toLowerCase();
    const mode = modeRaw === "settimanale" || modeRaw === "weekly" ? "settimanale" : "totale";

    const doc = await ActivityUserProfile.findOne({ guildId, userId: String(member.id) })
      .select("staff")
      .lean()
      .catch(() => null);
    const staff = doc?.staff || {};

    const sortedAll = await fetchSortedPartners(guild, mode === "settimanale");
    const visible = await pickTopPartnerRowsInGuild(sortedAll, guild, TOP_LIMIT);
    const rows = [];
    for (let i = 0; i < visible.length; i += 1) {
      const row = visible[i];
      const m = guild.members.cache.get(String(row.userId)) || (await guild.members.fetch(String(row.userId)).catch(() => null));
      rows.push({
        rank: i + 1,
        userId: String(row.userId),
        displayName: m ? identityFromMember(m).displayName : String(row.userId),
        username: m ? identityFromMember(m).username : "",
        avatarUrl: m ? identityFromMember(m).avatarUrl : "",
        score: Math.max(0, Math.floor(Number(row.score) || 0)),
      });
    }

    let blacklist = { count: 0, items: [] };
    if (isPm || isHighStaff) {
      const items = await listPartnershipBlacklistGuilds(100).catch(() => []);
      blacklist = {
        count: items.length,
        items: (items || []).map((it) => ({
          guildId: String(it.guildId || ""),
          guildName: String(it.guildName || it.name || "").trim() || null,
          invite: String(it.invite || "").trim() || null,
          iconUrl: String(it.iconUrl || "").trim() || null,
          note: String(it.note || "").trim() || null,
          addedBy: String(it.addedBy || "").trim() || null,
          addedAt: it.addedAt ? new Date(it.addedAt).toISOString() : null,
        })),
      };
    }

    res.setHeader("Cache-Control", "private, max-age=20");
    return res.status(200).json({
      ok: true,
      me: {
        isPm,
        isHighStaff,
        pointsEarned: Math.max(0, Math.floor(Number(resolvePartnerTotalEarned(staff) || resolveStaffPartnerPointsDisplay(staff) || 0))),
        pointsSpendable: Math.max(0, Math.floor(Number(resolvePartnerPointsShown(staff) || 0))),
        partnerCount: Math.max(0, Math.floor(Number(staff.partnerCount || 0))),
        redeemSpend: Math.max(0, Math.floor(Number(staff.partnerRedeemSpend || 0))),
      },
      leaderboard: { mode, rows },
      blacklist,
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-pm-hub:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteStaffValwarnGet(client, req, res) {
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
    const guildId = String(IDs.guilds.main || "");
    const viewer = access.member;
    const viewerIsHighStaff = memberIsHighStaff(viewer);
    const targetId = String(req.query?.userId || req.query?.target || viewer.id || "").trim();
    if (!/^\d{16,22}$/.test(targetId)) {
      return res.status(400).json({ ok: false, error: "bad_user", message: "userId non valido." });
    }
    if (targetId !== String(viewer.id) && !viewerIsHighStaff) {
      return res.status(403).json({
        ok: false,
        error: "forbidden",
        message: "Solo High Staff può consultare i dati di altri membri dello staff.",
      });
    }

    const guild = await client.guilds.fetch(guildId).catch(() => null);
    const targetMember =
      guild?.members?.cache?.get(targetId) ||
      (await guild?.members?.fetch(targetId).catch(() => null));

    const doc = await ActivityUserProfile.findOne({ guildId, userId: targetId })
      .select("staff")
      .lean()
      .catch(() => null);
    const staff = doc?.staff || {};

    let team = null;
    if (viewerIsHighStaff && String(req.query?.team || "") === "1") {
      const paused = await getStaffListPausedUserIds(guildId);
      const docs = await ActivityUserProfile.find(
        {
          guildId,
          $or: [
            { "staff.positiveCount": { $gt: 0 } },
            { "staff.negativeCount": { $gt: 0 } },
            { "staff.warnCount": { $gt: 0 } },
          ],
        },
        {
          userId: 1,
          "staff.positiveCount": 1,
          "staff.negativeCount": 1,
          "staff.warnCount": 1,
        },
      )
        .lean()
        .catch(() => []);
      team = [];
      for (const row of docs || []) {
        const uid = String(row.userId || "");
        if (!uid) continue;
        const m =
          guild?.members?.cache?.get(uid) ||
          (await guild?.members?.fetch(uid).catch(() => null));
        if (!m || (!memberHasStaffRole(m) && !memberIsPm(m))) continue;
        team.push({
          ...identityFromMember(m),
          onPause: paused.has(uid),
          positive: Math.max(0, Math.floor(Number(row.staff?.positiveCount || 0))),
          negative: Math.max(0, Math.floor(Number(row.staff?.negativeCount || 0))),
          warn: Math.max(0, Math.floor(Number(row.staff?.warnCount || 0))),
        });
      }
      team.sort((a, b) => b.warn - a.warn || b.negative - a.negative || a.displayName.localeCompare(b.displayName, "it"));
    }

    res.setHeader("Cache-Control", "private, max-age=20");
    return res.status(200).json({
      ok: true,
      viewerIsHighStaff,
      target: targetMember
        ? identityFromMember(targetMember)
        : { userId: targetId, displayName: targetId, username: "", avatarUrl: "" },
      valutazioni: {
        positive: Math.max(0, Math.floor(Number(staff.positiveCount || 0))),
        negative: Math.max(0, Math.floor(Number(staff.negativeCount || 0))),
        recentPositive: recentReasonLines(staff.positiveReasons, 8),
        recentNegative: recentReasonLines(staff.negativeReasons, 8),
      },
      warn: {
        count: Math.max(0, Math.floor(Number(staff.warnCount || 0))),
        recent: recentReasonLines(staff.warnReasons, 8),
      },
      team,
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-valwarn:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteStaffTicketsGet(client, req, res) {
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
    const guildId = String(IDs.guilds.main || "");
    const mine = String(req.query?.mine || "") === "1";
    const unclaimed = String(req.query?.unclaimed || "") === "1";
    const filter = { guildId, open: true };
    if (mine) filter.claimedBy = String(access.member.id);
    if (unclaimed) {
      filter.$or = [{ claimedBy: null }, { claimedBy: "" }, { claimedBy: { $exists: false } }];
    }

    const rows = await Ticket.find(filter, {
      ticketNumber: 1,
      userId: 1,
      userTag: 1,
      channelId: 1,
      ticketType: 1,
      claimedBy: 1,
      createdAt: 1,
      panelId: 1,
      descriptionSubmitted: 1,
    })
      .limit(200)
      .lean()
      .catch(() => []);

    const sorted = (Array.isArray(rows) ? rows : []).slice().sort((a, b) => {
      const ta = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
      return ta - tb;
    });
    const limited = sorted.slice(0, 120);

    const tickets = limited.map((t) => ({
      id: String(t._id || ""),
      ticketNumber: Number(t.ticketNumber) || null,
      userId: String(t.userId || ""),
      userTag: String(t.userTag || "").trim() || null,
      channelId: String(t.channelId || ""),
      ticketType: String(t.ticketType || "").trim() || "ticket",
      claimedBy: t.claimedBy ? String(t.claimedBy) : null,
      createdAt: t.createdAt ? new Date(t.createdAt).toISOString() : null,
      descriptionSubmitted: Boolean(t.descriptionSubmitted),
      panelId: t.panelId != null ? String(t.panelId) : null,
    }));

    res.setHeader("Cache-Control", "private, max-age=10");
    return res.status(200).json({
      ok: true,
      guildId,
      count: tickets.length,
      tickets,
      filters: { mine, unclaimed },
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-tickets:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteStaffSerataFilmGet(client, req, res) {
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
    if (resolveStaffProfileKind(access.member) === PROFILE_PM_ONLY) {
      return res.status(403).json({
        ok: false,
        error: "pm_only",
        message: "La Serata Film riguarda lo staff full, non i soli Partner Manager.",
      });
    }
    const guildId = String(IDs.guilds.main || "");
    const doc = await ActivityUserProfile.findOne({ guildId, userId: String(access.member.id) })
      .select("staff")
      .lean()
      .catch(() => null);
    const sf = resolveSerataFilmAttendanceForWeek(doc?.staff || {});
    return res.status(200).json({
      ok: true,
      saturdayKey: sf.saturdayKey || null,
      willAttend: Boolean(sf.willAttend),
      declaredAbsent: Boolean(sf.declaredAbsent),
      editable: Boolean(sf.editable),
      canEditUntilHint: "Puoi segnalare l'assenza fino alle 20:45 di sabato (ora Italia).",
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-seratafilm GET:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteStaffSerataFilmPost(client, req, res) {
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
    if (resolveStaffProfileKind(access.member) === PROFILE_PM_ONLY) {
      return res.status(403).json({
        ok: false,
        error: "pm_only",
        message: "La Serata Film riguarda lo staff full, non i soli Partner Manager.",
      });
    }
    if (!canEditSerataFilmAttendance(new Date())) {
      return res.status(403).json({
        ok: false,
        error: "closed",
        message: "Finestra chiusa: puoi modificare solo fino alle 20:45 di sabato.",
      });
    }
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const willAttend = body.willAttend !== false && body.willAttend !== "false" && body.willAttend !== 0;
    const guildId = String(IDs.guilds.main || "");
    const result = await setSerataFilmWillAttend(guildId, String(access.member.id), willAttend);
    if (!result?.ok) {
      return res.status(400).json({
        ok: false,
        error: result?.code || "failed",
        message: "Impossibile aggiornare la presenza.",
      });
    }
    const doc = await ActivityUserProfile.findOne({ guildId, userId: String(access.member.id) })
      .select("staff")
      .lean()
      .catch(() => null);
    const sf = resolveSerataFilmAttendanceForWeek(doc?.staff || {});
    return res.status(200).json({
      ok: true,
      saturdayKey: sf.saturdayKey || null,
      willAttend: Boolean(sf.willAttend),
      declaredAbsent: Boolean(sf.declaredAbsent),
      editable: Boolean(sf.editable),
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-seratafilm POST:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

module.exports = {
  handleSiteStaffDirectoryGet,
  handleSiteStaffPmHubGet,
  handleSiteStaffValwarnGet,
  handleSiteStaffTicketsGet,
  handleSiteStaffSerataFilmGet,
  handleSiteStaffSerataFilmPost,
};
