const { safeMessageReply } = require("../../../../shared/discord/replyRuntime") as typeof import("../../../../shared/discord/replyRuntime");
const { buildBackupPanelPayload, SECTION_HOME } = require("../../utils/backupPanelRuntime") as typeof import("../../utils/backupPanelRuntime");

export = {
  name: "backup",
  description: "Centro backup: menu e moduli per snapshot, lista, info, load e delete",
  usage: "+backup",
  examples: ["+backup"],
  async execute(message?) {
    const guild = message.guild;
    if (!guild) return;
    const ownerId = message.author.id;
    const payload = await buildBackupPanelPayload(guild, ownerId, SECTION_HOME);
    await safeMessageReply(message, payload);
  },
};