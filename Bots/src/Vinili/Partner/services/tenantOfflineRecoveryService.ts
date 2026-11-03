const { getBotState, setBotState } = require("../../../shared/botState/botStateStore") as typeof import("../../../shared/botState/botStateStore");
const { isMongoReady } = require("../../../shared/db/mongoConnect") as typeof import("../../../shared/db/mongoConnect");
const { isMultiGuildLayerEnabled } = require("../../../MultiGuild/core/env") as typeof import("../../../MultiGuild/core/env");
const { isViniliProtectedGuild, normalizeGuildId } = require("../../../MultiGuild/core/viniliProtectedGuilds") as typeof import("../../../MultiGuild/core/viniliProtectedGuilds");
const {
  refreshDynamicGuildRowsCache,
  getDynamicGuildRowsCache,
  loadTenantRegistryMap,
} = require("../../../MultiGuild/core/tenantRegistryStore") as typeof import("../../../MultiGuild/core/tenantRegistryStore");
const {
  refreshPartnershipConfigCache,
  getPartnershipConfigSync,
  isPartnershipSetupComplete,
  listConfiguredPartnershipGuildIds,
  BOT_STATE_KEY: PARTNERSHIP_CONFIG_KEY,
} = require("../core/tenantPartnershipSettings") as typeof import("../core/tenantPartnershipSettings");
const { getPartnerManagerRoleId, memberHasPartnerManagerRole } = require("../core/partnershipConfigResolver") as typeof import("../core/partnershipConfigResolver");
const { ActivityUserProfile } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const { handleTenantGuildBotRemoved } = require("./tenantPartnershipLeaveService") as typeof import("./tenantPartnershipLeaveService");
const { resetTenantPartnerServerScoreOnRoleRemove } = require("./tenantPartnerManagerRoleService") as typeof import("./tenantPartnerManagerRoleService");

const LAST_RUN_KEY = "tenantOfflineRecovery.lastRun.v1";
const DEFAULT_MIN_INTERVAL_MS = 5 * 60 * 1000;
const MEMBER_FETCH_DELAY_MS = 80;

let running = false;

function sleep(ms?) {
  return new Promise((resolve?) => {
    const t = setTimeout(resolve, ms);
    t.unref?.();
  });
}

function userGuildsPath() {
  try {
    const { Routes } = require("discord.js") as typeof import("discord.js");
    if (typeof Routes.userGuilds === "function") return Routes.userGuilds();
  } catch (_) {}
  return "/users/@me/guilds";
}

async function refreshBotGuildIdSet(client?) {
  const ids = new Set();
  const rest = client?._rest;
  if (rest?.get) {
    let after = "";
    for (let page = 0; page < 25; page += 1) {
      const query = new URLSearchParams({ limit: "200" });
      if (after) query.set("after", after);
      const batch = await rest.get(`${userGuildsPath()}?${query.toString()}`).catch(() => null);
      if (!Array.isArray(batch) || !batch.length) break;
      for (const g of batch) {
        const gid = normalizeGuildId(g?.id);
        if (gid) ids.add(gid);
      }
      after = String(batch[batch.length - 1]?.id || "").trim();
      if (!after || batch.length < 200) break;
    }
    return ids;
  }

  if (client?.guilds?.cache) {
    for (const gid of client.guilds.cache.keys()) {
      const n = normalizeGuildId(gid);
      if (n) ids.add(n);
    }
  }
  return ids;
}

async function collectTrackedTenantGuildIds() {
  const ids = new Set();

  await refreshDynamicGuildRowsCache().catch(() => null);
  for (const gid of Object.keys(getDynamicGuildRowsCache() || {})) {
    const n = normalizeGuildId(gid);
    if (n && !isViniliProtectedGuild(n)) ids.add(n);
  }

  const registryMap = await loadTenantRegistryMap().catch(() => ({}));
  for (const gid of Object.keys(registryMap || {})) {
    const n = normalizeGuildId(gid);
    if (n && !isViniliProtectedGuild(n)) ids.add(n);
  }

  await refreshPartnershipConfigCache().catch(() => null);
  const partnershipRaw = await getBotState(PARTNERSHIP_CONFIG_KEY, null).catch(() => null);
  const partnershipMap =
    partnershipRaw && typeof partnershipRaw === "object" && !Array.isArray(partnershipRaw)
      ? partnershipRaw
      : {};
  for (const gid of Object.keys(partnershipMap)) {
    const n = normalizeGuildId(gid);
    if (n && !isViniliProtectedGuild(n)) ids.add(n);
  }

  for (const gid of listConfiguredPartnershipGuildIds()) {
    const n = normalizeGuildId(gid);
    if (n && !isViniliProtectedGuild(n)) ids.add(n);
  }

  return [...ids];
}

async function recoverOrphanedTenantGuilds(client?, botGuildIds?) {
  const tracked = await collectTrackedTenantGuildIds();
  let cleared = 0;
  const clearedIds = [];

  for (const guildId of tracked) {
    if (botGuildIds.has(guildId)) continue;
    const result = await handleTenantGuildBotRemoved(guildId).catch((err?) => {
      global.logger?.warn?.(
        "[tenantOfflineRecovery] orphan guild cleanup failed:",
        guildId,
        err?.message || err,
      );
      return null;
    });
    if (result?.ok) {
      cleared += 1;
      clearedIds.push(guildId);
      global.logger?.info?.(
        `[tenantOfflineRecovery] cleared orphan tenant guild=${guildId} (bot no longer in guild)`,
      );
    }
  }

  return { cleared, clearedIds };
}

async function ensureGuildForMemberFetch(client?, guildId?) {
  const cached = client?.guilds?.cache?.get?.(guildId);
  if (cached?.members?.fetch) return cached;
  if (typeof client?.guilds?.fetch === "function") {
    return client.guilds.fetch(guildId).catch(() => null);
  }
  return null;
}

async function reconcileTenantPartnerManagerScores(client?, botGuildIds?) {
  await refreshPartnershipConfigCache().catch(() => null);
  const guildIds = listConfiguredPartnershipGuildIds().filter(
    (gid?) => botGuildIds.has(String(gid)) && !isViniliProtectedGuild(gid),
  );

  let scanned = 0;
  let reset = 0;
  let skippedStillPm = 0;

  for (const guildId of guildIds) {
    const config = getPartnershipConfigSync(guildId);
    if (!isPartnershipSetupComplete(config)) continue;
    const roleId = String(getPartnerManagerRoleId(guildId) || config?.partnerManagerRoleId || "").trim();
    if (!roleId) continue;

    const guild = await ensureGuildForMemberFetch(client, guildId);
    if (!guild?.members?.fetch) {
      global.logger?.warn?.(
        "[tenantOfflineRecovery] skip PM score reconcile: guild unavailable",
        guildId,
      );
      continue;
    }

    const candidates = await ActivityUserProfile.find(
      {
        guildId: String(guildId),
        $or: [
          { "staff.partnerCount": { $gt: 0 } },
          { "staff.partnerRedeemSpend": { $gt: 0 } },
          { "staff.managerId": { $exists: true, $ne: null } },
        ],
      },
      { userId: 1 },
    )
      .lean()
      .catch(() => []);

    for (const doc of candidates || []) {
      const userId = String(doc?.userId || "").trim();
      if (!/^\d{16,22}$/.test(userId)) continue;
      scanned += 1;

      const member = await guild.members.fetch(userId).catch(() => null);
      if (member && memberHasPartnerManagerRole(member, guildId)) {
        skippedStillPm += 1;
        continue;
      }

      const result = await resetTenantPartnerServerScoreOnRoleRemove(guildId, userId);
      if (result?.ok && !result?.skipped) reset += 1;
      if (MEMBER_FETCH_DELAY_MS > 0) await sleep(MEMBER_FETCH_DELAY_MS);
    }
  }

  return { scanned, reset, skippedStillPm, guilds: guildIds.length };
}

async function shouldSkipForThrottle(minIntervalMs?) {
  const raw = await getBotState(LAST_RUN_KEY, null).catch(() => null);
  const lastAt = Number(raw?.at || 0);
  if (!Number.isFinite(lastAt) || lastAt <= 0) return false;
  return Date.now() - lastAt < minIntervalMs;
}

async function markRecoveryRun(summary?) {
  await setBotState(LAST_RUN_KEY, {
    at: Date.now(),
    ...summary,
  }).catch(() => null);
}

async function runTenantOfflineRecoveryTick(client?, opts: Record<string, any> = {}) {
  if (!isMultiGuildLayerEnabled()) {
    return { ok: false, reason: "multi_guild_disabled" };
  }
  if (!isMongoReady()) {
    return { ok: false, reason: "mongo_not_ready" };
  }
  if (!client) {
    return { ok: false, reason: "no_client" };
  }
  if (running && opts.force !== true) {
    return { ok: false, reason: "busy" };
  }

  const minIntervalMs = Math.max(
    0,
    Number(opts.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS) || DEFAULT_MIN_INTERVAL_MS,
  );
  if (opts.force !== true && minIntervalMs > 0 && (await shouldSkipForThrottle(minIntervalMs))) {
    return { ok: true, skipped: "throttled" };
  }

  running = true;
  const startedAt = Date.now();
  try {
    const botGuildIds = await refreshBotGuildIdSet(client);
    const orphans = await recoverOrphanedTenantGuilds(client, botGuildIds);
    const scores =
      opts.skipPmScores === true
        ? { scanned: 0, reset: 0, skippedStillPm: 0, guilds: 0, skipped: true }
        : await reconcileTenantPartnerManagerScores(client, botGuildIds);

    const summary = {
      ok: true,
      botGuilds: botGuildIds.size,
      orphansCleared: orphans.cleared,
      pmScoresReset: scores.reset,
      pmScoresScanned: scores.scanned,
      durationMs: Date.now() - startedAt,
    };

    await markRecoveryRun(summary);

    return { ...summary, orphans, scores };
  } catch (err) {
    global.logger?.error?.("[tenantOfflineRecovery] tick failed:", err?.message || err);
    return { ok: false, reason: "error", error: err?.message || String(err) };
  } finally {
    running = false;
  }
}

function startTenantOfflineRecoveryLoop(client?, opts: Record<string, any> = {}) {
  if (!isMultiGuildLayerEnabled()) return { ok: false, reason: "multi_guild_disabled" };
  if (!client || client.__tenantOfflineRecoveryLoopStarted) {
    return { ok: false, reason: client?.__tenantOfflineRecoveryLoopStarted ? "already_started" : "no_client" };
  }

  const intervalMs = Math.max(
    60_000,
    Number(opts.intervalMs ?? 15 * 60 * 1000) || 15 * 60 * 1000,
  );
  const minIntervalMs = Math.max(0, Number(opts.minIntervalMs ?? DEFAULT_MIN_INTERVAL_MS) || 0);

  client.__tenantOfflineRecoveryLoopStarted = true;

  const tick = () => {
    void runTenantOfflineRecoveryTick(client, { minIntervalMs }).catch((err?) => {
      global.logger?.warn?.("[tenantOfflineRecovery] loop tick:", err?.message || err);
    });
  };

    const startupDelayMs = Math.max(0, Number(opts.startupDelayMs ?? 8_000) || 0);
  if (startupDelayMs > 0) {
    const t = setTimeout(tick, startupDelayMs);
    t.unref?.();
  } else {
    tick();
  }

  const timer = setInterval(tick, intervalMs);
  timer.unref?.();
  client.__tenantOfflineRecoveryTimer = timer;

  global.logger?.info?.(
    `[tenantOfflineRecovery] loop started interval=${Math.round(intervalMs / 1000)}s`,
  );
  return { ok: true, intervalMs };
}

export = {
  runTenantOfflineRecoveryTick,
  startTenantOfflineRecoveryLoop,
};
