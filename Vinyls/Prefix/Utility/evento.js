const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { getGuildExpSettings } = require("../../Services/Community/expService");
const { getEventWeekNumber } = require("../../Services/Community/activityEventRewardsService");
const { buildEventoClassificaExpOnlyPayload } = require("../../Services/Community/eventoClassificaService");

module.exports = {
  name: "evento",
  aliases: [],
  subcommands: ["classifica"],
  subcommandAliases: { classifica: "classifica" },

  async execute(message, args = []) {
    await message.channel.sendTyping().catch(() => {});
    const sub = String(args[0] || "").toLowerCase().trim();
    const guildId = message.guild?.id;
    if (!guildId) return;

    if (!sub || sub !== "classifica") {
      const usage = new EmbedBuilder()
        .setColor("#6f4e37")
        .setTitle("Comando evento")
        .setDescription("`+evento classifica` – Mostra direttamente la classifica EXP dell'evento.");
      await safeMessageReply(message, {
        embeds: [usage],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const second = String(args[1] || "").toLowerCase().trim();
    if (second === "staff") {
      await safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> La classifica staff non esiste piu. Usa `+evento classifica`.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const settings = await getGuildExpSettings(guildId);
    if (!settings?.eventExpiresAt || !settings?.eventStartedAt) {
      await safeMessageReply(message, {
        content: "<:vegax:1443934876440068179> Nessun evento attivo.",
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const currentWeek = Math.max(1, Math.min(4, Number(getEventWeekNumber(settings) || 1)));
    const payload = await buildEventoClassificaExpOnlyPayload(message.guild, currentWeek, currentWeek);
    await safeMessageReply(message, {
      ...payload,
      components: [],
      allowedMentions: { repliedUser: false },
    });
  },
};