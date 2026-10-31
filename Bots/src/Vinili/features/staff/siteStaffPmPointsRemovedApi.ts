const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const {
  assertWebsiteStaffAccess,
  normalizeHeaderSecret,
} = require("./siteStaffAccessApi") as typeof import("./siteStaffAccessApi");
const { memberIsHighStaffForPointReview } = require("../../Utils/Partner/partnerPointContextUtils") as typeof import("../../Utils/Partner/partnerPointContextUtils");
const { reviewPartnerPointReport } = require("../../Utils/Partner/partnerPointReportReviewRuntime") as typeof import("../../Utils/Partner/partnerPointReportReviewRuntime");
const {
  listPmPointsRemovedEntries,
  findPmPointsRemovedEntry,
} = require("../../Utils/Partner/pmPointsRemovedStore") as typeof import("../../Utils/Partner/pmPointsRemovedStore");
const { resolveWebUserIdentitiesBatch, identityFallback } = require("../../Web/siteWebUserIdentity") as typeof import("../../Web/siteWebUserIdentity");

const DEFAULT_LIMIT = 25;
const MAX_LIMIT = 50;

async function enrichEntries(client?, guild?, entries?) {
  const ids = new Set();
  for (const entry of entries) {
    if (entry.pmUserId) ids.add(entry.pmUserId);
    if (entry.reporterUserId) ids.add(entry.reporterUserId);
    if (entry.actorUserId) ids.add(entry.actorUserId);
  }
  const profiles = await resolveWebUserIdentitiesBatch(client, guild, [...ids], {
    cap: 60,
    budgetMs: 4000,
  });
  const profileOrFallback = (userId?) => {
    const uid = String(userId || "").trim();
    if (!uid) return null;
    return profiles.get(uid) || identityFallback(uid);
  };
  return entries.map((entry?) => ({
    ...entry,
    pm: profileOrFallback(entry.pmUserId),
    reporter: entry.reporterUserId ? profileOrFallback(entry.reporterUserId) : null,
    actor: entry.actorUserId ? profileOrFallback(entry.actorUserId) : null,
  }));
}

async function handleSiteStaffPmPointsRemovedGet(client?, req?, res?) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const access = await assertWebsiteStaffAccess(client, accessToken, { req });
    if (!access.ok) {
      return res.status(access.status).json({ ok: false, error: access.error, message: access.message });
    }

    const before = String(req.query?.before || "").trim();
    const pmUserId = String(req.query?.pmUserId || req.query?.pm || "").trim();
    const q = String(req.query?.q || req.query?.search || "").trim().toLowerCase();
    const pendingOnly = ["1", "true", "yes"].includes(String(req.query?.pending || "").toLowerCase());
    let limit = Number(req.query?.limit);
    if (!Number.isFinite(limit) || limit <= 0) limit = DEFAULT_LIMIT;
    limit = Math.min(MAX_LIMIT, Math.max(1, Math.floor(limit)));

    const viewerId = String(access.member?.id || access.user?.id || "").trim();
    const canReview = memberIsHighStaffForPointReview(access.member);
    /* partnerPtChrono1: self vede la propria cronologia; HS vede (e review) chiunque */
    const isSelfScoped = Boolean(pmUserId && viewerId && pmUserId === viewerId);
    if (!isSelfScoped && !canReview) {
      return res.status(403).json({
        ok: false,
        error: "forbidden",
        message: "Puoi vedere solo i tuoi punti tolti, oppure essere High Staff.",
      });
    }

    const guildId = String(IDs.guilds.main || "");
    const guild =
      client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
    if (!guild) {
      return res.status(503).json({ ok: false, error: "guild_unavailable", message: "Server non disponibile." });
    }

    const scopedPmUserId = isSelfScoped ? viewerId : pmUserId || null;
    const listed = await listPmPointsRemovedEntries({
      guildId,
      limit,
      before: before || null,
      pendingOnly: canReview ? pendingOnly : false,
      pmUserId: scopedPmUserId,
      q: canReview ? q || null : null,
    });
    const enriched = await enrichEntries(client, guild, listed.items);

    res.setHeader("Cache-Control", "private, max-age=15");
    return res.status(200).json({
      ok: true,
      channelId: "",
      guildId,
      canReview,
      items: enriched,
      pagination: {
        limit,
        before: before || null,
        nextBefore: listed.nextBefore,
        hasMore: listed.hasMore,
      },
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-pm-points-removed GET:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

async function handleSiteStaffPmPointsRemovedPost(client?, req?, res?) {
  try {
    const accessToken = normalizeHeaderSecret(req.headers.authorization);
    const access = await assertWebsiteStaffAccess(client, accessToken, { req });
    if (!access.ok) {
      return res.status(access.status).json({ ok: false, error: access.error, message: access.message });
    }
    if (!memberIsHighStaffForPointReview(access.member)) {
      return res.status(403).json({
        ok: false,
        error: "forbidden",
        message: "Solo l'High Staff può gestire le segnalazioni.",
      });
    }

    const body = req.body && typeof req.body === "object" ? req.body : {};
    const action = String(body.action || "").trim().toLowerCase();
    const messageId = String(body.messageId || "").trim();
    if (!messageId) {
      return res.status(400).json({ ok: false, error: "invalid_message", message: "messageId non valido." });
    }
    if (action !== "confirm" && action !== "deny") {
      return res.status(400).json({ ok: false, error: "invalid_action", message: "Azione non valida." });
    }

    const guildId = String(IDs.guilds.main || "");
    const guild =
      client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
    if (!guild) {
      return res.status(503).json({ ok: false, error: "guild_unavailable", message: "Server non disponibile." });
    }

    const entry = await findPmPointsRemovedEntry(guildId, messageId);
    if (!entry || String(entry.status || "") !== "pending") {
      return res.status(409).json({
        ok: false,
        error: "not_pending",
        message: "Questa segnalazione non è più in attesa.",
      });
    }

    const result = await reviewPartnerPointReport({
      guild,
      entryId: messageId,
      isConfirm: action === "confirm",
      reviewerUserId: String(access.member.id),
      pmUserId: entry.pmUserId,
      reporterUserId: entry.reporterUserId,
    });
    if (!result.ok) {
      const status = result.error === "not_pm" || result.error === "points_failed" ? 400 : 500;
      return res.status(status).json({ ok: false, error: result.error, message: result.message });
    }

    return res.status(200).json({
      ok: true,
      action: result.action,
      message: result.message,
      pmUserId: result.pmUserId,
      total: result.total ?? null,
      spendable: result.spendable ?? null,
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-staff-pm-points-removed POST:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

export = {
  handleSiteStaffPmPointsRemovedGet,
  handleSiteStaffPmPointsRemovedPost,
};
