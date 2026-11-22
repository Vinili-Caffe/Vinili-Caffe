function mountUsersLeaderboardWebhookRoutes(app?, client?) {
  const { handleSiteUsersLeaderboardGet } = require("../siteUsersLeaderboardApi") as typeof import("../siteUsersLeaderboardApi");
  const { handleSiteBotsLeaderboardGet } = require("../siteBotsLeaderboardApi") as typeof import("../siteBotsLeaderboardApi");
  app.get("/webhooks/site-users", (req?, res?) => {
    return handleSiteUsersLeaderboardGet(client, req, res);
  });
  app.get("/webhooks/site-bots-leaderboard", (req?, res?) => {
    return handleSiteBotsLeaderboardGet(client, req, res);
  });
}

function mountVoteWordleWebhookRoutes(app?, client?) {
  const { handleSiteVoteGet } = require("../siteVoteApi") as typeof import("../siteVoteApi");
  const {
    handleSiteWordleTodayGet,
    handleSiteWordleGuessPost,
    handleSiteWordleClaimPost,
    handleSiteWordleRemindPost,
  } = require("../siteWordleApi") as typeof import("../siteWordleApi");
  const {
    handleSiteWordleQuadTodayGet,
    handleSiteWordleQuadGuessPost,
    handleSiteWordleQuadClaimPost,
  } = require("../siteWordleQuadApi") as typeof import("../siteWordleQuadApi");

  app.get("/webhooks/site-vote", (req?, res?) => {
    return handleSiteVoteGet(client, req, res);
  });
  app.get("/webhooks/site-wordle/today", (req?, res?) => handleSiteWordleTodayGet(client, req, res));
  app.post("/webhooks/site-wordle/guess", (req?, res?) => handleSiteWordleGuessPost(client, req, res));
  app.post("/webhooks/site-wordle/claim", (req?, res?) => handleSiteWordleClaimPost(client, req, res));
  app.post("/webhooks/site-wordle/remind", (req?, res?) => handleSiteWordleRemindPost(client, req, res));
  /* wordleStatsSync1: statistiche Wordle sul profilo (stesse su telefono e PC) */
  app.get("/webhooks/site-wordle/stats", (req?, res?) => require("../siteWordleStatsApi").handleSiteWordleStatsGet(client, req, res));
  app.post("/webhooks/site-wordle/stats", (req?, res?) => require("../siteWordleStatsApi").handleSiteWordleStatsPost(client, req, res));
  /* wordleDailySync1: partita del giorno sul profilo (no rifarla da altro device) */
  app.get("/webhooks/site-wordle/daily", (req?, res?) => require("../siteWordleDailyApi").handleSiteWordleDailyGet(client, req, res));
  app.post("/webhooks/site-wordle/daily", (req?, res?) => require("../siteWordleDailyApi").handleSiteWordleDailyPost(client, req, res));

  /* Wordle ×4 (4 griglie simultanee) */
  app.get("/webhooks/site-wordle-quad/today", (req?, res?) => handleSiteWordleQuadTodayGet(client, req, res));
  app.post("/webhooks/site-wordle-quad/guess", (req?, res?) => handleSiteWordleQuadGuessPost(client, req, res));
  app.post("/webhooks/site-wordle-quad/claim", (req?, res?) => handleSiteWordleQuadClaimPost(client, req, res));
  app.get("/webhooks/site-wordle-quad/daily", (req?, res?) =>
    require("../siteWordleQuadDailyApi").handleSiteWordleQuadDailyGet(client, req, res),
  );
  app.post("/webhooks/site-wordle-quad/daily", (req?, res?) =>
    require("../siteWordleQuadDailyApi").handleSiteWordleQuadDailyPost(client, req, res),
  );
}

function mountMusicQuizWebhookRoutes(app?, client?) {
  const quiz = require("../siteMusicQuizApi") as typeof import("../siteMusicQuizApi");
  const packs = require("../siteMusicQuizPacksApi") as typeof import("../siteMusicQuizPacksApi");
  const scores = require("../siteMusicQuizScoresApi") as typeof import("../siteMusicQuizScoresApi");
  const comments = require("../siteMusicQuizCommentsApi") as typeof import("../siteMusicQuizCommentsApi");
  const party = require("../siteMusicQuizPartyApi") as typeof import("../siteMusicQuizPartyApi");

  app.get("/webhooks/site-music-quiz/hub", (req?, res?) => quiz.handleMusicQuizHubGet(client, req, res));
  app.get("/webhooks/site-music-quiz/search", (req?, res?) => quiz.handleMusicQuizSearchGet(client, req, res));
  /* copertine dei quiz salvate su disco quando il CDN non risponde */
  app.get("/webhooks/site-music-quiz/files/:userId/:fileName", (req?, res?) =>
    (require("../siteMusicQuizMeta") as typeof import("../siteMusicQuizMeta")).serveQuizCover(req, res),
  );
  /* import di una playlist Spotify / Apple Music / YouTube */
  app.get("/webhooks/site-music-quiz/import", (req?, res?) =>
    (require("../siteMusicQuizSpotify") as typeof import("../siteMusicQuizSpotify")).handleMusicQuizSpotifyImportGet(client, req, res),
  );
  app.get("/webhooks/site-music-quiz/artist/:id", (req?, res?) => quiz.handleMusicQuizArtistGet(client, req, res));
  app.get("/webhooks/site-music-quiz/playlist/:id", (req?, res?) => quiz.handleMusicQuizPlaylistGet(client, req, res));
  app.get("/webhooks/site-music-quiz/pack/:slug", (req?, res?) => packs.handleMusicQuizPackGet(client, req, res));
  app.post("/webhooks/site-music-quiz/pack", (req?, res?) => packs.handleMusicQuizPackCreatePost(client, req, res));
  app.post("/webhooks/site-music-quiz/session/start", (req?, res?) => quiz.handleMusicQuizSessionStartPost(client, req, res));
  app.post("/webhooks/site-music-quiz/session/answer", (req?, res?) => quiz.handleMusicQuizSessionAnswerPost(client, req, res));
  app.post("/webhooks/site-music-quiz/session/finish", (req?, res?) => quiz.handleMusicQuizSessionFinishPost(client, req, res));
  app.get("/webhooks/site-music-quiz/scores", (req?, res?) => scores.handleMusicQuizScoresGet(client, req, res));
  app.get("/webhooks/site-music-quiz/comments", (req?, res?) => comments.handleMusicQuizCommentsGet(client, req, res));
  app.post("/webhooks/site-music-quiz/comments", (req?, res?) => comments.handleMusicQuizCommentsPost(client, req, res));
  app.post("/webhooks/site-music-quiz/party", (req?, res?) => party.handleMusicQuizPartyCreatePost(client, req, res));
  app.get("/webhooks/site-music-quiz/party/:roomId", (req?, res?) => party.handleMusicQuizPartyGet(client, req, res));
  app.post("/webhooks/site-music-quiz/party/:roomId/join", (req?, res?) => party.handleMusicQuizPartyJoinPost(client, req, res));
  app.post("/webhooks/site-music-quiz/party/:roomId/action", (req?, res?) => party.handleMusicQuizPartyActionPost(client, req, res));
}

export = { mountUsersLeaderboardWebhookRoutes, mountVoteWordleWebhookRoutes, mountMusicQuizWebhookRoutes };
