/** Log: membro entrato. */
const L = require("../../services/serverLogRuntime") as typeof import("../../services/serverLogRuntime");

export = {
  name: "guildMemberAdd",
  async execute(member?) {
    if (!member?.guild) return;
    const created = Math.floor(Number(member.user?.createdTimestamp || 0) / 1000);
    await L.sendServerLog(
      member.guild,
      "memberJoin",
      {
        color: L.COLORS.green,
        author: L.authorOf(member.user),
        title: "Membro entrato",
        description: [`${L.userLine(member.user)}`, created ? `**Account creato:** <t:${created}:R>` : "", `**Membri ora:** ${member.guild.memberCount ?? "?"}`].filter(Boolean).join("\n"),
      },
      { isBot: Boolean(member.user?.bot) },
    );
  },
};
