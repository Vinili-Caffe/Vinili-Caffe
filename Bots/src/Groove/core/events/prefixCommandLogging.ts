const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { logCommandUsage } = require("./interactionCreateCommandLogging") as typeof import("./interactionCreateCommandLogging");
const { createPrefixCommandLogging } = require("../../../shared/discord/createCommandLoggingEvents") as typeof import("../../../shared/discord/createCommandLoggingEvents");

export = createPrefixCommandLogging({
  logCommandUsage,
  getStandardPrefixes: (client?) => {
    const configured = String(client?.config?.prefix || ",").trim() || ",";
    return Array.from(new Set([configured]));
  },
  resolveLogChannelId: () => IDs.channels.commandLogChannel,
});
