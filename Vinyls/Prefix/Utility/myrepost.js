const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const {
  isRepostDisabledInGuild,
  REPOST_DISABLED_MESSAGE,
} = require("../../Services/Community/repostService");
const { buildMyRepostPanel } = require("../../Utils/Community/myrepostPanel");

function parseTargetAndPage(message, args) {
  const mention = message.mentions.users.first();
  if (mention) {
    const pageRaw = Number(args?.[args.length - 1]);
    const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
    return { targetId: mention.id, page };
  }
  const first = String(args?.[0] || "").trim();
  if (first && /^\d{16,20}$/.test(first)) {
    const pageRaw = Number(args?.[1]);
    const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
    return { targetId: first, page };
  }
  const pageRaw = Number(first);
  const page = Number.isFinite(pageRaw) && pageRaw >= 1 ? Math.floor(pageRaw) : 1;
  return { targetId: message.author.id, page };
}

module.exports = {
  name: "myrepost",
  allowEmptyArgs: true,
  async execute(message, args) {
    if (!message?.guild) {
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("<:vegax:1443934876440068179> Questo comando funziona solo in un server."),
        ],
        allowedMentions: { repliedUser: false },
      });
    }

    if (isRepostDisabledInGuild(message.guild.id)) {
      return safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription(`<:vegax:1443934876440068179> ${REPOST_DISABLED_MESSAGE}`),
        ],
        allowedMentions: { repliedUser: false },
      });
    }

    const { targetId, page } = parseTargetAndPage(message, args);
    const prefix = String(message.client?.config?.prefix || "+").trim() || "+";
    const payload = await buildMyRepostPanel({
      guild: message.guild,
      targetUserId: targetId,
      requesterId: message.author.id,
      page,
      commandPrefix: prefix,
    });

    return safeMessageReply(message, {
      embeds: payload.embeds,
      components: payload.components,
      allowedMentions: { users: payload.allowedUserIds || [], repliedUser: false },
      includeBanner: false,
    });
  },
};