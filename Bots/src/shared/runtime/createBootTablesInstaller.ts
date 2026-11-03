const path = require("path") as typeof import("path");
const { logBootTable } = require("./bootTableRuntime") as typeof import("./bootTableRuntime");

/**
 * Installs client.logBootTables counting modules under the given top-level folders.
 */
function installBootTables(client?, categories = [], appRoot?) {
  if (!client) return;
  const cats = Array.isArray(categories) ? categories.filter(Boolean).map(String) : [];
  const root = appRoot ? path.resolve(appRoot) : null;
  client.logBootTables = () => {
    const base = root || path.resolve(__dirname, "..", "..");
    logBootTable(cats, base);
  };
}

export = { installBootTables };
