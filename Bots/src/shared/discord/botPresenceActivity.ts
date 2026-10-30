const { ActivityType } = require("discord.js") as typeof import("discord.js");

let GatewayOpcodes = { PresenceUpdate: 3 };
try {
  GatewayOpcodes = require("discord-api-types/v10").GatewayOpcodes;
} catch {
  try {
    GatewayOpcodes = require("discord.js").GatewayOpcodes || GatewayOpcodes;
  } catch {}
}

function isDiscordStreamingUrl(url?) {
  const raw = String(url || "").trim();
  if (!raw) return false;
  let host = "";
  try {
    host = new URL(raw).hostname.toLowerCase();
  } catch {
    return false;
  }
  if (host === "youtu.be") return true;
  if (host === "twitch.tv" || host === "www.twitch.tv") return true;
  if (host === "youtube.com" || host === "www.youtube.com" || host === "m.youtube.com") return true;
  if (host.endsWith(".youtube.com")) return true;
  return false;
}

function buildBotPresenceActivities(client?) {
  const cfg = client?.config?.presence && typeof client.config.presence === "object" ? client.config.presence : {};
  const name = String(cfg.activityName || "Vinili & Caffè").trim() || "Vinili & Caffè";
  const streamUrl = String(process.env.BOT_PRESENCE_STREAM_URL || cfg.streamUrl || "").trim();
  if (streamUrl && isDiscordStreamingUrl(streamUrl)) {
    return [{ type: ActivityType.Streaming, name, url: streamUrl }];
  }
  return [{ type: ActivityType.Watching, name }];
}

const VALID_PRESENCE_STATUSES = new Set(["online", "idle", "dnd", "invisible"]);
const PRESENCE_KEEPALIVE_MS = 15_000;
const PRESENCE_STABILIZE_DELAYS_MS = [1000, 3000, 8000, 15000, 30000, 60000, 120000, 180000];
const PRESENCE_VOICE_REAPPLY_MS = 1500;

function toConfigClient(configLike?) {
  return configLike?.config ? configLike : { config: configLike || {} };
}

function resolveBotPresenceStatus(client?) {
  const raw = String(client?.config?.status || "idle").trim().toLowerCase();
  return VALID_PRESENCE_STATUSES.has(raw) ? raw : "idle";
}

function wantsIdlePresence(client?) {
  return resolveBotPresenceStatus(client) === "idle";
}

function ensureIdleSince(client?) {
  if (!client) return Date.now();
  if (!client._idlePresenceSince) client._idlePresenceSince = Date.now();
  return client._idlePresenceSince;
}

function attachGatewayPresenceFields(payload?, client?) {
  const status = String(payload?.status || "idle");
  if (status === "idle") {
    payload.since = ensureIdleSince(client || null);
    payload.afk = true;
  } else {
    payload.since = null;
    payload.afk = false;
  }
  return payload;
}

function buildInitialClientPresenceOptions(configLike?) {
  const clientLike = toConfigClient(configLike);
  return attachGatewayPresenceFields(
    {
      status: resolveBotPresenceStatus(clientLike),
      activities: buildBotPresenceActivities(clientLike),
    },
    null,
  );
}

function buildPresencePayload(client?) {
  const payload = attachGatewayPresenceFields(
    {
      status: resolveBotPresenceStatus(client),
      activities: buildBotPresenceActivities(client),
    },
    client,
  );
  if (client?.shard?.ids?.length) payload.shardId = client.shard.ids[0];
  return payload;
}

function pushGatewayPresence(client?, payload?) {
  if (!client?.presence?._parse || !client?.ws) return false;
  const packet = client.presence._parse(payload);
  try {
    if (typeof client.ws.broadcast === "function") {
      client.ws.broadcast({ op: GatewayOpcodes.PresenceUpdate, d: packet });
    } else if (client.ws.shards?.size) {
      for (const shard of client.ws.shards.values()) {
        shard.send({ op: GatewayOpcodes.PresenceUpdate, d: packet });
      }
    } else {
      return false;
    }
    if (typeof client.presence._patch === "function") client.presence._patch(packet);
    return true;
  } catch (err) {
    global.logger?.error?.("[STATUS] gateway presence failed:", err?.message || err);
    return false;
  }
}

function patchClientPresenceGuard(client?) {
  if (!client?.presence?.set || client._presenceGuardPatched) return;
  client._presenceGuardPatched = true;
  if (wantsIdlePresence(client)) ensureIdleSince(client);
  const originalSet = client.presence.set.bind(client.presence);
  client.presence.set = function guardedPresenceSet(data: Record<string, any> = {}) {
    let next = data && typeof data === "object" ? { ...data } : {};
    if (wantsIdlePresence(client)) {
      next.status = "idle";
      next.since = ensureIdleSince(client);
      next.afk = true;
      if (!Array.isArray(next.activities) || !next.activities.length) {
        next.activities = buildBotPresenceActivities(client);
      }
    }
    return originalSet(next);
  };
}

async function applyBotPresence(client?) {
  if (!client?.user || !client?.presence) return false;
  patchClientPresenceGuard(client);
  const payload = buildPresencePayload(client);
  try {
    if (pushGatewayPresence(client, payload)) return true;
    client.presence.set(payload);
    return true;
  } catch (err) {
    global.logger?.error?.("[STATUS] Errore impostazione presenza:", err?.message || err);
    return false;
  }
}

function installBotPresenceKeeper(client?) {
  if (!client || client._presenceKeeperInterval) return;
  if (!wantsIdlePresence(client)) return;
  patchClientPresenceGuard(client);
  const interval = setInterval(() => {
    void applyBotPresence(client);
  }, PRESENCE_KEEPALIVE_MS);
  interval.unref?.();
  client._presenceKeeperInterval = interval;
}

function schedulePresenceStabilization(client?) {
  if (!client || client._botPresenceStabilizationScheduled) return;
  if (!wantsIdlePresence(client)) return;
  client._botPresenceStabilizationScheduled = true;
  for (const ms of PRESENCE_STABILIZE_DELAYS_MS) {
    const timer = setTimeout(() => {
      void applyBotPresence(client);
    }, ms);
    timer.unref?.();
  }
}

function notifyBotPresenceVoiceActivity(client?) {
  if (!client || !wantsIdlePresence(client)) return;
  if (client._botPresenceVoiceNotifyTimer) clearTimeout(client._botPresenceVoiceNotifyTimer);
  client._botPresenceVoiceNotifyTimer = setTimeout(() => {
    client._botPresenceVoiceNotifyTimer = null;
    void applyBotPresence(client);
  }, PRESENCE_VOICE_REAPPLY_MS);
  client._botPresenceVoiceNotifyTimer.unref?.();
}

function installBotPresenceVoiceRecovery(client?) {
  if (!client || client._botPresenceVoiceRecoveryInstalled) return;
  client._botPresenceVoiceRecoveryInstalled = true;
  client.on("voiceStateUpdate", (oldState?, newState?) => {
    const botId = client.user?.id;
    if (!botId) return;
    if (oldState?.id !== botId && newState?.id !== botId) return;
    notifyBotPresenceVoiceActivity(client);
  });
}

function installBotPresenceHooks(client?) {
  if (!client || client._botPresenceHooksInstalled) return;
  client._botPresenceHooksInstalled = true;
  patchClientPresenceGuard(client);
  installBotPresenceVoiceRecovery(client);
  client.on("clientReady", () => {
    patchClientPresenceGuard(client);
    void applyBotPresence(client);
    installBotPresenceKeeper(client);
    schedulePresenceStabilization(client);
  });
  client.on("shardReady", () => {
    void applyBotPresence(client);
  });
  client.on("shardResume", () => {
    void applyBotPresence(client);
    schedulePresenceStabilization(client);
  });
}

export = {
  isDiscordStreamingUrl,
  buildBotPresenceActivities,
  resolveBotPresenceStatus,
  buildInitialClientPresenceOptions,
  patchClientPresenceGuard,
  applyBotPresence,
  schedulePresenceStabilization,
  notifyBotPresenceVoiceActivity,
  installBotPresenceKeeper,
  installBotPresenceHooks,
};