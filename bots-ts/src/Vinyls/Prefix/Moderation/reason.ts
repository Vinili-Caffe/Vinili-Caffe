const { executeDynoModerationCommand } = require("../../Utils/Moderation/dynoModerationCommands") as typeof import("../../Utils/Moderation/dynoModerationCommands");

export = {
  name: "reason",
  async execute(message?, args?, client?) {
    return executeDynoModerationCommand("reason", message, args, client);
  },
};