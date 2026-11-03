function mountUsersLeaderboardWebhookRoutes(app?, client?) {
  const { handleSiteUsersLeaderboardGet } = require("../siteUsersLeaderboardApi") as typeof import("../siteUsersLeaderboardApi");
  app.get("/webhooks/site-users", (req?, res?) => {
    return handleSiteUsersLeaderboardGet(client, req, res);
  });
}

function mountVoteWordleWebhookRoutes(app?, client?) {
  const { handleSiteVoteGet } = require("../siteVoteApi") as typeof import("../siteVoteApi");
  const { handleSiteWordleTodayGet, handleSiteWordleGuessPost } = require("../siteWordleApi") as typeof import("../siteWordleApi");

  app.get("/webhooks/site-vote", (req?, res?) => {
    return handleSiteVoteGet(client, req, res);
  });
  app.get("/webhooks/site-wordle/today", (req?, res?) => handleSiteWordleTodayGet(client, req, res));
  app.post("/webhooks/site-wordle/guess", (req?, res?) => handleSiteWordleGuessPost(client, req, res));
  /* wordleStatsSync1: statistiche Wordle sul profilo (stesse su telefono e PC) */
  app.get("/webhooks/site-wordle/stats", (req?, res?) => require("../siteWordleStatsApi").handleSiteWordleStatsGet(client, req, res));
  app.post("/webhooks/site-wordle/stats", (req?, res?) => require("../siteWordleStatsApi").handleSiteWordleStatsPost(client, req, res));
  /* wordleDailySync1: partita del giorno sul profilo (no rifarla da altro device) */
  app.get("/webhooks/site-wordle/daily", (req?, res?) => require("../siteWordleDailyApi").handleSiteWordleDailyGet(client, req, res));
  app.post("/webhooks/site-wordle/daily", (req?, res?) => require("../siteWordleDailyApi").handleSiteWordleDailyPost(client, req, res));
}

export = { mountUsersLeaderboardWebhookRoutes, mountVoteWordleWebhookRoutes };
