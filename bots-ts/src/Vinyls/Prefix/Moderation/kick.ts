const { executeDynoModerationCommand } = require("../../Utils/Moderation/dynoModerationCommands") as typeof import("../../Utils/Moderation/dynoModerationCommands");

export = {
  name: "kick",
  async execute(message?, args?, client?) {
    return executeDynoModerationCommand("kick", message, args, client);
  },
};