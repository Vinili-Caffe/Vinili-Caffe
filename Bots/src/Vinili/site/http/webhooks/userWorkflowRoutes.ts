function mountUserWorkflowWebhookRoutes(app?, client?) {
  const { handleSiteUserWorkflowsGet } = require("../siteUserWorkflowApi") as typeof import("../siteUserWorkflowApi");
  app.get("/webhooks/site-user-workflows", (req?, res?) => handleSiteUserWorkflowsGet(client, req, res));
}

export = { mountUserWorkflowWebhookRoutes };
