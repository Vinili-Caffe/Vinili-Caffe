import { ChannelType, PermissionFlagsBits } from "discord.js";
import { baseEmbed, replyEmbed, replyErr, replyOk } from "../../../shared/embeds";
import type { PrefixCommand } from "../../prefix/types";
import { resolveTrack } from "./lavalink";
import { clearSession, getSession, isLavalinkReady } from "./musicSession";
import {
  enqueueAndPlay,
  getShoukaku,
  isVoicePlayerReady,
  playPrevious,
  restartTrack,
  seekMs,
  setPaused,
  setVolume,
  skipTrack,
  stopPlayback,
} from "./player";

async function requireVoice(
  message: import("discord.js").Message,
): Promise<{ channel: import("discord.js").VoiceBasedChannel } | { error: string }> {
  const member = message.member;
  const ch = member?.voice?.channel;
  if (!ch || ch.type !== ChannelType.GuildVoice) {
    return { error: "Entra in un canale vocale prima." };
  }
  const me = message.guild?.members.me;
  if (me && !ch.permissionsFor(me)?.has([PermissionFlagsBits.Connect, PermissionFlagsBits.Speak])) {
    return { error: "Non ho Connect/Speak in quel vocale." };
  }
  return { channel: ch };
}

export const playCommand: PrefixCommand = {
  name: "play",
  description: "Accoda e riproduce (Lavalink — abilita con VC_TS_LAVALINK=1).",
  usage: "+play <query|url>",
  category: "music",
  aliases: ["p"],
  async execute({ message, args }) {
    if (!isLavalinkReady()) {
      await replyErr(
        message,
        "Musica TS non collegata a Lavalink. Imposta `VC_TS_LAVALINK=1` + host quando sei pronto (evita conflitto col bot JS).",
      );
      return;
    }
    const q = args.join(" ").trim();
    if (!q) {
      await replyErr(message, "Uso: `+play <titolo|url>`");
      return;
    }
    const voice = await requireVoice(message);
    if ("error" in voice) {
      await replyErr(message, voice.error);
      return;
    }
    const resolved = await resolveTrack(q);
    const track = {
      title: resolved?.title || q,
      uri: resolved?.uri,
      encoded: resolved?.encoded,
      author: resolved?.author,
      lengthMs: resolved?.lengthMs,
      requestedBy: message.author.id,
    };

    if (isVoicePlayerReady() && track.encoded) {
      const result = await enqueueAndPlay({
        guild: message.guild!,
        voiceChannel: voice.channel,
        textChannelId: message.channel.id,
        track,
      });
      if (!result.ok) {
        await replyErr(message, result.message);
        return;
      }
      await replyOk(message, result.message);
      return;
    }

    // Fallback: coda locale senza voice (CONNECT off o resolve fail)
    const session = getSession(message.guild!.id);
    session.voiceChannelId = voice.channel.id;
    session.textChannelId = message.channel.id;
    if (!session.playing) session.playing = track;
    else session.queue.push(track);
    const label = resolved
      ? `**${resolved.title}**${resolved.author ? ` — ${resolved.author}` : ""}`
      : `**${q}** _(resolve locale)_`;
    const note = !isVoicePlayerReady()
      ? " _(voice off — VC_TS_LAVALINK_CONNECT=1 + ALLOW_SHARED)_"
      : " _(senza encoded)_";
    await replyOk(
      message,
      session.playing === track
        ? `In coda play: ${label}${note}`
        : `In coda (#${session.queue.length}): ${label}${note}`,
    );
  },
};

export const skipCommand: PrefixCommand = {
  name: "skip",
  description: "Salta il brano corrente.",
  usage: "+skip",
  category: "music",
  async execute({ message }) {
    if (!message.guild) return;
    if (isVoicePlayerReady()) {
      const r = await skipTrack(message.guild.id);
      if (!r.ok) await replyErr(message, r.message);
      else await replyOk(message, r.message);
      return;
    }
    const session = getSession(message.guild.id);
    if (!session.playing) {
      await replyErr(message, "Niente in riproduzione.");
      return;
    }
    const skipped = session.playing;
    session.history.push(skipped);
    if (session.history.length > 50) session.history.shift();
    session.playing = session.queue.shift() || null;
    session.paused = false;
    await replyOk(
      message,
      session.playing
        ? `Skip **${skipped.title}** → **${session.playing.title}**`
        : `Skip **${skipped.title}** · coda vuota.`,
    );
  },
};

export const stopCommand: PrefixCommand = {
  name: "stop",
  description: "Ferma e svuota la coda.",
  usage: "+stop",
  category: "music",
  async execute({ message }) {
    if (!message.guild) return;
    if (isVoicePlayerReady()) await stopPlayback(message.guild.id);
    else clearSession(message.guild.id);
    await replyOk(message, "Musica fermata, coda vuota.");
  },
};

export const nowCommand: PrefixCommand = {
  name: "now",
  description: "Brano corrente e coda.",
  usage: "+now",
  category: "music",
  aliases: ["np"],
  async execute({ message }) {
    if (!message.guild) return;
    const session = getSession(message.guild.id);
    if (!session.playing) {
      await replyErr(message, "Niente in riproduzione.");
      return;
    }
    const q =
      session.queue.length === 0
        ? "_Coda vuota_"
        : session.queue
            .slice(0, 10)
            .map((t, i) => `**${i + 1}.** ${t.title}`)
            .join("\n");
    await replyEmbed(
      message,
      baseEmbed()
        .setTitle("Now playing")
        .setDescription(
          [
            `**${session.playing.title}**`,
            session.playing.author ? `_di ${session.playing.author}_` : null,
            session.paused ? "_in pausa_" : null,
          ]
            .filter(Boolean)
            .join("\n"),
        )
        .addFields({ name: "Coda", value: q }),
    );
  },
};

export const queueCommand: PrefixCommand = {
  name: "queue",
  description: "Mostra la coda.",
  usage: "+queue",
  category: "music",
  aliases: ["q"],
  async execute({ message }) {
    if (!message.guild) return;
    const session = getSession(message.guild.id);
    if (!session.playing && !session.queue.length) {
      await replyErr(message, "Coda vuota.");
      return;
    }
    const lines: string[] = [];
    if (session.playing) lines.push(`▶ **${session.playing.title}**`);
    session.queue.forEach((t, i) => lines.push(`**${i + 1}.** ${t.title}`));
    await replyEmbed(message, baseEmbed().setTitle("Coda").setDescription(lines.join("\n")));
  },
};

export const pauseCommand: PrefixCommand = {
  name: "pause",
  description: "Mette in pausa.",
  usage: "+pause",
  category: "music",
  async execute({ message }) {
    if (!message.guild) return;
    const session = getSession(message.guild.id);
    if (!session.playing) {
      await replyErr(message, "Niente in riproduzione.");
      return;
    }
    if (isVoicePlayerReady()) await setPaused(message.guild.id, true);
    else session.paused = true;
    await replyOk(message, "In pausa.");
  },
};

export const resumeCommand: PrefixCommand = {
  name: "resume",
  description: "Riprende la riproduzione.",
  usage: "+resume",
  category: "music",
  async execute({ message }) {
    if (!message.guild) return;
    const session = getSession(message.guild.id);
    if (!session.playing) {
      await replyErr(message, "Niente in riproduzione.");
      return;
    }
    if (isVoicePlayerReady()) await setPaused(message.guild.id, false);
    else session.paused = false;
    await replyOk(message, "Ripresa.");
  },
};

export const volumeCommand: PrefixCommand = {
  name: "volume",
  description: "Imposta volume 1–200.",
  usage: "+volume <1-200>",
  category: "music",
  aliases: ["vol"],
  async execute({ message, args }) {
    if (!message.guild) return;
    const session = getSession(message.guild.id);
    const n = Math.floor(Number(args[0]));
    if (!Number.isFinite(n) || n < 1 || n > 200) {
      await replyOk(message, `Volume attuale: **${session.volume}**`);
      return;
    }
    if (isVoicePlayerReady()) await setVolume(message.guild.id, n);
    else session.volume = n;
    await replyOk(message, `Volume impostato a **${n}**.`);
  },
};

export const shuffleCommand: PrefixCommand = {
  name: "shuffle",
  description: "Mescola la coda.",
  usage: "+shuffle",
  category: "music",
  async execute({ message }) {
    if (!message.guild) return;
    const session = getSession(message.guild.id);
    if (session.queue.length < 2) {
      await replyErr(message, "Coda troppo corta da mescolare.");
      return;
    }
    for (let i = session.queue.length - 1; i > 0; i -= 1) {
      const j = Math.floor(Math.random() * (i + 1));
      const tmp = session.queue[i]!;
      session.queue[i] = session.queue[j]!;
      session.queue[j] = tmp;
    }
    await replyOk(message, `Coda mescolata (${session.queue.length} brani).`);
  },
};

export const clearCommand: PrefixCommand = {
  name: "clear",
  description: "Svuota la coda (mantiene il brano corrente).",
  usage: "+clear",
  category: "music",
  async execute({ message }) {
    if (!message.guild) return;
    const session = getSession(message.guild.id);
    const n = session.queue.length;
    session.queue = [];
    await replyOk(message, `Coda svuotata (${n} rimossi).`);
  },
};

export const nextCommand: PrefixCommand = {
  name: "next",
  description: "Mostra il prossimo brano in coda.",
  usage: "+next",
  category: "music",
  async execute({ message }) {
    if (!message.guild) return;
    const session = getSession(message.guild.id);
    const n = session.queue[0];
    if (!n) {
      await replyErr(message, "Nessun brano successivo.");
      return;
    }
    await replyOk(message, `Prossimo: **${n.title}** (richiesto da <@${n.requestedBy}>)`);
  },
};

export const previousCommand: PrefixCommand = {
  name: "previous",
  description: "Torna al brano precedente.",
  usage: "+previous",
  category: "music",
  async execute({ message }) {
    if (!message.guild) return;
    if (isVoicePlayerReady()) {
      const r = await playPrevious(message.guild.id);
      if (!r.ok) await replyErr(message, r.message);
      else await replyOk(message, r.message);
      return;
    }
    const session = getSession(message.guild.id);
    const prev = session.history.pop();
    if (!prev) {
      await replyErr(message, "Nessun brano precedente.");
      return;
    }
    if (session.playing) session.queue.unshift(session.playing);
    session.playing = prev;
    session.paused = false;
    await replyOk(message, `Previous: **${prev.title}**`);
  },
};

export const repeatCommand: PrefixCommand = {
  name: "repeat",
  description: "Cicla repeat off → track → queue.",
  usage: "+repeat",
  category: "music",
  aliases: ["loop"],
  async execute({ message }) {
    if (!message.guild) return;
    const session = getSession(message.guild.id);
    session.repeat =
      session.repeat === "off" ? "track" : session.repeat === "track" ? "queue" : "off";
    await replyOk(message, `Repeat: **${session.repeat}**`);
  },
};

export const rewindCommand: PrefixCommand = {
  name: "rewind",
  description: "Rewind di N secondi (default 10).",
  usage: "+rewind [secondi]",
  category: "music",
  async execute({ message, args }) {
    if (!message.guild) return;
    const session = getSession(message.guild.id);
    if (!session.playing) {
      await replyErr(message, "Niente in riproduzione.");
      return;
    }
    const sec = Math.max(1, Math.floor(Number(args[0]) || 10));
    if (isVoicePlayerReady()) {
      const sh = getShoukaku()?.players.get(message.guild.id);
      const pos = Math.max(0, (sh?.position || 0) - sec * 1000);
      await seekMs(message.guild.id, pos);
      await replyOk(message, `Rewind −${sec}s su **${session.playing.title}**.`);
      return;
    }
    await replyOk(message, `Rewind −${sec}s richiesto (voice off).`);
  },
};

export const restartCommand: PrefixCommand = {
  name: "restart",
  description: "Riavvia il brano corrente.",
  usage: "+restart",
  category: "music",
  async execute({ message }) {
    if (!message.guild) return;
    const session = getSession(message.guild.id);
    if (!session.playing) {
      await replyErr(message, "Niente in riproduzione.");
      return;
    }
    if (isVoicePlayerReady()) {
      const ok = await restartTrack(message.guild.id);
      if (!ok) {
        await replyErr(message, "Restart fallito.");
        return;
      }
    } else {
      session.paused = false;
    }
    await replyOk(message, `Restart **${session.playing.title}**`);
  },
};

export const requestedCommand: PrefixCommand = {
  name: "requested",
  description: "Chi ha richiesto il brano corrente.",
  usage: "+requested",
  category: "music",
  async execute({ message }) {
    if (!message.guild) return;
    const session = getSession(message.guild.id);
    if (!session.playing) {
      await replyErr(message, "Niente in riproduzione.");
      return;
    }
    await replyOk(
      message,
      `**${session.playing.title}** richiesto da <@${session.playing.requestedBy}>`,
    );
  },
};

export const upcomingCommand: PrefixCommand = {
  name: "upcoming",
  description: "Anteprima prossimi brani in coda.",
  usage: "+upcoming",
  category: "music",
  async execute({ message }) {
    if (!message.guild) return;
    const session = getSession(message.guild.id);
    if (!session.queue.length) {
      await replyErr(message, "Coda vuota.");
      return;
    }
    const lines = session.queue
      .slice(0, 8)
      .map((t, i) => `**${i + 1}.** ${t.title}`)
      .join("\n");
    await replyEmbed(message, baseEmbed().setTitle("Upcoming").setDescription(lines));
  },
};
