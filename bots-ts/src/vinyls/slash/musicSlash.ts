import {
  SlashCommandBuilder,
  type ChatInputCommandInteraction,
  type VoiceBasedChannel,
} from "discord.js";
import { ChannelType } from "discord.js";
import { registerSlashCommand } from "./registry";
import { resolveTrack } from "../modules/music/lavalink";
import { enqueueAndPlay, isVoicePlayerReady, skipTrack, stopPlayback, setPaused } from "../modules/music/player";
import { getSession, isLavalinkReady } from "../modules/music/musicSession";

/** Slash `/music` — stessi sub del live Commands/Music/music.js. */
export function registerMusicSlash(): void {
  registerSlashCommand({
    data: new SlashCommandBuilder()
      .setName("music")
      .setDescription("Controlli musica")
      .addSubcommand((s) =>
        s
          .setName("play")
          .setDescription("Riproduci")
          .addStringOption((o) => o.setName("query").setDescription("Titolo o URL").setRequired(true)),
      )
      .addSubcommand((s) => s.setName("skip").setDescription("Salta"))
      .addSubcommand((s) => s.setName("stop").setDescription("Stop"))
      .addSubcommand((s) => s.setName("queue").setDescription("Coda"))
      .addSubcommand((s) => s.setName("nowplaying").setDescription("Now playing"))
      .addSubcommand((s) => s.setName("pause").setDescription("Pausa"))
      .addSubcommand((s) => s.setName("resume").setDescription("Riprendi"))
      .toJSON(),
    async execute(interaction: ChatInputCommandInteraction) {
      const sub = interaction.options.getSubcommand();
      const guild = interaction.guild;
      if (!guild) {
        await interaction.reply({ content: "Solo in server.", ephemeral: true });
        return;
      }
      if (sub === "play") {
        if (!isLavalinkReady()) {
          await interaction.reply({ content: "Lavalink TS off.", ephemeral: true });
          return;
        }
        const member = await guild.members.fetch(interaction.user.id).catch(() => null);
        const ch = member?.voice?.channel as VoiceBasedChannel | null;
        if (!ch || ch.type !== ChannelType.GuildVoice) {
          await interaction.reply({ content: "Entra in vocale.", ephemeral: true });
          return;
        }
        const query = interaction.options.getString("query", true);
        await interaction.deferReply();
        const resolved = await resolveTrack(query);
        const track = {
          title: resolved?.title || query,
          uri: resolved?.uri,
          encoded: resolved?.encoded,
          author: resolved?.author,
          lengthMs: resolved?.lengthMs,
          requestedBy: interaction.user.id,
        };
        if (isVoicePlayerReady() && track.encoded) {
          const r = await enqueueAndPlay({
            guild,
            voiceChannel: ch,
            textChannelId: interaction.channelId,
            track,
          });
          await interaction.editReply(r.message);
          return;
        }
        const session = getSession(guild.id);
        if (!session.playing) session.playing = track;
        else session.queue.push(track);
        await interaction.editReply(`Coda: **${track.title}** _(voice gated)_`);
        return;
      }
      if (sub === "skip") {
        const r = await skipTrack(guild.id);
        await interaction.reply({ content: r.message, ephemeral: !r.ok });
        return;
      }
      if (sub === "stop") {
        await stopPlayback(guild.id);
        await interaction.reply("Stop.");
        return;
      }
      if (sub === "pause") {
        await setPaused(guild.id, true);
        await interaction.reply("Pausa.");
        return;
      }
      if (sub === "resume") {
        await setPaused(guild.id, false);
        await interaction.reply("Resume.");
        return;
      }
      const session = getSession(guild.id);
      if (sub === "nowplaying") {
        await interaction.reply(
          session.playing ? `▶ **${session.playing.title}**` : "Niente in play.",
        );
        return;
      }
      if (sub === "queue") {
        const lines = [
          session.playing ? `▶ ${session.playing.title}` : null,
          ...session.queue.slice(0, 10).map((t, i) => `${i + 1}. ${t.title}`),
        ].filter(Boolean);
        await interaction.reply(lines.join("\n") || "Coda vuota.");
      }
    },
  });
}
