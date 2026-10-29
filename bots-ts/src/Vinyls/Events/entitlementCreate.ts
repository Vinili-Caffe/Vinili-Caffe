const { handleEntitlementCreate } = require("../Services/Community/discordStoreEntitlementService") as typeof import("../Services/Community/discordStoreEntitlementService");

export = {
  name: "entitlementCreate",
  async execute(entitlement?, client?) {
    await handleEntitlementCreate(entitlement, client);
  },
};
