const path = require("path") as typeof import("path");
const APP_ROOT = __dirname;

require("dotenv").config({ path: path.join(APP_ROOT, ".env"), quiet: true });
require("dotenv").config({ path: path.join(APP_ROOT, "..", ".env"), quiet: true });

const enableSharding = process.env.ENABLE_SHARDING === "1" || process.env.SHARDING === "1";

function resolveToken() {
  return (
    process.env.DISCORD_TOKEN ||
    process.env.DISCORD_TOKEN_OFFICIAL ||
    (function () {
      try {
        return require("./config.json").token;
      } catch {
        return null;
      }
    })()
  );
}

function logShard(message?) {
  if (global.logger?.info) {
    global.logger.info(message);
    return;
  }
  console.log(message);
}

async function start() {
  if (!enableSharding) {
    require("./index.js");
    return;
  }

  const token = resolveToken();
  if (!token) {
    console.error("[SHARD] Missing token. Set DISCORD_TOKEN o DISCORD_TOKEN_OFFICIAL.");
    process.exit(1);
  }

  let recommendedShards = 1;
  try {
    const { fetchRecommendedShardCount } = require("discord.js") as typeof import("discord.js");
    recommendedShards = await fetchRecommendedShardCount(token);
  } catch (err) {
    logShard(`[SHARD] recommended count failed, fallback 1 shard: ${err?.message || err}`);
  }

  if (!Number.isFinite(recommendedShards) || recommendedShards <= 1) {
    logShard("[SHARD] 1 shard sufficiente: avvio diretto index.js (no ShardingManager)");
    require("./index.js");
    return;
  }

  const { ShardingManager } = require("discord.js") as typeof import("discord.js");
  const workerPath = path.join(APP_ROOT, "index.js");
  const manager = new ShardingManager(workerPath, { totalShards: recommendedShards, token });

  manager.on("shardCreate", (shard?) => {
    logShard(`[SHARD] Shard ${shard.id} spawned`);
  });

  await manager.spawn().catch((err?) => {
    console.error("[SHARD] Failed to spawn shards:", err);
    process.exit(1);
  });
}

start().catch((err?) => {
  console.error("[SHARD] Startup failed:", err?.message || err);
  process.exit(1);
});