const { logCommandUsage } = require("../Utils/Logging/commandUsageLogger") as typeof import("../Utils/Logging/commandUsageLogger");
const IDs = require("../Utils/Config/ids") as typeof import("../Utils/Config/ids");
const { createInteractionCommandLogging } = require("../../shared/discord/createCommandLoggingEvents") as typeof import("../../shared/discord/createCommandLoggingEvents");

export = createInteractionCommandLogging({
  logCommandUsage,
  channelId: IDs.channels.commandLogChannel,
});
