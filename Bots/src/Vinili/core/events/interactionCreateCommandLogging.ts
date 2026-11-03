const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { createCommandUsageLogger } = require("../../../shared/logging/createCommandUsageLogger") as typeof import("../../../shared/logging/createCommandUsageLogger");
const { createInteractionCommandLogging } = require("../../../shared/discord/createCommandLoggingEvents") as typeof import("../../../shared/discord/createCommandLoggingEvents");

const usageLogger = createCommandUsageLogger(IDs, { truncateFields: true });
const event = createInteractionCommandLogging({
  logCommandUsage: usageLogger.logCommandUsage,
  channelId: IDs.channels.commandLogChannel,
});

export = Object.assign(event, usageLogger);
