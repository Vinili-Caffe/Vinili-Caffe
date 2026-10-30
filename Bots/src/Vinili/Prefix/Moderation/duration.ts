const { executeDynoModerationCommand } = require("../../Utils/Moderation/dynoModerationCommands") as typeof import("../../Utils/Moderation/dynoModerationCommands");

export = {
  name: "duration",
  async execute(message?, args?, client?) {
    return executeDynoModerationCommand("duration", message, args, client);
  },
};