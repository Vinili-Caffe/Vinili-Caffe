const IDs = require("../Config/ids") as typeof import("../Config/ids");
const { listStaffGuideSectionMeta } = require("./staffGuideContent") as typeof import("./staffGuideContent");

const STAFF_GUIDE_LADDER_SECTION_IDS = new Set([
  "regolamento",
  "regole_staff",
  "limiti",
  "pause",
  "valutazioni",
  "moderazione_staff",
  "warnstaff",
  "pex",
  "lineeguida",
  "comandi",
  "generalimoderazione",
  "testualimoderazione",
  "vocalimoderazione",
  "sanzioni",
]);

function roleId(key?) {
  return String(IDs.roles?.[key] || "").trim();
}

function getStaffGuideAccessRoleIds() {
  return [
    roleId("Staff"),
    roleId("Helper"),
    roleId("Mod"),
    roleId("SeniorModerator"),
    roleId("Director"),
    roleId("HighStaff"),
    roleId("Manager"),
    roleId("Admin"),
    roleId("Founder"),
  ].filter(Boolean);
}

function getStaffLadderRoleIds() {
  return [
    roleId("Helper"),
    roleId("Mod"),
    roleId("SeniorModerator"),
    roleId("Director"),
    roleId("Admin"),
    roleId("Manager"),
    roleId("Founder"),
    roleId("HighStaff"),
    roleId("Staff"),
  ].filter(Boolean);
}

function memberHasAnyRole(member?, roleIds?) {
  if (!member?.roles?.cache || !Array.isArray(roleIds) || !roleIds.length) return false;
  return roleIds.some((id?) => id && member.roles.cache.has(String(id)));
}

function memberHasStaffLadderRole(member?) {
  return memberHasAnyRole(member, getStaffLadderRoleIds());
}

function isPartnerManagerOnlyMember(member?) {
  const pmId = roleId("PartnerManager");
  if (!pmId || !member?.roles?.cache?.has(pmId)) return false;
  const access = getStaffGuideAccessRoleIds();
  return !access.some((id?) => member.roles.cache.has(id));
}

function getRequiredRoleIdsForSection(sectionId?) {
  const id = String(sectionId || "").trim();
  if (STAFF_GUIDE_LADDER_SECTION_IDS.has(id)) {
    return getStaffGuideAccessRoleIds();
  }
    if (id === "compiti_fissi") {
    return [roleId("Helper"), roleId("Mod"), roleId("HighStaff"), roleId("Manager"), roleId("Admin"), roleId("Founder")].filter(Boolean);
  }
  if (id === "guidapartners") {
    return [roleId("PartnerManager"), roleId("Director"), roleId("HighStaff"), roleId("Manager"), roleId("Admin"), roleId("Founder")].filter(Boolean);
  }
  if (id === "guidamiddle" || id.startsWith("middle_")) {
    return [roleId("SeniorModerator"), roleId("Director"), roleId("HighStaff"), roleId("Manager"), roleId("Admin"), roleId("Founder")].filter(Boolean);
  }
  return [];
}

/** Staff ladder / Staff role — excludes Partner Manager–only (same gate as guida staff). */
function memberCanAccessStaffFeedbackBoard(member?) {
  if (!member) return false;
  if (isPartnerManagerOnlyMember(member)) return false;
  if (memberHasAnyRole(member, getStaffGuideAccessRoleIds())) return true;
  return memberHasStaffLadderRole(member);
}

function memberCanReadStaffGuideSection(member?, sectionId?) {
  const id = String(sectionId || "").trim();
  if (!id || !member) return false;

  const meta = listStaffGuideSectionMeta().find((s?) => s.id === id);
  if (!meta) return false;

  if (STAFF_GUIDE_LADDER_SECTION_IDS.has(id)) {
    return memberCanAccessStaffFeedbackBoard(member);
  }

  const required = getRequiredRoleIdsForSection(id);
  if (!required.length) return false;
  return memberHasAnyRole(member, required);
}

function listReadableStaffGuideSections(member?) {
  return listStaffGuideSectionMeta()
    .filter((section?) => memberCanReadStaffGuideSection(member, section.id))
    .map((section?) => {
      const out = {
        id: section.id,
        label: section.label,
        description: section.description,
      };
      if (section.parent) out.parent = section.parent;
      return out;
    });
}

export = {
  STAFF_GUIDE_LADDER_SECTION_IDS,
  getStaffGuideAccessRoleIds,
  memberCanReadStaffGuideSection,
  listReadableStaffGuideSections,
  isPartnerManagerOnlyMember,
  memberCanAccessStaffFeedbackBoard,
};
