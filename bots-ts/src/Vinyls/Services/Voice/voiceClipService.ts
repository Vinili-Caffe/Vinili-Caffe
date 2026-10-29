const fs = require("fs") as typeof import("fs");
const path = require("path") as typeof import("path");
const os = require("os") as typeof import("os");
const { spawn } = require("child_process") as typeof import("child_process");
const { AttachmentBuilder } = require("discord.js") as typeof import("discord.js");
const { getVoiceConnection, VoiceConnectionStatus } = require("@discordjs/voice") as typeof import("@discordjs/voice");
const ffmpegStatic = require("ffmpeg-static") as typeof import("ffmpeg-static");
const { resolveBoardPostChannel } = require("../../Utils/Quote/quotePostChannel") as typeof import("../../Utils/Quote/quotePostChannel");
const { nextClipCount } = require("../../Utils/Quote/quoteCounter") as typeof import("../../Utils/Quote/quoteCounter");
const { accountUsername, guildMemberDisplayAvatarUrlDynamic } = require("../../Utils/Discord/guildDiscordIdentity") as typeof import("../../Utils/Discord/guildDiscordIdentity");
const { DEFAULT_FOOTER_TEXT } = require("../../Utils/Embeds/defaultFooter") as typeof import("../../Utils/Embeds/defaultFooter");
const { transcribeClipAudioFile } = require("./voiceClipTranscribe") as typeof import("./voiceClipTranscribe");
const { registerClipBoardPost } = require("../Community/repostService") as typeof import("../Community/repostService");
const { TENANT_EMBED_COLOR } = require("../../MultiGuild/utils/tenantEmbedBranding") as typeof import("../../MultiGuild/utils/tenantEmbedBranding");
const {
  CAPTURE_MAX_SEC,
  PCM_CHANNELS,
  PCM_SAMPLE_RATE,
  extractVoiceCaptureClip,
  getVoiceCaptureInfo,
  isVoiceCaptureActive,
} = require("./voiceContinuousCaptureService") as typeof import("./voiceContinuousCaptureService");
const { isTenantClipTranscriptionEnabledSync } = require("../../MultiGuild/core/tenantGuildSettings") as typeof import("../../MultiGuild/core/tenantGuildSettings");

const CLIP_MIN_SEC = 3;
const CLIP_DEFAULT_SEC = 30;
const CLIP_COLOR = TENANT_EMBED_COLOR;
const MIN_MP3_BYTES = 8_192;
const exportingClipByGuild = new Set();

function resolveClipConfig(client?) {
  const cfg = client?.config?.voiceClip;
  const maxDurationSec = Math.max(CLIP_MIN_SEC, Math.min(CAPTURE_MAX_SEC, Number(cfg?.maxDurationSec) || CAPTURE_MAX_SEC));
  const defaultDurationSec = Math.max(CLIP_MIN_SEC, Math.min(maxDurationSec, Number(cfg?.defaultDurationSec) || CLIP_DEFAULT_SEC));
  return {
    maxDurationSec,
    defaultDurationSec,
    language: String(cfg?.language || "it").trim().toLowerCase().split("-")[0] || "it",
    provider: String(cfg?.provider || "auto").trim().toLowerCase(),
  };
}

function parseClipDurationSec(rawArgs?, client?) {
  const cfg = resolveClipConfig(client);
  const token = String(Array.isArray(rawArgs) ? rawArgs[0] : rawArgs || "").trim();
  if (!token) return { ok: true, seconds: cfg.defaultDurationSec };
  const n = Number(token);
  if (!Number.isFinite(n) || n <= 0) {
    return { ok: false, message: `Indica i secondi da estrarre, es. \`+clip 30\` (min ${CLIP_MIN_SEC}, max ${cfg.maxDurationSec}).` };
  }
  const seconds = Math.floor(n);
  if (seconds < CLIP_MIN_SEC || seconds > cfg.maxDurationSec) {
    return {
      ok: false,
      message: `Durata clip non valida. Usa un valore tra **${CLIP_MIN_SEC}** e **${cfg.maxDurationSec}** secondi.`,
    };
  }
  return { ok: true, seconds };
}

function rmDirSafe(dir?) {
  if (!dir) return;
  try {
    fs.rmSync(dir, { recursive: true, force: true });
  } catch {
  }
}

function runFfmpeg(args?) {
  return new Promise((resolve?, reject?) => {
    const ffmpeg = ffmpegStatic || "ffmpeg";
    const proc = spawn((ffmpeg as any), args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    proc.stderr?.on("data", (chunk?) => {
      err += String(chunk || "");
    });
    proc.on("error", reject);
    proc.on("close", (code?) => {
      if (code === 0) ((resolve as any)() as any);
      else reject(new Error(err.trim() || `ffmpeg exit ${code}`));
    });
  });
}

/* clipSpeechClarity1: downmix mono + EQ voce + denoise leggero + loudnorm (niente tanh squash) */
function downmixStereoPcmToMono(pcmStereo?) {
  const frameBytes = PCM_CHANNELS * 2;
  if (!pcmStereo?.length || PCM_CHANNELS < 2) return pcmStereo;
  const frames = Math.floor(pcmStereo.length / frameBytes);
  if (frames <= 0) return Buffer.alloc(0);
  const out = Buffer.alloc(frames * 2);
  for (let i = 0; i < frames; i += 1) {
    const off = i * frameBytes;
    const l = pcmStereo.readInt16LE(off);
    const r = pcmStereo.readInt16LE(off + 2);
    out.writeInt16LE(Math.max(-32768, Math.min(32767, Math.round((l + r) / 2))), i * 2);
  }
  return out;
}

async function pcmBufferToMp3(pcmBuffer?, outPath?) {
  const frameBytes = PCM_CHANNELS * 2;
  let pcm = pcmBuffer;
  if (!pcm?.length || pcm.length < frameBytes) throw new Error("silent");
  const remainder = pcm.length % frameBytes;
  if (remainder) pcm = pcm.subarray(0, pcm.length - remainder);
  pcm = downmixStereoPcmToMono(pcm);
  if (!pcm?.length || pcm.length < 2) throw new Error("silent");

  const tmpDir = path.dirname(outPath);
  const pcmPath = path.join(tmpDir, "slice.pcm");
  fs.writeFileSync(pcmPath, pcm);
  /* Filtri leggeri: EQ voce + loudnorm. Niente afftdn/compressor aggressivi (mangiavano le consonanti). */
  const speechAf = [
    "highpass=f=80",
    "lowpass=f=8000",
    "loudnorm=I=-16:TP=-1.5:LRA=11",
  ].join(",");
  await runFfmpeg([
    "-y",
    "-f",
    "s16le",
    "-ar",
    String(PCM_SAMPLE_RATE),
    "-ac",
    "1",
    "-i",
    pcmPath,
    "-af",
    speechAf,
    "-ac",
    "1",
    "-ar",
    "48000",
    "-c:a",
    "libmp3lame",
    "-b:a",
    "256k",
    "-q:a",
    "2",
    outPath,
  ]);
  const size = fs.statSync(outPath).size;
  if (!Number.isFinite(size) || size < MIN_MP3_BYTES) throw new Error("silent");
}

function resolveBotVoiceChannelId(guild?, client?) {
  const guildId = String(guild?.id || "");
  if (!guildId) return null;
  const conn = getVoiceConnection(guildId);
  if (conn && conn.state?.status !== VoiceConnectionStatus.Destroyed) {
    const connChannelId = String(conn.joinConfig?.channelId || "").trim();
    if (connChannelId) return connChannelId;
  }
  const musicConn = client?.shoukaku?.connections?.get(guildId);
  const musicChannelId = String(musicConn?.channelId || "").trim();
  if (musicChannelId) return musicChannelId;
  return String(guild?.members?.me?.voice?.channelId || "").trim() || null;
}

function isGuildClipRecording(guildId?) {
  return exportingClipByGuild.has(String(guildId || "").trim());
}

function validateClipExportAccess(guild?, memberVoiceChannel?, client?) {
  const guildId = String(guild?.id || "");
  if (!guildId) return { ok: false, message: "Server non valido." };
  if (exportingClipByGuild.has(guildId)) {
    return { ok: false, message: "C'è già un clip in elaborazione in questo server." };
  }
  if (!memberVoiceChannel?.isVoiceBased?.()) {
    return { ok: false, message: "Devi essere in un canale vocale." };
  }
  const botChannelId = resolveBotVoiceChannelId(guild, client);
  if (!botChannelId) {
    return {
      ok: false,
      message: "Il bot non è in vocale. Usa `+join` o avvia la musica, poi `+clip`.",
    };
  }
  if (botChannelId !== String(memberVoiceChannel.id)) {
    return {
      ok: false,
      message: "Devi essere nello stesso vocale del bot per estrarre un clip.",
    };
  }
  if (!isVoiceCaptureActive(guildId)) {
    return {
      ok: false,
      message: "Registrazione vocale non attiva. Fai entrare il bot in vocale con `+join` o musica.",
    };
  }
  const capture = getVoiceCaptureInfo(guildId);
  if (!capture?.bufferedSec) {
    return {
      ok: false,
      message: "Non c'è ancora audio nel buffer. Parla in vocale e riprova tra qualche secondo.",
    };
  }
  return { ok: true, capture };
}

function escapeItalicMarkdown(text?) {
  return String(text || "").replace(/\*/g, "\\*").replace(/_/g, "\\_");
}

function formatClipTranscription(text?) {
  const raw = String(text || "").trim();
  if (!raw) return "» _Nessun testo riconosciuto nel clip._";
  const clipped = raw.length > 3600 ? `${raw.slice(0, 3599)}…` : raw;
  return `» *${escapeItalicMarkdown(clipped)}*`;
}

function buildClipBoardEmbed({ requester, requesterId, voiceChannelName, durationSec, transcription, totalPosts, prefix }) {
  const profileName = accountUsername(requester) || "Utente";
  const iconURL = guildMemberDisplayAvatarUrlDynamic(requester, { size: 128 }) || undefined;
  const safePrefix = String(prefix || "+").trim() || "+";
  const uid = String(requesterId || requester?.id || requester?.user?.id || "").trim();
  return {
    color: CLIP_COLOR,
    author: { name: profileName, icon_url: iconURL },
    title: "🎙️ Clip vocale",
    description: [
      `Ultimi **${durationSec}s** da **${voiceChannelName}**`,
      "",
      "**Trascrizione**",
      formatClipTranscription(transcription),
    ].join("\n"),
    fields: uid ? [{ name: "Clip di", value: `<@${uid}>`, inline: true }] : [],
    footer: {
      text: `† · ৎ ${safePrefix}clip · Post #${totalPosts} · ${DEFAULT_FOOTER_TEXT}`,
    },
    timestamp: new Date().toISOString(),
  };
}

function buildClipAckEmbed({ requesterId, boardUrl, voiceChannelName, durationSec, prefix }) {
  const linkLine = boardUrl ? `» [Apri la clip](${boardUrl})` : "» Clip pubblicata.";
  const safePrefix = String(prefix || "+").trim() || "+";
  return {
    color: CLIP_COLOR,
    description: [
      `🎙️ <@${requesterId}> ha pubblicato un clip vocale da **${voiceChannelName}** (${durationSec}s).`,
      linkLine,
    ].join("\n"),
    footer: { text: `✧ * . ˊ ${safePrefix}clip` },
    timestamp: new Date().toISOString(),
  };
}

function messageJumpUrl(guildId?, channelId?, messageId?) {
  const g = String(guildId || "").trim();
  const c = String(channelId || "").trim();
  const m = String(messageId || "").trim();
  if (!g || !c || !m) return "";
  return `https://discord.com/channels/${g}/${c}/${m}`;
}

async function exportClipFromCommand(ctx?) {
  const { guild, requester, voiceChannel, commandChannel, client, seconds } = ctx;
  const guildId = String(guild.id);
  const requesterId = String(requester?.id || requester?.user?.id || "");
  const access = validateClipExportAccess(guild, voiceChannel, client);
  if (!access.ok) return { ok: false, message: access.message };

  const extracted = extractVoiceCaptureClip(guildId, seconds);
  if (!extracted.ok) {
    if (extracted.reason === "silent") {
      return {
        ok: false,
        message:
          "Nessun audio utile negli ultimi secondi richiesti. Dopo un riavvio il buffer riparte da zero: parla un momento in vocale e riprova.",
      };
    }
    if (extracted.reason === "not_capturing") {
      return {
        ok: false,
        message:
          "Il bot non sta ancora registrando questo vocale (spesso dopo un riavvio). Resta in call qualche secondo e riprova.",
      };
    }
    if (extracted.reason === "empty") {
      const avail = Math.floor(Number(extracted.availableSec) || 0);
      return {
        ok: false,
        message: avail > 0
          ? `Buffer audio ancora troppo corto (${avail}s). Parla un momento e riprova.`
          : "Buffer audio vuoto (dopo un riavvio riparte da zero). Parla un momento in vocale e riprova.",
      };
    }
    return { ok: false, message: "Impossibile estrarre il clip dal buffer vocale." };
  }

  const tmpDir = path.join(os.tmpdir(), "vc-clip-export", `${guildId}-${Date.now()}`);
  fs.mkdirSync(tmpDir, { recursive: true });
  exportingClipByGuild.add(guildId);

  try {
    const mp3Path = path.join(tmpDir, "clip.mp3");
    await pcmBufferToMp3(extracted.pcm, mp3Path);

    const cfg = resolveClipConfig(client);
    let transcription = "";
    if (isTenantClipTranscriptionEnabledSync(guildId)) {
      const transcribed = await transcribeClipAudioFile(mp3Path, {
        language: cfg.language,
        provider: cfg.provider,
      });
      transcription = transcribed.ok ? transcribed.text : "";
    }

    const quoteChannel = await resolveBoardPostChannel(guild, "clip");
    const postChannel = quoteChannel || commandChannel;
    if (!postChannel?.isTextBased?.()) {
      return { ok: false, message: "Impossibile pubblicare la clip." };
    }

    let totalPosts;
    try {
      totalPosts = await nextClipCount(guildId);
    } catch (err) {
      global.logger?.warn?.("[clip] counter failed:", err?.message || err);
      return { ok: false, message: "Contatore clip non disponibile. Riprova tra poco." };
    }

    const {
      resolveCommandPrefixForGuild,
    } = require("../../MultiGuild/core/tenantGuildSettings") as typeof import("../../MultiGuild/core/tenantGuildSettings");
    const prefix = resolveCommandPrefixForGuild(guildId, client);
    const voiceChannelName = extracted.voiceChannelName || voiceChannel.name;
    const boardEmbed = buildClipBoardEmbed({
      requester,
      requesterId,
      voiceChannelName,
      durationSec: extracted.durationSec,
      transcription,
      totalPosts,
      prefix,
    });

    let boardMsg = null;
    const registered = await registerClipBoardPost({
      guild,
      guildId,
      requesterId,
      requester,
      postChannel,
      boardEmbed,
      mp3Path,
      transcription,
      totalPosts,
    }).catch((err?) => {
      global.logger?.warn?.("[clip] repost register:", err?.message || err);
      return null;
    });
    if (registered?.ok && registered.boardMessage) {
      boardMsg = registered.boardMessage;
    } else {
            const attachment = new AttachmentBuilder(mp3Path, { name: "clip.mp3" });
      boardMsg = await postChannel
        .send({
          files: [attachment],
          embeds: [boardEmbed],
          allowedMentions: { users: [requesterId] },
        })
        .catch(() => null);
    }

    const boardUrl = messageJumpUrl(guildId, postChannel.id, boardMsg?.id);
    const ackEmbed = buildClipAckEmbed({
      requesterId,
      boardUrl,
      voiceChannelName,
      durationSec: extracted.durationSec,
      prefix,
    });

    return { ok: true, ackEmbed, boardUrl, durationSec: extracted.durationSec };
  } catch (err) {
    global.logger?.warn?.("[clip] export:", err?.message || err);
    const msg = String(err?.message || err || "") === "silent"
      ? "Nessun audio utile negli ultimi secondi richiesti."
      : "Esportazione clip fallita. Riprova tra qualche secondo.";
    return { ok: false, message: msg };
  } finally {
    exportingClipByGuild.delete(guildId);
    rmDirSafe(tmpDir);
  }
}

export = {
  CAPTURE_MAX_SEC,
  exportClipFromCommand,
  isGuildClipRecording,
  parseClipDurationSec,
  resolveClipConfig,
  validateClipExportAccess,
};