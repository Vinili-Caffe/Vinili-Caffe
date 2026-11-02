const { executeDynoModerationCommand } = require("../../utils/dynoModerationCommands") as typeof import("../../utils/dynoModerationCommands");

export = {
  name: "mute",
  async execute(message?, args?, client?) {
    return executeDynoModerationCommand("mute", message, args, client);
  },
};