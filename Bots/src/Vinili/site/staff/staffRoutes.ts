/** Rotte HTTP dell'area staff (accesso, pause, organico, compiti, profilo, PM, serata film, ticket staff…). */
function mountStaffRoutes(app?, client?, ctx: Record<string, any> = {}) {
  const { handleSiteStaffAccessGet } = require("./siteStaffAccessApi") as typeof import("./siteStaffAccessApi");
  const { handleSiteStaffPauseGet, handleSiteStaffPausePost } = require("./siteStaffPauseApi") as typeof import("./siteStaffPauseApi");
  const {
    handleSiteStaffCompitiGet,
    handleSiteStaffCompitiPost,
    handleSiteStaffCompitiFileGet,
  } = require("./siteStaffCompitiApi") as typeof import("./siteStaffCompitiApi");
  const { handleSiteStaffProfileGet } = require("./siteStaffProfileApi") as typeof import("./siteStaffProfileApi");
  const { handleSiteStaffGuideGet } = require("./siteStaffGuideApi") as typeof import("./siteStaffGuideApi");
  const { handleSiteStaffDashboardGet } = require("./siteStaffDashboardApi") as typeof import("./siteStaffDashboardApi");
  const { handleSiteStaffManageGet, handleSiteStaffManagePost } = require("./siteStaffManageApi") as typeof import("./siteStaffManageApi");
  const { handleSiteStaffOrganicoGet, handleSiteStaffOrganicoPost } = require("./siteStaffOrganicoApi") as typeof import("./siteStaffOrganicoApi");
  const { handleSiteStaffPmActionsPost } = require("../../Partner/site/siteStaffPmActionsApi") as typeof import("../../Partner/site/siteStaffPmActionsApi");
  const { handleSiteStaffValTradePost } = require("./siteStaffValTradeApi") as typeof import("./siteStaffValTradeApi");
  const { handleSiteStaffModLookupGet } = require("./siteStaffModApi") as typeof import("./siteStaffModApi");
  const {
    handleSiteStaffPmHubGet,
    handleSiteStaffTicketsGet,
    handleSiteStaffSerataFilmGet,
    handleSiteStaffSerataFilmPost,
  } = require("./siteStaffToolsApi") as typeof import("./siteStaffToolsApi");
  app.get("/webhooks/site-staff-access", (req?, res?) => handleSiteStaffAccessGet(client, req, res));
  app.get("/webhooks/site-view-as/roles", (req?, res?) => {
    const { handleViewAsRolesGet } = require("../http/siteViewAsPreview") as typeof import("../http/siteViewAsPreview");
    return handleViewAsRolesGet(client, req, res);
  });
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
  } = require("../../Partner/site/siteStaffPmShopApi") as typeof import("../../Partner/site/siteStaffPmShopApi");
  app.get("/webhooks/site-staff-pm-shop", (req?, res?) => handleSiteStaffPmShopGet(client, req, res));
  app.post("/webhooks/site-staff-pm-shop", (req?, res?) => handleSiteStaffPmShopPost(client, req, res));
  const {
    handleSiteStaffPmPointsRemovedGet,
    handleSiteStaffPmPointsRemovedPost,
  } = require("../../Partner/site/siteStaffPmPointsRemovedApi") as typeof import("../../Partner/site/siteStaffPmPointsRemovedApi");
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
