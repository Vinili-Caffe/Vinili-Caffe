function isCandidatureWebsiteApiEnabled() {
  return ["1", "true", "yes", "on"].includes(String(process.env.WEBSITE_CANDIDATURE_HTTP || "").trim().toLowerCase());
}

function mountCandidatureWebhookRoutes(app?, client?, ctx: Record<string, any> = {}) {
  const normalizeHeaderSecret = ctx.normalizeHeaderSecret;
  const siteCandidatureCorsMiddleware = ctx.siteCandidatureCorsMiddleware;

  if (isCandidatureWebsiteApiEnabled()) {
    app.use(siteCandidatureCorsMiddleware);
    const { submitCandidatureWebsite, getCandidatureEligibilitySummary } = require("../../staff/candidature/candidatureApplicationHandlers") as typeof import("../../staff/candidature/candidatureApplicationHandlers");
    const { getWebsiteUnbanEligibility, submitWebsiteUnban } = require("../../staff/appeals/unbanWebsiteHandlers") as typeof import("../../staff/appeals/unbanWebsiteHandlers");
    const {
      getWebsiteUnmuteEligibility,
      submitWebsiteUnmute,
    } = require("../../staff/appeals/unmuteWebsiteHandlers") as typeof import("../../staff/appeals/unmuteWebsiteHandlers");
    app.get("/webhooks/site-candidature/eligibility", async (req?, res?) => {
      try {
        const accessToken = normalizeHeaderSecret(req.headers.authorization);
        if (!accessToken) {
          return res.status(401).json({ ok: false, error: "missing_token", message: "Header Authorization: Bearer <token> richiesto." });
        }
        const out = await getCandidatureEligibilitySummary(client, accessToken);
        return res.status(Number(out.status) || 500).json(out);
      } catch (err) {
        global.logger?.error?.("[WEBHOOK] site-candidature eligibility:", err);
        return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
      }
    });
    app.post("/webhooks/site-candidature", async (req?, res?) => {
      try {
        const accessToken = normalizeHeaderSecret(req.headers.authorization);
        if (!accessToken) {
          return res.status(401).json({ ok: false, error: "missing_token", message: "Header Authorization: Bearer <token> richiesto." });
        }
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const type = body.type;
        const answers = body.answers;
        const out = await submitCandidatureWebsite(client, { accessToken, type, answers });
        return res.status(Number(out.status) || 500).json(out);
      } catch (err) {
        global.logger?.error?.("[WEBHOOK] site-candidature:", err);
        return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
      }
    });
    app.get("/webhooks/site-unban/eligibility", async (req?, res?) => {
      try {
        res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
        res.set("Pragma", "no-cache");
        const accessToken = normalizeHeaderSecret(req.headers.authorization);
        if (!accessToken) {
          return res.status(401).json({ ok: false, error: "missing_token", message: "Header Authorization: Bearer <token> richiesto." });
        }
        const out = await getWebsiteUnbanEligibility(client, accessToken);
        return res.status(Number(out.status) || 500).json(out);
      } catch (err) {
        global.logger?.error?.("[WEBHOOK] site-unban eligibility:", err);
        return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
      }
    });
    app.post("/webhooks/site-unban", async (req?, res?) => {
      try {
        const accessToken = normalizeHeaderSecret(req.headers.authorization);
        if (!accessToken) {
          return res.status(401).json({ ok: false, error: "missing_token", message: "Header Authorization: Bearer <token> richiesto." });
        }
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const out = await submitWebsiteUnban(client, {
          accessToken,
          answers: body.answers,
          acceptedRules: body.acceptedRules,
        });
        return res.status(Number(out.status) || 500).json(out);
      } catch (err) {
        global.logger?.error?.("[WEBHOOK] site-unban:", err);
        return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
      }
    });
    app.get("/webhooks/site-unmute/eligibility", async (req?, res?) => {
      try {
        res.set("Cache-Control", "no-store, no-cache, must-revalidate, private");
        res.set("Pragma", "no-cache");
        const accessToken = normalizeHeaderSecret(req.headers.authorization);
        if (!accessToken) {
          return res.status(401).json({ ok: false, error: "missing_token", message: "Header Authorization: Bearer <token> richiesto." });
        }
        const out = await getWebsiteUnmuteEligibility(client, accessToken);
        return res.status(Number(out.status) || 500).json(out);
      } catch (err) {
        global.logger?.error?.("[WEBHOOK] site-unmute eligibility:", err);
        return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
      }
    });
    app.post("/webhooks/site-unmute", async (req?, res?) => {
      try {
        const accessToken = normalizeHeaderSecret(req.headers.authorization);
        if (!accessToken) {
          return res.status(401).json({ ok: false, error: "missing_token", message: "Header Authorization: Bearer <token> richiesto." });
        }
        const body = req.body && typeof req.body === "object" ? req.body : {};
        const out = await submitWebsiteUnmute(client, {
          accessToken,
          answers: body.answers,
          acceptedRules: body.acceptedRules,
        });
        return res.status(Number(out.status) || 500).json(out);
      } catch (err) {
        global.logger?.error?.("[WEBHOOK] site-unmute:", err);
        return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
      }
    });
  } else {
    const candidatureDisabledBody = {
      ok: false,
      error: "candidature_http_disabled",
      message:
        "API candidature sito disattivata: nel .env del bot imposta WEBSITE_CANDIDATURE_HTTP=1 e riavvia. Se il sito statico e il bot usano la stessa porta (es. tutto su 3000), il POST colpisce `serve` e non Express: avvia il sito su un'altra porta (es. 5173) e lascia la webhookPort al bot.",
    };
    app.use(siteCandidatureCorsMiddleware);
    app.get("/webhooks/site-candidature/eligibility", (req?, res?) => res.status(503).json(candidatureDisabledBody));
    app.post("/webhooks/site-candidature", (req?, res?) => res.status(503).json(candidatureDisabledBody));
    app.get("/webhooks/site-unban/eligibility", (req?, res?) => res.status(503).json(candidatureDisabledBody));
    app.post("/webhooks/site-unban", (req?, res?) => res.status(503).json(candidatureDisabledBody));
    app.get("/webhooks/site-unmute/eligibility", (req?, res?) => res.status(503).json(candidatureDisabledBody));
    app.post("/webhooks/site-unmute", (req?, res?) => res.status(503).json(candidatureDisabledBody));
    global.logger?.warn?.(
      "[WEBHOOK] API sito disattive: WEBSITE_CANDIDATURE_HTTP disattivo — GET/POST su /webhooks/site-candidature, /webhooks/site-unban e /webhooks/site-unmute rispondono 503.",
    );
  }
}

export = { mountCandidatureWebhookRoutes, isCandidatureWebsiteApiEnabled };
