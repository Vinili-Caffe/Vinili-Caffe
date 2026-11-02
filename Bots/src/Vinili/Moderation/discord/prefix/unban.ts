const { executeDynoModerationCommand } = require("../../utils/dynoModerationCommands") as typeof import("../../utils/dynoModerationCommands");

export = {
  name: "unban",
  async execute(message?, args?, client?) {
    return executeDynoModerationCommand("unban", message, args, client);
  },
};