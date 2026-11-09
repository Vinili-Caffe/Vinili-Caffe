/** Log: ruolo eliminato. */
const L = require("../../services/serverLogRuntime") as typeof import("../../services/serverLogRuntime");

export = {
  name: "roleDelete",
  async execute(role?) {
    if (!role?.guild) return;
    await L.sendServerLog(role.guild, "roleDelete", { color: L.COLORS.red, title: "Ruolo eliminato", description: `**@${L.clip(role.name, 100)}** \`${role.id}\`` });
  },
};
