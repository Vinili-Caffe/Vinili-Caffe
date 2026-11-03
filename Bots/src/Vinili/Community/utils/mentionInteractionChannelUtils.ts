const { ChannelType } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");

const MENTION_INTERACTION_BASE_CHANNEL_IDS = new Set(
  [
    IDs.channels?.chat,
    IDs.channels?.media,
    IDs.channels?.commands,
    IDs.channels?.selfieVerificati,
    IDs.channels?.counting,
    IDs.channels?.poketwo,
    IDs.channels?.ship,
    IDs.channels?.economy,
    IDs.channels?.staffChat,
    IDs.channels?.staffCmds,
    IDs.channels?.hogwartsHouseGryffindor,
    IDs.channels?.hogwartsHouseHufflepuff,
    IDs.channels?.hogwartsHouseRavenclaw,
    IDs.channels?.hogwartsHouseSlytherin,
  ]
    .filter(Boolean)
    .map(String),
);

const VOICE_TEXT_PARENT_CATEGORY_IDS = new Set(
  [
    IDs.categories?.categoryPublics,
    IDs.categories?.categoryPrivate,
    IDs.categories?.categoryStanze,
    IDs.categories?.categoryPrivateAnchor,
  ]
    .filter(Boolean)
    .map(String),
);

function resolveMentionInteractionRootChannel(channel?) {
  if (!channel) return null;
  if (typeof channel.isThread === "function" && channel.isThread()) {
    return channel.parent ?? null;
  }
  return channel;
}

function isVoiceTextChatChannel(channel?) {
  if (!channel) return false;
  const root = resolveMentionInteractionRootChannel(channel) ?? channel;

  if (root.type === ChannelType.GuildVoice || root.type === ChannelType.GuildStageVoice) {
    return typeof root.isTextBased === "function" ? root.isTextBased() : true;
  }

  const parentId = String(root.parentId || "");
  if (
    parentId &&
    VOICE_TEXT_PARENT_CATEGORY_IDS.has(parentId) &&
    (root.type === ChannelType.GuildText || root.type === ChannelType.GuildAnnouncement)
  ) {
    return true;
  }

  return false;
}

function channelAllowsMentionInteraction(channel?) {
  if (!channel) return false;
  const root = resolveMentionInteractionRootChannel(channel);
  if (!root) return false;
  const id = String(root.id || "");
  if (MENTION_INTERACTION_BASE_CHANNEL_IDS.has(id)) return true;
  return isVoiceTextChatChannel(root);
}

function messageAllowsMentionInteraction(message?) {
  return channelAllowsMentionInteraction(message?.channel);
}

export = {
  messageAllowsMentionInteraction,
};
