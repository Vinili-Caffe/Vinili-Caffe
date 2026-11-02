const { logCommandUsage } = require("../Utils/Logging/commandUsageLogger") as typeof import("../Utils/Logging/commandUsageLogger");
const IDs = require("../Utils/Config/ids") as typeof import("../Utils/Config/ids");
const { createPrefixCommandLogging } = require("../../shared/discord/createCommandLoggingEvents") as typeof import("../../shared/discord/createCommandLoggingEvents");

export = createPrefixCommandLogging({
  logCommandUsage,
  getStandardPrefixes: () => ["+"],
  getPrefixOverrideMap: () => new Map(),
  resolveLogChannelId: () => IDs.channels.commandLogChannel || null,
});
