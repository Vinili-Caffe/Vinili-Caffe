"use strict";

const {
  getPublicPartnershipLeaderboard,
  listViewerPmGuilds,
} = require("../../../MultiGuild/site/dashboard/siteDashboardLeaderboardApi") as typeof import("../../../MultiGuild/site/dashboard/siteDashboardLeaderboardApi");

function bearerToken(req?) {
  const auth = String(req?.headers?.authorization || "").trim();
  return auth.toLowerCase().startsWith("bearer ") ? auth.slice(7).trim() : "";
}

async function handleSiteBotsLeaderboardGet(client?, req?, res?) {
  try {
    const query = req?.query && typeof req.query === "object" ? req.query : {};
    const token = bearerToken(req);
    const listMode = String(query.list || query.mode || "").trim().toLowerCase();

    if (listMode === "pm-guilds" || listMode === "pmguilds") {
      if (!token) {
        return res.status(401).json({ ok: false, error: "missing_token", message: "Accedi per vedere i tuoi server PM." });
      }
      const out = await listViewerPmGuilds(client, token);
      const status = Number(out?.status) || (out?.ok ? 200 : 500);
      return res.status(status).json(out);
    }

    const selfUserId = String(query.userId || query.id || "").trim() || null;
    const out = await getPublicPartnershipLeaderboard(client, query, {
      selfUserId,
      accessToken: token || null,
    });
    const status = Number(out?.status) || (out?.ok ? 200 : 500);
    return res.status(status).json(out);
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-bots-leaderboard:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

export = { handleSiteBotsLeaderboardGet };
