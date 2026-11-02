const { executeDynoModerationCommand } = require("../../utils/dynoModerationCommands") as typeof import("../../utils/dynoModerationCommands");

export = {
  name: "warn",
  async execute(message?, args?, client?) {
    return executeDynoModerationCommand("warn", message, args, client);
  },
};