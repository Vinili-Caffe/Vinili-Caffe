/**
 * Discord OAuth /users/@me with a non-blocked User-Agent.
 * Bare Node/undici UA is often Cloudflare 1010 from datacenter IPs.
 */
const DISCORD_OAUTH_UA = "DiscordBot (https://www.viniliecaffe.it, 1.0)";

async function fetchDiscordOAuthMe(accessToken, options = {}) {
  const token = String(accessToken || "").trim();
  if (!token) {
    return {
      ok: false,
      status: 401,
      error: "missing_token",
      message: "Token mancante.",
      me: null,
    };
  }

  const timeoutMs = Math.max(800, Number(options.timeoutMs) || 8000);
  const ctrl = typeof AbortController !== "undefined" ? new AbortController() : null;
  const timer = setTimeout(() => {
    try {
      ctrl?.abort?.();
    } catch (_) {}
  }, timeoutMs);

  try {
    const meRes = await fetch("https://discord.com/api/v10/users/@me", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "User-Agent": DISCORD_OAUTH_UA,
      },
      signal: ctrl ? ctrl.signal : undefined,
    });

    const raw = await meRes.text().catch(() => "");
    if (/error code:\s*1010/i.test(raw) || (meRes.status === 403 && /cloudflare/i.test(raw))) {
      return {
        ok: false,
        status: 502,
        error: "discord_unreachable",
        message: "Impossibile contattare Discord in questo momento. Riprova tra poco.",
        me: null,
      };
    }

    if (meRes.status === 401) {
      return {
        ok: false,
        status: 401,
        error: "invalid_token",
        message: "Sessione Discord non valida o scaduta: effettua di nuovo il login.",
        me: null,
      };
    }

    if (!meRes.ok) {
      return {
        ok: false,
        status: 502,
        error: "discord_unreachable",
        message: "Impossibile contattare Discord in questo momento. Riprova tra poco.",
        me: null,
      };
    }

    let me = null;
    try {
      me = raw ? JSON.parse(raw) : null;
    } catch (_) {
      me = null;
    }
    if (!me || typeof me !== "object") {
      return {
        ok: false,
        status: 502,
        error: "discord_unreachable",
        message: "Risposta Discord non valida. Riprova tra poco.",
        me: null,
      };
    }
    return { ok: true, status: 200, me, error: null, message: null };
  } catch (err) {
    const aborted = String(err?.name || err?.message || "").toLowerCase().includes("abort");
    return {
      ok: false,
      status: 502,
      error: aborted ? "discord_timeout" : "discord_unreachable",
      message: aborted
        ? "Discord non risponde in tempo. Riprova tra poco."
        : "Impossibile contattare Discord in questo momento. Riprova tra poco.",
      me: null,
    };
  } finally {
    clearTimeout(timer);
  }
}

module.exports = {
  DISCORD_OAUTH_UA,
  fetchDiscordOAuthMe,
};
