const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { openIncomePanel, setSession } = require("../../Utils/Economy/incomeClaimGuiRuntime");

module.exports = {
  name: "daily",
  allowEmptyArgs: true,
  description: "Riscuote la ricompensa giornaliera con pannello interattivo.",
  usage: "+daily",
  examples: ["+daily"],
  async execute(message, args, client) {
    const opened = await openIncomePanel(client, message, "daily");
    if (!opened.ok) {
      await safeMessageReply(message, { content: `<:vegax:1443934876440068179> ${opened.message}`, allowedMentions: { repliedUser: false } });
      return;
    }
    const sent = await safeMessageReply(message, opened.payload);
    if (sent?.id) setSession(sent.id, opened.session);
  },
};