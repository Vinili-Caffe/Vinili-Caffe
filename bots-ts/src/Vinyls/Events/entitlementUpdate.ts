const { handleEntitlementUpdate } = require("../Services/Community/discordStoreEntitlementService") as typeof import("../Services/Community/discordStoreEntitlementService");

export = {
  name: "entitlementUpdate",
  async execute(_oldEntitlement?, newEntitlement?, client?) {
    await handleEntitlementUpdate(newEntitlement, client);
  },
};
