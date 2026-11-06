// @ts-nocheck
/* Facade economia Discord (archivio giochi-economia).
   Gate: fasi economia Star Wars (calendar economyOn) oppure anteprima HS (!publicEnabled). */
const serverSvc = () => require("./serverEconomyService");
const gamblingSvc = () => require("./serverEconomyGamblingRob");

function isStarWarsEconomyLive(client?) {
  try {
    const {
      resolveFeatureStateNow,
    } = require("../../../../../starwars/src/Vinili/Utils/Eventi/starWarsEventCalendar") as typeof import("../../../../../starwars/src/Vinili/Utils/Eventi/starWarsEventCalendar");
    const {
      resolveStarWarsEventConfig,
      isPastStarWarsEventEnd,
    } = require("../../../../../starwars/src/Vinili/Utils/Eventi/starWarsEventConfig") as typeof import("../../../../../starwars/src/Vinili/Utils/Eventi/starWarsEventConfig");
    if (isPastStarWarsEventEnd(client)) return false;
    const cfg = resolveStarWarsEventConfig(client);
    const st = resolveFeatureStateNow(new Date());
    return Boolean(st?.economyOn) || !cfg?.publicEnabled;
  } catch (_) {
    return false;
  }
}

function resolveEconomyMode(client?, _nowMs = Date.now()) {
  return isStarWarsEconomyLive(client) ? "server" : null;
}

function isEconomyCommandsVisible(client?, nowMs = Date.now()) {
  return resolveEconomyMode(client, nowMs) !== null;
}

function isServerEconomyEnabled(client?) {
  return resolveEconomyMode(client) === "server";
}

function economyConfig(client?) {
  const raw = serverSvc().economyConfig(client);
  return { ...raw, enabled: isServerEconomyEnabled(client) };
}

function isEconomyGameEnabled(client?, action?) {
  const key = String(action || "").trim().toLowerCase();
  if (!key) return false;
  const cfg = economyConfig(client);
  const game = cfg?.[key];
  if (!game || typeof game !== "object") return true;
  return game.enabled !== false;
}

async function economyDisabledAccess(_client?) {
  return { ok: false, message: "L'economia è disattivata (fuori dalle fasi calendario)." };
}

function memberRoleIdForGuild(guildId?) {
  const IDs = require("../../Utils/Config/ids");
  const base = String(IDs.roles?.Member || "").trim();
  if (!base) return "";
  try {
    const {
      remapRoleIdForGuild,
      isTestMirrorGuild,
    } = require("../../../../../../src/Vinili/Config/testGuildMirrorRemap") as typeof import("../../../../../../src/Vinili/Config/testGuildMirrorRemap");
    if (isTestMirrorGuild(guildId)) return remapRoleIdForGuild(guildId, base) || base;
  } catch (_) {}
  return base;
}

async function memberHasEconomyAccess(message?, client?) {
  const member = message?.member;
  const userId = message?.author?.id;
  if (!member) return false;
  if (await serverSvc().isHighStaff(member, client, userId)) return true;

  const localMemberRole = memberRoleIdForGuild(message?.guild?.id);
  if (localMemberRole && member?.roles?.cache?.has(localMemberRole)) return true;

  /* Fallback: Member sul server principale (utile da server test). */
  try {
    const IDs = require("../../Utils/Config/ids");
    const mainRole = String(IDs.roles?.Member || "").trim();
    if (!mainRole) return false;
    const mainMember = await serverSvc().resolveMainGuildMember(client, userId, member);
    if (mainMember?.roles?.cache?.has(mainRole)) return true;
  } catch (_) {}
  return false;
}

async function assertServerEconomyAccess(message?, client?) {
  if (!isServerEconomyEnabled(client)) return economyDisabledAccess(client);
  if (!message?.guild || !message?.member || message.author?.bot) {
    return { ok: false, message: "Comando disponibile solo nel server." };
  }
  if (!(await memberHasEconomyAccess(message, client))) {
    return { ok: false, message: "Devi essere Member per usare l'economia del server." };
  }
  try {
    const {
      getStarWarsWallet,
    } = require("../../../../../starwars/src/Vinili/Services/Community/starWarsEventWalletService") as typeof import("../../../../../starwars/src/Vinili/Services/Community/starWarsEventWalletService");
    const {
      hasStarWarsFaction,
    } = require("../../../../../starwars/src/Vinili/Utils/Eventi/starWarsRuntimeGate") as typeof import("../../../../../starwars/src/Vinili/Utils/Eventi/starWarsRuntimeGate");
    const bridge = require("./starWarsCreditsBridge") as typeof import("./starWarsCreditsBridge");
    const walletGid = bridge.walletGuildId(client, message.guild.id);
    const wallet = await getStarWarsWallet(walletGid, message.author.id, bridge.eventKey(client));
    if (!hasStarWarsFaction(wallet)) {
      return { ok: false, message: "Devi prima smistarti in una fazione per usare l'economia." };
    }
  } catch (_) {}
  return { ok: true, cfg: economyConfig(client) };
}

async function claimWork(client?, message?) {
  if (!isServerEconomyEnabled(client)) return economyDisabledAccess(client);
  return serverSvc().claimWork(client, message);
}

async function claimFixed(client?, message?, incomeType?) {
  if (!isServerEconomyEnabled(client)) return economyDisabledAccess(client);
  return serverSvc().claimFixed(client, message, incomeType);
}

async function peekWorkClaim(client?, message?) {
  if (!isServerEconomyEnabled(client)) return economyDisabledAccess(client);
  return serverSvc().peekWorkClaim(client, message);
}

async function peekFixedClaim(client?, message?, incomeType?) {
  if (!isServerEconomyEnabled(client)) return economyDisabledAccess(client);
  return serverSvc().peekFixedClaim(client, message, incomeType);
}

export = {
  ...gamblingSvc(),
  assertServerEconomyAccess,
  claimFixed,
  claimWork,
  defaultBetCurrency: (...args) => serverSvc().defaultBetCurrency(...args),
  economyConfig,
  formatDuration: (...args) => serverSvc().formatDuration(...args),
  formatEconomyAmount: (...args) => serverSvc().formatEconomyAmount(...args),
  isEconomyCommandsVisible,
  isEconomyGameEnabled,
  isHighStaff: (...args) => serverSvc().isHighStaff(...args),
  isMember: (...args) => serverSvc().isMember(...args),
  isServerEconomyEnabled,
  isStarWarsEconomyLive,
  parseCurrencyArg: (...args) => serverSvc().parseCurrencyArg(...args),
  peekFixedClaim,
  peekWorkClaim,
  resolveEconomyMode,
};
