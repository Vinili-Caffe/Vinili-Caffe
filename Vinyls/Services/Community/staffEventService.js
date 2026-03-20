const { InviteTrack } = require("../../Schemas/Community/communitySchemas");
const Staff = require("../../Schemas/Staff/staffSchema");
const { getStaffEventSettings } = require("./expService");
const IDs = require("../../Utils/Config/ids");
const STAFF_ROLE_ID = IDs.roles.Staff;
const HIGH_STAFF_ROLE_ID = IDs.roles.HighStaff;
const PARTNER_MANAGER_ROLE_ID = IDs.roles.PartnerManager;
const STAFF_ACTIVITY_LIMITS={[String(IDs.roles.Helper)]:{messages:400,hours:3.5},[String(IDs.roles.Mod)]:{messages:500,hours:5},[String(IDs.roles.Coordinator)]:{messages:500,hours:4.5},[String(IDs.roles.Supervisor)]:{messages:450,hours:4},};
const STAFF_ROLE_PRIORITY=[String(IDs.roles.Supervisor),String(IDs.roles.Coordinator),String(IDs.roles.Mod),String(IDs.roles.Helper),];
const OVER_LIMIT_MSG = 150;
const OVER_LIMIT_HOURS = 1.5;

function isStaffButNotHighStaff(member) {
  if (!member?.roles?.cache) return false;
  if (!STAFF_ROLE_ID || !member.roles.cache.has(STAFF_ROLE_ID)) return false;
  if (HIGH_STAFF_ROLE_ID && member.roles.cache.has(HIGH_STAFF_ROLE_ID)) return false;
  return true;
}

function hasPartnerManagerAndStaff(member) {
  if (!member?.roles?.cache) return false;
  if (!STAFF_ROLE_ID || !member.roles.cache.has(STAFF_ROLE_ID)) return false;
  if (!PARTNER_MANAGER_ROLE_ID || !member.roles.cache.has(PARTNER_MANAGER_ROLE_ID)) return false;
  if (HIGH_STAFF_ROLE_ID && member.roles.cache.has(HIGH_STAFF_ROLE_ID)) return false;
  return true;
}

async function isStaffEventActive(guildId) {
  const settings = await getStaffEventSettings(guildId);
  return Boolean(settings?.active);
}

async function addStaffEventPoints(guildId, userId, points, note = null) {
  if (!guildId || !userId || !Number.isFinite(points) || points <= 0) return null;
  const active = await isStaffEventActive(guildId);
  if (!active) return null;
  await Staff.findOneAndUpdate(
    { guildId, userId },
    {
      $setOnInsert: { guildId, userId },
      $inc: { "staffEvent.points": Math.floor(points) },
    },
    { upsert: true, new: true },
  ).catch(() => null);
  return true;
}

async function getStaffEventPointsDoc(guildId, userId) {
  if (!guildId || !userId) return null;
  const doc = await Staff.findOne({ guildId, userId })
    .select("staffEvent.points")
    .lean()
    .catch(() => null);
  return { points: Number(doc?.staffEvent?.points || 0) };
}

async function getStaffEventLeaderboard(guildId) {
  if (!guildId) return [];
  const list=await Staff.find({guildId}).select("userId staffEvent.points").sort({"staffEvent.points":-1}).lean().catch(() => []);
  return list
    .map((d) => ({ userId: String(d?.userId || ""), points: Number(d?.staffEvent?.points || 0) }))
    .filter((d) => d.userId && d.points > 0);
}

async function giveExistingInvitesPointsAtStart(guild) {
  if (!guild?.id) return;
  const active = await isStaffEventActive(guild.id);
  if (!active) return;
  await guild.members.fetch().catch(() => null);
  const staffIds = [];
  for (const [, member] of guild.members.cache) {
    if (member?.user?.id && isStaffButNotHighStaff(member)) staffIds.push(member.id);
  }
  if (!staffIds.length) return;
  for (const inviterId of staffIds) {
    const alreadyGiven=await Staff.findOne({guildId:guild.id,userId:inviterId,"staffEvent.rewardGivenTypes":"existing_invites",}).select("_id").lean().catch(() => null);
    if (alreadyGiven?._id) continue;
    const count=await InviteTrack.countDocuments({guildId:guild.id,inviterId,active:true,}).catch(() => 0);
    if (count <= 0) {
      await Staff.updateOne(
        { guildId: guild.id, userId: inviterId },
        {
          $setOnInsert: { guildId: guild.id, userId: inviterId },
          $addToSet: { "staffEvent.rewardGivenTypes": "existing_invites" },
        },
        { upsert: true },
      ).catch(() => null);
      continue;
    }
    await addStaffEventPoints(guild.id, inviterId, count, "existing_invites");
    await Staff.updateOne(
      { guildId: guild.id, userId: inviterId },
      {
        $setOnInsert: { guildId: guild.id, userId: inviterId },
        $addToSet: { "staffEvent.rewardGivenTypes": "existing_invites" },
      },
      { upsert: true },
    ).catch(() => null);
  }
}

async function givePmStaff15PointsAtStart(guild) {
  if (!guild?.id) return;
  const active = await isStaffEventActive(guild.id);
  if (!active) return;
  await guild.members.fetch().catch(() => null);
  let granted = 0;
  for (const [, member] of guild.members.cache) {
    if (!member?.user?.id) continue;
    if (!hasPartnerManagerAndStaff(member)) continue;
    const existing=await Staff.findOne({guildId:guild.id,userId:member.id,"staffEvent.rewardGivenTypes":"pm_staff",}).select("_id").lean().catch(() => null);
    if (existing?._id) continue;
    await addStaffEventPoints(guild.id, member.id, 15, "pm_staff");
    await Staff.updateOne(
      { guildId: guild.id, userId: member.id },
      {
        $setOnInsert: { guildId: guild.id, userId: member.id },
        $addToSet: { "staffEvent.rewardGivenTypes": "pm_staff" },
      },
      { upsert: true },
    ).catch(() => null);
    granted += 1;
  }
}

function resolveStaffRoleForLimits(member) {
  if (!member?.roles?.cache) return null;
  for (const roleId of STAFF_ROLE_PRIORITY) {
    if (member.roles.cache.has(roleId)) return roleId;
  }
  return null;
}

async function adjustPmStaffPointsOnRoleChange(oldMember, newMember) {
  const guild = newMember?.guild;
  if (!guild?.id || !newMember?.id) return;
  const active = await isStaffEventActive(guild.id);
  if (!active) return null;

  const hadComboBefore = hasPartnerManagerAndStaff(oldMember);
  const hasComboNow = hasPartnerManagerAndStaff(newMember);
  if (hadComboBefore === hasComboNow) return null;

  const doc = await getStaffEventPointsDoc(guild.id, newMember.id);
  const currentPoints = Number(doc?.points || 0);

  if (!hadComboBefore && hasComboNow) {
    await addStaffEventPoints(guild.id, newMember.id, 15, "pm_staff_auto");
    return "added";
  }

  if (hadComboBefore && !hasComboNow && currentPoints >= 15) {
    const res = await Staff.updateOne(
      { guildId: guild.id, userId: newMember.id, "staffEvent.points": { $gte: 15 } },
      { $inc: { "staffEvent.points": -15 } },
    ).catch(() => null);
    if (res?.modifiedCount) {
      return "removed";
    }
  }
  return null;
}

async function giveWeekly20PointsIfEligible(guild, eventWeekNum, _settings) {
  if (!guild?.id || eventWeekNum < 1 || eventWeekNum > 4) return;
  const active = await isStaffEventActive(guild.id);
  if (!active) return;
  const staffSettings = await getStaffEventSettings(guild.id);
  if (!staffSettings?.startedAt) return;
  const { getUserOverviewStats } = require("./activityService");
  await guild.members.fetch().catch(() => null);
  for (const [, member] of guild.members.cache) {
    if (!member?.user?.id) continue;
    if (!isStaffButNotHighStaff(member)) continue;
    const staffRoleId = resolveStaffRoleForLimits(member);
    const limits = staffRoleId ? STAFF_ACTIVITY_LIMITS[staffRoleId] : null;
    if (!limits) continue;
    const overview = await getUserOverviewStats(guild.id, member.id, 7).catch(() => null);
    const d7 = overview?.windows?.d7;
    const msg = Math.max(0, Math.floor(Number(d7?.text ?? 0)));
    const voiceSeconds = Math.max(0, Math.floor(Number(d7?.voiceSeconds ?? 0)));
    const voiceHours = voiceSeconds / 3600;
    const minMsg = limits.messages + OVER_LIMIT_MSG;
    const minHours = limits.hours + OVER_LIMIT_HOURS;
    if (msg < minMsg || voiceHours < minHours) continue;
    const existing=await Staff.findOne({guildId:guild.id,userId:member.id,"staffEvent.weeklyRewards":eventWeekNum,}).select("_id").lean().catch(() => null);
    if (existing?._id) continue;
    await addStaffEventPoints(guild.id, member.id, 20, `weekly_${eventWeekNum}`);
    await Staff.updateOne(
      { guildId: guild.id, userId: member.id },
      {
        $setOnInsert: { guildId: guild.id, userId: member.id },
        $addToSet: { "staffEvent.weeklyRewards": eventWeekNum },
      },
      { upsert: true },
    ).catch(() => null);
  }
}

module.exports = {
  isStaffEventActive,
  isStaffButNotHighStaff,
  addStaffEventPoints,
  getStaffEventLeaderboard,
  givePmStaff15PointsAtStart,
  giveExistingInvitesPointsAtStart,
  giveWeekly20PointsIfEligible,
  adjustPmStaffPointsOnRoleChange,
};