const { executeDynoModerationCommand } = require("../../utils/dynoModerationCommands") as typeof import("../../utils/dynoModerationCommands");

export = {
  name: "clearwarn",
  async execute(message?, args?, client?) {
    return executeDynoModerationCommand("clearwarn", message, args, client);
  },
};