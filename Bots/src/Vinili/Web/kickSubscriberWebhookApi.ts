const {
  completeOAuthLink,
  handleSubscriptionEvent,
  verifyKickWebhookSignature,
  getKickPublicKeyPem,
  resolveSubSyncConfig,
  createLinkAuthorizeUrl,
  getLinkStatus,
  unlinkKickAccount,
} = require("../Services/Community/kickSubscriberSyncService") as typeof import("../Services/Community/kickSubscriberSyncService");

function htmlPage(title?, body?) {
  return `<!doctype html><html lang="it"><head><meta charset="utf-8"/><meta name="viewport" content="width=device-width,initial-scale=1"/><title>${title}</title>
<style>body{font-family:system-ui,sans-serif;background:#0b1220;color:#e2e8f0;display:flex;min-height:100vh;align-items:center;justify-content:center;margin:0;padding:1.5rem}
.card{max-width:28rem;background:#111827;border:1px solid #234;border-radius:1rem;padding:1.5rem 1.25rem;text-align:center}
h1{font-size:1.15rem;margin:0 0 .75rem}p{margin:.35rem 0;line-height:1.45;color:#cbd5e1}.ok{color:#86efac}.err{color:#fca5a5}
a{color:#86efac}</style></head><body><div class="card">${body}</div></body></html>`;
}

function normalizeBearer(req?) {
  return String(req?.headers?.authorization || "")
    .trim()
    .replace(/^Bearer\s+/i, "")
    .trim();
}

async function resolveDiscordUserIdFromBearer(accessToken?) {
  const token = String(accessToken || "").trim();
  if (!token) {
    return { ok: false, status: 401, error: "missing_token", message: "Login Discord richiesto." };
  }
  try {
    const meRes = await fetch("https://discord.com/api/v10/users/@me", {
      headers: { Authorization: `Bearer ${token}` },
    });
    if (!meRes.ok) {
      return { ok: false, status: 401, error: "invalid_token", message: "Sessione Discord non valida o scaduta." };
    }
    const meJson: any = await meRes.json().catch(() => ({}));
    const userId = String(meJson?.id || "").trim();
    if (!/^\d{17,20}$/.test(userId)) {
      return { ok: false, status: 401, error: "invalid_user", message: "Profilo Discord non valido." };
    }
    return { ok: true, status: 200, userId };
  } catch (_) {
    return { ok: false, status: 502, error: "discord_unreachable", message: "Impossibile contattare Discord." };
  }
}

async function handleKickSubOAuthCallback(client?, req?, res?) {
  try {
    const code = String(req.query?.code || "").trim();
    const stateNonce = String(req.query?.state || "").trim();
    const err = String(req.query?.error || "").trim();
    if (err) {
      res.status(400).type("html").send(
        htmlPage(
          "Kick link",
          `<h1 class="err">Autorizzazione annullata</h1><p>${err}</p><p>Riprova dal bottone <strong>SUB</strong> sull’anteprima Kick.</p>`,
        ),
      );
      return;
    }
    if (!code || !stateNonce) {
      res.status(400).type("html").send(
        htmlPage("Kick link", `<h1 class="err">Richiesta non valida</h1><p>Parametri OAuth mancanti.</p>`),
      );
      return;
    }
    const out = await completeOAuthLink(client, { code, stateNonce });
    if (!out?.ok) {
      res.status(Number(out?.status) || 400).type("html").send(
        htmlPage(
          "Kick link",
          `<h1 class="err">Collegamento non riuscito</h1><p>${String(out?.error || "error")}</p><p>Riprova dal bottone <strong>SUB</strong>.</p>`,
        ),
      );
      return;
    }
    const subMsg = out.subActive
      ? `<p class="ok">Sub Kick attivo: ruolo Discord assegnato.</p>`
      : `<p><strong>Importante:</strong> il collegamento da solo <strong>non</strong> assegna il ruolo.</p><p>Per ricevere il ruolo Discord devi essere sub e scrivere <strong>almeno un messaggio</strong> nella <strong>chat dello streamer su Kick</strong> (badge Sub). Poi il ruolo arriva in automatico.</p>`;
    res.status(200).type("html").send(
      htmlPage(
        "Kick link",
        `<h1 class="ok">Kick collegato</h1><p><strong>${out.kickUsername || out.kickUserId}</strong></p>${subMsg}<p><a href="https://www.viniliecaffe.it/">Torna al sito</a></p>`,
      ),
    );
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] kick-sub oauth-callback:", err);
    res.status(500).type("html").send(
      htmlPage("Kick link", `<h1 class="err">Errore interno</h1><p>Riprova tra poco.</p>`),
    );
  }
}

async function handleKickSubEventsWebhook(client?, req?, res?) {
  try {
    const cfg = resolveSubSyncConfig(client);
    if (!cfg.enabled) return res.status(503).json({ ok: false, error: "disabled" });

    const rawBuf = Buffer.isBuffer(req._kickSubRawBody)
      ? req._kickSubRawBody
      : typeof req.rawBody === "string"
        ? Buffer.from(req.rawBody, "utf8")
        : null;
    const rawBody = rawBuf
      ? rawBuf.toString("utf8")
      : JSON.stringify(req.body || {});

    const messageId = String(
      req.headers["kick-event-message-id"] || req.headers["x-event-message-id"] || "",
    ).trim();
    const timestamp = String(
      req.headers["kick-event-message-timestamp"] || req.headers["x-event-message-timestamp"] || "",
    ).trim();
    const signature = String(
      req.headers["kick-event-signature"] || req.headers["x-event-signature"] || "",
    ).trim();
    const eventType = String(
      req.headers["kick-event-type"] || req.headers["x-event-type"] || "",
    ).trim();

        if (!messageId && !timestamp && !signature && !eventType) {
      return res.status(200).json({ ok: true, ignored: "missing_kick_headers" });
    }

    let publicKeyPem = "";
    try {
      publicKeyPem = await getKickPublicKeyPem();
    } catch (err) {
      global.logger?.warn?.("[KICK SUB] public key:", err?.message || err);
    }

    const hadRaw = Boolean(rawBuf);
    const valid = verifyKickWebhookSignature({
      messageId,
      timestamp,
      signature,
      rawBody: rawBuf || rawBody,
      publicKeyPem,
    });
    if (!valid) {
      global.logger?.warn?.(
        "[KICK SUB] invalid webhook signature",
        "type=",
        eventType || "?",
        "raw=",
        hadRaw ? `ok:${rawBuf.length}b` : "missing",
        "msgId=",
        messageId ? "set" : "missing",
        "ts=",
        timestamp ? "set" : "missing",
        "sig=",
        signature ? "set" : "missing",
      );
      return res.status(401).json({ ok: false, error: "invalid_signature" });
    } else if (eventType) {
      global.logger?.info?.("[KICK SUB] webhook ok", eventType, "msg=", messageId.slice(0, 12));
    }

    const payload = req.body && typeof req.body === "object" ? req.body : {};
    if (
      eventType === "channel.subscription.new" ||
      eventType === "channel.subscription.renewal" ||
      eventType === "channel.subscription.gifts" ||
      eventType === "chat.message.sent"
    ) {
      const out = await handleSubscriptionEvent(client, eventType, payload, messageId);
      if (eventType === "chat.message.sent" && out && !out.deduped) {
        global.logger?.info?.(
          "[KICK SUB] chat.message.sent",
          "roleGranted=",
          Boolean(out.roleGranted),
          "linked=",
          Boolean(out.linked),
          "subBadge=",
          Boolean(out.subBadge),
        );
      }
    }
    return res.status(200).json({ ok: true });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] kick-sub events:", err);
    return res.status(500).json({ ok: false, error: "internal" });
  }
}

async function handleKickSubStatusGet(client?, req?, res?) {
  try {
    const cfg = resolveSubSyncConfig(client);
    if (!cfg.enabled) {
      res.setHeader("Cache-Control", "private, no-store");
      return res.status(200).json({
        ok: true,
        enabled: false,
        linked: false,
        subActive: false,
        error: "disabled",
      });
    }
    const resolved = await resolveDiscordUserIdFromBearer(normalizeBearer(req));
    if (!resolved.ok) {
      return res.status(Number(resolved.status) || 401).json(resolved);
    }
    const st = await getLinkStatus(client, resolved.userId);
    const slug = String(cfg.streamerSlug || "diunk17").trim() || "diunk17";
    res.setHeader("Cache-Control", "private, no-store");
    return res.status(200).json({
      ok: true,
      enabled: true,
      ...st,
      streamerSlug: slug,
      subscribeUrl: `https://kick.com/${encodeURIComponent(slug)}`,
    });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] kick-sub status:", err);
    return res.status(500).json({ ok: false, error: "internal" });
  }
}

async function handleKickSubOAuthStartGet(client?, req?, res?) {
  try {
    const cfg = resolveSubSyncConfig(client);
    if (!cfg.enabled) {
      return res.status(200).json({ ok: false, enabled: false, error: "disabled" });
    }
    const resolved = await resolveDiscordUserIdFromBearer(normalizeBearer(req));
    if (!resolved.ok) {
      return res.status(Number(resolved.status) || 401).json(resolved);
    }
    const url = await createLinkAuthorizeUrl(client, resolved.userId);
    res.setHeader("Cache-Control", "private, no-store");
    if (String(req.query?.redirect || "") === "1") {
      return res.redirect(302, url);
    }
    return res.status(200).json({ ok: true, url, expiresInSec: 900 });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] kick-sub oauth-start:", err);
    return res.status(500).json({
      ok: false,
      error: "internal",
      message: "Non riesco a generare il link Kick.",
    });
  }
}

async function handleKickSubUnlinkPost(client?, req?, res?) {
  try {
    const cfg = resolveSubSyncConfig(client);
    if (!cfg.enabled) return res.status(200).json({ ok: false, enabled: false, error: "disabled" });
    const resolved = await resolveDiscordUserIdFromBearer(normalizeBearer(req));
    if (!resolved.ok) {
      return res.status(Number(resolved.status) || 401).json(resolved);
    }
    const out = await unlinkKickAccount(client, resolved.userId);
    return res.status(200).json({ ok: true, unlinked: Boolean(out?.unlinked) });
  } catch (err) {
    global.logger?.error?.("[WEBHOOK] kick-sub unlink:", err);
    return res.status(500).json({ ok: false, error: "internal" });
  }
}

export = {
  handleKickSubOAuthCallback,
  handleKickSubEventsWebhook,
  handleKickSubStatusGet,
  handleKickSubOAuthStartGet,
  handleKickSubUnlinkPost,
};
