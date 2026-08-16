const { handleEntitlementDelete } = require("../Services/Community/discordStoreEntitlementService");

module.exports = {
  name: "entitlementDelete",
  async execute(entitlement, client) {
    await handleEntitlementDelete(entitlement, client);
  },
};
