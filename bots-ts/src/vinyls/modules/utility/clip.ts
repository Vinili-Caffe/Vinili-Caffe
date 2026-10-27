import fs from "node:fs";
import path from "node:path";
import { AttachmentBuilder } from "discord.js";
import { replyErr, replyOk } from "../../../shared/embeds";
import type { PrefixCommand } from "../../prefix/types";
import {
  extractPcmClip,
  getPcmCaptureInfo,
  isPcmCaptureActive,
  pcmToMp3File,
} from "./pcmRing";
import { getLastCapture, listCaptures, pushCaptureSeg } from "./voiceCapture";

const lastClip = new Map<string, { at: number; by: string; note: string; mp3?: string }>();

export const clipCommand: PrefixCommand = {
  name: "clip",
  description: "Esporta clip vocale dal ring PCM (se capture on).",
  usage: "+clip [secondi|nota]",
  category: "utility",
  async execute({ message, args }) {
    const guild = message.guild;
    if (!guild) return;
    if (!message.member?.voice?.channel) {
      await replyErr(message, "Devi essere in vocale.");
      return;
    }
    const maybeSec = Number(args[0]);
    const seconds = Number.isFinite(maybeSec) && maybeSec > 0 ? Math.floor(maybeSec) : 15;
    const note =
      Number.isFinite(maybeSec) && maybeSec > 0
        ? args.slice(1).join(" ").trim() || `clip ${seconds}s`
        : args.join(" ").trim() || "clip";

    pushCaptureSeg(guild.id, {
      at: Date.now(),
      userId: message.author.id,
      channelId: message.member.voice.channel.id,
      note,
    });

    if (!isPcmCaptureActive(guild.id) || process.env.VC_TS_VOICE_CAPTURE !== "1") {
      lastClip.set(guild.id, { at: Date.now(), by: message.author.id, note });
      const info = getPcmCaptureInfo(guild.id);
      await replyOk(
        message,
        `Clip meta: **${note.slice(0, 40)}**\n_PCM capture off o idle_ (size=${info.sizeBytes}, max=${info.maxSec}s). Imposta \`VC_TS_VOICE_CAPTURE=1\` + bot in vocale.`,
      );
      return;
    }

    const pcm = extractPcmClip(guild.id, Math.min(30, Math.max(3, seconds)));
    if (pcm.length < 8_000) {
      await replyErr(message, "Ring PCM troppo corto — parla un po’ e riprova.");
      return;
    }
    try {
      const mp3Path = await pcmToMp3File(pcm);
      if (!mp3Path) {
        await replyErr(message, "Export MP3 fallito.");
        return;
      }
      lastClip.set(guild.id, { at: Date.now(), by: message.author.id, note, mp3: mp3Path });
      const file = new AttachmentBuilder(mp3Path, { name: "clip.mp3" });
      await message.reply({
        content: `🎬 Clip **${seconds}s** · ${note.slice(0, 60)}`,
        files: [file],
        allowedMentions: { repliedUser: false },
      });
      setTimeout(() => {
        try {
          fs.rmSync(path.dirname(mp3Path), { recursive: true, force: true });
        } catch {
          /* ignore */
        }
      }, 60_000).unref?.();
    } catch (err) {
      await replyErr(message, `ffmpeg clip fallito: ${String((err as Error)?.message || err).slice(0, 120)}`);
    }
  },
};

export const myclipCommand: PrefixCommand = {
  name: "myclip",
  description: "Ultimo clip meta della guild.",
  usage: "+myclip",
  category: "utility",
  async execute({ message }) {
    const guild = message.guild;
    if (!guild) return;
    const c =
      lastClip.get(guild.id) ||
      (() => {
        const cap = getLastCapture(guild.id);
        return cap ? { at: cap.at, by: cap.userId, note: cap.note } : null;
      })();
    if (!c) {
      await replyErr(message, "Nessun clip in memoria.");
      return;
    }
    const recent = listCaptures(guild.id, 3)
      .map((s) => `· <@${s.userId}> ${s.note}`)
      .join("\n");
    await replyOk(
      message,
      `Ultimo clip di <@${c.by}>: **${c.note}** (<t:${Math.floor(c.at / 1000)}:R>)\n${recent}`,
    );
  },
};
