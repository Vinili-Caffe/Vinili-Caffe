function mountPrefsBootWebhookRoutes(app?, client?) {
  const {
    handleSiteSeratafilmAccessGet,
    handleSiteSeratafilmFilmGet,
  } = require("../siteSeratafilmAccessApi") as typeof import("../siteSeratafilmAccessApi");
  const {
    handleSiteChromePrefsGet,
    handleSiteChromePrefsPost,
  } = require("../siteChromePrefsApi") as typeof import("../siteChromePrefsApi");
  const { handleSiteCookieConsentGet } = require("../siteCookieConsentApi") as typeof import("../siteCookieConsentApi");
  const {
    handleSiteAgeAttestGet,
    handleSiteAgeAttestPost,
  } = require("../siteAgeAttestApi") as typeof import("../siteAgeAttestApi");

  app.get("/webhooks/site-seratafilm-access", (req?, res?) => handleSiteSeratafilmAccessGet(client, req, res));
  app.get("/webhooks/site-seratafilm-film", (req?, res?) => handleSiteSeratafilmFilmGet(client, req, res));
  app.get("/webhooks/site-chrome-prefs", (req?, res?) => handleSiteChromePrefsGet(client, req, res));
  app.post("/webhooks/site-chrome-prefs", (req?, res?) => handleSiteChromePrefsPost(client, req, res));
  /* siteClientErrors1: errori JavaScript dei visitatori → logs/site-client-errors.log */
  app.post("/webhooks/site-client-error", (req?, res?) => {
    const { handleSiteClientErrorPost } = require("../siteClientErrorsApi") as typeof import("../siteClientErrorsApi");
    return handleSiteClientErrorPost(req, res);
  });
  app.get("/webhooks/site-client-error/recent", (req?, res?) => {
    const { handleSiteClientErrorRecent } = require("../siteClientErrorsApi") as typeof import("../siteClientErrorsApi");
    return handleSiteClientErrorRecent(req, res);
  });
  app.get("/webhooks/site-cookie-consent", (req?, res?) => handleSiteCookieConsentGet(client, req, res));
  /* siteAgeAttest1: autodichiarazione età (server-side, immutabile) */
  app.get("/webhooks/site-age-attest", (req?, res?) => handleSiteAgeAttestGet(client, req, res));
  app.post("/webhooks/site-age-attest", (req?, res?) => handleSiteAgeAttestPost(client, req, res));
  /* siteBoot1: me skim + unread + theme/prefs in un round-trip */
  try {
    const { handleSiteBootGet } = require("../siteBootApi") as typeof import("../siteBootApi");
    app.get("/webhooks/site-boot", (req?, res?) => handleSiteBootGet(client, req, res));
  } catch (eBootRoute) {
    global.logger?.warn?.("[WEBHOOK] site-boot mount skipped:", eBootRoute?.message || eBootRoute);
  }
}

export = { mountPrefsBootWebhookRoutes };
