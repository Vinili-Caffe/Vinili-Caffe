const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { applyDefaultFooterToEmbeds } = require("../../Utils/Embeds/defaultFooter");
const { fetchGuildNextUpDetails } = require("../../Services/Music/lavalinkMusicService");
const { memberDisplayName, userAvatarUrlDynamic } = require("../../Utils/Discord/guildDiscordIdentity");

async function buildRequesterFooter(guild, data) {
  const id = data.requesterUserId ? String(data.requesterUserId) : "";
  if (id && guild?.members?.fetch) {
    const mem = await guild.members.fetch({ user: id, force: false }).catch(() => null);
    if (mem?.user) {
      const name = memberDisplayName(mem) || "Utente";
      return {
        text: `Richiesto da ${name}`.slice(0, 2048),
        iconURL: userAvatarUrlDynamic(mem, { size: 64 }),
      };
    }
  }
  const tag = String(data.requesterDisplayTag || "").trim();
  if (tag) return { text: `Richiesto da ${tag}`.slice(0, 2048) };
  return null;
}

module.exports = {
  name: "next",
  subcommands: ["up"],
  allowEmptyArgs: true,
  subcommandUsages: { up: ",next up" },
  description: "Mostra il prossimo brano in coda.",
  usage: ",next [up]",
  examples: [",next up", ",next"],
  async execute(message, args) {
    const raw = String(args[0] || "up").trim().toLowerCase();
    if (raw !== "up") {
      const err = new EmbedBuilder()
        .setColor(0xff0000)
        .setDescription("<a:VC_Attention:1482534443632558151> Usa **,next up**.");
      await safeMessageReply(
        message,
        applyDefaultFooterToEmbeds(
          { embeds: [err], allowedMentions: { repliedUser: false } },
          message.guild,
        ),
      ).catch(() => null);
      return;
    }
    const data = await fetchGuildNextUpDetails(message.client, message.guild);
    if (!data.ok) {
      const err = new EmbedBuilder()
        .setColor(0xff0000)
        .setDescription(`**${data.message}**`);
      await safeMessageReply(
        message,
        applyDefaultFooterToEmbeds(
          { embeds: [err], allowedMentions: { repliedUser: false } },
          message.guild,
        ),
      ).catch(() => null);
      return;
    }
    const embed = new EmbedBuilder()
      .setColor(0x6f4e37)
      .setTitle("Prossimo in coda 🎵")
      .addFields(
        { name: "Brano", value: data.trackFieldValue, inline: false },
        {
          name: "Tempo stimato prima della riproduzione",
          value: data.estimatedUntil,
          inline: true,
        },
        { name: "Durata del brano", value: data.length, inline: true },
        { name: "Posizione nella coda", value: String(data.positionInQueue), inline: false },
      )
      .setTimestamp(Date.now());
    if (data.thumbnailUrl) embed.setThumbnail(data.thumbnailUrl);
    const footer = await buildRequesterFooter(message.guild, data);
    if (footer) embed.setFooter(footer);
    await safeMessageReply(
      message,
      applyDefaultFooterToEmbeds(
        { embeds: [embed], allowedMentions: { repliedUser: false } },
        message.guild,
      ),
    ).catch(() => null);
  },
};