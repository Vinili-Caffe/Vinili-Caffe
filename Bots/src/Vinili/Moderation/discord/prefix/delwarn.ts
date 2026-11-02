const { executeDynoModerationCommand } = require("../../utils/dynoModerationCommands") as typeof import("../../utils/dynoModerationCommands");

export = {
  name: "delwarn",
  async execute(message?, args?, client?) {
    return executeDynoModerationCommand("delwarn", message, args, client);
  },
};