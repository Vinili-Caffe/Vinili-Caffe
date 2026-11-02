const { isMultiGuildLayerEnabled } = require("../core/env") as typeof import("../core/env");
const { handleManagedInviteDeleted } = require("../services/guildJoinAlertService") as typeof import("../services/guildJoinAlertService");
const { handlePartnershipInviteDeleted } = require("../../Partner/services/partnershipInviteService") as typeof import("../../Partner/services/partnershipInviteService");

export = {
  name: "inviteDelete",
  async execute(invite?) {
    if (!isMultiGuildLayerEnabled()) return;
    const client = invite?.client;
    if (!client) return;
    await handleManagedInviteDeleted(client, invite);
    await handlePartnershipInviteDeleted(client, invite);
  },
};