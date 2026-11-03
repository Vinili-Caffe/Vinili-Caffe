const {
  listStaffGuideSectionMeta,
  getStaffGuideSectionMeta,
  getStaffGuideChildSectionIds,
} = require("./staffGuide/meta") as typeof import("./staffGuide/meta");
const { buildStaffGuideSectionMarkdown } = require("./staffGuide/sections") as typeof import("./staffGuide/sections");

export = { listStaffGuideSectionMeta, getStaffGuideSectionMeta, getStaffGuideChildSectionIds, buildStaffGuideSectionMarkdown };
