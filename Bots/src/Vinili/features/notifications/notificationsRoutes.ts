/** Rotte HTTP delle notifiche del sito. */
function mountNotificationsRoutes(app?, client?, ctx: Record<string, any> = {}) {
  const {
    handleSiteNotificationsGet,
    handleSiteNotificationsMarkReadPost,
    handleSiteNotificationsClearPost,
    handleSiteNotificationsDeletePost,
    handleSiteNotificationsPushVapidGet,
    handleSiteNotificationsPushSubscribePost,
    handleSiteNotificationsPushShownPost,
    handleSiteNotificationsPushUnsubscribePost,
    handleSiteNotificationsPushTestPost,
  } = require("../../Web/siteInAppNotificationsApi") as typeof import("../../Web/siteInAppNotificationsApi");
  app.get("/webhooks/site-notifications", (req?, res?) => {
    return handleSiteNotificationsGet(client, req, res);
  });
  app.post("/webhooks/site-notifications/read", (req?, res?) => {
    return handleSiteNotificationsMarkReadPost(client, req, res);
  });
  app.post("/webhooks/site-notifications/clear", (req?, res?) => {
    return handleSiteNotificationsClearPost(client, req, res);
  });
  app.post("/webhooks/site-notifications/delete", (req?, res?) => {
    return handleSiteNotificationsDeletePost(client, req, res);
  });
  app.get("/webhooks/site-notifications/push/vapid-public-key", (req?, res?) => {
    return handleSiteNotificationsPushVapidGet(client, req, res);
  });
  app.post("/webhooks/site-notifications/push/subscribe", (req?, res?) => {
    return handleSiteNotificationsPushSubscribePost(client, req, res);
  });
  app.post("/webhooks/site-notifications/push/shown", (req?, res?) => {
    return handleSiteNotificationsPushShownPost(client, req, res);
  });
  app.post("/webhooks/site-notifications/push/unsubscribe", (req?, res?) => {
    return handleSiteNotificationsPushUnsubscribePost(client, req, res);
  });
  app.post("/webhooks/site-notifications/push/test", (req?, res?) => {
    return handleSiteNotificationsPushTestPost(client, req, res);
  });
}

export = { mountNotificationsRoutes };
