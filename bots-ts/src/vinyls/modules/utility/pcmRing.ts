import { spawn } from "node:child_process";
import fs from "node:fs";
import os from "node:os";
import path from "node:path";
import {
  EndBehaviorType,
  getVoiceConnection,
  type VoiceConnection,
} from "@discordjs/voice";
import ffmpegStatic from "ffmpeg-static";
import prism from "prism-media";
import { logger } from "../../../shared";

const PCM_SAMPLE_RATE = 48_000;
const PCM_CHANNELS = 1;
const DECODE_CHANNELS = 2;
const BYTES_PER_SEC = PCM_SAMPLE_RATE * PCM_CHANNELS * 2;
const MAX_SEC = Math.max(10, Math.min(30, Number(process.env.VC_VOICE_PCM_RING_SEC) || 20));

class PcmRing {
  capacity = MAX_SEC * BYTES_PER_SEC;
  buffer = Buffer.alloc(this.capacity);
  head = 0;
  size = 0;

  writeMono(chunk: Buffer): void {
    if (!chunk.length) return;
    let data = chunk;
    if (data.length >= this.capacity) data = data.subarray(data.length - this.capacity);
    const len = data.length;
    const tail = this.capacity - this.head;
    if (len <= tail) data.copy(this.buffer, this.head);
    else {
      data.copy(this.buffer, this.head, 0, tail);
      data.copy(this.buffer, 0, tail, len);
    }
    this.head = (this.head + len) % this.capacity;
    this.size = Math.min(this.capacity, this.size + len);
  }

  snapshot(seconds: number): Buffer {
    const want = Math.min(this.size, Math.floor(seconds * BYTES_PER_SEC));
    if (want <= 0) return Buffer.alloc(0);
    const out = Buffer.alloc(want);
    const start = (this.head - want + this.capacity) % this.capacity;
    if (start + want <= this.capacity) {
      this.buffer.copy(out, 0, start, start + want);
    } else {
      const first = this.capacity - start;
      this.buffer.copy(out, 0, start, this.capacity);
      this.buffer.copy(out, first, 0, want - first);
    }
    return out;
  }
}

function downmixStereoToMono(pcmStereo: Buffer): Buffer {
  const frame = DECODE_CHANNELS * 2;
  if (pcmStereo.length < frame) return Buffer.alloc(0);
  const frames = Math.floor(pcmStereo.length / frame);
  const out = Buffer.alloc(frames * 2);
  for (let i = 0; i < frames; i += 1) {
    const off = i * frame;
    const l = pcmStereo.readInt16LE(off);
    const r = pcmStereo.readInt16LE(off + 2);
    out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round((l + r) / 2))), i * 2);
  }
  return out;
}

interface GuildCapture {
  ring: PcmRing;
  connection: VoiceConnection | null;
  subscribed: Set<string>;
}

const byGuild = new Map<string, GuildCapture>();

function ensure(guildId: string): GuildCapture {
  let c = byGuild.get(guildId);
  if (!c) {
    c = { ring: new PcmRing(), connection: null, subscribed: new Set() };
    byGuild.set(guildId, c);
  }
  return c;
}

export function isPcmCaptureActive(guildId: string): boolean {
  return Boolean(byGuild.get(guildId)?.connection);
}

export function getPcmCaptureInfo(guildId: string): { sizeBytes: number; maxSec: number } {
  const c = byGuild.get(guildId);
  return { sizeBytes: c?.ring.size || 0, maxSec: MAX_SEC };
}

export function extractPcmClip(guildId: string, seconds: number): Buffer {
  return ensure(guildId).ring.snapshot(Math.max(3, Math.min(MAX_SEC, seconds)));
}

/** Attacca receiver su voice connection esistente (music/TTS). */
export function attachPcmCapture(guildId: string, connection?: VoiceConnection | null): void {
  if (process.env.VC_TS_VOICE_CAPTURE !== "1") return;
  const conn = connection || getVoiceConnection(guildId);
  if (!conn) return;
  const cap = ensure(guildId);
  if (cap.connection === conn) return;
  detachPcmCapture(guildId);
  cap.connection = conn;
  const receiver = conn.receiver;
  receiver.speaking.on("start", (userId: string) => {
    if (cap.subscribed.has(userId)) return;
    try {
      const opus = receiver.subscribe(userId, {
        end: { behavior: EndBehaviorType.AfterSilence, duration: 800 },
      });
      const decoder = new prism.opus.Decoder({
        rate: PCM_SAMPLE_RATE,
        channels: DECODE_CHANNELS,
        frameSize: 960,
      });
      cap.subscribed.add(userId);
      opus.pipe(decoder);
      decoder.on("data", (chunk: Buffer) => {
        cap.ring.writeMono(downmixStereoToMono(chunk));
      });
      const cleanup = () => {
        cap.subscribed.delete(userId);
        try {
          opus.destroy();
        } catch {
          /* ignore */
        }
        try {
          decoder.destroy();
        } catch {
          /* ignore */
        }
      };
      opus.on("end", cleanup);
      opus.on("close", cleanup);
      decoder.on("error", (err: Error) => {
        logger.warn("[pcm] decode", err.message);
        cleanup();
      });
    } catch (err) {
      logger.warn("[pcm] subscribe", err);
    }
  });
  logger.info(`[pcm] capture attached guild=${guildId}`);
}

export function detachPcmCapture(guildId: string): void {
  const cap = byGuild.get(guildId);
  if (!cap) return;
  cap.connection = null;
  cap.subscribed.clear();
}

export async function pcmToMp3File(pcmMono: Buffer): Promise<string | null> {
  if (!pcmMono.length) return null;
  const dir = fs.mkdtempSync(path.join(os.tmpdir(), "vc-clip-"));
  const pcmPath = path.join(dir, "clip.pcm");
  const mp3Path = path.join(dir, "clip.mp3");
  fs.writeFileSync(pcmPath, pcmMono);
  const ffmpeg = typeof ffmpegStatic === "string" ? ffmpegStatic : "ffmpeg";
  await new Promise<void>((resolve, reject) => {
    const proc = spawn(
      ffmpeg,
      [
        "-f",
        "s16le",
        "-ar",
        String(PCM_SAMPLE_RATE),
        "-ac",
        "1",
        "-i",
        pcmPath,
        "-codec:a",
        "libmp3lame",
        "-q:a",
        "4",
        "-y",
        mp3Path,
      ],
      { stdio: ["ignore", "ignore", "pipe"] },
    );
    let err = "";
    proc.stderr?.on("data", (c) => {
      err += String(c);
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0) resolve();
      else reject(new Error(err.trim() || `ffmpeg ${code}`));
    });
  });
  try {
    fs.unlinkSync(pcmPath);
  } catch {
    /* ignore */
  }
  return mp3Path;
}
