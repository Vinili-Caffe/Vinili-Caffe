"use strict";

const {
  getPublicPartnershipLeaderboard,
} = require("../../../MultiGuild/site/dashboard/siteDashboardLeaderboardApi") as typeof import("../../../MultiGuild/site/dashboard/siteDashboardLeaderboardApi");

async function handleSiteBotsLeaderboardGet(client?, req?, res?) {
  try {
    const query = req?.query && typeof req.query === "object" ? req.query : {};
    const selfUserId = String(query.userId || query.id || "").trim() || null;
    const out = await getPublicPartnershipLeaderboard(client, query, { selfUserId });
    const status = Number(out?.status) || (out?.ok ? 200 : 500);
    return res.status(status).json(out);
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-bots-leaderboard:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

export = { handleSiteBotsLeaderboardGet };
