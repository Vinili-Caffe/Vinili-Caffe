const IDs = require("../Config/ids");
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas");

const PAY = SITE_DOCUMENT_TYPE.PAYMENT;
const { resolveWebsiteGuildMember } = require("./siteRoleRequestApi");
const { enqueueSiteInAppNotification } = require("./siteInAppNotificationsService");

function resolveGuildId(client) {
  return String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
}

function isPaypalLiveEnv() {
  const raw = String(process.env.PAYPAL_ENV || process.env.PAYPAL_MODE || "sandbox").trim().toLowerCase();
  return raw === "live" || raw === "production" || raw === "prod";
}

function getPaypalApiBase() {
  return isPaypalLiveEnv() ? "https://api-m.paypal.com" : "https://api-m.sandbox.paypal.com";
}

function getPaypalClientCredentials() {
  const clientId = String(process.env.PAYPAL_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.PAYPAL_CLIENT_SECRET || "").trim();
  return { clientId, clientSecret };
}

function normalizeMoneyAmount(value) {
  const n = Number(value);
  if (!Number.isFinite(n) || n <= 0) return "0.00";
  return n.toFixed(2);
}

function buildPlanCatalog() {
  return {
    sponsor_news_forever: { key: "sponsor_news_forever", label: "Sponsor canale news", amount: "6.00", currency: "EUR" },
    sponsor_site_7: { key: "sponsor_site_7", label: "Sponsor sul sito 7 giorni", amount: "10.00", currency: "EUR" },
    sponsor_site_14: { key: "sponsor_site_14", label: "Sponsor sul sito 14 giorni", amount: "20.00", currency: "EUR" },
    sponsor_site_30: { key: "sponsor_site_30", label: "Sponsor sul sito 30 giorni", amount: "30.00", currency: "EUR" },
    sponsor_film_night: { key: "sponsor_film_night", label: "Sponsor durante serata film", amount: "2.50", currency: "EUR" },
    donation_5: { key: "donation_5", label: "Donazione supporto 5 euro", amount: "5.00", currency: "EUR" },
    donation_10: { key: "donation_10", label: "Donazione supporto 10 euro", amount: "10.00", currency: "EUR" },
    donation_20: { key: "donation_20", label: "Donazione supporto 20 euro", amount: "20.00", currency: "EUR" },
  };
}

async function fetchPaypalAccessToken() {
  const { clientId, clientSecret } = getPaypalClientCredentials();
  if (!clientId || !clientSecret) {
    return {
      ok: false,
      status: 503,
      error: "paypal_not_configured",
      message: "PayPal non configurato sul server.",
    };
  }
  const basic = Buffer.from(`${clientId}:${clientSecret}`).toString("base64");
  let res;
  try {
    res = await fetch(`${getPaypalApiBase()}/v1/oauth2/token`, {
      method: "POST",
      headers: {
        Authorization: `Basic ${basic}`,
        "Content-Type": "application/x-www-form-urlencoded",
      },
      body: "grant_type=client_credentials",
    });
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error: "paypal_unreachable",
      message: "Impossibile contattare PayPal.",
      details: err?.message || String(err || ""),
    };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok || !String(data?.access_token || "").trim()) {
    return {
      ok: false,
      status: 502,
      error: "paypal_oauth_failed",
      message: "Autenticazione PayPal fallita.",
      details: data,
    };
  }
  return { ok: true, accessToken: String(data.access_token).trim() };
}

async function paypalApiRequest(path, { method = "GET", body = null, headers = {} } = {}) {
  const tokenResult = await fetchPaypalAccessToken();
  if (!tokenResult.ok) return tokenResult;
  const reqHeaders = {
    Authorization: `Bearer ${tokenResult.accessToken}`,
    ...headers,
  };
  if (body != null && !reqHeaders["Content-Type"]) {
    reqHeaders["Content-Type"] = "application/json";
  }
  let res;
  try {
    res = await fetch(`${getPaypalApiBase()}${path}`, {
      method,
      headers: reqHeaders,
      ...(body != null ? { body: JSON.stringify(body) } : {}),
    });
  } catch (err) {
    return {
      ok: false,
      status: 502,
      error: "paypal_unreachable",
      message: "Impossibile contattare PayPal.",
      details: err?.message || String(err || ""),
    };
  }
  const data = await res.json().catch(() => ({}));
  if (!res.ok) {
    return {
      ok: false,
      status: Number(res.status) || 502,
      error: "paypal_request_failed",
      message: "Richiesta PayPal fallita.",
      details: data,
    };
  }
  return { ok: true, status: Number(res.status) || 200, data };
}

function extractApproveUrl(orderData) {
  const links = Array.isArray(orderData?.links) ? orderData.links : [];
  const row = links.find((x) => String(x?.rel || "").toLowerCase() === "approve");
  return String(row?.href || "").trim();
}

function buildPaypalCustomId({ guildId, userId, planKey }) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  const pk = String(planKey || "").trim();
  return `${gid}:${uid}:${pk}`.slice(0, 127);
}

function parseCustomId(value) {
  const raw = String(value || "").trim();
  const parts = raw.split(":");
  if (parts.length < 3) return { guildId: "", userId: "", planKey: "" };
  return {
    guildId: String(parts[0] || "").trim(),
    userId: String(parts[1] || "").trim(),
    planKey: String(parts.slice(2).join(":") || "").trim(),
  };
}

function normalizeWebhookHeaders(headers = {}) {
  const get = (name) => String(headers[name] || headers[name.toLowerCase()] || "").trim();
  return {
    transmissionId: get("paypal-transmission-id"),
    transmissionTime: get("paypal-transmission-time"),
    certUrl: get("paypal-cert-url"),
    authAlgo: get("paypal-auth-algo"),
    transmissionSig: get("paypal-transmission-sig"),
  };
}

async function verifyPaypalWebhookSignature(webhookEvent, headers) {
  const webhookId = String(process.env.PAYPAL_WEBHOOK_ID || "").trim();
  if (!webhookId) return { ok: true, skipped: true };
  const h = normalizeWebhookHeaders(headers);
  if (!h.transmissionId || !h.transmissionTime || !h.certUrl || !h.authAlgo || !h.transmissionSig) {
    return { ok: false, status: 400, error: "missing_signature_headers", message: "Header firma PayPal mancanti." };
  }
  const verify = await paypalApiRequest("/v1/notifications/verify-webhook-signature", {
    method: "POST",
    body: {
      auth_algo: h.authAlgo,
      cert_url: h.certUrl,
      transmission_id: h.transmissionId,
      transmission_sig: h.transmissionSig,
      transmission_time: h.transmissionTime,
      webhook_id: webhookId,
      webhook_event: webhookEvent,
    },
  });
  if (!verify.ok) {
    return {
      ok: false,
      status: Number(verify.status) || 502,
      error: "signature_verification_failed",
      message: "Verifica firma webhook PayPal fallita.",
      details: verify.details || verify.data || null,
    };
  }
  const status = String(verify.data?.verification_status || "").trim().toUpperCase();
  if (status !== "SUCCESS") {
    return { ok: false, status: 400, error: "invalid_signature", message: "Firma webhook PayPal non valida." };
  }
  return { ok: true, skipped: false };
}

function parseCaptureFromOrderData(orderData) {
  const pUnits = Array.isArray(orderData?.purchase_units) ? orderData.purchase_units : [];
  for (const pu of pUnits) {
    const captures = Array.isArray(pu?.payments?.captures) ? pu.payments.captures : [];
    if (captures.length) {
      const cap = captures[0];
      return {
        captureId: String(cap?.id || "").trim(),
        captureStatus: String(cap?.status || "").trim(),
        amount: normalizeMoneyAmount(cap?.amount?.value),
        currency: String(cap?.amount?.currency_code || "EUR").trim() || "EUR",
        customId: String(pu?.custom_id || "").trim(),
      };
    }
  }
  return {
    captureId: "",
    captureStatus: "",
    amount: "0.00",
    currency: "EUR",
    customId: "",
  };
}

async function createSitePaymentOrder(client, payload = {}) {
  const accessToken = String(payload.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;

  const catalog = buildPlanCatalog();
  const planKey = String(payload.planKey || "").trim();
  const plan = catalog[planKey];
  if (!plan) {
    return { ok: false, status: 400, error: "invalid_plan", message: "Piano pagamento non valido." };
  }
  const customId = buildPaypalCustomId({
    guildId: resolved.guild.id,
    userId: resolved.userId,
    planKey: plan.key,
  });
  const createBody = {
    intent: "CAPTURE",
    purchase_units: [
      {
        custom_id: customId,
        description: plan.label,
        amount: {
          currency_code: plan.currency,
          value: plan.amount,
        },
      },
    ],
    application_context: {
      shipping_preference: "NO_SHIPPING",
      user_action: "PAY_NOW",
    },
  };
  const created = await paypalApiRequest("/v2/checkout/orders", {
    method: "POST",
    body: createBody,
    headers: { Prefer: "return=representation" },
  });
  if (!created.ok) {
    return {
      ok: false,
      status: Number(created.status) || 502,
      error: created.error || "paypal_create_failed",
      message: "Impossibile creare l'ordine PayPal.",
      details: created.details || created.data || null,
    };
  }

  const orderId = String(created.data?.id || "").trim();
  const approveUrl = extractApproveUrl(created.data);
  if (!orderId) {
    return { ok: false, status: 502, error: "paypal_missing_order_id", message: "PayPal non ha restituito un orderId valido." };
  }

  await SiteDocument.findOneAndUpdate(
    { docType: PAY, provider: "paypal", orderId },
    {
      $setOnInsert: {
        docType: PAY,
        provider: "paypal",
        createdBy: "site",
        orderId,
      },
      $set: {
        guildId: resolved.guild.id,
        userId: resolved.userId,
        planKey: plan.key,
        description: plan.label,
        amount: plan.amount,
        currency: plan.currency,
        paymentStatus: String(created.data?.status || "CREATED"),
        approveUrl,
        rawOrder: created.data,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);

  return {
    ok: true,
    status: 200,
    orderId,
    approveUrl,
    plan: { key: plan.key, label: plan.label, amount: plan.amount, currency: plan.currency },
  };
}

async function finalizePaymentEffects(doc) {
  const userId = String(doc?.userId || "").trim();
  const guildId = String(doc?.guildId || "").trim();
  const description = String(doc?.description || "Pagamento confermato").trim();
  if (!userId || !guildId) return;
  try {
    await enqueueSiteInAppNotification({
      guildId,
      userId,
      title: "Pagamento PayPal confermato",
      body: `${description}: pagamento completato con successo.`,
      kind: "success",
      openUrl: "/donazioni",
      dedupeKey: `paypal-success:${String(doc?.captureId || doc?.orderId || "")}`,
      dedupeWindowMs: 86_400_000,
    });
  } catch (_) {}
}

async function captureSitePaymentOrder(client, payload = {}) {
  const accessToken = String(payload.accessToken || "").trim();
  const resolved = await resolveWebsiteGuildMember(client, accessToken);
  if (!resolved.ok) return resolved;

  const orderId = String(payload.orderId || "").trim();
  if (!orderId) {
    return { ok: false, status: 400, error: "missing_order_id", message: "orderId mancante." };
  }

  const capture = await paypalApiRequest(`/v2/checkout/orders/${encodeURIComponent(orderId)}/capture`, {
    method: "POST",
    body: {},
    headers: { Prefer: "return=representation" },
  });
  if (!capture.ok) {
    return {
      ok: false,
      status: Number(capture.status) || 502,
      error: capture.error || "paypal_capture_failed",
      message: "Impossibile catturare il pagamento.",
      details: capture.details || capture.data || null,
    };
  }

  const cap = parseCaptureFromOrderData(capture.data);
  const parsedCustom = parseCustomId(cap.customId);
  const finalUserId = parsedCustom.userId || resolved.userId;
  const finalGuildId = parsedCustom.guildId || resolved.guild.id || resolveGuildId(client);
  const finalPlanKey = parsedCustom.planKey || "";
  const status = String(cap.captureStatus || capture.data?.status || "").toUpperCase();
  const updated = await SiteDocument.findOneAndUpdate(
    { docType: PAY, provider: "paypal", orderId },
    {
      $setOnInsert: { docType: PAY, provider: "paypal", createdBy: "site", orderId },
      $set: {
        guildId: finalGuildId,
        userId: finalUserId,
        planKey: finalPlanKey,
        paymentStatus: status,
        captureId: cap.captureId || undefined,
        amount: cap.amount,
        currency: cap.currency,
        rawCapture: capture.data,
      },
    },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => null);

  if (status === "COMPLETED" && updated) {
    await finalizePaymentEffects(updated);
  }

  return {
    ok: true,
    status: 200,
    orderId,
    captureId: cap.captureId || null,
    paymentStatus: status || "UNKNOWN",
    message: status === "COMPLETED" ? "Pagamento completato." : "Pagamento elaborato.",
  };
}

function extractOrderAndCaptureFromWebhook(eventData = {}) {
  const resource = eventData?.resource && typeof eventData.resource === "object" ? eventData.resource : {};
  const eventType = String(eventData?.event_type || "").trim();
  let orderId = "";
  let captureId = "";
  let amount = "0.00";
  let currency = "EUR";
  let status = "";
  let customId = "";
  if (eventType.startsWith("PAYMENT.CAPTURE.")) {
    orderId = String(resource?.supplementary_data?.related_ids?.order_id || "").trim();
    captureId = String(resource?.id || "").trim();
    amount = normalizeMoneyAmount(resource?.amount?.value);
    currency = String(resource?.amount?.currency_code || "EUR").trim() || "EUR";
    status = String(resource?.status || "").trim().toUpperCase();
    customId = String(resource?.custom_id || "").trim();
  } else if (eventType.startsWith("CHECKOUT.ORDER.")) {
    orderId = String(resource?.id || "").trim();
    status = String(resource?.status || "").trim().toUpperCase();
    const unit = Array.isArray(resource?.purchase_units) ? resource.purchase_units[0] || {} : {};
    amount = normalizeMoneyAmount(unit?.amount?.value);
    currency = String(unit?.amount?.currency_code || "EUR").trim() || "EUR";
    customId = String(unit?.custom_id || "").trim();
  }
  const parsedCustom = parseCustomId(customId);
  return {
    eventType,
    orderId,
    captureId,
    amount,
    currency,
    status,
    customId,
    guildId: parsedCustom.guildId,
    userId: parsedCustom.userId,
    planKey: parsedCustom.planKey,
  };
}

async function handleSitePayPalWebhook(client, req, res) {
  try {
    const body = req.body && typeof req.body === "object" ? req.body : null;
    if (!body) {
      return res.status(400).json({ ok: false, error: "invalid_body", message: "Body webhook non valido." });
    }
    const signature = await verifyPaypalWebhookSignature(body, req.headers || {});
    if (!signature.ok) {
      return res.status(Number(signature.status) || 400).json(signature);
    }

    const extracted = extractOrderAndCaptureFromWebhook(body);
    if (!extracted.orderId && !extracted.captureId) {
      return res.status(200).json({ ok: true, ignored: true, reason: "unsupported_event" });
    }

    const finalGuildId = extracted.guildId || resolveGuildId(client) || "global";
    const finalStatus = extracted.status || "UNKNOWN";
    const updated = await SiteDocument.findOneAndUpdate(
      extracted.orderId
        ? { docType: PAY, provider: "paypal", orderId: extracted.orderId }
        : { docType: PAY, provider: "paypal", captureId: extracted.captureId },
      {
        $setOnInsert: {
          docType: PAY,
          provider: "paypal",
          createdBy: "paypal_webhook",
          ...(extracted.orderId ? { orderId: extracted.orderId } : {}),
        },
        $set: {
          guildId: finalGuildId,
          userId: extracted.userId || undefined,
          planKey: extracted.planKey || undefined,
          captureId: extracted.captureId || undefined,
          amount: extracted.amount,
          currency: extracted.currency,
          paymentStatus: finalStatus,
          webhookEventType: extracted.eventType,
          webhookEventId: String(body?.id || "").trim() || undefined,
          rawWebhook: body,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).catch(() => null);

    if (extracted.eventType === "PAYMENT.CAPTURE.COMPLETED" && updated) {
      await finalizePaymentEffects(updated);
    }

    return res.status(200).json({ ok: true });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] site-payments paypal-webhook:", err);
    return res.status(500).json({ ok: false, error: "internal", message: "Errore interno." });
  }
}

function listSitePaymentPlans() {
  const catalog = buildPlanCatalog();
  return Object.values(catalog).map((x) => ({
    key: x.key,
    label: x.label,
    amount: x.amount,
    currency: x.currency,
  }));
}

module.exports = {
  listSitePaymentPlans,
  createSitePaymentOrder,
  captureSitePaymentOrder,
  handleSitePayPalWebhook,
};