const { executeDynoModerationCommand } = require("../../utils/dynoModerationCommands") as typeof import("../../utils/dynoModerationCommands");

export = {
  name: "warnings",
  async execute(message?, args?, client?) {
    return executeDynoModerationCommand("warnings", message, args, client);
  },
};