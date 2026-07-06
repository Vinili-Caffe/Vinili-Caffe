const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { applyDefaultFooterToEmbeds } = require("../../Utils/Embeds/defaultFooter");
const { fetchGuildNowPlayingDetails } = require("../../Services/Music/lavalinkMusicService");

async function buildRequesterFooter(guild, data) {
  const id = data.requesterUserId ? String(data.requesterUserId) : "";
  if (id && guild?.members?.fetch) {
    const mem = await guild.members.fetch({ user: id, force: false }).catch(() => null);
    if (mem?.user) {
      const name =
        String(mem.displayName || mem.user.globalName || mem.user.username || "").trim() || "Utente";
      return {
        text: `Richiesto da ${name}`.slice(0, 2048),
        iconURL: mem.user.displayAvatarURL({ size: 64 }),
      };
    }
  }
  const tag = String(data.requesterDisplayTag || "").trim();
  if (tag) return { text: `Richiesto da ${tag}`.slice(0, 2048) };
  return null;
}

module.exports = {
  name: "now",
  subcommands: ["playing"],
  allowEmptyArgs: true,
  subcommandUsages: { playing: "+now playing" },
  description:
    "Mostra il brano in riproduzione.",
  usage: "+now playing",
  examples: ["+now playing", "+now"],
  async execute(message, args) {
    const raw = String(args[0] || "playing").trim().toLowerCase();
    if (raw !== "playing") {
      const err = new EmbedBuilder()
        .setColor(0xff0000)
        .setDescription("**Usa** `+now` **oppure** `+now playing`.");
      await safeMessageReply(
        message,
        applyDefaultFooterToEmbeds(
          { embeds: [err], allowedMentions: { repliedUser: false } },
          message.guild,
        ),
      ).catch(() => null);
      return;
    }
    const data = await fetchGuildNowPlayingDetails(message.client, message.guild);
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
    const progressLines = `${data.progressBar}\n\`${data.positionClock}\` / \`${data.lengthClock}\``;
    const embed = new EmbedBuilder()
      .setColor(0x6f4e37)
      .setTitle("Now playing")
      .addFields(
        { name: "Brano", value: data.trackFieldValue, inline: false },
        { name: "Avanzamento", value: progressLines.slice(0, 1024), inline: false },
        { name: "Posizione in coda", value: String(data.positionInQueue), inline: true },
      )
      .setTimestamp(Date.now());
    if (data.paused) embed.setDescription("*In pausa*");
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