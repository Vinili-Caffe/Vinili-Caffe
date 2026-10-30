/* Economia del server (caffè e vinili) usata da bal, work, daily/weekly/monthly e dalla guida.
   Prima smistava anche verso l'economia Galeoni dell'evento Hogwarts e i giochi d'azzardo
   (rob, slots, roulette, tris…): sono in Bots/archivio. Con serverEconomy.enabled=false l'economia è spenta. */
const serverSvc = () => require("./serverEconomyService");

function resolveEconomyMode(client?, _nowMs = Date.now()) {
  return serverSvc().isServerEconomyEnabled(client) ? "server" : null;
}

function isEconomyCommandsVisible(client?, nowMs = Date.now()) {
  return resolveEconomyMode(client, nowMs) !== null;
}

function economyConfig(client?) {
  return serverSvc().economyConfig(client);
}

function isEconomyGameEnabled(client?, action?) {
  const key = String(action || "").trim().toLowerCase();
  if (!key) return false;
  const cfg = economyConfig(client);
  const game = cfg?.[key];
  if (!game || typeof game !== "object") return true;
  return game.enabled !== false;
}

function isServerEconomyEnabled(client?) {
  return serverSvc().isServerEconomyEnabled(client);
}

async function economyDisabledAccess(_client?) {
  return { ok: false, message: "L'economia è disattivata." };
}

async function assertServerEconomyAccess(message?, client?) {
  if (resolveEconomyMode(client) === "server") return serverSvc().assertServerEconomyAccess(message, client);
  return economyDisabledAccess(client);
}

async function claimWork(client?, message?) {
  if (!resolveEconomyMode(client)) return economyDisabledAccess(client);
  return serverSvc().claimWork(client, message);
}

async function claimFixed(client?, message?, incomeType?) {
  if (!resolveEconomyMode(client)) return economyDisabledAccess(client);
  return serverSvc().claimFixed(client, message, incomeType);
}

async function peekWorkClaim(client?, message?) {
  if (!resolveEconomyMode(client)) return economyDisabledAccess(client);
  return serverSvc().peekWorkClaim(client, message);
}

async function peekFixedClaim(client?, message?, incomeType?) {
  if (!resolveEconomyMode(client)) return economyDisabledAccess(client);
  return serverSvc().peekFixedClaim(client, message, incomeType);
}

async function isHighStaff(member?, client?, userId?) {
  return serverSvc().isHighStaff(member, client, userId);
}

export = {
  assertServerEconomyAccess,
  claimFixed,
  claimWork,
  economyConfig,
  formatDuration: (...args) => serverSvc().formatDuration(...args),
  isEconomyCommandsVisible,
  isEconomyGameEnabled,
  isHighStaff,
  isServerEconomyEnabled,
  peekFixedClaim,
  peekWorkClaim,
  resolveEconomyMode,
};
