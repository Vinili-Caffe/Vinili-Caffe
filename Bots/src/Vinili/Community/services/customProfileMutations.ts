"use strict";

/** Custom profile: facade mutazioni ruolo/voc (API sito invariata). */
const { createCustomRole, deleteCustomRole, renameCustomRole, removeCustomRoleMember, addCustomRoleMember } = require("./customProfileRole") as typeof import("./customProfileRole");
const { setCustomRoleColor, setCustomRoleIcon } = require("./customProfileRoleStyle") as typeof import("./customProfileRoleStyle");
const { createCustomVoc, deleteCustomVoc, renameCustomVoc, setCustomVocEmoji, addCustomVocMember, removeCustomVocMember } = require("./customProfileVoc") as typeof import("./customProfileVoc");
const { memberHasGradientHoloAccess } = require("./customProfileShared") as typeof import("./customProfileShared");

export = {
  createCustomRole,
  deleteCustomRole,
  renameCustomRole,
  setCustomRoleColor,
  setCustomRoleIcon,
  removeCustomRoleMember,
  addCustomRoleMember,
  createCustomVoc,
  deleteCustomVoc,
  renameCustomVoc,
  setCustomVocEmoji,
  addCustomVocMember,
  removeCustomVocMember,
  memberHasGradientHoloAccess,
};
