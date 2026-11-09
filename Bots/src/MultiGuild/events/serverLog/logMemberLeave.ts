/** Log: membro uscito. */
const L = require("../../services/serverLogRuntime") as typeof import("../../services/serverLogRuntime");

export = {
  name: "guildMemberRemove",
  async execute(member?) {
    if (!member?.guild) return;
    const joined = Math.floor(Number(member.joinedTimestamp || 0) / 1000);
    const roles = member.roles?.cache ? [...member.roles.cache.values()].filter((r?) => r.id !== member.guild.id).map((r?) => `<@&${r.id}>`) : [];
    await L.sendServerLog(
      member.guild,
      "memberLeave",
      {
        color: L.COLORS.grey,
        author: L.authorOf(member.user),
        title: "Membro uscito",
        description: [`${L.userLine(member.user)}`, joined ? `**Era entrato:** <t:${joined}:R>` : "", roles.length ? `**Ruoli:** ${L.clip(roles.join(" "), 900)}` : ""].filter(Boolean).join("\n"),
      },
      { isBot: Boolean(member.user?.bot) },
    );
  },
};
