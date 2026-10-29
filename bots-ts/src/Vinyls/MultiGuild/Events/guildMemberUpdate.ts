const {
  handleTenantPartnerManagerRoleUpdate,
} = require("../../Services/Partner/tenantPartnerManagerRoleService") as typeof import("../../Services/Partner/tenantPartnerManagerRoleService");

export = {
  name: "guildMemberUpdate",
  async execute(oldMember?, newMember?, client?) {
    await handleTenantPartnerManagerRoleUpdate(oldMember, newMember, client);
  },
};
