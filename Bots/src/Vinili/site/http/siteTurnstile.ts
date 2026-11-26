/**
 * Verifica Cloudflare Turnstile (stesse chiavi della Vetrina in config.boards.turnstile).
 * Se il secret non è configurato → ok (skipped), così i form restano usabili in dev.
 */
"use strict";

function boardsTurnstileKeys(client?) {
  try {
    const { boardsConfig } = require("../boards/boardReviews") as typeof import("../boards/boardReviews");
    const cfg: any = boardsConfig(client);
    return {
      siteKey: String(cfg?.turnstileSiteKey || "").trim(),
      secretKey: String(cfg?.turnstileSecretKey || "").trim(),
    };
  } catch (_) {
    return { siteKey: "", secretKey: "" };
  }
}

async function verifySiteTurnstile(client?, token?, ip?) {
  const { secretKey } = boardsTurnstileKeys(client);
  const tok = String(token || "").trim();
  if (!secretKey) return { ok: true as const, skipped: true as const };
  if (!tok) return { ok: false as const, error: "missing_turnstile", message: "Completa la verifica anti-robot." };
  try {
    const body = new URLSearchParams();
    body.set("secret", secretKey);
    body.set("response", tok);
    if (ip) body.set("remoteip", String(ip));
    const res = await fetch("https://challenges.cloudflare.com/turnstile/v0/siteverify", {
      method: "POST",
      headers: { "content-type": "application/x-www-form-urlencoded" },
      body,
    });
    const data: any = await res.json().catch(() => null);
    if (data && data.success === true) return { ok: true as const };
    return {
      ok: false as const,
      error: "turnstile_failed",
      message: "Verifica anti-robot non riuscita. Riprova.",
      codes: data?.["error-codes"] || [],
    };
  } catch (err: any) {
    global.logger?.warn?.("[turnstile] verify:", err?.message || err);
    return { ok: false as const, error: "turnstile_error", message: "Verifica anti-robot non disponibile. Riprova tra poco." };
  }
}

function publicTurnstileMeta(client?) {
  const keys = boardsTurnstileKeys(client);
  return {
    turnstileSiteKey: keys.siteKey,
    turnstileRequired: Boolean(keys.secretKey),
  };
}

export = {
  boardsTurnstileKeys,
  verifySiteTurnstile,
  publicTurnstileMeta,
};
