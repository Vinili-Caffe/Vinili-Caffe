const { executeDynoModerationCommand } = require("../../Utils/Moderation/dynoModerationCommands") as typeof import("../../Utils/Moderation/dynoModerationCommands");

export = {
  name: "unmute",
  async execute(message?, args?, client?) {
    return executeDynoModerationCommand("unmute", message, args, client);
  },
};