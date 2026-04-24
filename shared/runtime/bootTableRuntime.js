const path = require("path");
const { listJsFilesRecursive } = require("./fsRuntime");

function logBootTable(categories = [], baseDir = process.cwd()) {
  const safeCategories = Array.isArray(categories) ? categories.filter(Boolean) : [];
  const summary = [];
  let total = 0;

  for (const category of safeCategories) {
    const absBase = path.resolve(baseDir, category);
    const files = listJsFilesRecursive(absBase);
    const count = files.length;
    total += count;
    summary.push(`${category}: ${count}`);
  }

  if (!summary.length) return;
  global.logger?.info?.(`[BOOT] Loaded ${total} modules (${summary.join(", ")})`);
}

module.exports = { logBootTable };