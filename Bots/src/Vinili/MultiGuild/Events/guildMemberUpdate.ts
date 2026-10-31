const {
  handleTenantPartnerManagerRoleUpdate,
} = require("../services/Partner/tenantPartnerManagerRoleService") as typeof import("../services/Partner/tenantPartnerManagerRoleService");

export = {
  name: "guildMemberUpdate",
  async execute(oldMember?, newMember?, client?) {
    await handleTenantPartnerManagerRoleUpdate(oldMember, newMember, client);
  },
};
