const { isMultiGuildLayerEnabled } = require("../core/env");
const { handleManagedInviteDeleted } = require("../services/guildJoinAlertService");

module.exports = {
  name: "inviteDelete",
  async execute(invite) {
    if (!isMultiGuildLayerEnabled()) return;
    const client = invite?.client;
    if (!client) return;
    await handleManagedInviteDeleted(client, invite);
  },
};