const { executeTenantHelp } = require("../../utils/tenantHelp") as typeof import("../../utils/tenantHelp");
const { isViniliFullFeatureGuild } = require("../../core/guildFeatureScope") as typeof import("../../core/guildFeatureScope");

/** +help solo tenant (partnership). Sul main Vinili non risponde (wiki sul sito). */
export = {
  name: "help",
  allowEmptyArgs: true,
  description: "Apre la guida ai comandi disponibili su questo server.",
  usage: "+help [comando]",
  examples: ["+help", "+help setup", "+help points"],
  async execute(message?, args?) {
    if (!message?.guild || !message?.member) return;
    if (isViniliFullFeatureGuild(message.guild.id)) return;
    return executeTenantHelp(message, args);
  },
};
