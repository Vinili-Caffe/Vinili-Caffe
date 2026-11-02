const { executeDynoModerationCommand } = require("../../utils/dynoModerationCommands") as typeof import("../../utils/dynoModerationCommands");

export = {
  name: "unmute",
  async execute(message?, args?, client?) {
    return executeDynoModerationCommand("unmute", message, args, client);
  },
};