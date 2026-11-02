const { executeDynoModerationCommand } = require("../../utils/dynoModerationCommands") as typeof import("../../utils/dynoModerationCommands");

export = {
  name: "unlock",
  allowEmptyArgs: true,
  async execute(message?, args?, client?) {
    return executeDynoModerationCommand("unlock", message, args, client);
  },
};