const { EventEmitter } = require("events") as typeof import("events");

function resolveEventListenersCeiling(configLike?, fallback = 50) {
  const raw = Number(configLike?.eventListeners ?? fallback);
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.max(10, Math.floor(raw));
}

function raiseAsyncEventEmitterDefaults(maxListeners?) {
  try {
    const mod = require("@vladfrangu/async_event_emitter") as typeof import("@vladfrangu/async_event_emitter");
    const Ctor = mod?.AsyncEventEmitter || mod?.default;
    if (Ctor && typeof Ctor === "function") {
            if ("defaultMaxListeners" in Ctor) {
        Ctor.defaultMaxListeners = Math.max(Number(Ctor.defaultMaxListeners) || 0, maxListeners);
      }
    }
  } catch (_) {}
  try {
    if (Number(EventEmitter.defaultMaxListeners || 0) < maxListeners) {
      EventEmitter.defaultMaxListeners = maxListeners;
    }
  } catch (_) {}
}

function pushUniqueEmitter(list?, emitter?) {
  if (!emitter || typeof emitter.setMaxListeners !== "function") return;
  if (list.includes(emitter)) return;
  list.push(emitter);
}

function collectGatewayEmitters(client?) {
  const out = [];
  pushUniqueEmitter(out, client);
  pushUniqueEmitter(out, client?.ws);

  const djsShards = client?.ws?.shards;
  if (djsShards && typeof djsShards.values === "function") {
    for (const shard of djsShards.values()) pushUniqueEmitter(out, shard);
  }

  const inner = client?.ws?._ws;
  pushUniqueEmitter(out, inner);
  if (inner?.shards && typeof inner.shards.values === "function") {
    for (const shard of inner.shards.values()) pushUniqueEmitter(out, shard);
  }

  const strategy = inner?.strategy;
  pushUniqueEmitter(out, strategy);
  if (strategy?.shards && typeof strategy.shards.values === "function") {
    for (const shard of strategy.shards.values()) pushUniqueEmitter(out, shard);
  }

  return out;
}

function applyGatewayShardListenerCeiling(client?, maxListeners?) {
  const n = Math.max(10, Math.floor(Number(maxListeners) || 50));
  raiseAsyncEventEmitterDefaults(n);
  const emitters = collectGatewayEmitters(client);
  for (const emitter of emitters) {
    try {
      emitter.setMaxListeners(n);
    } catch (_) {}
  }
  return emitters.length;
}

function installGatewayShardListenerCeiling(client?) {
  if (!client || client._gatewayShardListenerCeilingInstalled) return;
  client._gatewayShardListenerCeilingInstalled = true;
  const maxListeners = resolveEventListenersCeiling(client.config);
  raiseAsyncEventEmitterDefaults(maxListeners);

  const apply = () => {
    applyGatewayShardListenerCeiling(client, maxListeners);
  };

  apply();
  client.on("clientReady", apply);
  client.on("shardReady", apply);
  client.on("shardResume", apply);
  client.on("shardReconnecting", apply);
  client.on("shardDisconnect", apply);

    let passes = 0;
  const bootTimer = setInterval(() => {
    apply();
    passes += 1;
    if (passes >= 40 || client._gatewayShardListenerCeilingSettled) {
      clearInterval(bootTimer);
    }
  }, 500);
  bootTimer.unref?.();

  client.once("clientReady", () => {
    apply();
    const settle = setTimeout(() => {
      client._gatewayShardListenerCeilingSettled = true;
    }, 30_000);
    settle.unref?.();
  });
}

export = {
  applyGatewayShardListenerCeiling,
  collectGatewayEmitters,
  installGatewayShardListenerCeiling,
  resolveEventListenersCeiling,
  raiseAsyncEventEmitterDefaults,
};
