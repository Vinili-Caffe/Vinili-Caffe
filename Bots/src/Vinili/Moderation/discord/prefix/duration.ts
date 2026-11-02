const { executeDynoModerationCommand } = require("../../utils/dynoModerationCommands") as typeof import("../../utils/dynoModerationCommands");

export = {
  name: "duration",
  async execute(message?, args?, client?) {
    return executeDynoModerationCommand("duration", message, args, client);
  },
};