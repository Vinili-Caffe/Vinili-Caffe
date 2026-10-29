const { executeDynoModerationCommand } = require("../../Utils/Moderation/dynoModerationCommands") as typeof import("../../Utils/Moderation/dynoModerationCommands");

export = {
  name: "case",
  async execute(message?, args?, client?) {
    return executeDynoModerationCommand("case", message, args, client);
  },
};