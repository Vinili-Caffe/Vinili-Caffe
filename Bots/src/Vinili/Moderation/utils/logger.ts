const baseLogs = require("./logs") as typeof import("./logs");
const { createBotLogger } = require("../../../shared/logging/createBotLogger") as typeof import("../../../shared/logging/createBotLogger");
const config = require("../../config.json") as typeof import("../../config.json");

export = createBotLogger({
  baseLogs,
  resolveLogLevel: () => {
    const fromEnv = String(process.env.LOG_LEVEL || process.env.VC_LOG_LEVEL || "")
      .trim()
      .toLowerCase();
    if (fromEnv) return fromEnv;
    return String(config.logLevel || "info");
  },
});
