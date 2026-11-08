const path = require("path") as typeof import("path");
const { listJsFilesRecursive } = require("../shared/runtime/fsRuntime") as typeof import("../shared/runtime/fsRuntime");
const { normalizeLifecycleEventName, trackBoundHandler } = require("../shared/runtime/loaderRuntime") as typeof import("../shared/runtime/loaderRuntime");
const { isMultiGuildLayerEnabled } = require("./core/env") as typeof import("./core/env");
const { resolveGuildContext } = require("./core/guildContext") as typeof import("./core/guildContext");
const { resolveGuildAccess, listRegisteredGuildIds, listTenantGuildIds, invalidateRegistryCache } = require("./core/guildRegistry") as typeof import("./core/guildRegistry");
const { canInvokePrefixCommand, shouldRunViniliAutomations, shouldApplyMultiGuildLayer, shouldUseMultiGuildCommandGate } = require("./core/accessPolicy") as typeof import("./core/accessPolicy");
const { getProtectedGuildIds, isViniliProtectedGuild, isMultiGuildManagedGuild } = require("./core/viniliProtectedGuilds") as typeof import("./core/viniliProtectedGuilds");
const guildJoinAlert = require("./services/guildJoinAlertService") as typeof import("./services/guildJoinAlertService");
const openMediaCommands = require("./core/openMediaCommands") as typeof import("./core/openMediaCommands");
const tenantRegistryStore = require("./core/tenantRegistryStore") as typeof import("./core/tenantRegistryStore");
const tenantPrefixGate = require("./core/tenantPrefixGate") as typeof import("./core/tenantPrefixGate");

const APP_ROOT = path.join(__dirname, "..");
const EVENTS_DIR = path.join(__dirname, "events");

function loadMultiGuildEvents(client?) {
  if (!client) return 0;
  if (!client._eventHandlers) client._eventHandlers = new Map();
  let loaded = 0;
  for (const file of listJsFilesRecursive(EVENTS_DIR)) {
    try {
      delete require.cache[require.resolve(file)];
      const event = require(file);
      if (!event?.name || typeof event.execute !== "function") continue;
      const eventName = normalizeLifecycleEventName(event.name);
      const handler = async (...args) => {
        return Promise.resolve(event.execute(...args, client)).catch((err?) => {
          global.logger?.error?.(`[MultiGuild EVENT ${eventName}]`, err);
        });
      };
      const bind = event.once ? client.once.bind(client) : client.on.bind(client);
      bind(eventName, handler);
      trackBoundHandler(client, "_eventHandlers", eventName, handler);
      loaded += 1;
    } catch (err) {
      global.logger?.warn?.("[MultiGuild] event load failed:", file, err?.message || err);
    }
  }
  return loaded;
}

function buildApi() {
  return { enabled: isMultiGuildLayerEnabled(), resolveGuildContext, resolveGuildAccess, listRegisteredGuildIds, listTenantGuildIds, getProtectedGuildIds, isViniliProtectedGuild, isMultiGuildManagedGuild, isViniliFullFeatureGuild: tenantPrefixGate.isViniliFullFeatureGuild, shouldRunViniliCommunityFeatures: tenantPrefixGate.isViniliFullFeatureGuild, invalidateRegistryCache, canInvokePrefixCommand, shouldApplyMultiGuildLayer, shouldUseMultiGuildCommandGate, shouldRunViniliAutomations, services: {}, joinAlert: guildJoinAlert, openMedia: openMediaCommands, tenantRegistry: tenantRegistryStore, tenantPrefixGate };
}

function attachToClient(client?) {
  if (!client) return null;
  try {
    require("./utils/tenantEmbedBranding").registerTenantEmbedBrandingApplier();
  } catch (err) {
    global.logger?.warn?.("[MultiGuild] tenant embed branding init failed:", err?.message || err);
  }
  const api = buildApi();
  client.multiGuild = api;
  if (!api.enabled) {
    global.logger?.info?.("[MultiGuild] layer presente ma disattivato (MULTI_GUILD_LAYER≠1)");
    return api;
  }
  const loaded = loadMultiGuildEvents(client);
  try {
    const { noteBoot } = require("../shared/runtime/bootSummary") as typeof import("../shared/runtime/bootSummary");
    noteBoot(client, { multiGuildEvents: loaded });
  } catch (_) {
    /* ignore */
  }
  if (String(process.env.BOOT_VERBOSE || "").trim() === "1") {
    global.logger?.info?.(`[MultiGuild] API collegata — eventi layer: ${loaded}`);
  }
  return api;
}

export = { APP_ROOT, attachToClient };