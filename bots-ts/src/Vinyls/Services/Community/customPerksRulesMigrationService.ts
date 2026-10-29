const { ChannelType, PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const { CustomRole, ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { MentionReaction } = require("../../Schemas/Community/autoInteractionSchemas") as typeof import("../../Schemas/Community/autoInteractionSchemas");
const { getCustomReactionMax } = require("../../Utils/Community/mentionReactionPanelUtils") as typeof import("../../Utils/Community/mentionReactionPanelUtils");
const { getCustomRoleSlotCapFromRoles, getCustomRoleSlotCapWithContest } = require("../../Utils/Community/customRoleSlots") as typeof import("../../Utils/Community/customRoleSlots");
const { hasEventWeekWinnerGrant } = require("./weekWinnerGrantsService") as typeof import("./weekWinnerGrantsService");
const IDs = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");

const CUSTOM_VOC_CREATE_ROLE_IDS = [
  IDs?.roles?.VIP,
  IDs?.roles?.DoubleBooster,
  IDs?.roles?.VIPplus,
  IDs?.roles?.["VIP+"],
  IDs?.roles?.Level50,
].filter(Boolean);
async function deleteRoleIfPossible(guild?, clientUserId?, roleId?, reason?) {
  const rid = String(roleId || "").trim();
  if (!rid) return false;
  const role = guild.roles.cache.get(rid) || (await guild.roles.fetch(rid).catch(() => null));
  if (!role) return true;
  const me = guild.members.me || guild.members.cache.get(clientUserId);
  if (!me?.permissions?.has?.(PermissionsBitField.Flags.ManageRoles)) return false;
  if (role.position >= (me.roles?.highest?.position || 0)) return false;
  return role.delete(reason).then(() => true).catch(() => false);
}

async function deleteCustomVocIfPossible(guild?, channelId?, reason?) {
  const cid = String(channelId || "").trim();
  if (!cid) return false;
  const channel = guild.channels.cache.get(cid) || (await guild.channels.fetch(cid).catch(() => null));
  if (!channel) return true;
  if (channel.type !== ChannelType.GuildVoice) return false;
  const deleted = await channel.delete(reason).then(() => true).catch(() => false);
  if (deleted) {
    const { tryDeleteEmptyCustomPrivateCategory } = require("../../Utils/Community/customPrivateCategoryUtils") as typeof import("../../Utils/Community/customPrivateCategoryUtils");
    await tryDeleteEmptyCustomPrivateCategory(guild, {
      excludeChannelId: cid,
      reason: "Auto cleanup empty custom private category",
    }).catch(() => { });
  }
  return deleted;
}

async function migrateGuildCustomPerks(guild?, client?) {
  const guildId = String(guild?.id || "").trim();
  if (!guildId) return { touched: 0, reactionsTrimmed: 0 };
  const customDocs = await CustomRole.find({ guildId }).lean().catch(() => []);
  let touched = 0;
  for (const row of Array.isArray(customDocs) ? customDocs : []) {
    const userId = String(row?.userId || "").trim();
    if (!userId) continue;
    const member = await guild.members.fetch(userId).catch(() => null);
    const profileRow = await ActivityUserProfile.findOne({ guildId, userId })
      .select("profile.contestPrizes profile.totals.exp.event")
      .lean()
      .catch(() => null);
    const contestUnlock = Boolean(
      profileRow?.profile?.contestPrizes?.disegniSecondPlaceUnlock ||
        profileRow?.profile?.totals?.exp?.event?.contestDisegniSecondPlaceUnlock,
    );
    const week2 = await hasEventWeekWinnerGrant(guildId, userId, 2).catch(() => false);
    const week3 = await hasEventWeekWinnerGrant(guildId, userId, 3).catch(() => false);
    const hasExtraUnlock = contestUnlock || week2 || week3;
    const canPrimary = getCustomRoleSlotCapWithContest(member, hasExtraUnlock) >= 1;
    const canSecondary = getCustomRoleSlotCapFromRoles(member) >= 2;
    const canVoc =
      (member?.roles?.cache && CUSTOM_VOC_CREATE_ROLE_IDS.some((roleId?) => member.roles.cache.has(roleId))) ||
      hasExtraUnlock;
    const roleId = String(row?.roleId || "").trim();
    const secondaryRoleId = String(row?.secondaryRoleId || "").trim();
    const customVocChannelId = String(row?.customVocChannelId || "").trim();
    const updateSet: Record<string, any> = {};

    if (!canPrimary && roleId) {
      await deleteRoleIfPossible(guild, client?.user?.id, roleId, "Custom role rules migration: owner no longer eligible");
      updateSet.roleId = null;
      touched += 1;
    }

    if (!canSecondary && secondaryRoleId) {
      await deleteRoleIfPossible(guild, client?.user?.id, secondaryRoleId, "Custom role rules migration: owner no longer eligible for secondary");
      updateSet.secondaryRoleId = null;
      touched += 1;
    }

    if (!canVoc && customVocChannelId) {
      await deleteCustomVocIfPossible(guild, customVocChannelId, "Custom voc rules migration: owner no longer eligible");
      updateSet.customVocChannelId = null;
      touched += 1;
    }

            
    if (Object.keys(updateSet).length) {
      await CustomRole.updateOne({ guildId, userId }, { $set: updateSet }).catch(() => {});
    }
  }

  const reactionDocs = await MentionReaction.find({
    guildId,
    "profile.mentionReaction.reactions.0": { $exists: true },
  })
    .lean()
    .catch(() => []);
  let reactionsTrimmed = 0;
  for (const row of Array.isArray(reactionDocs) ? reactionDocs : []) {
    const userId = String(row?.userId || "").trim();
    if (!userId) continue;
    const member = await guild.members.fetch(userId).catch(() => null);
    if (!member) continue;
    const maxAllowed = Math.max(1, Number(getCustomReactionMax(member) || 3));
    const reactions = Array.isArray(row?.reactions) ? row.reactions : [];
    if (reactions.length <= maxAllowed) continue;
    const trimmed = reactions.slice(0, maxAllowed);
    await MentionReaction.findOneAndUpdate(
      { guildId, userId },
      { $set: { reactions: trimmed } },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).catch(() => {});
    reactionsTrimmed += 1;
  }
  return { touched, reactionsTrimmed };
}

async function runCustomPerksRulesMigration(client?) {
  const guilds = [...(client?.guilds?.cache?.values?.() || [])];
  const out = { guilds: guilds.length, touched: 0, reactionsTrimmed: 0 };
  for (const guild of guilds) {
    const res = await migrateGuildCustomPerks(guild, client).catch(() => ({ touched: 0, reactionsTrimmed: 0 }));
    out.touched += Number(res?.touched || 0);
    out.reactionsTrimmed += Number(res?.reactionsTrimmed || 0);
  }
  return out;
}

export = {
  runCustomPerksRulesMigration,
  deleteCustomVocIfPossible,
};