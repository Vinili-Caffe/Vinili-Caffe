const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const Ticket = require("../../Schemas/Ticket/ticketSchema");
const {
  resolveStaffProfileKind,
  resolveStaffPartnerPointsDisplay,
  PROFILE_PM_ONLY,
} = require("../../Utils/Staff/staffProfilePanelRuntime") as typeof import("../../Utils/Staff/staffProfilePanelRuntime");
const {
  resolvePartnerPointsShown,
  resolvePartnerTotalEarned,
} = require("../../Utils/Staff/partnerPointsDisplayUtils") as typeof import("../../Utils/Staff/partnerPointsDisplayUtils");
const {
  TOP_LIMIT,
  fetchSortedPartners,
  pickTopPartnerRowsInGuild,
} = require("../../Utils/Partner/partnerLeaderboardRuntime") as typeof import("../../Utils/Partner/partnerLeaderboardRuntime");
const { listPartnershipBlacklistGuilds } = require("../../Services/Partner/partnershipBlacklistService") as typeof import("../../Services/Partner/partnershipBlacklistService");
const {
  resolveSerataFilmAttendanceForWeek,
  setSerataFilmWillAttend,
  canEditSerataFilmAttendance,
} = require("../../Utils/Staff/serataFilmAttendanceUtils") as typeof import("../../Utils/Staff/serataFilmAttendanceUtils");
const {
  STAFF_HIGH_STAFF_ELIGIBLE_KEYS,
  memberHasAnyRoleKey,
} = require("../../Utils/Staff/staffRoleHierarchy") as typeof import("../../Utils/Staff/staffRoleHierarchy");
const { assertWebsiteStaffAccess, normalizeHeaderSecret } = require("./siteStaffAccessApi") as typeof import("./siteStaffAccessApi");
const { buildPmShopCatalogForWeb } = require("./siteStaffPmShopApi") as typeof import("./siteStaffPmShopApi");
const { memberIsPm } = require("./siteStaffRosterCache") as typeof import("./siteStaffRosterCache");
const { sendJsonWithEtag, weakEtagFromParts } = require("../../Web/siteHttpEtag") as typeof import("../../Web/siteHttpEtag");
const { resolveWebUserIdentitiesBatch } = require("../../Web/siteWebUserIdentity") as typeof import("../../Web/siteWebUserIdentity");
const { memberCanManagePartnerManagers } = require("../tickets/discord/ticketPartnershipStaffRoles") as typeof import("../tickets/discord/ticketPartnershipStaffRoles");

function memberIsHighStaff(member?) {
  return memberHasAnyRoleKey(member, STAFF_HIGH_STAFF_ELIGIBLE_KEYS);
}

async function handleSiteStaffPmHubGet(client?, req?, res?) {
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
    const guildId = String(IDs.guilds.main || "");
    const guild = await client.guilds.fetch(guildId).catch(() => null);
    if (!guild) {
      return res.status(503).json({ ok: false, error: "guild_unavailable", message: "Server non disponibile." });
    }
    const member = access.member;
    const isPm = memberIsPm(member);
    const isHighStaff = memberIsHighStaff(member);
    const canManagePm = memberCanManagePartnerManagers(member);
    const modeRaw = String(req.query?.lb || req.query?.mode || "totale").toLowerCase();
    const mode = modeRaw === "settimanale" || modeRaw === "weekly" ? "settimanale" : "totale";

    const doc = await ActivityUserProfile.findOne({ guildId, userId: String(member.id) })
      .select("staff")
      .lean()
      .catch(() => null);
    const staff = doc?.staff || {};

    const sortedAll = await fetchSortedPartners(guild, mode === "settimanale");
    const visible = await pickTopPartnerRowsInGuild(sortedAll, guild, TOP_LIMIT);
    const ids = visible.map((row?) => String(row.userId || "").trim()).filter(Boolean);
    const identities = await resolveWebUserIdentitiesBatch(client, guild, ids, {
      cap: TOP_LIMIT + 5,
      budgetMs: 3500,
    });
    const rows = [];
    for (let i = 0; i < visible.length; i += 1) {
      const row = visible[i];
      const uid = String(row.userId || "").trim();
      const id = identities.get(uid) || {
        userId: uid,
        displayName: "Utente",
        username: "",
        avatarUrl: "",
      };
      rows.push({
        rank: i + 1,
        userId: uid,
        displayName: id.displayName,
        username: id.username,
        avatarUrl: id.avatarUrl,
        score: Math.max(0, Math.floor(Number(row.score) || 0)),
      });
    }

    let blacklist = { count: 0, items: [] };
    if (isPm || canManagePm) {
      const items = await listPartnershipBlacklistGuilds(100).catch(() => []);
      blacklist = {
        count: items.length,
        items: (items || []).map((it?) => ({
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

    const pointsSpendable = Math.max(0, Math.floor(Number(resolvePartnerPointsShown(staff) || 0)));
    res.setHeader("Cache-Control", "private, max-age=20");
    return res.status(200).json({
      ok: true,
      me: {
        isPm,
        isHighStaff,
        canManagePm,
        pointsEarned: Math.max(0, Math.floor(Number(resolvePartnerTotalEarned(staff) || resolveStaffPartnerPointsDisplay(staff) || 0))),
        pointsSpendable,
        partnerCount: Math.max(0, Math.floor(Number(staff.partnerCount || 0))),
        redeemSpend: Math.max(0, Math.floor(Number(staff.partnerRedeemSpend || 0))),
        shop: isPm ? buildPmShopCatalogForWeb(pointsSpendable) : null,
      },
      leaderboard: { mode, rows },
      blacklist,
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-pm-hub:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteStaffTicketsGet(client?, req?, res?) {
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
    const guildId = String(IDs.guilds.main || "");
    const mine = String(req.query?.mine || "") === "1";
    const unclaimed = String(req.query?.unclaimed || "") === "1";
    const filter: Record<string, any> = { guildId, open: true };
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

    const sorted = (Array.isArray(rows) ? rows : []).slice().sort((a?, b?) => {
      const ta = a?.createdAt ? new Date(a.createdAt).getTime() : 0;
      const tb = b?.createdAt ? new Date(b.createdAt).getTime() : 0;
      return ta - tb;
    });
    const limited = sorted.slice(0, 120);

    const tickets = limited.map((t?) => ({
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

    const payload = {
      ok: true,
      guildId,
      count: tickets.length,
      tickets,
      filters: { mine, unclaimed },
    };
    /* siteApiW8: ETag/304 on discord staff tickets list poll */
    const etag = weakEtagFromParts([
      "stt",
      guildId,
      access.member.id,
      mine ? "1" : "0",
      unclaimed ? "1" : "0",
      tickets.length,
      tickets
        .map((t?) => `${t.id}:${t.claimedBy || ""}:${t.createdAt || ""}`)
        .join(",")
        .slice(0, 180),
    ]);
    return sendJsonWithEtag(req, res, payload, {
      cacheControl: "private, no-cache",
      etag,
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-tickets:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteStaffSerataFilmGet(client?, req?, res?) {
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

async function handleSiteStaffSerataFilmPost(client?, req?, res?) {
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
    const userId = String(access.member.id);
    const result = await setSerataFilmWillAttend(guildId, userId, willAttend);
    if (!result?.ok) {
      return res.status(400).json({
        ok: false,
        error: result?.code || "failed",
        message: "Impossibile aggiornare la presenza.",
      });
    }
    try {
      const { clearStaffProfileCacheForUser } = require("./siteStaffProfileApi") as typeof import("./siteStaffProfileApi");
      clearStaffProfileCacheForUser(userId);
    } catch (eCache) {}
    try {
      const { broadcastSiteSerataChanged, broadcastSiteStaffProfileChanged } = require("../suggestions/siteSuggestionsBroadcast") as typeof import("../suggestions/siteSuggestionsBroadcast");
      broadcastSiteSerataChanged({ action: willAttend ? "attend" : "absent", userId });
      broadcastSiteStaffProfileChanged(userId, { action: "seratafilm" });
    } catch (_) {}
    const doc = await ActivityUserProfile.findOne({ guildId, userId })
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

export = {
  handleSiteStaffPmHubGet,
  handleSiteStaffTicketsGet,
  handleSiteStaffSerataFilmGet,
  handleSiteStaffSerataFilmPost,
};
