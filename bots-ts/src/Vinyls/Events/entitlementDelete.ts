const { handleEntitlementDelete } = require("../Services/Community/discordStoreEntitlementService") as typeof import("../Services/Community/discordStoreEntitlementService");

export = {
  name: "entitlementDelete",
  async execute(entitlement?, client?) {
    await handleEntitlementDelete(entitlement, client);
  },
};
