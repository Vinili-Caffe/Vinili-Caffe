const { executeDynoModerationCommand } = require("../../utils/dynoModerationCommands") as typeof import("../../utils/dynoModerationCommands");

export = {
  name: "lock",
  allowEmptyArgs: true,
  async execute(message?, args?, client?) {
    return executeDynoModerationCommand("lock", message, args, client);
  },
};