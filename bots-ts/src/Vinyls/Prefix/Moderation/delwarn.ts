const { executeDynoModerationCommand } = require("../../Utils/Moderation/dynoModerationCommands") as typeof import("../../Utils/Moderation/dynoModerationCommands");

export = {
  name: "delwarn",
  async execute(message?, args?, client?) {
    return executeDynoModerationCommand("delwarn", message, args, client);
  },
};