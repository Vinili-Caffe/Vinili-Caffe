const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { logCommandUsage } = require("./interactionCreateCommandLogging") as typeof import("./interactionCreateCommandLogging");
const { createPrefixCommandLogging } = require("../../../shared/discord/createCommandLoggingEvents") as typeof import("../../../shared/discord/createCommandLoggingEvents");

export = createPrefixCommandLogging({
  logCommandUsage,
  getStandardPrefixes: () => ["+"],
  getPrefixOverrideMap: () => new Map(),
  resolveLogChannelId: () => IDs.channels.commandLogChannel || null,
});
