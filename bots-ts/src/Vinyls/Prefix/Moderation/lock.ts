const { executeDynoModerationCommand } = require("../../Utils/Moderation/dynoModerationCommands") as typeof import("../../Utils/Moderation/dynoModerationCommands");

export = {
  name: "lock",
  allowEmptyArgs: true,
  async execute(message?, args?, client?) {
    return executeDynoModerationCommand("lock", message, args, client);
  },
};