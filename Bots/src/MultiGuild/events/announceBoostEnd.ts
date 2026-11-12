/** Boost finito: toglie i ruoli del boost dati dalla dashboard. */
const { handleBoostEnded } = require("../services/announcementsRuntime") as typeof import("../services/announcementsRuntime");

export = {
  name: "guildMemberUpdate",
  async execute(oldMember?, newMember?) {
    await handleBoostEnded(oldMember, newMember).catch((err?) => global.logger?.warn?.("[ANNUNCI] boost finito:", err?.message || err));
  },
};
