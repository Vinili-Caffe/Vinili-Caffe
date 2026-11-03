const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");
const { collectGuildCatalog, writeCatalogFiles } = require("./buildIdsCatalog") as typeof import("./buildIdsCatalog");
const DEFAULT_DELAY_MS = 15000;
const BOT_ROOT = path.resolve(__dirname, "..");
const timers = new Map();
const pendingReasons = new Map();
const runningGuilds = new Set();
const rerunGuilds = new Set();

function getMainGuildId() {
  try {
    const IDs = require("./ids") as typeof import("./ids");
    return String(IDs.guilds?.main || "").trim();
  } catch {
    return "";
  }
}

function isIdsCatalogGuild(guildId?) {
  const mainId = getMainGuildId();
  const gid = String(guildId || "").trim();
    return Boolean(mainId && gid && gid === mainId);
}

function getCatalogPath(baseDir?) {
  return path.join(baseDir, "Config", "idsCatalog.js");
}

function addReason(guildId?, reason?) {
  const key = String(guildId || "");
  if (!key) return;
  if (!pendingReasons.has(key)) pendingReasons.set(key, new Set());
  pendingReasons.get(key).add(String(reason || "unspecified"));
}

function consumeReasons(guildId?) {
  const key = String(guildId || "");
  const reasons = pendingReasons.get(key);
  pendingReasons.delete(key);
  return Array.from(reasons || []);
}

async function runIdsCatalogSync(client?, guildId?) {
  const gid = String(guildId || "");
  if (!gid) return { changed: false, reason: "missing-guild-id" };
  if (!isIdsCatalogGuild(gid)) {
    pendingReasons.delete(gid);
    return { changed: false, reason: "not-main-guild" };
  }

  if (runningGuilds.has(gid)) {
    rerunGuilds.add(gid);
    return { changed: false, reason: "already-running" };
  }

  runningGuilds.add(gid);
  try {
    const reasons = consumeReasons(gid);
    let guild = client.guilds.cache.get(gid) || (await client.guilds.fetch(gid).catch(() => null));
    if (!guild) return { changed: false, reason: "guild-not-found" };
    guild = await guild.fetch().catch(() => guild) || guild;

    const IDs = require("./ids") as typeof import("./ids");
    const payload = await collectGuildCatalog(guild, IDs);
    const baseDir = BOT_ROOT;
    const catalogPath = getCatalogPath(baseDir);
    let previous = "";
    try {
      previous = await fs.promises.readFile(catalogPath, "utf8");
    } catch {
      previous = "";
    }

    if (previous === payload.catalogSource) return { changed: false, reason: "no-diff", triggers: reasons };

    await writeCatalogFiles(baseDir, payload);
    delete require.cache[require.resolve("./idsCatalog")];
    delete require.cache[require.resolve("./ids")];

    return { changed: true, triggers: reasons };
  } catch (error) {
    global.logger.error("[IDS AUTO SYNC] Failed:", error);
    return { changed: false, reason: "error", error };
  } finally {
    runningGuilds.delete(gid);
    if (rerunGuilds.has(gid)) {
      rerunGuilds.delete(gid);
      queueIdsCatalogSync(client, gid, "rerun", { delayMs: 3000 });
    }
  }
}

function queueIdsCatalogSync(client?, guildId?, reason = "event", options: Record<string, any> = {}) {
  const gid = String(guildId || "");
  if (!gid) return;
  if (!isIdsCatalogGuild(gid)) return;
  addReason(gid, reason);

  const delayMs = Number.isFinite(options.delayMs) ? Math.max(0, options.delayMs) : DEFAULT_DELAY_MS;
  const existing = timers.get(gid);
  if (existing) clearTimeout(existing);

  const timer = setTimeout(async () => { timers.delete(gid); await runIdsCatalogSync(client, gid); }, delayMs);
  timer.unref?.();

  timers.set(gid, timer);
}

export = { queueIdsCatalogSync };