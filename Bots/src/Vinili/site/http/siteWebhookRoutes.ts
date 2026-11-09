const { mountWebTicketRoutes } = require("../../site/tickets/webTicketRoutes") as typeof import("../../site/tickets/webTicketRoutes");
const { mountDashboardTicketRoutes } = require("../../../MultiGuild/tickets/dashboard/dashboardTicketRoutes") as typeof import("../../../MultiGuild/tickets/dashboard/dashboardTicketRoutes");
const { mountBoardsRoutes } = require("../../site/boards/boardsRoutes") as typeof import("../../site/boards/boardsRoutes");
const { mountBachecaRoutes } = require("../../site/bacheca/bachecaRoutes") as typeof import("../../site/bacheca/bachecaRoutes");
const { mountSuggestionsRoutes } = require("../../site/suggestions/suggestionsRoutes") as typeof import("../../site/suggestions/suggestionsRoutes");
const { mountContestRoutes } = require("../../site/contest/contestRoutes") as typeof import("../../site/contest/contestRoutes");
const { mountWorkflowRoutes } = require("../../site/workflow/workflowRoutes") as typeof import("../../site/workflow/workflowRoutes");
const { mountNotificationsRoutes } = require("../../site/notifications/notificationsRoutes") as typeof import("../../site/notifications/notificationsRoutes");
const { mountStaffRoutes } = require("../../site/staff/staffRoutes") as typeof import("../../site/staff/staffRoutes");
const { mountDashboardRoutes } = require("../../../MultiGuild/site/dashboard/dashboardRoutes") as typeof import("../../../MultiGuild/site/dashboard/dashboardRoutes");
const { mountDashboardAuditMiddleware } = require("../../../MultiGuild/site/dashboard/dashboardAuditLog") as typeof import("../../../MultiGuild/site/dashboard/dashboardAuditLog");

const { replyJsonEtag } = require("./webhooks/replyJsonEtag") as typeof import("./webhooks/replyJsonEtag");
const { mountStaffApiNoStore } = require("./webhooks/staffApiNoStore") as typeof import("./webhooks/staffApiNoStore");
const { mountCandidatureWebhookRoutes } = require("./webhooks/candidatureRoutes") as typeof import("./webhooks/candidatureRoutes");
const { mountPublicMiscWebhookRoutes } = require("./webhooks/publicMiscRoutes") as typeof import("./webhooks/publicMiscRoutes");
const {
  mountUsersLeaderboardWebhookRoutes,
  mountVoteWordleWebhookRoutes,
} = require("./webhooks/engagementRoutes") as typeof import("./webhooks/engagementRoutes");
const { mountPrefsBootWebhookRoutes } = require("./webhooks/prefsBootRoutes") as typeof import("./webhooks/prefsBootRoutes");
const {
  mountDiscordMeWebhookRoutes,
  mountOauthStartWebhookRoutes,
} = require("./webhooks/oauthAuthRoutes") as typeof import("./webhooks/oauthAuthRoutes");
const { mountConfessionaleWebhookRoutes } = require("./webhooks/confessionaleRoutes") as typeof import("./webhooks/confessionaleRoutes");
const { mountUserWorkflowWebhookRoutes } = require("./webhooks/userWorkflowRoutes") as typeof import("./webhooks/userWorkflowRoutes");
const { mountLiveWikiWebhookRoutes } = require("./webhooks/liveWikiRoutes") as typeof import("./webhooks/liveWikiRoutes");
const { mountRolesWebhookRoutes } = require("./webhooks/rolesRoutes") as typeof import("./webhooks/rolesRoutes");
const { mountProfileWebhookRoutes } = require("./webhooks/profileRoutes") as typeof import("./webhooks/profileRoutes");
const { mountReviewsWebhookRoutes } = require("./webhooks/reviewsRoutes") as typeof import("./webhooks/reviewsRoutes");
const { mountEventoWebhookRoutes } = require("./webhooks/eventoRoutes") as typeof import("./webhooks/eventoRoutes");
const { mountDiscussionImagesWebhookRoutes } = require("./webhooks/discussionImagesRoutes") as typeof import("./webhooks/discussionImagesRoutes");
const { mountBotFeedbackWebhookRoutes } = require("./webhooks/botFeedbackRoutes") as typeof import("./webhooks/botFeedbackRoutes");

function mountSiteWebhookRoutes(app?, client?, deps?) {
  const normalizeHeaderSecret = deps.normalizeHeaderSecret;
  const siteCandidatureCorsMiddleware = deps.siteCorsMiddleware;
  const ctx = { normalizeHeaderSecret, replyJsonEtag, siteCandidatureCorsMiddleware };

  mountStaffApiNoStore(app);
  mountCandidatureWebhookRoutes(app, client, ctx);

  const {
    ensureBoardsVoteReminderScheduler,
    ensureBoardsStatsScheduler,
  } = require("../../site/boards/siteBoardsApi") as typeof import("../../site/boards/siteBoardsApi");
  try {
    ensureBoardsStatsScheduler(client);
  } catch (_) {}

  mountPublicMiscWebhookRoutes(app, client);
  mountUsersLeaderboardWebhookRoutes(app, client);
  mountBoardsRoutes(app, client, { replyJsonEtag, normalizeHeaderSecret });
  mountBachecaRoutes(app, client);
  mountVoteWordleWebhookRoutes(app, client);
  mountNotificationsRoutes(app, client);
  mountPrefsBootWebhookRoutes(app, client);
  mountDiscordMeWebhookRoutes(app, client, ctx);
  mountStaffRoutes(app, client);
  mountConfessionaleWebhookRoutes(app, client);
  mountWorkflowRoutes(app, client);
  mountUserWorkflowWebhookRoutes(app, client);
  mountWebTicketRoutes(app, client);
  mountOauthStartWebhookRoutes(app);
  mountLiveWikiWebhookRoutes(app, client, ctx);
  mountRolesWebhookRoutes(app, client, ctx);
  mountProfileWebhookRoutes(app, client, ctx);
  mountReviewsWebhookRoutes(app, client, ctx);

  /* boardsVoteFlow1 */
  try {
    ensureBoardsVoteReminderScheduler(client);
  } catch (_) {}
  mountContestRoutes(app, client, { normalizeHeaderSecret });

  mountEventoWebhookRoutes(app, client);
  mountDiscussionImagesWebhookRoutes(app);
  mountSuggestionsRoutes(app, client, { normalizeHeaderSecret, replyJsonEtag });
  mountBotFeedbackWebhookRoutes(app, client, ctx);
  /* registro modifiche: prima delle rotte della dashboard, così vede ogni scrittura */
  mountDashboardAuditMiddleware(app, { normalizeHeaderSecret });
  mountDashboardRoutes(app, client, { normalizeHeaderSecret });
  mountDashboardTicketRoutes(app, client, { normalizeHeaderSecret });
}

export = { mountSiteWebhookRoutes };
