const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const profileButton = require("../../Buttons/profile");

module.exports = {
  name: "profile",
  allowEmptyArgs: true,

  async execute(message) {
    if (!message?.guild || !message?.author) return;
    await message.channel.sendTyping().catch(() => {});
    const payload = await profileButton.buildPanelPayload(
      message.guild,
      message.author.id,
      message.client,
      "home",
    );
    await safeMessageReply(message, {
      ...payload,
      allowedMentions: { repliedUser: false },
    });
  },
};