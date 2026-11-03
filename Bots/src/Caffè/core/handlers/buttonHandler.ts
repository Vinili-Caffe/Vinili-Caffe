const path = require("path") as typeof import("path");
const { createButtonHandlersLoader } = require("../../../shared/runtime/createButtonHandlersLoader") as typeof import("../../../shared/runtime/createButtonHandlersLoader");

function isNonHandlerFile(relativeKey?) {
  const rel = String(relativeKey || "").replace(/\\/g, "/");
  const base = path.basename(rel).replace(/\.(cjs|mjs|js|cts|mts|ts)$/i, "");
  if (base === "index" || base === "components" || base.endsWith("Helpers")) return true;
  if (rel === "topChannel/components.ts" || rel === "topChannel/components.js") return true;
  return false;
}

export = createButtonHandlersLoader({
  isNonHandlerFile,
  resolveDirs: () => {
    const root = path.resolve(__dirname, "..", "..");
    return [
      path.join(root, "Voice", "discord", "buttons"),
      path.join(root, "Community", "discord", "buttons"),
      path.resolve(__dirname, "..", "..", "..", "shared", "music", "discord", "buttons"),
    ];
  },
});
