const path = require("path") as typeof import("path");
const { listJsFilesRecursive } = require("../../shared/runtime/fsRuntime") as typeof import("../../shared/runtime/fsRuntime");

const IDS_SUBFOLDER = path.sep + "ids" + path.sep;

const REMOVED_BUTTON_HANDLER_NAMES = new Set([
  "balGui",
  "incomeClaimGui",
  "blackjackGui",
  "coinflipGui",
  "duelGui",
  "robGui",
  "rouletteGui",
  "rpsGui",
  "scratchGui",
  "shopGui",
  "slotsGui",
  "trisGui",
  "classificaToggle",
  "myquoteDelete",
  "myrepostDelete",
  "myclipDelete",
  "myquotePagination",
  "myrepostPagination",
  "myclipPagination",
  "colorsCommand",
  "candidature",
  "ticket",
  "websiteUnbanSite",
  "websiteUnmuteSite",
  "resoconto",
  "profile",
]);

function isNonHandlerFile(relativeKey?) {
  const rel = String(relativeKey || "").replace(/\\/g, "/");
  const base = path.basename(rel).replace(/\.(cjs|mjs|js|cts|mts|ts)$/i, "");
  if (base === "index" || base === "components" || base === "idBarrel" || base === "buttonParsers" || base.endsWith("Helpers")) return true;
  if (rel.endsWith("/topChannel/components.ts") || rel.endsWith("/topChannel/components.js")) return true;
  return false;
}

function collectHandlerPaths(dirs?) {
  const out = [];
  for (const dir of dirs || []) {
    if (!dir) continue;
    const abs = path.resolve(dir);
    try {
      const { existsSync } = require("fs") as typeof import("fs");
      if (!existsSync(abs)) continue;
    } catch {
      continue;
    }
    for (const fullPath of listJsFilesRecursive(abs)) {
      if (fullPath.includes(IDS_SUBFOLDER)) continue;
      if (isNonHandlerFile(path.relative(abs, fullPath))) continue;
      out.push({ dir: abs, fullPath });
    }
  }
  return out;
}

export = (client?) => {
  client.buttonHandlers = client.buttonHandlers || [];

  client.loadButtonHandlers = async (basePaths?) => {
    const partnerButtons = path.resolve(__dirname, "..", "Partner", "discord", "buttons");
    const statsButtons = path.resolve(__dirname, "..", "Stats", "discord", "buttons");
    const musicButtons = path.resolve(__dirname, "..", "..", "shared", "music", "discord", "buttons");
    const moderationButtons = path.resolve(__dirname, "..", "Moderation", "discord", "buttons");
    const communityButtons = path.resolve(__dirname, "..", "Community", "discord", "buttons");
    const giveawayButtons = path.resolve(__dirname, "..", "Giveaway", "discord", "buttons");
    const minigamesButtons = path.resolve(__dirname, "..", "Minigames", "discord", "buttons");
    const backupButtons = path.resolve(__dirname, "..", "Backup", "discord", "buttons");
    const levelButtons = path.resolve(__dirname, "..", "Level", "discord", "buttons");
    const securityButtons = path.resolve(__dirname, "..", "Security", "discord", "buttons");
    const multiGuildButtons = path.resolve(__dirname, "..", "MultiGuild", "Buttons");
    const defaults = [
      partnerButtons,
      statsButtons,
      giveawayButtons,
      minigamesButtons,
      backupButtons,
      levelButtons,
      securityButtons,
      communityButtons,
      musicButtons,
      moderationButtons,
      multiGuildButtons,
    ];
    const dirs = Array.isArray(basePaths)
      ? basePaths
      : basePaths
        ? [basePaths, ...defaults]
        : defaults;

    const loaded = [];
    const seenNames = new Set();
    for (const { dir, fullPath } of collectHandlerPaths(dirs)) {
      const key = path.relative(dir, fullPath);
      const fileName = path.basename(fullPath).replace(/\.(cjs|mjs|js|cts|mts|ts)$/i, "");
      if (REMOVED_BUTTON_HANDLER_NAMES.has(String(fileName).trim())) continue;
      try {
        delete require.cache[require.resolve(fullPath)];
        const mod = require(fullPath);
        if (!mod || typeof mod.match !== "function" || typeof mod.execute !== "function") {
          global.logger?.warn?.(`[BUTTON_HANDLERS] ${key}: missing match/execute, skipped.`);
          continue;
        }
        const name = mod.name || fileName;
        if (REMOVED_BUTTON_HANDLER_NAMES.has(String(name).trim())) continue;
        const nameKey = String(name).trim().toLowerCase();
        if (seenNames.has(nameKey)) continue;
        seenNames.add(nameKey);
        loaded.push({
          name,
          order: typeof mod.order === "number" ? mod.order : 100,
          match: mod.match,
          execute: mod.execute,
          source: key.replace(/\\/g, "/"),
        });
      } catch (err) {
        global.logger?.error?.(`[BUTTON_HANDLERS] Failed to load ${key}:`, err);
      }
    }

    loaded.sort((a?, b?) => a.order - b.order || String(a.name).localeCompare(String(b.name)));
    client.buttonHandlers = loaded;
    return client.buttonHandlers;
  };
};
