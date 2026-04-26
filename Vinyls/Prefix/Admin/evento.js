const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { buildSfondiClassificaPayload } = require("../../Services/Community/weeklyContestService");
const IDs = require("../../Utils/Config/ids");
const { getGuildChannelCached } = require("../../Utils/Interaction/interactionEntityCache");

module.exports = {
  name: "evento",
  canonicalSubcommands: ["classifica"],
  subcommands: ["classifica"],
  subcommandDescriptions: {
    classifica: "Classifica del weekly contest (sfondi Mobile/PC oppure disegni, in base al profilo attivo)",
  },
  subcommandUsages: {
    classifica: "+evento classifica",
  },
  async execute(message, args) {
    const sub = String(args[0] || "").trim().toLowerCase();
    if (sub !== "classifica") {
      await message.channel.send({
        content: "Uso: `+evento classifica` — top 10 submission più votate nel contest attivo (Mobile/PC per sfondi, un solo elenco per contest disegni).",
        allowedMentions: { parse: [] },
      }).catch(() => {});
      return;
    }
    if (!message.guild) return;
    await message.channel.sendTyping?.().catch(() => {});
    const payload = await buildSfondiClassificaPayload(message.guild, "mobile");
    const contestDisegniChannelId = String(IDs.channels?.contestDisegni || "").trim();
    if (contestDisegniChannelId) {
      const contestChannel =
        message.guild.channels.cache.get(contestDisegniChannelId) ||
        (await getGuildChannelCached(message.guild, contestDisegniChannelId));
      if (contestChannel?.isTextBased?.()) {
        await contestChannel.send({
          ...payload,
          allowedMentions: { parse: [] },
        }).catch(() => {});
      }
    }
    await safeMessageReply(message, {
      ...payload,
      allowedMentions: { repliedUser: false },
    });
  },
};