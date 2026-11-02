const { executeDynoModerationCommand } = require("../../utils/dynoModerationCommands") as typeof import("../../utils/dynoModerationCommands");

export = {
  name: "modlogs",
  async execute(message?, args?, client?) {
    return executeDynoModerationCommand("modlogs", message, args, client);
  },
};