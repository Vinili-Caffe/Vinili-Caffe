const { executeDynoModerationCommand } = require("../../Utils/Moderation/dynoModerationCommands") as typeof import("../../Utils/Moderation/dynoModerationCommands");

export = {
  name: "moderations",
  async execute(message?, args?, client?) {
    return executeDynoModerationCommand("moderations", message, args, client);
  },
};