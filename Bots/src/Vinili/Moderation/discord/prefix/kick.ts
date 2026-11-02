const { executeDynoModerationCommand } = require("../../utils/dynoModerationCommands") as typeof import("../../utils/dynoModerationCommands");

export = {
  name: "kick",
  async execute(message?, args?, client?) {
    return executeDynoModerationCommand("kick", message, args, client);
  },
};