const { executeDynoModerationCommand } = require("../../Utils/Moderation/dynoModerationCommands") as typeof import("../../Utils/Moderation/dynoModerationCommands");

export = {
  name: "clearwarn",
  async execute(message?, args?, client?) {
    return executeDynoModerationCommand("clearwarn", message, args, client);
  },
};