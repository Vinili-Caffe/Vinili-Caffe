const IDs = require("../../Config/ids") as typeof import("../../Config/ids");

const STAFF_EMOJI_BY_ROLE_ID = new Map(
  [
    [IDs.roles.Helper, "<:VC_Helper:1502328751638450426>"],
    [IDs.roles.Mod, "<:VC_Mod:1494287597952958514>"],
    [IDs.roles.SeniorModerator, "<:VC_SeniorModerator:1494286913744539648>"],
    [IDs.roles.Director, "<:VC_Director:1494286915778641941>"],
    [IDs.roles.Admin, "<:VC_Admin:1494286848686686209>"],
    [IDs.roles.Manager, "<:VC_Manager:1521629610876338307>"],
    [IDs.roles.Founder, "<:VC_Founder:1494286918974963732>"],
    [IDs.roles.PartnerManager, "<:VC_PartnerManager:1494286911286808576>"],
    [IDs.roles.HighStaff, "<:VC_Staff:1494286904089247754>"],
    [IDs.roles.Staff, "<:VC_Staff:1494286904089247754>"],
  ]
    .filter(([roleId]) => roleId)
    .map(([roleId, emoji]) => [String(roleId), emoji]),
);

function getStaffRoleEmojiByRoleId(roleId?, fallback = "<:VC_Staff:1494286904089247754>") {
  const key = String(roleId || "");
  return STAFF_EMOJI_BY_ROLE_ID.get(key) || fallback;
}

export = {
  getStaffRoleEmojiByRoleId,
};