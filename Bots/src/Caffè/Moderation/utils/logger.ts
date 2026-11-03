const baseLogs = require("./logs") as typeof import("./logs");
const { createBotLogger } = require("../../../shared/logging/createBotLogger") as typeof import("../../../shared/logging/createBotLogger");
const config: any = require("../../config.json") as typeof import("../../config.json");

export = createBotLogger({
  baseLogs,
  resolveLogLevel: () => String(config.logLevel || "info"),
});
