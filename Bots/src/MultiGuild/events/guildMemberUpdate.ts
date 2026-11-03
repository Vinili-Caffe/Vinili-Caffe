const {
  handleTenantPartnerManagerRoleUpdate,
} = require("../../Vinili/Partner/services/tenantPartnerManagerRoleService") as typeof import("../../Vinili/Partner/services/tenantPartnerManagerRoleService");

export = {
  name: "guildMemberUpdate",
  async execute(oldMember?, newMember?, client?) {
    await handleTenantPartnerManagerRoleUpdate(oldMember, newMember, client);
  },
};
