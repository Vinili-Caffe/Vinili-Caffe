const { logCommandUsage } = require("./interaction/commandUsageLogger") as typeof import("./interaction/commandUsageLogger");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { createInteractionCommandLogging } = require("../../../shared/discord/createCommandLoggingEvents") as typeof import("../../../shared/discord/createCommandLoggingEvents");

export = createInteractionCommandLogging({
  logCommandUsage,
  channelId: IDs.channels.commandLogChannel,
});
