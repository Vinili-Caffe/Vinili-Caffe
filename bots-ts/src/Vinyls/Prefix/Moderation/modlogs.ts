const { executeDynoModerationCommand } = require("../../Utils/Moderation/dynoModerationCommands") as typeof import("../../Utils/Moderation/dynoModerationCommands");

export = {
  name: "modlogs",
  async execute(message?, args?, client?) {
    return executeDynoModerationCommand("modlogs", message, args, client);
  },
};