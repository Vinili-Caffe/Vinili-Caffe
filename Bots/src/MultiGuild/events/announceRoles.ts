/** Annuncio "ruolo ottenuto" (regole della dashboard), su tutti i server. */
const { handleRoleAdded } = require("../services/announcementsRuntime") as typeof import("../services/announcementsRuntime");

export = {
  name: "guildMemberUpdate",
  async execute(oldMember?, newMember?) {
    await handleRoleAdded(oldMember, newMember).catch((err?) => global.logger?.warn?.("[ANNUNCI] ruolo:", err?.message || err));
  },
};
