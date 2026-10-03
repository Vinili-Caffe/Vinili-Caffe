const {
  getVoiceConnection,
  VoiceConnectionStatus,
  EndBehaviorType,
} = require("@discordjs/voice");
const prism = require("prism-media");

const PCM_SAMPLE_RATE = 48000;
const PCM_CHANNELS = 2;
const PCM_BYTES_PER_SEC = PCM_SAMPLE_RATE * PCM_CHANNELS * 2;
const CAPTURE_MAX_SEC = 60;
const PAD_TICK_MS = 200;
/* Marker: clipAllVoices1 — master mix + undeafen-before-sub + resub on speak */

let opusUnavailableLogged = false;

function markCaptureOpusUnavailable(capture, err) {
  if (capture?.opusDisabled) return;
  capture.opusDisabled = true;
  if (!opusUnavailableLogged) {
    opusUnavailableLogged = true;
    global.logger?.warn?.(
      "[VOICE CAPTURE] Opus decoder non disponibile, capture vocale disattivata:",
      err?.message || err,
    );
  }
  stopCaptureSubscriptions(capture);
}

const captureByGuild = new Map();

class PcmRingBuffer {
  constructor(maxSeconds) {
    this.capacity = Math.max(1, maxSeconds) * PCM_BYTES_PER_SEC;
    this.buffer = Buffer.alloc(this.capacity);
    this.head = 0;
    this.size = 0;
    this.lastWriteAt = 0;
    this.lastAppendAt = 0;
    this.lastAppendLen = 0;
  }

  padSilenceToNow() {
    if (!this.lastWriteAt) return;
    const now = Date.now();
    const elapsedMs = now - this.lastWriteAt;
    const MIN_SILENCE_GAP_MS = 50;
    if (elapsedMs < MIN_SILENCE_GAP_MS) return;
    let silenceBytes = Math.floor((elapsedMs / 1000) * PCM_BYTES_PER_SEC);
    const sampleBytes = PCM_CHANNELS * 2;
    silenceBytes -= silenceBytes % sampleBytes;
    if (silenceBytes <= 0) return;
    const toWrite = Math.min(silenceBytes, this.capacity);
    this._writeRaw(Buffer.alloc(toWrite));
    this.lastWriteAt = now;
    this.lastAppendAt = 0;
    this.lastAppendLen = 0;
  }

  _writeRaw(chunk) {
    if (!chunk?.length) return;
    let data = chunk;
    if (data.length >= this.capacity) {
      data = data.subarray(data.length - this.capacity);
    }
    const len = data.length;
    const tail = this.capacity - this.head;
    if (len <= tail) {
      data.copy(this.buffer, this.head);
    } else {
      data.copy(this.buffer, this.head, 0, tail);
      data.copy(this.buffer, 0, tail, len);
    }
    this.head = (this.head + len) % this.capacity;
    this.size = Math.min(this.capacity, this.size + len);
  }

  write(chunk) {
    if (!chunk?.length) return;
    this.padSilenceToNow();
    this._writeRaw(chunk);
    const now = Date.now();
    this.lastWriteAt = now;
    this.lastAppendAt = now;
    this.lastAppendLen = chunk.length;
  }

  /**
   * Mix into the shared timeline: same ~20ms window → add into last append;
   * otherwise append (after silence pad). Keeps every speaker on one clock.
   */
  writeMix(chunk) {
    if (!chunk?.length) return;
    this.padSilenceToNow();
    const now = Date.now();
    const sameWindow =
      this.lastAppendAt &&
      now - this.lastAppendAt < 30 &&
      this.lastAppendLen >= chunk.length &&
      this.size >= chunk.length;

    if (sameWindow) {
      const len = chunk.length;
      for (let i = 0; i + 1 < len; i += 2) {
        const pos = (this.head - len + i + this.capacity * 2) % this.capacity;
        const a = this.buffer.readInt16LE(pos);
        const b = chunk.readInt16LE(i);
        this.buffer.writeInt16LE(softClipSample(a + b), pos);
      }
      this.lastWriteAt = now;
      return;
    }

    this._writeRaw(chunk);
    this.lastWriteAt = now;
    this.lastAppendAt = now;
    this.lastAppendLen = chunk.length;
  }

  readLast(seconds) {
    const want = Math.min(this.size, Math.max(1, seconds) * PCM_BYTES_PER_SEC);
    if (want <= 0) return Buffer.alloc(0);
    const out = Buffer.alloc(want);
    const start = (this.head - want + this.capacity) % this.capacity;
    if (start + want <= this.capacity) {
      this.buffer.copy(out, 0, start, start + want);
      return out;
    }
    const first = this.capacity - start;
    this.buffer.copy(out, 0, start, this.capacity);
    this.buffer.copy(out, first, 0, want - first);
    return out;
  }

  bufferedSeconds() {
    return Math.floor(this.size / PCM_BYTES_PER_SEC);
  }
}

function pcmBufferHasAudio(buffer) {
  if (!buffer?.length) return false;
  for (let i = 0; i + 1 < buffer.length; i += 2) {
    if (Math.abs(buffer.readInt16LE(i)) > 24) return true;
  }
  return false;
}

function softClipSample(sample) {
  const x = sample / 32768;
  const y = Math.tanh(x * 1.15);
  const out = Math.round(y * 32767);
  if (out > 32767) return 32767;
  if (out < -32768) return -32768;
  return out;
}

function mixPcmBuffers(buffers) {
  const tracks = buffers.filter((buf) => buf?.length);
  if (!tracks.length) return Buffer.alloc(0);
  const size = Math.max(...tracks.map((buf) => buf.length));
  if (tracks.length === 1) {
    const single = tracks[0];
    if (single.length === size) return peakNormalizePcm(Buffer.from(single));
    const out = Buffer.alloc(size);
    single.copy(out, size - single.length);
    return peakNormalizePcm(out);
  }

  const floats = new Float64Array(size / 2);
  for (let i = 0; i + 1 < size; i += 2) {
    let sum = 0;
    let active = 0;
    for (const track of tracks) {
      const offset = size - track.length;
      const pos = i - offset;
      if (pos < 0 || pos + 1 >= track.length) continue;
      const sample = track.readInt16LE(pos);
      if (Math.abs(sample) <= 24) continue;
      sum += sample;
      active += 1;
    }
    if (!active) {
      floats[i / 2] = 0;
      continue;
    }
    floats[i / 2] = active > 1 ? sum / Math.sqrt(active) : sum;
  }

  let peak = 1;
  for (let i = 0; i < floats.length; i += 1) {
    const a = Math.abs(floats[i]);
    if (a > peak) peak = a;
  }
  const target = 28000;
  const gain = peak > 1 ? Math.min(3.5, target / peak) : 1;
  const out = Buffer.alloc(size);
  for (let i = 0; i < floats.length; i += 1) {
    out.writeInt16LE(softClipSample(floats[i] * gain), i * 2);
  }
  return out;
}

function peakNormalizePcm(buffer, target = 28000) {
  if (!buffer?.length) return buffer;
  let peak = 1;
  for (let i = 0; i + 1 < buffer.length; i += 2) {
    const a = Math.abs(buffer.readInt16LE(i));
    if (a > peak) peak = a;
  }
  if (peak < 512) return buffer;
  const gain = Math.min(3.5, target / peak);
  if (gain >= 0.98 && gain <= 1.05) return buffer;
  const out = Buffer.alloc(buffer.length);
  for (let i = 0; i + 1 < buffer.length; i += 2) {
    out.writeInt16LE(softClipSample(buffer.readInt16LE(i) * gain), i);
  }
  return out;
}

function resolveConnection(guildId) {
  const conn = getVoiceConnection(String(guildId || ""));
  if (!conn || conn.state?.status === VoiceConnectionStatus.Destroyed) return null;
  return conn;
}

async function ensureCaptureReceive(guild, capture) {
  const me = guild?.members?.me;
  if (!me?.voice) return;
  if (me.voice.deaf || me.voice.selfDeaf) {
    capture.restoreBotDeaf = true;
    await me.voice.setDeaf(false).catch(() => {
      capture.restoreBotDeaf = false;
    });
  }
}

async function restoreCaptureReceive(guild, capture) {
  if (!capture?.restoreBotDeaf) return;
  const me = guild?.members?.me;
  if (!me?.voice?.channelId) return;
  await me.voice.setDeaf(true).catch(() => null);
}

function destroyUserSubscription(row) {
  if (!row) return;
  try {
    row.subscription?.destroy();
  } catch {
  }
  try {
    row.decoder?.removeAllListeners?.("data");
  } catch {
  }
  try {
    row.decoder?.destroy?.();
  } catch {
  }
}

function isSubscriptionDead(row) {
  if (!row?.subscription) return true;
  try {
    if (row.subscription.destroyed) return true;
    if (row.subscription.readableEnded) return true;
    if (row.subscription.closed) return true;
  } catch {
    return true;
  }
  return false;
}

function subscribeCaptureUser(capture, userId, { force = false } = {}) {
  const uid = String(userId || "").trim();
  if (!uid || uid === String(capture.botUserId || "") || capture.opusDisabled) return;

  const connection = capture.connection;
  if (!connection) return;

  const existing = capture.users.get(uid);
  if (existing && !force && !isSubscriptionDead(existing)) return;

  if (existing) {
    destroyUserSubscription(existing);
  }

  const OpusDecoder = prism.opus.Decoder;

  try {
    const ring = existing?.ring || new PcmRingBuffer(CAPTURE_MAX_SEC);
    const decoder = new OpusDecoder({ frameSize: 960, channels: PCM_CHANNELS, rate: PCM_SAMPLE_RATE });
    const subscription = connection.receiver.subscribe(uid, {
      end: { behavior: EndBehaviorType.Manual },
    });

    subscription.on("error", () => {});
    decoder.on("error", () => {});
    decoder.on("data", (chunk) => {
      try {
        ring.write(chunk);
      } catch {
      }
      try {
        capture.masterRing?.writeMix(chunk);
      } catch {
      }
    });
    subscription.pipe(decoder);

    capture.users.set(uid, { subscription, decoder, ring, subscribedAt: Date.now() });
  } catch (err) {
    markCaptureOpusUnavailable(capture, err);
  }
}

function seedCaptureMembers(capture, voiceChannel) {
  if (!voiceChannel?.members) return;
  for (const member of voiceChannel.members.values()) {
    if (member.user?.bot) continue;
    subscribeCaptureUser(capture, member.id);
  }
}

function startCapturePadTicker(capture) {
  stopCapturePadTicker(capture);
  capture.padTimer = setInterval(() => {
    try {
      capture.masterRing?.padSilenceToNow();
    } catch {
    }
    for (const row of capture.users.values()) {
      try {
        row.ring?.padSilenceToNow();
      } catch {
      }
    }
  }, PAD_TICK_MS);
  if (typeof capture.padTimer.unref === "function") capture.padTimer.unref();
}

function stopCapturePadTicker(capture) {
  if (!capture?.padTimer) return;
  try {
    clearInterval(capture.padTimer);
  } catch {
  }
  capture.padTimer = null;
}

function stopCaptureSubscriptions(capture) {
  stopCapturePadTicker(capture);
  for (const row of capture.users.values()) {
    destroyUserSubscription(row);
  }
  capture.users.clear();
  try {
    capture.connection?.receiver?.speaking?.off?.("start", capture.onSpeakingStart);
  } catch {
  }
}

async function startVoiceContinuousCapture({ guildId, voiceChannel, client, botUserId }) {
  const gid = String(guildId || "").trim();
  if (!gid || !voiceChannel?.isVoiceBased?.()) return { ok: false, reason: "invalid" };

  const connection = resolveConnection(gid);
  if (!connection) return { ok: false, reason: "no_connection" };

  const existing = captureByGuild.get(gid);
  if (existing && String(existing.voiceChannelId) === String(voiceChannel.id)) {
    existing.connection = connection;
    await ensureCaptureReceive(voiceChannel.guild, existing);
    seedCaptureMembers(existing, voiceChannel);
    if (!existing.padTimer) startCapturePadTicker(existing);
    return { ok: true, reused: true };
  }
  if (existing) await stopVoiceContinuousCapture(gid, client);

  const capture = {
    guildId: gid,
    voiceChannelId: String(voiceChannel.id),
    voiceChannelName: String(voiceChannel.name || "Vocale"),
    connection,
    client,
    botUserId: String(botUserId || client?.user?.id || ""),
    users: new Map(),
    masterRing: new PcmRingBuffer(CAPTURE_MAX_SEC),
    startedAt: Date.now(),
    restoreBotDeaf: false,
    onSpeakingStart: null,
    padTimer: null,
  };

  // Undeafen PRIMA di subscribe: da deaf Discord non manda l'audio degli altri.
  await ensureCaptureReceive(voiceChannel.guild, capture);

  capture.onSpeakingStart = (userId) => {
    // Se la sub è morta (o mai aperta), riapri tenendo il ring — altrimenti no-op.
    subscribeCaptureUser(capture, userId);
  };

  connection.receiver.speaking.on("start", capture.onSpeakingStart);
  seedCaptureMembers(capture, voiceChannel);
  startCapturePadTicker(capture);
  captureByGuild.set(gid, capture);
  return { ok: true };
}

async function stopVoiceContinuousCapture(guildId, client) {
  const gid = String(guildId || "").trim();
  const capture = captureByGuild.get(gid);
  if (!capture) return false;

  stopCaptureSubscriptions(capture);
  const guild = client?.guilds?.cache?.get(gid) || capture.client?.guilds?.cache?.get(gid);
  if (guild) await restoreCaptureReceive(guild, capture);
  captureByGuild.delete(gid);
  return true;
}

function syncCaptureVoiceChannelMember(guildId, member) {
  const capture = captureByGuild.get(String(guildId || "").trim());
  if (!capture || !member || member.user?.bot) return;
  if (String(member.voice?.channelId || "") !== capture.voiceChannelId) return;
  subscribeCaptureUser(capture, member.id);
}

function getVoiceCaptureInfo(guildId) {
  const capture = captureByGuild.get(String(guildId || "").trim());
  if (!capture) return null;
  try {
    capture.masterRing?.padSilenceToNow();
  } catch {
  }
  const rings = [...capture.users.values()].map((row) => row.ring).filter(Boolean);
  for (const ring of rings) {
    try {
      ring.padSilenceToNow();
    } catch {
    }
  }
  const userSec = rings.length ? Math.max(...rings.map((ring) => ring.bufferedSeconds())) : 0;
  const masterSec = capture.masterRing ? capture.masterRing.bufferedSeconds() : 0;
  const bufferedSec = Math.max(userSec, masterSec);
  return {
    active: true,
    voiceChannelId: capture.voiceChannelId,
    voiceChannelName: capture.voiceChannelName,
    bufferedSec,
    startedAt: capture.startedAt,
    users: capture.users.size,
  };
}

function extractVoiceCaptureClip(guildId, seconds) {
  const capture = captureByGuild.get(String(guildId || "").trim());
  if (!capture) return { ok: false, reason: "not_capturing" };

  try {
    capture.masterRing?.padSilenceToNow();
  } catch {
  }
  const rings = [...capture.users.values()].map((row) => row.ring).filter(Boolean);
  for (const ring of rings) {
    try {
      ring.padSilenceToNow();
    } catch {
    }
  }

  const userSec = rings.length ? Math.max(...rings.map((ring) => ring.bufferedSeconds())) : 0;
  const masterSec = capture.masterRing ? capture.masterRing.bufferedSeconds() : 0;
  const availableSec = Math.max(userSec, masterSec);
  if (availableSec < 1) return { ok: false, reason: "empty", availableSec: 0 };

  const durationSec = Math.max(1, Math.min(CAPTURE_MAX_SEC, availableSec, Math.floor(Number(seconds) || 1)));

  // Preferisci master mix (tutte le voci già allineate sul wall-clock).
  if (capture.masterRing && masterSec >= 1) {
    const masterPcm = capture.masterRing.readLast(durationSec);
    if (masterPcm.length && pcmBufferHasAudio(masterPcm)) {
      return {
        ok: true,
        pcm: peakNormalizePcm(masterPcm),
        durationSec,
        voiceChannelName: capture.voiceChannelName,
        availableSec,
        source: "master",
      };
    }
  }

  if (!rings.length) return { ok: false, reason: "empty", availableSec: 0 };

  const pcmBuffers = rings
    .map((ring) => ring.readLast(durationSec))
    .filter((buf) => pcmBufferHasAudio(buf));
  if (!pcmBuffers.length) return { ok: false, reason: "silent", availableSec };

  const pcm = mixPcmBuffers(pcmBuffers);
  if (!pcm.length || !pcmBufferHasAudio(pcm)) {
    return { ok: false, reason: "silent", availableSec };
  }

  return {
    ok: true,
    pcm,
    durationSec,
    voiceChannelName: capture.voiceChannelName,
    availableSec,
    source: "users",
  };
}

function isVoiceCaptureActive(guildId) {
  return captureByGuild.has(String(guildId || "").trim());
}

module.exports = {
  CAPTURE_MAX_SEC,
  PCM_BYTES_PER_SEC,
  PCM_SAMPLE_RATE,
  PCM_CHANNELS,
  extractVoiceCaptureClip,
  getVoiceCaptureInfo,
  isVoiceCaptureActive,
  pcmBufferHasAudio,
  startVoiceContinuousCapture,
  stopVoiceContinuousCapture,
  syncCaptureVoiceChannelMember,
  mixPcmBuffers,
};
