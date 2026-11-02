const {
  handleTenantPartnerManagerRoleUpdate,
} = require("../../Partner/services/tenantPartnerManagerRoleService") as typeof import("../../Partner/services/tenantPartnerManagerRoleService");

export = {
  name: "guildMemberUpdate",
  async execute(oldMember?, newMember?, client?) {
    await handleTenantPartnerManagerRoleUpdate(oldMember, newMember, client);
  },
};
