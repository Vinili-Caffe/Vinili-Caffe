const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { runPrivacyPanel } = require("../../Utils/privacyContentPanel");

module.exports = {
  name: "privacy",
  allowEmptyArgs: true,
  async execute(message) {
    if (!message.guild) {
      await safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Usa il comando in un server.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }
    await runPrivacyPanel(message);
  },
};