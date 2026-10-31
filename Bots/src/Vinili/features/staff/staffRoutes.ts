/** Rotte HTTP dell'area staff (accesso, pause, organico, compiti, profilo, PM, serata film, ticket staff…). */
function mountStaffRoutes(app?, client?, ctx: Record<string, any> = {}) {
  const { handleSiteStaffAccessGet } = require("../../Web/siteStaffAccessApi") as typeof import("../../Web/siteStaffAccessApi");
  const { handleSiteStaffPauseGet, handleSiteStaffPausePost } = require("../../Web/siteStaffPauseApi") as typeof import("../../Web/siteStaffPauseApi");
  const {
    handleSiteStaffCompitiGet,
    handleSiteStaffCompitiPost,
    handleSiteStaffCompitiFileGet,
  } = require("../../Web/siteStaffCompitiApi") as typeof import("../../Web/siteStaffCompitiApi");
  const { handleSiteStaffProfileGet } = require("../../Web/siteStaffProfileApi") as typeof import("../../Web/siteStaffProfileApi");
  const { handleSiteStaffGuideGet } = require("../../Web/siteStaffGuideApi") as typeof import("../../Web/siteStaffGuideApi");
  const { handleSiteStaffDashboardGet } = require("../../Web/siteStaffDashboardApi") as typeof import("../../Web/siteStaffDashboardApi");
  const { handleSiteStaffManageGet, handleSiteStaffManagePost } = require("../../Web/siteStaffManageApi") as typeof import("../../Web/siteStaffManageApi");
  const { handleSiteStaffOrganicoGet, handleSiteStaffOrganicoPost } = require("../../Web/siteStaffOrganicoApi") as typeof import("../../Web/siteStaffOrganicoApi");
  const { handleSiteStaffPmActionsPost } = require("../../Web/siteStaffPmActionsApi") as typeof import("../../Web/siteStaffPmActionsApi");
  const { handleSiteStaffValTradePost } = require("../../Web/siteStaffValTradeApi") as typeof import("../../Web/siteStaffValTradeApi");
  const { handleSiteStaffModLookupGet } = require("../../Web/siteStaffModApi") as typeof import("../../Web/siteStaffModApi");
  const {
    handleSiteStaffPmHubGet,
    handleSiteStaffTicketsGet,
    handleSiteStaffSerataFilmGet,
    handleSiteStaffSerataFilmPost,
  } = require("../../Web/siteStaffToolsApi") as typeof import("../../Web/siteStaffToolsApi");
  app.get("/webhooks/site-staff-access", (req?, res?) => handleSiteStaffAccessGet(client, req, res));
  app.get("/webhooks/site-staff-dashboard", (req?, res?) => handleSiteStaffDashboardGet(client, req, res));
  app.get("/webhooks/site-staff-manage", (req?, res?) => handleSiteStaffManageGet(client, req, res));
  app.post("/webhooks/site-staff-manage", (req?, res?) => handleSiteStaffManagePost(client, req, res));
  app.get("/webhooks/site-staff-organico", (req?, res?) => handleSiteStaffOrganicoGet(client, req, res));
  app.post("/webhooks/site-staff-organico", (req?, res?) => handleSiteStaffOrganicoPost(client, req, res));
  app.get("/webhooks/site-staff-pause", (req?, res?) => handleSiteStaffPauseGet(client, req, res));
  app.post("/webhooks/site-staff-pause", (req?, res?) => handleSiteStaffPausePost(client, req, res));
  app.get("/webhooks/site-staff-compiti", (req?, res?) => handleSiteStaffCompitiGet(client, req, res));
  app.post("/webhooks/site-staff-compiti", (req?, res?) => handleSiteStaffCompitiPost(client, req, res));
  app.get("/webhooks/site-staff-compiti/files/:weekKey/:userId/:fileName", (req?, res?) =>
    handleSiteStaffCompitiFileGet(client, req, res),
  );
  app.get("/webhooks/site-staff-profile", (req?, res?) => handleSiteStaffProfileGet(client, req, res));
  app.get("/webhooks/site-staff-pm-hub", (req?, res?) => handleSiteStaffPmHubGet(client, req, res));
  app.get("/webhooks/site-staff-tickets", (req?, res?) => handleSiteStaffTicketsGet(client, req, res));
  app.get("/webhooks/site-staff-seratafilm", (req?, res?) => handleSiteStaffSerataFilmGet(client, req, res));
  app.post("/webhooks/site-staff-seratafilm", (req?, res?) => handleSiteStaffSerataFilmPost(client, req, res));
  app.get("/webhooks/site-staff-guide", (req?, res?) => handleSiteStaffGuideGet(client, req, res));
  app.post("/webhooks/site-staff-pm-actions", (req?, res?) => handleSiteStaffPmActionsPost(client, req, res));
  const {
    handleSiteStaffPmShopPost,
    handleSiteStaffPmShopGet,
  } = require("../../Web/siteStaffPmShopApi") as typeof import("../../Web/siteStaffPmShopApi");
  app.get("/webhooks/site-staff-pm-shop", (req?, res?) => handleSiteStaffPmShopGet(client, req, res));
  app.post("/webhooks/site-staff-pm-shop", (req?, res?) => handleSiteStaffPmShopPost(client, req, res));
  const {
    handleSiteStaffPmPointsRemovedGet,
    handleSiteStaffPmPointsRemovedPost,
  } = require("../../Web/siteStaffPmPointsRemovedApi") as typeof import("../../Web/siteStaffPmPointsRemovedApi");
  app.get("/webhooks/site-staff-pm-points-removed", (req?, res?) =>
    handleSiteStaffPmPointsRemovedGet(client, req, res),
  );
  app.post("/webhooks/site-staff-pm-points-removed", (req?, res?) =>
    handleSiteStaffPmPointsRemovedPost(client, req, res),
  );
  app.post("/webhooks/site-staff-valtrade", (req?, res?) => handleSiteStaffValTradePost(client, req, res));
  app.get("/webhooks/site-staff-mod", (req?, res?) => handleSiteStaffModLookupGet(client, req, res));
}

export = { mountStaffRoutes };
