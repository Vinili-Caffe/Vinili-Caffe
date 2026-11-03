const { ChannelType } = require("discord.js") as typeof import("discord.js");
const { CustomRole, ActivityUserProfile } = require("../schemas/communitySchemas") as typeof import("../schemas/communitySchemas");
const { MentionReaction } = require("../schemas/autoInteractionSchemas") as typeof import("../schemas/autoInteractionSchemas");
const { getCustomReactionMax } = require("../utils/mentionReactionPanelUtils") as typeof import("../utils/mentionReactionPanelUtils");
const { getCustomRoleSlotCapFromRoles, getCustomRoleSlotCapWithContest } = require("../utils/customRoleSlots") as typeof import("../utils/customRoleSlots");
const { hasEventWeekWinnerGrant } = require("./weekWinnerGrantsService") as typeof import("./weekWinnerGrantsService");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");

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
    const { tryDeleteEmptyCustomPrivateCategory } = require("../utils/customPrivateCategoryUtils") as typeof import("../utils/customPrivateCategoryUtils");
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