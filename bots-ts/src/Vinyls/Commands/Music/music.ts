const { SlashCommandBuilder } = require("discord.js") as typeof import("discord.js");
const { safeEditReply } = require("../../../shared/discord/replyRuntime") as typeof import("../../../shared/discord/replyRuntime");
const {
  playFromInteraction,
  skipGuild,
  stopGuild,
  formatQueue,
  pauseToggle,
  nowPlayingStatus,
}: any = require("../../Services/Music/lavalinkMusicService") as typeof import("../../Services/Music/lavalinkMusicService");

const EPHEMERAL_FLAG = 1 << 6;

export = {
  category: "Music",
  description: "Musica tramite Lavalink (YouTube, Spotify, URL, ricerca).",
    skipDeploy: true,
  data: new SlashCommandBuilder()
    .setName("music")
    .setDescription("Controlla la riproduzione musicale del bot.")
    .addSubcommand((sub?) =>
      sub
        .setName("play")
        .setDescription("Riproduci o aggiungi in coda (URL, link Spotify, o testo da cercare)")
        .addStringOption((o?) =>
          o
            .setName("query")
            .setDescription("URL o testo (es. ytsearch:artista titolo, link Spotify)")
            .setRequired(true),
        ),
    )
    .addSubcommand((sub?) => sub.setName("skip").setDescription("Salta la traccia corrente"))
    .addSubcommand((sub?) => sub.setName("stop").setDescription("Ferma la musica e svuota la coda"))
    .addSubcommand((sub?) => sub.setName("queue").setDescription("Mostra la coda"))
    .addSubcommand((sub?) => sub.setName("nowplaying").setDescription("Traccia in riproduzione"))
    .addSubcommand((sub?) => sub.setName("pause").setDescription("Metti in pausa"))
    .addSubcommand((sub?) => sub.setName("resume").setDescription("Riprendi")),

  async execute(interaction?) {
    const sub = interaction.options.getSubcommand();
    if (sub === "play") {
      await interaction.deferReply().catch(() => {});
      const query = interaction.options.getString("query", true);
      const result = await playFromInteraction(interaction, query);
      return safeEditReply(interaction, {
        content: result.ok ? result.message : `<:vegax:1443934876440068179> ${result.message}`,
        flags: result.ok ? 0 : EPHEMERAL_FLAG,
      });
    }

    if (sub === "skip") {
      await interaction.deferReply({ flags: EPHEMERAL_FLAG }).catch(() => {});
      const result = await skipGuild(interaction);
      return safeEditReply(interaction, {
        content: result.ok ? result.message : `<:vegax:1443934876440068179> ${result.message}`,
        flags: EPHEMERAL_FLAG,
      });
    }

    if (sub === "stop") {
      await interaction.deferReply({ flags: EPHEMERAL_FLAG }).catch(() => {});
      const result = await stopGuild(interaction);
      return safeEditReply(interaction, {
        content: result.ok ? result.message : `<:vegax:1443934876440068179> ${result.message}`,
        flags: EPHEMERAL_FLAG,
      });
    }

    if (sub === "queue") {
      await interaction.deferReply().catch(() => {});
      const result = formatQueue(interaction);
      return safeEditReply(interaction, {
        content: result.ok ? result.message : `<:vegax:1443934876440068179> ${result.message}`,
      });
    }

    if (sub === "nowplaying") {
      await interaction.deferReply({ flags: EPHEMERAL_FLAG }).catch(() => {});
      const result = nowPlayingStatus(interaction);
      return safeEditReply(interaction, {
        content: result.ok ? result.message : `<:vegax:1443934876440068179> ${result.message}`,
        flags: EPHEMERAL_FLAG,
      });
    }

    if (sub === "pause") {
      await interaction.deferReply({ flags: EPHEMERAL_FLAG }).catch(() => {});
      const result = await pauseToggle(interaction, true);
      return safeEditReply(interaction, {
        content: result.ok ? result.message : `<:vegax:1443934876440068179> ${result.message}`,
        flags: EPHEMERAL_FLAG,
      });
    }

    if (sub === "resume") {
      await interaction.deferReply({ flags: EPHEMERAL_FLAG }).catch(() => {});
      const result = await pauseToggle(interaction, false);
      return safeEditReply(interaction, {
        content: result.ok ? result.message : `<:vegax:1443934876440068179> ${result.message}`,
        flags: EPHEMERAL_FLAG,
      });
    }
  },
};