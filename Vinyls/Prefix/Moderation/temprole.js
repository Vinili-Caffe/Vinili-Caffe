const { executeDynoModerationCommand } = require("../../Utils/Moderation/dynoModerationCommands");

module.exports = {
  name: "temprole",
  args: true,
  usage: "+temprole [user] [time] [role], [optional reason]",
  subcommands: ["add", "remove"],
  async execute(message, args, client) {
    return executeDynoModerationCommand("temprole", message, args, client);
  },
};