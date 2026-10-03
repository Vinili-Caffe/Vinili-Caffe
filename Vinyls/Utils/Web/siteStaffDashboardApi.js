const IDs = require("../Config/ids");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const {
  resolveStaffProfileDisplayRoleId,
  buildFullProfileRoleLabelForEmbed,
  resolveStaffProfileKind,
} = require("../Staff/staffProfilePanelRuntime");
const {
  memberIsHighStaffEligible,
  memberHasDirectorRole,
  memberCanReviewAppelli,
} = require("../Staff/staffRoleHierarchy");
const { assertWebsiteStaffAccess, normalizeHeaderSecret } = require("./siteStaffAccessApi");
const {
  getCachedStaffRoster,
  countPendingPausesCached,
  identityFromMember,
  memberIsPm,
  stripDiscordDecorations,
} = require("./siteStaffRosterCache");
const { countOpenWebTickets } = require("./siteWebTicketsApi");
const { sendJsonWithEtag, weakEtagFromJson, weakEtagFromParts } = require("./siteHttpEtag");

const DASH_CACHE_TTL_MS = 20_000;
let dashCache = null;

async function buildDashboardPayload(client, viewerMember) {
  const guildId = String(IDs.guilds.main || "");
  const canManage = memberIsHighStaffEligible(viewerMember);

  const [roster, ticketStats, pendingPauses, viewerDoc] = await Promise.all([
    getCachedStaffRoster(client),
    countOpenWebTickets(guildId),
    canManage ? countPendingPausesCached(guildId) : Promise.resolve(0),
    ActivityUserProfile.findOne({ guildId, userId: String(viewerMember.id) })
      .select("staff.positiveCount staff.negativeCount staff.warnCount")
      .lean()
      .catch(() => null),
  ]);

  if (!roster?.ok) {
    return roster || { ok: false, status: 503, error: "guild_unavailable", message: "Server non disponibile." };
  }

  const guild = roster.guild;
  const displayRoleId = resolveStaffProfileDisplayRoleId(viewerMember);
  let roleLabel = buildFullProfileRoleLabelForEmbed(guild, viewerMember);
  roleLabel = stripDiscordDecorations(roleLabel) || "Staff";
  const staff = viewerDoc?.staff || {};
  const paused = roster.paused || new Set();

  return {
    ok: true,
    status: 200,
    canManage,
    viewer: {
      ...identityFromMember(viewerMember),
      displayRoleId: displayRoleId || null,
      displayRoleLabel: roleLabel,
      profileKind: resolveStaffProfileKind(viewerMember),
      isPm: memberIsPm(viewerMember),
      isHighStaff: canManage,
      positive: Math.max(0, Math.floor(Number(staff.positiveCount || 0))),
      negative: Math.max(0, Math.floor(Number(staff.negativeCount || 0))),
      warn: Math.max(0, Math.floor(Number(staff.warnCount || 0))),
      onPause: paused.has(String(viewerMember.id)),
    },
    stats: {
      staffTotal: roster.counts?.total || 0,
      onPause: roster.counts?.onPause || 0,
      pmCount: roster.counts?.pmCount || 0,
      openTickets: Number(ticketStats?.openTickets) || 0,
      unclaimedTickets: Number(ticketStats?.unclaimedTickets) || 0,
      pendingPauses: Number(pendingPauses) || 0,
    },
    byRole: roster.byRole || [],
    tools: [
      { id: "guida", href: "/staff/guida/", title: "Guida", desc: "Procedure ufficiali", icon: "book" },
      { id: "pause", href: "/staff/pause/", title: "Pause", desc: "Calendario e richieste", icon: "calendar" },
      { id: "inbox", href: "/staff/inbox/", title: "Inbox", desc: "Pause, candidature, appelli e resoconti", icon: "inbox" },
      { id: "ticket", href: "/staff/ticket/", title: "Ticket", desc: "Chat live ticket sul sito", icon: "ticket" },
    ],
  };
}

async function handleSiteStaffDashboardGet(client, req, res) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const access = await assertWebsiteStaffAccess(client, accessToken, { req });
    if (!access.ok) {
      return res.status(access.status).json({
        ok: false,
        error: access.error,
        message: access.message,
      });
    }

    const now = Date.now();
    const cacheKey = `${access.member.id}:${memberIsHighStaffEligible(access.member) ? "m" : "s"}`;
    if (dashCache && dashCache.key === cacheKey && dashCache.exp > now) {
      /* siteApiW6: ETag/304 on staff dashboard */
      return sendJsonWithEtag(req, res, dashCache.payload, {
        cacheControl: "private, no-cache",
        etag: dashCache.etag || weakEtagFromParts(["dash", cacheKey, dashCache.exp]),
      });
    }

    const payload = await buildDashboardPayload(client, access.member);
    if (!payload.ok) {
      return res.status(payload.status || 500).json(payload);
    }
    const etag = weakEtagFromJson(payload);
    dashCache = { key: cacheKey, exp: now + DASH_CACHE_TTL_MS, payload, etag };
    return sendJsonWithEtag(req, res, payload, {
      cacheControl: "private, no-cache",
      etag,
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-dashboard:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

module.exports = {
  handleSiteStaffDashboardGet,
  memberIsHighStaffEligible,
  memberHasDirectorRole,
  memberCanReviewAppelli,
};
