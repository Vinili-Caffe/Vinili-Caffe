/** Annuncio dei boost sui server tenant (dal messaggio di sistema di Discord). */
const { handleTenantBoostMessage } = require("../services/announcementsRuntime") as typeof import("../services/announcementsRuntime");

export = {
  name: "messageCreate",
  async execute(message?) {
    if (!message?.guild || !message.system) return;
    await handleTenantBoostMessage(message).catch((err?) => global.logger?.warn?.("[ANNUNCI] boost:", err?.message || err));
  },
};
