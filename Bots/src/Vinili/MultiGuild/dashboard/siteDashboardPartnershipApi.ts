
const { listGuildPickerData } = require("./partnershipGuildPicker") as typeof import("./partnershipGuildPicker");
const { getDashboardPartnership, patchDashboardPartnership } = require("./partnershipSettings") as typeof import("./partnershipSettings");
const { getDashboardPartnershipMigration, startDashboardPartnershipMigration, undoDashboardPartnershipMigration } = require("./partnershipMigration") as typeof import("./partnershipMigration");
const { getDashboardPartnershipBlacklist, addDashboardPartnershipBlacklist, removeDashboardPartnershipBlacklist, leaveDashboardPartnership } = require("./partnershipBlacklist") as typeof import("./partnershipBlacklist");
const { getDashboardPartnershipManagers, adjustDashboardPartnershipManagerPoints } = require("./partnershipManagers") as typeof import("./partnershipManagers");
const { getDashboardPartnershipHistory } = require("./partnershipHistory") as typeof import("./partnershipHistory");


export = {
  getDashboardPartnership,
  patchDashboardPartnership,
  leaveDashboardPartnership,
  getDashboardPartnershipMigration,
  startDashboardPartnershipMigration,
  undoDashboardPartnershipMigration,
  getDashboardPartnershipBlacklist,
  addDashboardPartnershipBlacklist,
  removeDashboardPartnershipBlacklist,
  getDashboardPartnershipManagers,
  adjustDashboardPartnershipManagerPoints,
  getDashboardPartnershipHistory,
  listGuildPickerData,
};
