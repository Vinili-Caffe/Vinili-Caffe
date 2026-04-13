const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { buildSfondiClassificaPayload } = require("../../Services/Community/weeklyContestService");

module.exports = {
  name: "evento",
  canonicalSubcommands: ["classifica"],
  subcommands: ["classifica"],
  subcommandDescriptions: {
    classifica: "Classifica degli sfondi più votati (Mobile / PC)",
  },
  subcommandUsages: {
    classifica: "+evento classifica",
  },
  async execute(message, args) {
    const sub = String(args[0] || "").trim().toLowerCase();
    if (sub !== "classifica") {
      await message.channel.send({
        content: "Uso: `+evento classifica` — top 10 sfondi più votati nel contest, con switch Mobile / PC.",
        allowedMentions: { parse: [] },
      }).catch(() => {});
      return;
    }
    if (!message.guild) return;
    await message.channel.sendTyping?.().catch(() => {});
    const payload = await buildSfondiClassificaPayload(message.guild, "mobile");
    await safeMessageReply(message, {
      ...payload,
      allowedMentions: { repliedUser: false },
    });
  },
};