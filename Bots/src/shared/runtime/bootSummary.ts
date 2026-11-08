/** Accumula metriche di boot e stampa una sola riga a ready. */

function bootBag(client?) {
  if (!client) return null;
  if (!client.__bootSummary || typeof client.__bootSummary !== "object") {
    client.__bootSummary = {};
  }
  return client.__bootSummary;
}

function noteBoot(client?, patch: Record<string, any> = {}) {
  const bag = bootBag(client);
  if (!bag) return;
  Object.assign(bag, patch || {});
}

function formatDurationMs(ms?) {
  if (!Number.isFinite(ms) || ms < 0) return "0s";
  if (ms < 1000) return `${Math.round(ms)}ms`;
  const sec = Math.floor(ms / 1000) % 60;
  const min = Math.floor(ms / 60000) % 60;
  const parts = [];
  if (min > 0) parts.push(`${min}m`);
  parts.push(`${sec}s`);
  return parts.join(" ");
}

/**
 * Una sola riga: moduli, prefix, multi-guild, tempi.
 * Esempio: [BOOT] Vinili ready — modules=1177 prefix=85 tenants=77 (6s)
 */
function logBootReady(client?, startedAt?) {
  const name = client?.user?.username || client?.__bootLabel || "Bot";
  const bag = bootBag(client) || {};
  const parts = [];
  if (Number.isFinite(bag.modules)) parts.push(`modules=${bag.modules}`);
  if (Number.isFinite(bag.prefix)) parts.push(`prefix=${bag.prefix}`);
  if (Number.isFinite(bag.multiGuildEvents)) parts.push(`mgEvents=${bag.multiGuildEvents}`);
  if (Number.isFinite(bag.protectedGuilds) || Number.isFinite(bag.tenants)) {
    parts.push(`protette=${Number(bag.protectedGuilds) || 0} tenants=${Number(bag.tenants) || 0}`);
  }
  if (Number.isFinite(bag.preReadyMs)) parts.push(`pre=${formatDurationMs(bag.preReadyMs)}`);
  if (Number.isFinite(bag.mongoMs)) parts.push(`mongo=${formatDurationMs(bag.mongoMs)}`);
  const elapsed =
    startedAt != null && Number.isFinite(startedAt)
      ? formatDurationMs(Date.now() - startedAt)
      : bag.readyMs != null
        ? formatDurationMs(bag.readyMs)
        : "";
  const detail = parts.length ? ` — ${parts.join(" ")}` : "";
  const time = elapsed ? ` (${elapsed})` : "";
  global.logger?.info?.(`[BOOT] ${name} ready${detail}${time}`);
}

export = {
  noteBoot,
  logBootReady,
  formatDurationMs,
  bootBag,
};
