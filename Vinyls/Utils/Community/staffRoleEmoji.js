const IDs = require("../Config/ids");

const STAFF_EMOJI_BY_ROLE_ID = new Map(
  [
    [IDs.roles.Helper, "<:VC_Helper:1494287597952958514>"],
    [IDs.roles.Mod, "<:VC_Mod:1494286913744539648>"],
    [IDs.roles.Admin, "<:VC_Admin:1494286915778641941>"],
    [IDs.roles.Founder, "<:VC_Founder:1494286918974963732>"],
    [IDs.roles.PartnerManager, "<:VC_PartnerManager:1494286911286808576>"],
    [IDs.roles.HighStaff, "<:VC_Staff:1494286904089247754>"],
    [IDs.roles.Staff, "<:VC_Staff:1494286904089247754>"],
  ]
    .filter(([roleId]) => roleId)
    .map(([roleId, emoji]) => [String(roleId), emoji]),
);

function getStaffRoleEmojiByRoleId(roleId, fallback = "<:VC_Staff:1494286904089247754>") {
  const key = String(roleId || "");
  return STAFF_EMOJI_BY_ROLE_ID.get(key) || fallback;
}

module.exports = {
  getStaffRoleEmojiByRoleId,
};