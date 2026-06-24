function resolveEventListenersCeiling(configLike, fallback = 50) {
  const raw = Number(configLike?.eventListeners ?? fallback);
  if (!Number.isFinite(raw) || raw <= 0) return fallback;
  return Math.max(10, Math.floor(raw));
}

function applyGatewayShardListenerCeiling(client, maxListeners) {
  const inner = client?.ws?._ws;
  const shards = inner?.shards;
  if (!shards || typeof shards.values !== "function") return 0;
  let count = 0;
  for (const shard of shards.values()) {
    if (typeof shard?.setMaxListeners === "function") {
      shard.setMaxListeners(maxListeners);
      count += 1;
    }
  }
  return count;
}

function installGatewayShardListenerCeiling(client) {
  if (!client || client._gatewayShardListenerCeilingInstalled) return;
  client._gatewayShardListenerCeilingInstalled = true;
  const maxListeners = resolveEventListenersCeiling(client.config);
  const apply = () => {
    applyGatewayShardListenerCeiling(client, maxListeners);
  };
  client.on("clientReady", apply);
  client.on("shardReady", apply);
  client.on("shardResume", apply);
}

module.exports = {
  applyGatewayShardListenerCeiling,
  installGatewayShardListenerCeiling,
  resolveEventListenersCeiling,
};