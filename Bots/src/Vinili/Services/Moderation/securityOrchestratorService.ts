const { getAntiNukeStatusSnapshot, shouldBlockAllCommands, } = require("./antiNukeService") as typeof import("./antiNukeService");
const { getAutoModPanicSnapshot } = require("./automodService") as typeof import("./automodService");
const { getJoinRaidStatusSnapshot } = require("./joinRaidService") as typeof import("./joinRaidService");
const SECURITY_LOCK_CACHE_TTL_MS = 3000;
const securityLockCache = new Map();

function invalidateSecurityLockCache(guildId?) {
  if (guildId == null) {
    securityLockCache.clear();
  } else {
    securityLockCache.delete(String(guildId));
  }
  try {
    const { invalidateCommandLockCache } = require("./antiNukeService") as typeof import("./antiNukeService");
    invalidateCommandLockCache(guildId);
  } catch (_) {}
}

function buildSecurityLockDecision({
  antiNukePanic = false,
  autoModPanic = false,
  joinRaid = false,
  lockAllCommands = false,
  joinRaidLockCommands = false,
  autoModLockCommands = false,
} = {}) {
  const joinLockActive = Boolean(antiNukePanic || joinRaid || autoModPanic);
  const commandLockByPanic = Boolean(lockAllCommands && antiNukePanic);
  const commandLockByJoinRaid = Boolean(joinRaid && joinRaidLockCommands);
  const commandLockByAutoModPanic = Boolean(autoModPanic && autoModLockCommands);
  const commandLockActive = Boolean(
    commandLockByPanic || commandLockByJoinRaid || commandLockByAutoModPanic,
  );
  const sources = [];
  if (antiNukePanic) sources.push("AntiNuke panic");
  if (autoModPanic) sources.push("AutoMod panic");
  if (joinRaid) sources.push("Join Raid");
  const commandSources = [];
  if (commandLockByPanic) {
    if (antiNukePanic) commandSources.push("AntiNuke panic");
  }
  if (commandLockByJoinRaid) commandSources.push("Join Raid");
  if (commandLockByAutoModPanic) commandSources.push("AutoMod panic");

  return {
    active: joinLockActive || commandLockActive,
    joinLockActive,
    commandLockActive,
    sources,
    commandSources: Array.from(new Set(commandSources)),
    details: {
      antiNukePanic: Boolean(antiNukePanic),
      autoModPanic: Boolean(autoModPanic),
      joinRaid: Boolean(joinRaid),
      lockAllCommands: Boolean(lockAllCommands),
      joinRaidLockCommands: Boolean(joinRaidLockCommands),
      autoModLockCommands: Boolean(autoModLockCommands),
      commandLockByPanic,
      commandLockByJoinRaid,
      commandLockByAutoModPanic,
    },
  };
}

async function getSecurityLockState(guild?) {
  if (!guild?.id) {
    return {
      active: false,
      joinLockActive: false,
      commandLockActive: false,
      sources: [],
      commandSources: [],
      details: {
        antiNukePanic: false,
        autoModPanic: false,
        joinRaid: false,
        lockAllCommands: false,
        joinRaidLockCommands: false,
        autoModLockCommands: false,
        commandLockByPanic: false,
        commandLockByJoinRaid: false,
        commandLockByAutoModPanic: false,
      },
    };
  }

  const guildId = String(guild.id);
  const now = Date.now();
  const cached = securityLockCache.get(guildId);
  if (cached && cached.expiresAt > now) return cached.result;

  const antiNuke = getAntiNukeStatusSnapshot(guildId);
  const antiNukePanic = Boolean(antiNuke?.panicActive);
  const autoModSnap = getAutoModPanicSnapshot(guildId);
  const autoModPanic = Boolean(autoModSnap?.active);
  const autoModLockCommands = Boolean(autoModSnap?.lockCommands);
  const joinRaidSnapshot = await getJoinRaidStatusSnapshot(guildId).catch(() => null);
  const joinRaid = Boolean(joinRaidSnapshot?.raidActive);
  const joinRaidLockCommands = Boolean(joinRaidSnapshot?.config?.lockCommands);
  const lockAllCommands = Boolean(antiNuke?.config?.panicMode?.lockdown?.lockAllCommands,);
  const decision = buildSecurityLockDecision({
    antiNukePanic,
    autoModPanic,
    joinRaid,
    lockAllCommands,
    joinRaidLockCommands,
    autoModLockCommands,
  });
  const commandLockEval = await shouldBlockAllCommands(guild, { joinRaidSnapshot }).catch(
    () => decision.commandLockActive,
  );
  const finalCommandLock = Boolean(commandLockEval);
  const commandSourcesResolved = (() => {
    if (!finalCommandLock) return [];
    const out = [];
    if (Boolean(lockAllCommands) && Boolean(antiNuke?.panicActive)) {
      out.push("AntiNuke panic");
    }
    if (joinRaid && joinRaidLockCommands) {
      out.push("Join Raid");
    }
    if (autoModPanic && autoModLockCommands) {
      out.push("AutoMod panic");
    }
    return out.length ? Array.from(new Set(out)) : ["Command lock"];
  })();
  const result = {
    ...decision,
    commandLockActive: finalCommandLock,
    commandSources: commandSourcesResolved,
    active: Boolean(decision.joinLockActive || finalCommandLock),
  };
  securityLockCache.set(guildId, {
    result,
    expiresAt: now + SECURITY_LOCK_CACHE_TTL_MS,
  });
  return result;
}

export = { getSecurityLockState, invalidateSecurityLockCache };