const { safeMessageReply } = require("../../../../shared/discord/replyRuntime") as typeof import("../../../../shared/discord/replyRuntime");
const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");

const { E } = require("../../../../shared/emojis/emojiCatalog") as typeof import("../../../../shared/emojis/emojiCatalog");
export = {
  name: "membercount",
  allowEmptyArgs: true,
  async execute(message?) {
    await message.channel.sendTyping();
    const guild = message.guild;
    if (!guild) {
      await safeMessageReply(message, {
        content: `${E.vegax} Solo in server.`,
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    const totalMembers = guild.memberCount;

    const embed = new EmbedBuilder()
      .setColor("#6f4e37")
      .addFields({
        name: `**${E.member_role_icon} Members**`,
        value: `${totalMembers}`,
      })
      .setTimestamp();

    await safeMessageReply(message, {
      embeds: [embed],
      allowedMentions: { repliedUser: false },
    });
  },
};