/**
 * Misura RTT REST Discord con cache, così health/watchdog non sparano /users/@me a raffica.
 */
const DEFAULT_CACHE_MS = Math.max(
  5_000,
  Number(process.env.VC_DISCORD_REST_PING_CACHE_MS || 20_000) || 20_000,
);

function installRestRttProbe(client?) {
  const rest = client?.rest;
  if (!rest || rest.__vcRttProbeInstalled) return;
  rest.__vcRttProbeInstalled = true;
  const originalRequest = typeof rest.request === "function" ? rest.request.bind(rest) : null;
  if (!originalRequest) return;
  rest.request = async (options?) => {
    const t0 = Date.now();
    try {
      return await originalRequest(options);
    } finally {
      const ms = Math.max(0, Date.now() - t0);
      /* Ignora outlier enormi (timeout/retry) per non sporcare la dashboard. */
      if (ms > 0 && ms < 8_000) {
        client.__lastRestRttMs = ms;
        client.__lastRestRttAt = Date.now();
      }
    }
  };
}

async function measureDiscordRestPingMs(client?, opts: Record<string, any> = {}) {
  if (!client?.rest?.get) return null;
  const cacheMs = Math.max(0, Number(opts.cacheMs ?? DEFAULT_CACHE_MS) || 0);
  const force = opts.force === true;
  const cachedAt = Number(client.__lastRestRttAt || 0);
  const cachedMs = Number(client.__lastRestRttMs);
  if (
    !force &&
    cacheMs > 0 &&
    Number.isFinite(cachedMs) &&
    cachedMs >= 0 &&
    Date.now() - cachedAt < cacheMs
  ) {
    return Math.round(cachedMs);
  }

  const { Routes } = require("discord-api-types/v10") as typeof import("discord-api-types/v10");
  const t0 = Date.now();
  try {
    await client.rest.get(Routes.user("@me"));
    const ms = Math.max(0, Date.now() - t0);
    client.__lastRestRttMs = ms;
    client.__lastRestRttAt = Date.now();
    return ms;
  } catch {
    if (Number.isFinite(cachedMs) && cachedMs >= 0) return Math.round(cachedMs);
    return null;
  }
}

export = {
  installRestRttProbe,
  measureDiscordRestPingMs,
};
