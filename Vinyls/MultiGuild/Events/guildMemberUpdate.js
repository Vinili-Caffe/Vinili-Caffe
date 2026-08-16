const {
  handleTenantPartnerManagerRoleUpdate,
} = require("../../Services/Partner/tenantPartnerManagerRoleService");

module.exports = {
  name: "guildMemberUpdate",
  async execute(oldMember, newMember, client) {
    await handleTenantPartnerManagerRoleUpdate(oldMember, newMember, client);
  },
};
