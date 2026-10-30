const { executeDynoModerationCommand } = require("../../Utils/Moderation/dynoModerationCommands") as typeof import("../../Utils/Moderation/dynoModerationCommands");

export = {
  name: "ban",
  async execute(message?, args?, client?) {
    return executeDynoModerationCommand("ban", message, args, client);
  },
};