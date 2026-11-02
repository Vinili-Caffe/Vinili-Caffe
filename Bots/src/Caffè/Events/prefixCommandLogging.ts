const { logCommandUsage } = require("../Utils/Logging/commandUsageLogger") as typeof import("../Utils/Logging/commandUsageLogger");
const IDs = require("../Utils/Config/ids") as typeof import("../Utils/Config/ids");
const { createPrefixCommandLogging } = require("../../shared/discord/createCommandLoggingEvents") as typeof import("../../shared/discord/createCommandLoggingEvents");

export = createPrefixCommandLogging({
  logCommandUsage,
  getStandardPrefixes: (client?) => {
    const configured = String(client?.config?.prefix || ",").trim() || ",";
    return Array.from(new Set([configured]));
  },
  resolveLogChannelId: () => IDs.channels.commandLogChannel,
});
