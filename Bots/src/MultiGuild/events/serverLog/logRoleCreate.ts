/** Log: ruolo creato. */
const L = require("../../services/serverLogRuntime") as typeof import("../../services/serverLogRuntime");

export = {
  name: "roleCreate",
  async execute(role?) {
    if (!role?.guild) return;
    await L.sendServerLog(role.guild, "roleCreate", { color: L.COLORS.green, title: "Ruolo creato", description: `<@&${role.id}> · **${L.clip(role.name, 100)}** \`${role.id}\`` });
  },
};
