function mountRolesWebhookRoutes(app?, client?, ctx: Record<string, any> = {}) {
  const normalizeHeaderSecret = ctx.normalizeHeaderSecret;
  const { handleSiteRolesGet } = require("../siteRolesApi") as typeof import("../siteRolesApi");
  const { submitSiteRoleRequest, leaveSiteRole, getSiteRoleRequestStates } = require("../siteRoleRequestApi") as typeof import("../siteRoleRequestApi");

  app.get("/webhooks/site-roles", (req?, res?) => {
    return handleSiteRolesGet(client, req, res);
  });
  app.get("/webhooks/site-roles/request-state", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const out = await getSiteRoleRequestStates(client, { accessToken });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-roles request-state:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-roles/request", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const out = await submitSiteRoleRequest(client, {
        accessToken,
        roleId: body.roleId,
        reason: body.reason,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-roles request:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
  app.post("/webhooks/site-roles/leave", async (req?, res?) => {
    try {
      const accessToken = normalizeHeaderSecret(req.headers.authorization);
      if (!accessToken) {
        return res.status(401).json({
          ok: false,
          error: "missing_token",
          message: "Header Authorization: Bearer <token> richiesto.",
        });
      }
      const body = req.body && typeof req.body === "object" ? req.body : {};
      const out = await leaveSiteRole(client, {
        accessToken,
        roleId: body.roleId,
      });
      return res.status(Number(out.status) || 500).json(out);
    } catch (err) {
      global.logger?.error?.("[WEBHOOK] site-roles leave:", err);
      return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
    }
  });
}

export = { mountRolesWebhookRoutes };
