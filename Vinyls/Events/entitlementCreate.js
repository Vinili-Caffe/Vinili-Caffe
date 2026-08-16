const { handleEntitlementCreate } = require("../Services/Community/discordStoreEntitlementService");

module.exports = {
  name: "entitlementCreate",
  async execute(entitlement, client) {
    await handleEntitlementCreate(entitlement, client);
  },
};
