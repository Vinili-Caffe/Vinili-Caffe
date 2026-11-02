const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { memberHasStaffRole } = require("../../Utils/Community/staffListUtils") as typeof import("../../Utils/Community/staffListUtils");
const { resolvePartnerTotalEarned } = require("./partnerPointsDisplayUtils") as typeof import("./partnerPointsDisplayUtils");
const PROFILE_FULL = "full";
const PROFILE_PM_ONLY = "pm_only";
const PROFILE_PROSPECT = "prospect";
const STAFF_ROLE_PRIORITY = [String(IDs.roles.Director), String(IDs.roles.SeniorModerator), String(IDs.roles.Mod), String(IDs.roles.Helper), String(IDs.roles.Staff)].filter(Boolean);
const STAFF_PROFILE_DISPLAY_ROLE_PRIORITY = [IDs.roles.Founder, IDs.roles.Manager, IDs.roles.Admin, IDs.roles.Director, IDs.roles.HighStaff, String(IDs.roles.SeniorModerator), String(IDs.roles.Mod), String(IDs.roles.Helper), IDs.roles.PartnerManager, String(IDs.roles.Staff), IDs.roles.Blogger].filter(Boolean);

function resolveStaffPartnerPointsDisplay(staffObj?) {
  return resolvePartnerTotalEarned(staffObj);
}

function resolveStaffRole(member?) {
  if (!member?.roles?.cache) return null;
  for (const roleId of STAFF_ROLE_PRIORITY) {
    if (member.roles.cache.has(roleId)) return roleId;
  }
  return null;
}

function resolveStaffProfileDisplayRoleId(member?) {
  if (!member?.roles?.cache) return null;
  for (const roleId of STAFF_PROFILE_DISPLAY_ROLE_PRIORITY) {
    if (roleId && member.roles.cache.has(roleId)) return roleId;
  }
  return null;
}

function buildFullProfileRoleLabelForEmbed(guild?, member?) {
  const badges = buildStaffProfileRoleBadges(guild, member);
  if (!badges.length) return "—";
  return badges.map((b?) => b.label).join(" & ");
}

function staffProfileRoleBadgeKind(roleId?) {
  const id = String(roleId || "");
  if (IDs.roles.Founder && id === String(IDs.roles.Founder)) return "founder";
  if (IDs.roles.Manager && id === String(IDs.roles.Manager)) return "manager";
  if (IDs.roles.PartnerManager && id === String(IDs.roles.PartnerManager)) return "pm";
  if (IDs.roles.Blogger && id === String(IDs.roles.Blogger)) return "blogger";
  if (IDs.roles.StafferDelMese && id === String(IDs.roles.StafferDelMese)) return "sdm";
  if (IDs.roles.StafferDellaSettimana && id === String(IDs.roles.StafferDellaSettimana)) return "sdw";
  if (IDs.roles.HighStaff && id === String(IDs.roles.HighStaff)) return "highstaff";
  if (IDs.roles.Staff && id === String(IDs.roles.Staff)) return "staff";
  if (IDs.roles.Director && id === String(IDs.roles.Director)) return "director";
  if (IDs.roles.Admin && id === String(IDs.roles.Admin)) return "admin";
  return "staff";
}

function staffProfileRoleBadgeIcon(kind?) {
  if (kind === "founder") return "fa-star-o";
  if (kind === "manager") return "fa-briefcase";
  if (kind === "pm") return "fa-handshake-o";
  if (kind === "blogger") return "fa-pencil";
  if (kind === "sdm") return "fa-trophy";
  if (kind === "sdw") return "fa-star";
  if (kind === "highstaff") return "fa-shield";
  if (kind === "director") return "fa-shield";
  if (kind === "admin") return "fa-shield";
  return "fa-shield";
}

function staffProfileRoleColorHex(role?) {
  if (role?.hexColor && role.hexColor !== "#000000") return role.hexColor;
  return "#d4a888";
}

function pushRoleBadgeIfMissing(badges?, guild?, roleId?, fallbackLabel?) {
  const id = String(roleId || "").trim();
  if (!id) return;
  if (badges.some((b?) => String(b?.roleId || "") === id)) return;
  const discordRole = guild?.roles?.cache?.get(id) || null;
  const kind = staffProfileRoleBadgeKind(id);
  badges.push({
    kind,
    icon: staffProfileRoleBadgeIcon(kind),
    label: discordRole?.name || fallbackLabel || "Staff",
    color: staffProfileRoleColorHex(discordRole),
    roleId: id,
  });
}

function appendStaffDelMeseBadge(guild?, member?, badges?) {
  const list = Array.isArray(badges) ? badges.slice() : [];
  const sdmId = String(IDs.roles?.StafferDelMese || "").trim();
  if (!sdmId || !member?.roles?.cache?.has(sdmId)) return list;
  if (list.some((b?) => String(b?.roleId || "") === sdmId || String(b?.kind || "") === "sdm")) return list;
  const discordRole = guild?.roles?.cache?.get(sdmId) || null;
  // Prima dei badge staff/carriera (Moderator, Staff, …).
  list.unshift({
    kind: "sdm",
    icon: "fa-trophy",
    label: discordRole?.name || "Staff del Mese",
    color: staffProfileRoleColorHex(discordRole) || "#f0c75e",
    roleId: sdmId,
  });
  return list;
}

function appendStaffDelSettimanaBadge(guild?, member?, badges?) {
  const list = Array.isArray(badges) ? badges.slice() : [];
  const sdwId = String(IDs.roles?.StafferDellaSettimana || "").trim();
  if (!sdwId || !member?.roles?.cache?.has(sdwId)) return list;
  if (list.some((b?) => String(b?.roleId || "") === sdwId || String(b?.kind || "") === "sdw")) return list;
  const discordRole = guild?.roles?.cache?.get(sdwId) || null;
  list.unshift({
    kind: "sdw",
    icon: "fa-star",
    label: discordRole?.name || "Staffer della Settimana",
    color: staffProfileRoleColorHex(discordRole) || "#e8c49c",
    roleId: sdwId,
  });
  return list;
}

function buildStaffProfileRoleBadges(guild?, member?) {
  if (!member?.roles?.cache || !guild?.roles?.cache) return [];
  const pmId = String(IDs.roles.PartnerManager || "").trim();
  const sdmId = String(IDs.roles?.StafferDelMese || "").trim();
  const sdwId = String(IDs.roles?.StafferDellaSettimana || "").trim();
  const highStaffId = String(IDs.roles.HighStaff || "").trim();
  const staffId = String(IDs.roles.Staff || "").trim();
  const badges = [];
  for (const roleId of STAFF_PROFILE_DISPLAY_ROLE_PRIORITY) {
    const rid = String(roleId || "").trim();
    if (!rid || rid === pmId || rid === sdmId || rid === sdwId || rid === highStaffId || rid === staffId) continue;
    if (member.roles.cache.has(rid)) {
      pushRoleBadgeIfMissing(badges, guild, rid, "Staff");
      break;
    }
  }
    if (highStaffId && member.roles.cache.has(highStaffId)) {
    pushRoleBadgeIfMissing(badges, guild, highStaffId, "High Staff");
  }
  if (staffId && member.roles.cache.has(staffId)) {
    pushRoleBadgeIfMissing(badges, guild, staffId, "Staff");
  }
  if (pmId && member.roles.cache.has(pmId)) {
    pushRoleBadgeIfMissing(badges, guild, pmId, "Partner Manager");
  }
  const bloggerId = String(IDs.roles.Blogger || "").trim();
  if (bloggerId && member.roles.cache.has(bloggerId)) {
    pushRoleBadgeIfMissing(badges, guild, bloggerId, "Blogger");
  }
  return appendStaffDelMeseBadge(
    guild,
    member,
    appendStaffDelSettimanaBadge(guild, member, badges),
  );
}

function hasDisplayTierStaffBeforePartnerManager(member?) {
  if (!member?.roles?.cache) return false;
  const pmId = IDs.roles.PartnerManager;
  if (!pmId) return false;
  for (const roleId of STAFF_PROFILE_DISPLAY_ROLE_PRIORITY) {
    if (String(roleId) === String(pmId)) break;
    if (roleId && member.roles.cache.has(roleId)) return true;
  }
  return false;
}

function viewerIsFounder(member?) {
  if (!member?.roles?.cache) return false;
  const c = member.roles.cache;
  return Boolean(IDs.roles.Founder && c.has(IDs.roles.Founder));
}

function targetIsFounder(member?) {
  if (!member?.roles?.cache) return false;
  const c = member.roles.cache;
  return Boolean(IDs.roles.Founder && c.has(IDs.roles.Founder));
}

function resolveStaffProfileKind(member?) {
  if (!member) return PROFILE_PROSPECT;
  if (!memberHasStaffRole(member)) return PROFILE_PROSPECT;
  const pmId = IDs.roles.PartnerManager;
  const hasPm = Boolean(pmId && member.roles?.cache?.has(pmId));
  const hasLadder = Boolean(resolveStaffRole(member));
  const hasHigherThanPm = hasDisplayTierStaffBeforePartnerManager(member);
  if (hasPm && !hasLadder && !hasHigherThanPm) return PROFILE_PM_ONLY;
  return PROFILE_FULL;
}


export = {
  PROFILE_FULL,
  PROFILE_PM_ONLY,
  PROFILE_PROSPECT,
  resolveStaffPartnerPointsDisplay,
  resolveStaffProfileKind,
  buildFullProfileRoleLabelForEmbed,
  buildStaffProfileRoleBadges,
  resolveStaffProfileDisplayRoleId,
  viewerIsFounder,
  targetIsFounder,
};