import type { Client, VoiceState } from "discord.js";
import { logger } from "../../../shared";

/**
 * Ring buffer meta per clip — PCM/ffmpeg 1:1 live = deepen successivo.
 * Tiene ultimi N "segmenti" per guild quando c’è attività vocale bot-aware.
 */
interface CaptureSeg {
  at: number;
  userId: string;
  channelId: string;
  note: string;
}

const ring = new Map<string, CaptureSeg[]>();
const MAX = 30;

export function pushCaptureSeg(guildId: string, seg: CaptureSeg): void {
  const list = ring.get(guildId) || [];
  list.push(seg);
  if (list.length > MAX) list.splice(0, list.length - MAX);
  ring.set(guildId, list);
}

export function getLastCapture(guildId: string): CaptureSeg | null {
  const list = ring.get(guildId);
  return list?.length ? list[list.length - 1]! : null;
}

export function listCaptures(guildId: string, limit = 5): CaptureSeg[] {
  const list = ring.get(guildId) || [];
  return list.slice(-limit);
}

export function registerVoiceCaptureHooks(client: Client): void {
  if (process.env.VC_TS_VOICE_CAPTURE !== "1") {
    logger.info("[voiceCapture] off — VC_TS_VOICE_CAPTURE=1");
    return;
  }
  client.on("voiceStateUpdate", (before: VoiceState, after: VoiceState) => {
    try {
      const guildId = after.guild.id;
      const joined = !before.channelId && after.channelId;
      const left = before.channelId && !after.channelId;
      if (!joined && !left) return;
      const userId = after.id;
      pushCaptureSeg(guildId, {
        at: Date.now(),
        userId,
        channelId: String(after.channelId || before.channelId || ""),
        note: joined ? "join" : "leave",
      });
    } catch (err) {
      logger.warn("[voiceCapture]", err);
    }
  });
  logger.info("[voiceCapture] join/leave ring on (PCM stream TBD)");
}
