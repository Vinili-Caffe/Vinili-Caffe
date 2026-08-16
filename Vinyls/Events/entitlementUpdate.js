const { handleEntitlementUpdate } = require("../Services/Community/discordStoreEntitlementService");

module.exports = {
  name: "entitlementUpdate",
  async execute(_oldEntitlement, newEntitlement, client) {
    await handleEntitlementUpdate(newEntitlement, client);
  },
};
