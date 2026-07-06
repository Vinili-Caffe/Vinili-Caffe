const { EmbedBuilder } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { handleStreamerLiveCommand } = require("../../Services/Community/twitchLiveAlertService");

module.exports = {
  name: "live",
  hideFromHelp: true,
  description: "Gestisce annuncio live Twitch e stato del canale vocale streaming.",
  subcommands: ["on", "off"],
  async execute(message, args) {
    const mode = String(args[0] || "").trim().toLowerCase();
    if (!["on", "off"].includes(mode)) {
      return safeMessageReply(
        message,
        "<:vegax:1443934876440068179> Uso: `+live on` oppure `+live off`",
      );
    }

    try {
      const result = await handleStreamerLiveCommand(message.client, message.author.id, mode);
      if (!result?.ok) {
        if (result?.code === "not_streamer") {
          return safeMessageReply(
            message,
            "<:VC_Attention:1482534443632558151> Solo lo streamer configurato può usare questo comando.",
          );
        }
        if (result?.code === "not_live") {
          return safeMessageReply(
            message,
            "<:VC_Attention:1482534443632558151> Non risulti in live su Twitch. Avvia la diretta e riprova con `+live on`.",
          );
        }
        if (result?.code === "twitch_error") {
          return safeMessageReply(
            message,
            "<:VC_Attention:1482534443632558151> Non riesco a verificare lo stato della live su Twitch. Riprova tra poco.",
          );
        }
        return safeMessageReply(
          message,
          "<:VC_Attention:1482534443632558151> Comando non riuscito. Riprova tra poco.",
        );
      }

      if (mode === "on") {
        const login = String(result.streamer?.login || "twitch").trim();
        const announced = result.announce?.ok && !result.announce?.skipped;
        const embed = new EmbedBuilder()
          .setColor("#9146FF")
          .setTitle("<a:VC_Announce:1482534613568979007> Live attivata")
          .setDescription(
            [
              `<:success:1461731530333229226> Canale vocale impostato su **ON** e status aggiornato.`,
              `> [twitch.tv/${login}](https://www.twitch.tv/${login})`,
              "",
              announced
                ? "<:VC_Reply:1482532158080942191> Annuncio live inviato in **#news**."
                : "<:VC_Info:1482526956703580372> Annuncio già inviato per questa diretta: nessun duplicato.",
            ].join("\n"),
          );
        return safeMessageReply(message, { embeds: [embed] });
      }

      const embed = new EmbedBuilder()
        .setColor("#6f4e37")
        .setTitle("🔴 Live disattivata")
        .setDescription("<:success:1461731530333229226> Canale vocale impostato su **OFF** e status rimosso.");
      return safeMessageReply(message, { embeds: [embed] });
    } catch (error) {
      global.logger?.error?.("[live] command failed:", error);
      return safeMessageReply(
        message,
        "<:VC_Attention:1482534443632558151> Errore durante l'aggiornamento della live.",
      );
    }
  },
};
