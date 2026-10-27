import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  AudioPlayerStatus,
  createAudioPlayer,
  createAudioResource,
  entersState,
  getVoiceConnection,
  joinVoiceChannel,
  StreamType,
  VoiceConnectionStatus,
  type AudioPlayer,
  type VoiceConnection,
} from "@discordjs/voice";
import { ChannelType, type Client, type Message, type VoiceBasedChannel } from "discord.js";
import ffmpegStatic from "ffmpeg-static";
import prism from "prism-media";
import { logger } from "../../../shared";
import { baseEmbed, replyEmbed, replyErr, replyOk } from "../../../shared/embeds";
import { registerPrefixCommand } from "../../../vinyls/prefix/registry";
import type { PrefixCommand } from "../../../vinyls/prefix/types";

/**
 * Prefix live Coffee TTS: join, leave, set, voices.
 * Audio: Google Translate TTS → ffmpeg → @discordjs/voice (come live).
 */
const userVoice = new Map<string, string>();
const autojoin = new Map<string, boolean>();
const VOICES = ["it", "en", "en-gb", "es", "fr", "de", "pt", "pt-br", "pl", "nl", "ja", "ko", "zh"];

interface GuildTtsState {
  guildId: string;
  channelId: string | null;
  connection: VoiceConnection | null;
  player: AudioPlayer;
  queue: Array<{ text: string; lang: string; voiceChannel: VoiceBasedChannel }>;
  playing: boolean;
}

const guildStates = new Map<string, GuildTtsState>();

const TTS_HEADERS: Record<string, string> = {
  "User-Agent":
    "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
  Accept: "audio/mpeg,audio/*;q=0.9,*/*;q=0.8",
  Referer: "https://translate.google.com/",
};

function ensureState(guildId: string): GuildTtsState {
  let s = guildStates.get(guildId);
  if (!s) {
    const player = createAudioPlayer();
    s = { guildId, channelId: null, connection: null, player, queue: [], playing: false };
    player.on(AudioPlayerStatus.Idle, () => {
      s!.playing = false;
      void playNext(s!);
    });
    player.on("error", (err) => {
      logger.warn("[tts] player error", err.message);
      s!.playing = false;
      void playNext(s!);
    });
    guildStates.set(guildId, s);
  }
  return s;
}

function buildGoogleTtsUrl(text: string, lang: string): string {
  const q = encodeURIComponent(text);
  const tl = encodeURIComponent(lang || "it");
  return `https://translate.google.com/translate_tts?ie=UTF-8&client=tw-ob&tl=${tl}&q=${q}`;
}

function looksLikeMpeg(buf: Buffer): boolean {
  if (buf.length < 4) return false;
  if (buf.subarray(0, 3).toString("ascii") === "ID3") return true;
  return buf[0] === 0xff && (buf[1]! & 0xe0) === 0xe0;
}

async function fetchTtsBuffer(text: string, lang: string): Promise<Buffer | null> {
  const chunk = text.slice(0, 180);
  if (!chunk.trim()) return null;
  const url = buildGoogleTtsUrl(chunk, lang);
  try {
    const res = await fetch(url, {
      headers: TTS_HEADERS,
      signal: AbortSignal.timeout(12_000),
    });
    if (!res.ok) return null;
    const ab = await res.arrayBuffer();
    const buf = Buffer.from(ab);
    if (!looksLikeMpeg(buf)) return null;
    return buf;
  } catch (err) {
    logger.warn("[tts] fetch", err);
    return null;
  }
}

async function ensureConnection(
  state: GuildTtsState,
  voiceChannel: VoiceBasedChannel,
): Promise<VoiceConnection | null> {
  if (
    state.connection?.joinConfig.channelId === voiceChannel.id &&
    state.connection.state.status !== VoiceConnectionStatus.Destroyed
  ) {
    try {
      await entersState(state.connection, VoiceConnectionStatus.Ready, 8_000);
      return state.connection;
    } catch {
      try {
        state.connection.destroy();
      } catch {
        /* ignore */
      }
      state.connection = null;
    }
  }
  if (state.connection) {
    try {
      state.connection.destroy();
    } catch {
      /* ignore */
    }
    state.connection = null;
  }
  try {
    const connection = joinVoiceChannel({
      channelId: voiceChannel.id,
      guildId: voiceChannel.guild.id,
      adapterCreator: voiceChannel.guild.voiceAdapterCreator,
      selfDeaf: false,
    });
    state.connection = connection;
    state.channelId = voiceChannel.id;
    connection.subscribe(state.player);
    await entersState(connection, VoiceConnectionStatus.Ready, 15_000);
    try {
      const { attachPcmCapture } = await import("../../../vinyls/modules/utility/pcmRing.js");
      attachPcmCapture(voiceChannel.guild.id, connection);
    } catch {
      /* optional */
    }
    return connection;
  } catch (err) {
    logger.warn("[tts] join failed", err);
    state.connection = null;
    state.channelId = null;
    return null;
  }
}

async function playNext(state: GuildTtsState): Promise<void> {
  if (state.queue.length === 0) {
    state.playing = false;
    return;
  }
  const item = state.queue.shift()!;
  state.playing = true;
  const tmpPath = path.join(
    os.tmpdir(),
    `vc_tts_${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`,
  );
  try {
    const connection = await ensureConnection(state, item.voiceChannel);
    if (!connection) {
      state.playing = false;
      void playNext(state);
      return;
    }
    const buffer = await fetchTtsBuffer(item.text, item.lang);
    if (!buffer?.length) throw new Error("TTS buffer vuoto");
    fs.writeFileSync(tmpPath, buffer);
    const ffmpegPath = typeof ffmpegStatic === "string" ? ffmpegStatic : "ffmpeg";
    const transcoder = new prism.FFmpeg({
      args: ["-analyzeduration", "0", "-loglevel", "0", "-i", tmpPath, "-f", "s16le", "-ar", "48000", "-ac", "2"],
      shell: false,
      command: ffmpegPath,
    });
    const resource = createAudioResource(transcoder, { inputType: StreamType.Raw });
    state.player.play(resource);
    transcoder.once("close", () => {
      try {
        fs.unlinkSync(tmpPath);
      } catch {
        /* ignore */
      }
    });
  } catch (err) {
    logger.warn("[tts] play", err);
    try {
      fs.unlinkSync(tmpPath);
    } catch {
      /* ignore */
    }
    state.playing = false;
    void playNext(state);
  }
}

function enqueueSpeak(
  guildId: string,
  voiceChannel: VoiceBasedChannel,
  text: string,
  lang: string,
): void {
  const state = ensureState(guildId);
  if (state.queue.length >= 20) return;
  state.queue.push({ text, lang, voiceChannel });
  if (!state.playing) void playNext(state);
}

async function leaveGuild(guildId: string): Promise<void> {
  const state = guildStates.get(guildId);
  if (state) {
    state.queue = [];
    state.playing = false;
    try {
      state.player.stop(true);
    } catch {
      /* ignore */
    }
    if (state.connection) {
      try {
        state.connection.destroy();
      } catch {
        /* ignore */
      }
      state.connection = null;
    }
    state.channelId = null;
  }
  const existing = getVoiceConnection(guildId);
  if (existing) {
    try {
      existing.destroy();
    } catch {
      /* ignore */
    }
  }
}

const joinCommand: PrefixCommand = {
  name: "join",
  description: "Entra nel vocale (TTS).",
  usage: "+join",
  category: "tts",
  async execute({ message }) {
    const ch = message.member?.voice?.channel;
    if (!ch || ch.type !== ChannelType.GuildVoice) {
      await replyErr(message, "Devi essere in un canale vocale.");
      return;
    }
    if (!ch.joinable) {
      await replyErr(message, "Non ho i permessi per entrare in quel canale vocale.");
      return;
    }
    const state = ensureState(message.guild!.id);
    const conn = await ensureConnection(state, ch);
    if (!conn) {
      await replyErr(message, "Join vocale fallito.");
      return;
    }
    await replyOk(message, `TTS connesso a **${ch.name}**.`);
  },
};

const leaveCommand: PrefixCommand = {
  name: "leave",
  description: "Esci dal vocale TTS.",
  usage: "+leave",
  category: "tts",
  async execute({ message }) {
    if (!message.guild) return;
    await leaveGuild(message.guild.id);
    await replyOk(message, "TTS leave.");
  },
};

const setCommand: PrefixCommand = {
  name: "set",
  description: "Imposta voice/autojoin TTS.",
  usage: "+set voice <code|reset> | +set autojoin <on|off>",
  category: "tts",
  async execute({ message, args }) {
    const sub = String(args[0] || "").toLowerCase();
    if (sub === "voice") {
      const raw = String(args[1] || "").toLowerCase();
      if (!raw) {
        await replyErr(message, "Uso: `+set voice <codice | reset>`");
        return;
      }
      if (raw === "reset") {
        userVoice.delete(message.author.id);
        await replyOk(message, "Voce TTS resettata.");
        return;
      }
      if (!VOICES.includes(raw)) {
        await replyErr(message, `Codice non supportato. Prova: ${VOICES.slice(0, 8).join(", ")}…`);
        return;
      }
      userVoice.set(message.author.id, raw);
      await replyOk(message, `Voce TTS: \`${raw}\``);
      return;
    }
    if (sub === "autojoin") {
      const raw = String(args[1] || "").toLowerCase();
      if (raw !== "on" && raw !== "off") {
        await replyErr(message, "Uso: `+set autojoin <on | off>`");
        return;
      }
      autojoin.set(message.author.id, raw === "on");
      await replyOk(message, `Autojoin TTS: **${raw}**`);
      return;
    }
    await replyErr(message, "Uso: `+set voice <codice | reset>` o `+set autojoin <on | off>`.");
  },
};

const voicesCommand: PrefixCommand = {
  name: "voices",
  description: "Elenco voci TTS supportate.",
  usage: "+voices",
  category: "tts",
  async execute({ message }) {
    const current = userVoice.get(message.author.id) || "it";
    await replyEmbed(
      message,
      baseEmbed()
        .setTitle("Voices TTS")
        .setDescription(
          ["**Voci supportate**", VOICES.map((c) => `\`${c}\``).join(", "), "", `**In uso:** \`${current}\``].join(
            "\n",
          ),
        ),
    );
  },
};

function shouldSpeakMessage(message: Message, botChannelId: string | null): boolean {
  if (!message.guild || message.author.bot || !message.content) return false;
  if (message.content.startsWith(process.env.BOT_PREFIX || "+")) return false;
  const memberCh = message.member?.voice?.channel;
  if (!memberCh || memberCh.type !== ChannelType.GuildVoice) return false;
  if (!botChannelId) {
    return autojoin.get(message.author.id) === true;
  }
  return memberCh.id === botChannelId;
}

export function registerTtsModule(client?: Client): void {
  registerPrefixCommand(joinCommand);
  registerPrefixCommand(leaveCommand);
  registerPrefixCommand(setCommand);
  registerPrefixCommand(voicesCommand);

  if (client) {
    client.on("messageCreate", (message: Message) => {
      try {
        if (!message.guild) return;
        const state = guildStates.get(message.guild.id);
        const botCh = state?.channelId || null;
        if (!shouldSpeakMessage(message, botCh)) return;
        const voiceCh = message.member!.voice.channel!;
        if (!botCh && autojoin.get(message.author.id)) {
          // autojoin: will join on enqueue
        } else if (!botCh) {
          return;
        }
        const lang = userVoice.get(message.author.id) || "it";
        const text = message.content.replace(/https?:\/\/\S+/gi, "").trim();
        if (text.length < 2 || text.length > 300) return;
        enqueueSpeak(message.guild.id, voiceCh, text, lang);
      } catch (err) {
        logger.warn("[tts] message", err);
      }
    });
  }

  logger.info("[tts] join/leave/set/voices + Google TTS audio");
}
