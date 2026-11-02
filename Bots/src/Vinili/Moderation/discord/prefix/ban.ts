const { executeDynoModerationCommand } = require("../../utils/dynoModerationCommands") as typeof import("../../utils/dynoModerationCommands");

export = {
  name: "ban",
  async execute(message?, args?, client?) {
    return executeDynoModerationCommand("ban", message, args, client);
  },
};