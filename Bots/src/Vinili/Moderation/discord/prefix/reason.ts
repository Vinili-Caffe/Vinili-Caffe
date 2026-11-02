const { executeDynoModerationCommand } = require("../../utils/dynoModerationCommands") as typeof import("../../utils/dynoModerationCommands");

export = {
  name: "reason",
  async execute(message?, args?, client?) {
    return executeDynoModerationCommand("reason", message, args, client);
  },
};