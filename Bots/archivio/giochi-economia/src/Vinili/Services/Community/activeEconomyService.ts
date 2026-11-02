// @ts-nocheck
/* Facade economia server + gambling (archivio giochi-economia).
   Galeoni Hogwarts era un altro mode: vedi Bots/archivio/hogwarts. */
const serverSvc = () => require("./serverEconomyService");
const gamblingSvc = () => require("./serverEconomyGamblingRob");

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

/** Stub galeoni: in pack server-only. */
function robBankTargetId(_client?) {
  return gamblingSvc().ROB_BANK_TARGET_ID;
}

async function listRobCandidateUserIds(_client?, _guildId?, _excludeId?, _cfg?) {
  return [];
}

export = {
  ...gamblingSvc(),
  assertServerEconomyAccess,
  claimFixed,
  claimWork,
  defaultBetCurrency: (...args) => serverSvc().defaultBetCurrency(...args),
  economyConfig,
  formatDuration: (...args) => serverSvc().formatDuration(...args),
  isEconomyCommandsVisible,
  isEconomyGameEnabled,
  isHighStaff,
  isServerEconomyEnabled,
  listRobCandidateUserIds,
  parseCurrencyArg: (...args) => serverSvc().parseCurrencyArg(...args),
  peekFixedClaim,
  peekWorkClaim,
  resolveEconomyMode,
  robBankTargetId,
};
