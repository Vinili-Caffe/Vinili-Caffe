const { executeDynoModerationCommand } = require("../../Utils/Moderation/dynoModerationCommands") as typeof import("../../Utils/Moderation/dynoModerationCommands");

export = {
  name: "warn",
  async execute(message?, args?, client?) {
    return executeDynoModerationCommand("warn", message, args, client);
  },
};