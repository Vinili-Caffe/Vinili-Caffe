const { executeDynoModerationCommand } = require("../../Utils/Moderation/dynoModerationCommands") as typeof import("../../Utils/Moderation/dynoModerationCommands");

export = {
  name: "unlock",
  allowEmptyArgs: true,
  async execute(message?, args?, client?) {
    return executeDynoModerationCommand("unlock", message, args, client);
  },
};