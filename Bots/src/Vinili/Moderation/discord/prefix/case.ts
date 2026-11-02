const { executeDynoModerationCommand } = require("../../utils/dynoModerationCommands") as typeof import("../../utils/dynoModerationCommands");

export = {
  name: "case",
  async execute(message?, args?, client?) {
    return executeDynoModerationCommand("case", message, args, client);
  },
};