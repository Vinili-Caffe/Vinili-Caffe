const path = require("path");
const { listJsFilesRecursive } = require("../../shared/runtime/fsRuntime");
const { normalizeLifecycleEventName, trackBoundHandler } = require("../../shared/runtime/loaderRuntime");
const { isMultiGuildLayerEnabled } = require("./core/env");
const { resolveGuildContext } = require("./core/guildContext");
const { resolveGuildAccess, listRegisteredGuildIds, listTenantGuildIds, invalidateRegistryCache } = require("./core/guildRegistry");
const { canInvokePrefixCommand, shouldRunViniliAutomations, shouldApplyMultiGuildLayer, shouldUseMultiGuildCommandGate } = require("./core/accessPolicy");
const { getProtectedGuildIds, isViniliProtectedGuild, isMultiGuildManagedGuild } = require("./core/viniliProtectedGuilds");
const viniliBridge = require("./bridge/viniliServices");
const guildJoinAlert = require("./services/guildJoinAlertService");
const openMediaCommands = require("./core/openMediaCommands");
const tenantRegistryStore = require("./core/tenantRegistryStore");
const tenantPrefixGate = require("./core/tenantPrefixGate");

const APP_ROOT = path.join(__dirname, "..");
const EVENTS_DIR = path.join(__dirname, "Events");

function loadMultiGuildEvents(client) {
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
        return Promise.resolve(event.execute(...args, client)).catch((err) => {
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
  return { enabled: isMultiGuildLayerEnabled(), resolveGuildContext, resolveGuildAccess, listRegisteredGuildIds, listTenantGuildIds, getProtectedGuildIds, isViniliProtectedGuild, isMultiGuildManagedGuild, isViniliFullFeatureGuild: tenantPrefixGate.isViniliFullFeatureGuild, shouldRunViniliCommunityFeatures: tenantPrefixGate.isViniliFullFeatureGuild, invalidateRegistryCache, canInvokePrefixCommand, shouldApplyMultiGuildLayer, shouldUseMultiGuildCommandGate, shouldRunViniliAutomations, services: viniliBridge, joinAlert: guildJoinAlert, openMedia: openMediaCommands, tenantRegistry: tenantRegistryStore, tenantPrefixGate };
}

function attachToClient(client) {
  if (!client) return null;
  const api = buildApi();
  client.multiGuild = api;
  if (!api.enabled) {
    global.logger?.info?.("[MultiGuild] layer presente ma disattivato (MULTI_GUILD_LAYER≠1)");
    return api;
  }
  const loaded = loadMultiGuildEvents(client);
  global.logger?.info?.(`[MultiGuild] API collegata — eventi layer: ${loaded}`);
  return api;
}

module.exports = { APP_ROOT, EVENTS_DIR, isLayerEnabled: isMultiGuildLayerEnabled, attachToClient, buildApi, loadMultiGuildEvents };