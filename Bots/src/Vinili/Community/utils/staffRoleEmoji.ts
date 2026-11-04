const IDs = require("../../Config/ids") as typeof import("../../Config/ids");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const STAFF_EMOJI_BY_ROLE_ID = new Map(
  [
    [IDs.roles.Helper, E.VC_Helper],
    [IDs.roles.Mod, E.VC_Mod],
    [IDs.roles.SeniorModerator, E.VC_SeniorModerator],
    [IDs.roles.Director, E.VC_Director],
    [IDs.roles.Admin, E.VC_Admin],
    [IDs.roles.Manager, E.VC_Manager],
    [IDs.roles.Founder, E.VC_Founder],
    [IDs.roles.PartnerManager, E.VC_PartnerManager],
    [IDs.roles.HighStaff, E.VC_Staff],
    [IDs.roles.Staff, E.VC_Staff],
  ]
    .filter(([roleId]) => roleId)
    .map(([roleId, emoji]) => [String(roleId), emoji]),
);

function getStaffRoleEmojiByRoleId(roleId?, fallback = E.VC_Staff) {
  const key = String(roleId || "");
  return STAFF_EMOJI_BY_ROLE_ID.get(key) || fallback;
}

export = {
  getStaffRoleEmojiByRoleId,
};