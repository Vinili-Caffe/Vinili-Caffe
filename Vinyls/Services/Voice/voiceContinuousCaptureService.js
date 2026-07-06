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

const captureByGuild = new Map();

class PcmRingBuffer {
  constructor(maxSeconds) {
    this.capacity = Math.max(1, maxSeconds) * PCM_BYTES_PER_SEC;
    this.buffer = Buffer.alloc(this.capacity);
    this.head = 0;
    this.size = 0;
  }

  write(chunk) {
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
    if (buffer.readInt16LE(i) !== 0) return true;
  }
  return false;
}

function mixPcmBuffers(buffers) {
  const tracks = buffers.filter((buf) => buf?.length);
  if (!tracks.length) return Buffer.alloc(0);
  const size = Math.max(...tracks.map((buf) => buf.length));
  if (tracks.length === 1) {
    const single = tracks[0];
    if (single.length === size) return Buffer.from(single);
    const out = Buffer.alloc(size);
    single.copy(out, size - single.length);
    return out;
  }
  const out = Buffer.alloc(size);
  for (let i = 0; i + 1 < size; i += 2) {
    let sum = 0;
    let count = 0;
    for (const track of tracks) {
      const offset = size - track.length;
      const pos = i - offset;
      if (pos < 0 || pos + 1 >= track.length) continue;
      sum += track.readInt16LE(pos);
      count += 1;
    }
    if (!count) continue;
    let mixed = Math.round(sum / count);
    if (mixed > 32767) mixed = 32767;
    if (mixed < -32768) mixed = -32768;
    out.writeInt16LE(mixed, i);
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
  if (me.voice.deaf) {
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

function subscribeCaptureUser(capture, userId) {
  const uid = String(userId || "").trim();
  if (!uid || uid === String(capture.botUserId || "") || capture.users.has(uid)) return;

  const connection = capture.connection;
  if (!connection) return;

  const ring = new PcmRingBuffer(CAPTURE_MAX_SEC);
  const decoder = new prism.opus.Decoder({ frameSize: 960, channels: PCM_CHANNELS, rate: PCM_SAMPLE_RATE });
  const subscription = connection.receiver.subscribe(uid, {
    end: { behavior: EndBehaviorType.Manual },
  });

  subscription.on("error", () => {});
  decoder.on("error", () => {});
  decoder.on("data", (chunk) => {
    ring.write(chunk);
  });
  subscription.pipe(decoder);

  capture.users.set(uid, { subscription, decoder, ring });
}

function seedCaptureMembers(capture, voiceChannel) {
  if (!voiceChannel?.members) return;
  for (const member of voiceChannel.members.values()) {
    if (member.user?.bot) continue;
    subscribeCaptureUser(capture, member.id);
  }
}

function stopCaptureSubscriptions(capture) {
  for (const row of capture.users.values()) {
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
    startedAt: Date.now(),
    restoreBotDeaf: false,
    onSpeakingStart: null,
  };

  capture.onSpeakingStart = (userId) => {
    subscribeCaptureUser(capture, userId);
  };

  connection.receiver.speaking.on("start", capture.onSpeakingStart);
  seedCaptureMembers(capture, voiceChannel);
  await ensureCaptureReceive(voiceChannel.guild, capture);
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
  const rings = [...capture.users.values()].map((row) => row.ring);
  const bufferedSec = rings.length
    ? Math.max(...rings.map((ring) => ring.bufferedSeconds()))
    : 0;
  return {
    active: true,
    voiceChannelId: capture.voiceChannelId,
    voiceChannelName: capture.voiceChannelName,
    bufferedSec,
    startedAt: capture.startedAt,
  };
}

function extractVoiceCaptureClip(guildId, seconds) {
  const capture = captureByGuild.get(String(guildId || "").trim());
  if (!capture) return { ok: false, reason: "not_capturing" };

  const rings = [...capture.users.values()].map((row) => row.ring).filter(Boolean);
  if (!rings.length) return { ok: false, reason: "empty" };

  const availableSec = Math.max(...rings.map((ring) => ring.bufferedSeconds()));
  if (availableSec < 1) return { ok: false, reason: "empty", availableSec: 0 };

  const durationSec = Math.max(1, Math.min(CAPTURE_MAX_SEC, availableSec, Math.floor(Number(seconds) || 1)));
  const pcmBuffers = rings.map((ring) => ring.readLast(durationSec));
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