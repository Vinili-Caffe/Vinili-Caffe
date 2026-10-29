const { executeDynoModerationCommand } = require("../../Utils/Moderation/dynoModerationCommands") as typeof import("../../Utils/Moderation/dynoModerationCommands");

export = {
  name: "unban",
  async execute(message?, args?, client?) {
    return executeDynoModerationCommand("unban", message, args, client);
  },
};