const path = require("path") as typeof import("path");
const { listJsFilesRecursive } = require("../../../shared/runtime/fsRuntime") as typeof import("../../../shared/runtime/fsRuntime");
const { isDiscordPanelEnabled } = require("../config/discordPanelsConfig") as typeof import("../config/discordPanelsConfig");

const PANEL_DIRS = [
  path.join(__dirname, "..", "discord", "panels"),
  path.join(__dirname, "..", "..", "Moderation", "discord", "panels"),
];

const SECTION_MENU = "menu";
const SECTION_EMBED_WITH_BUTTONS = "embedWithButtons";
const SECTION_EMBED_ONLY = "embedOnly";
let panels = [];
const byName: Record<string, any> = {};

function loadPanels() {
  panels = [];
  Object.keys(byName).forEach((k?) => delete byName[k]);
  const files = [];
  for (const dir of PANEL_DIRS) {
    try {
      for (const p of listJsFilesRecursive(dir)) {
        const rel = path.relative(dir, p).replace(/\\/g, "/");
        const base = path.basename(rel).replace(/\.(cjs|mjs|js|cts|mts|ts)$/i, "");
        if (rel.includes("/")) continue;
        if (/^startupPanels\./i.test(rel)) continue;
        if (!/\.(cjs|mjs|js|cts|mts|ts)$/i.test(rel) || rel.endsWith(".d.ts")) continue;
        if (base.endsWith("Helpers")) continue;
        files.push(p);
      }
    } catch (_) {}
  }
  for (const filePath of files) {
    try {
      delete require.cache[require.resolve(filePath)];
      const mod = require(filePath);
      if (!mod || typeof mod.run !== "function" || !mod.section) {
        global.logger?.warn?.("[EMBEDS] Skip (no run/section):", path.basename(filePath));
        continue;
      }
      const name = mod.name || path.basename(filePath).replace(/\.(cjs|mjs|js|cts|mts|ts)$/i, "");
      const order = typeof mod.order === "number" ? mod.order : 50;
      panels.push({ name, order, section: mod.section, run: mod.run });
      byName[name] = mod;
    } catch (err) {
      global.logger?.error?.("[EMBEDS] Failed to load " + path.basename(filePath) + ":", err);
    }
  }
  panels.sort((a?, b?) => a.order - b.order || String(a.name).localeCompare(String(b.name)));
  return panels;
}

if (panels.length === 0) loadPanels();

function getPanelsBySection(section?, { includeDisabled = false } = {}) {
  if (panels.length === 0) loadPanels();
  return panels
    .filter((p?) => p.section === section)
    .filter((p?) => includeDisabled || isDiscordPanelEnabled(p.name))
    .map((p?) => ({ name: p.name, run: p.run }));
}

function listAllPanelMeta() {
  if (panels.length === 0) loadPanels();
  return panels.map((p?) => ({
    name: p.name,
    section: p.section,
    order: p.order,
    enabled: isDiscordPanelEnabled(p.name),
  }));
}

export = {
  getPanelsBySection,
  loadPanels,
  listAllPanelMeta,
  byName,
  SECTION_MENU,
  SECTION_EMBED_WITH_BUTTONS,
  SECTION_EMBED_ONLY,
};
