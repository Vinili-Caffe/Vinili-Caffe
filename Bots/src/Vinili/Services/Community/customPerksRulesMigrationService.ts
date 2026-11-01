const { ChannelType } = require("discord.js") as typeof import("discord.js");
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

export = {
  deleteCustomVocIfPossible,
};