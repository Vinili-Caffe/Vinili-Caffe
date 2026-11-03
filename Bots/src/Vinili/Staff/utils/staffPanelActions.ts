/** Facade: staff pex/depex/warn career panel actions. */
const {
  getHighestLadderRole,
  getNextLadderRoleId,
  peekDepexLadderTargetRoleId,
  staffLadderRankIndex,
  getMemberStaffLadderRank,
  assertStaffCareerHierarchy,
} = require("./staffPanel/helpers") as typeof import("./staffPanel/helpers");
const {
  runProspectStaffPex,
  runProspectStaffPexToPartnerManager,
  runProspectStaffPexToBlogger,
  runProfileStaffPex,
} = require("./staffPanel/pexActions") as typeof import("./staffPanel/pexActions");
const {
  runProfileStaffDepex,
  runProfileStaffCompleteDepex,
} = require("./staffPanel/depexActions") as typeof import("./staffPanel/depexActions");
const {
  runProfileStaffWarnAdd,
  runProfileStaffWarnRemove,
} = require("./staffPanel/warnActions") as typeof import("./staffPanel/warnActions");

export = {
  runProfileStaffPex,
  runProspectStaffPex,
  runProspectStaffPexToPartnerManager,
  runProspectStaffPexToBlogger,
  runProfileStaffDepex,
  runProfileStaffCompleteDepex,
  runProfileStaffWarnAdd,
  runProfileStaffWarnRemove,
  getHighestLadderRole,
  getNextLadderRoleId,
  peekDepexLadderTargetRoleId,
  staffLadderRankIndex,
  getMemberStaffLadderRank,
  assertStaffCareerHierarchy,
};
