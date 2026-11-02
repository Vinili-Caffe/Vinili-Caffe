const { executeDynoModerationCommand } = require("../../utils/dynoModerationCommands") as typeof import("../../utils/dynoModerationCommands");

export = {
  name: "moderations",
  async execute(message?, args?, client?) {
    return executeDynoModerationCommand("moderations", message, args, client);
  },
};