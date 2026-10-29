const { executeDynoModerationCommand } = require("../../Utils/Moderation/dynoModerationCommands") as typeof import("../../Utils/Moderation/dynoModerationCommands");

export = {
  name: "mute",
  async execute(message?, args?, client?) {
    return executeDynoModerationCommand("mute", message, args, client);
  },
};