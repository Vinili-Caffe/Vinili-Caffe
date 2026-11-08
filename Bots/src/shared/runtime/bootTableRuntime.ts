const path = require("path") as typeof import("path");
const { listJsFilesRecursive } = require("./fsRuntime") as typeof import("./fsRuntime");

function logBootTable(categories = [], baseDir = process.cwd()) {
  const safeCategories = Array.isArray(categories) ? categories.filter(Boolean) : [];
  const summary = [];
  let total = 0;

  for (const category of safeCategories) {
    const absBase = path.isAbsolute(category) ? path.resolve(category) : path.resolve(baseDir, category);
    const label = path.isAbsolute(category) ? path.basename(absBase) : category;
    const files = listJsFilesRecursive(absBase);
    const count = files.length;
    total += count;
    summary.push(`${label}: ${count}`);
  }

  if (!summary.length) return;
  try {
    const { noteBoot } = require("./bootSummary") as typeof import("./bootSummary");
    /* client non passato qui: salva su global per il ready successivo */
    const g: any = global;
    if (!g.__vcBootPending) g.__vcBootPending = {};
    g.__vcBootPending.modules = total;
    g.__vcBootPending.moduleSummary = summary.join(", ");
  } catch (_) {
    /* ignore */
  }
  /* dettaglio moduli solo se BOOT_VERBOSE=1 */
  if (String(process.env.BOOT_VERBOSE || "").trim() === "1") {
    global.logger?.info?.(`[BOOT] Loaded ${total} modules (${summary.join(", ")})`);
  }
}

export = { logBootTable };