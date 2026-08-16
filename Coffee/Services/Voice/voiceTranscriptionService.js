const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
const axios = require("axios");
const FormData = require("form-data");
const ffmpegStatic = require("ffmpeg-static");
const { EmbedBuilder } = require("discord.js");
const { accountUsername, userAvatarUrlDynamic } = require("../../Utils/Discord/guildDiscordIdentity");
const { reportRecoveryHealth } = require("../../../shared/recovery/recoveryHealth");
const {
  getVoiceTranscriptionCheckpoint,
  saveVoiceTranscriptionCheckpoint,
  isMessageAfterTranscriptionCheckpoint,
} = require("./voiceTranscriptionCheckpoint");
const TRANSCRIBE_COLOR = 0x57f287;
const DEFAULT_INVITE = ".gg/viniliecaffe";
const processingMessageIds = new Set();
const userCooldownUntil = new Map();
const USER_COOLDOWN_MS = 8000;
const DEFAULT_RESTORE_LOOKBACK_MS = 2 * 60 * 60 * 1000;
const DEFAULT_RESTORE_FETCH_LIMIT = 50;
const RESTORE_CHANNEL_CONCURRENCY = 4;
const RESTORE_MESSAGE_GAP_MS = 350;

function resolveTranscriptionConfig(client) {
  const cfg = client?.config?.voiceTranscription;
  if (!cfg || cfg.enabled === false) return null;
  const channelIds = Array.isArray(cfg.channelIds)
    ? cfg.channelIds.map(String).filter(Boolean)
    : [];
  return {
    channelIds,
    maxDurationSec: Math.min(600, Math.max(1, Number(cfg.maxDurationSec) || 120)),
    language: String(cfg.language || "it").trim().toLowerCase().split("-")[0] || "it",
    invite: String(cfg.invite || DEFAULT_INVITE).trim() || DEFAULT_INVITE,
    provider: String(cfg.provider || "auto").trim().toLowerCase(),
    restoreOnRestart: cfg.restoreOnRestart !== false,
    restoreLookbackMs: Math.min(
      24 * 60 * 60 * 1000,
      Math.max(60_000, Number(cfg.restoreLookbackMs) || DEFAULT_RESTORE_LOOKBACK_MS),
    ),
    restoreFetchLimit: Math.min(100, Math.max(10, Math.floor(Number(cfg.restoreFetchLimit) || DEFAULT_RESTORE_FETCH_LIMIT))),
  };
}

function isChannelAllowed(channelId, cfg) {
  if (!cfg?.channelIds?.length) return true;
  return cfg.channelIds.includes(String(channelId || ""));
}

function isOnUserCooldown(userId) {
  const until = Number(userCooldownUntil.get(String(userId)) || 0);
  return until > Date.now();
}

function touchUserCooldown(userId) {
  userCooldownUntil.set(String(userId), Date.now() + USER_COOLDOWN_MS);
}

function isVideoAttachment(att) {
  const ct = String(att?.contentType || "").toLowerCase();
  const name = String(att?.name || "").toLowerCase();
  if (ct.startsWith("video/")) return true;
  return [".mp4", ".mov", ".webm", ".mkv", ".avi", ".m4v"].some((ext) => name.endsWith(ext));
}

function pickVoiceAttachment(message) {
  const attachments = [...(message?.attachments?.values?.() || [])];
  if (!attachments.length) return null;
  for (const att of attachments) {
    if (isVideoAttachment(att)) continue;
    const ct = String(att.contentType || "").toLowerCase();
    const name = String(att.name || "").toLowerCase();
    if (ct.startsWith("audio/")) return att;
    if (name.endsWith(".ogg") || name.endsWith(".oga") || name.includes("voice-message")) return att;
  }
  if (attachments.length === 1 && !String(message.content || "").trim()) {
    const only = attachments[0];
    if (!isVideoAttachment(only)) return only;
  }
  return null;
}

function looksLikeVoiceMessage(message) {
  if (!message?.guild || message.author?.bot) return false;
  const att = pickVoiceAttachment(message);
  if (!att?.url || isVideoAttachment(att)) return false;
  const ct = String(att.contentType || "").toLowerCase();
  if (ct.startsWith("audio/")) return true;
  const name = String(att.name || "").toLowerCase();
  if (name.endsWith(".ogg") || name.endsWith(".oga") || name.includes("voice-message")) return true;
  const duration = Number(att.duration);
  if (Number.isFinite(duration) && duration > 0) {
    return ct.startsWith("audio/") || name.endsWith(".ogg") || name.endsWith(".oga") || name.includes("voice-message");
  }
  return false;
}

async function downloadAttachmentToTemp(attachment) {
  const ext = path.extname(String(attachment.name || "")) || ".ogg";
  const tmpPath = path.join(os.tmpdir(), `vc-voice-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  try {
    const res = await axios.get(attachment.url, {
      responseType: "arraybuffer",
      timeout: 60000,
      maxContentLength: 25 * 1024 * 1024,
    });
    fs.writeFileSync(tmpPath, Buffer.from(res.data));
    return tmpPath;
  } catch (err) {
    const status = Number(err?.response?.status || 0);
    const host = (() => {
      try {
        return new URL(String(attachment.url || "")).host;
      } catch {
        return "";
      }
    })();
    const wrapped = new Error(
      status
        ? `attachment_download_failed status=${status}${host ? ` host=${host}` : ""}`
        : `attachment_download_failed ${err?.message || err}`,
    );
    wrapped.code = status === 404 ? "ATTACHMENT_GONE" : "ATTACHMENT_DOWNLOAD_FAILED";
    wrapped.cause = err;
    throw wrapped;
  }
}

function runFfmpegToMp3(inputPath, outputPath) {
  return new Promise((resolve, reject) => {
    const ffmpeg = ffmpegStatic || "ffmpeg";
    const args = ["-y", "-i", inputPath, "-ac", "1", "-ar", "16000", "-b:a", "64k", outputPath];
    const proc = spawn(ffmpeg, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    proc.stderr?.on("data", (chunk) => {
      err += String(chunk || "");
    });
    proc.on("error", reject);
    proc.on("close", (code) => {
      if (code === 0 && fs.existsSync(outputPath)) resolve(outputPath);
      else reject(new Error(err.trim() || `ffmpeg exit ${code}`));
    });
  });
}

async function prepareAudioForTranscription(downloadedPath) {
  const lower = downloadedPath.toLowerCase();
  if (lower.endsWith(".mp3") || lower.endsWith(".wav") || lower.endsWith(".m4a")) {
    return downloadedPath;
  }
  const mp3Path = downloadedPath.replace(/\.[^.]+$/, "") + ".mp3";
  await runFfmpegToMp3(downloadedPath, mp3Path);
  return mp3Path;
}

function resolveTranscriptionProvider(preferred) {
  const openaiKey = String(process.env.OPENAI_API_KEY || process.env.VOICE_TRANSCRIBE_API_KEY || "").trim();
  const groqKey = String(process.env.GROQ_API_KEY || "").trim();
  const pref = String(preferred || "auto").toLowerCase();
  if (pref === "openai" && openaiKey) return { kind: "openai", apiKey: openaiKey };
  if (pref === "groq" && groqKey) return { kind: "groq", apiKey: groqKey };
  if (groqKey) return { kind: "groq", apiKey: groqKey };
  if (openaiKey) return { kind: "openai", apiKey: openaiKey };
  return null;
}

async function postTranscriptionRequest({ provider, apiKey, filePath, language }) {
  const form = new FormData();
  const baseName = path.basename(filePath) || "audio.mp3";
  form.append("file", fs.createReadStream(filePath), {
    filename: baseName,
    contentType: "audio/mpeg",
  });
  form.append("response_format", "json");
  if (language) form.append("language", language);

  const endpoint =
    provider === "groq"
      ? "https://api.groq.com/openai/v1/audio/transcriptions"
      : "https://api.openai.com/v1/audio/transcriptions";
  if (provider === "groq") {
    form.append("model", "whisper-large-v3-turbo");
  } else {
    form.append("model", "whisper-1");
  }

  try {
    const res = await axios.post(endpoint, form, {
      headers: { Authorization: `Bearer ${apiKey}`, ...form.getHeaders() },
      timeout: 120000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
    return String(res.data?.text || "").trim();
  } catch (err) {
    const status = Number(err?.response?.status || 0);
    const body =
      typeof err?.response?.data === "string"
        ? err.response.data
        : err?.response?.data
          ? JSON.stringify(err.response.data)
          : "";
    const detail = String(body || err?.message || err).slice(0, 300);
    const wrapped = new Error(
      `transcription_api_failed provider=${provider} status=${status || "n/a"} ${detail}`,
    );
    wrapped.code = "TRANSCRIPTION_API_FAILED";
    wrapped.cause = err;
    throw wrapped;
  }
}

async function transcribeAudioFile(filePath, language, providerPref) {
  const provider = resolveTranscriptionProvider(providerPref);
  if (!provider) {
    throw new Error("transcription_not_configured");
  }
  return postTranscriptionRequest({
    provider: provider.kind,
    apiKey: provider.apiKey,
    filePath,
    language,
  });
}

function cleanupTempFiles(paths) {
  for (const p of paths) {
    if (!p) continue;
    try {
      fs.unlinkSync(p);
    } catch {
    }
  }
}

function buildTranscriptionEmbed(message, text, invite) {
  const member = message.member;
  const authorName = accountUsername(member || message.author);
  const iconURL = userAvatarUrlDynamic(member || message.author, { size: 128 }) || undefined;
  const body = String(text || "").trim();
  const description = body ? `» ${body}` : "» _Nessun testo riconosciuto nel vocale._";
  const safeInvite = String(invite || DEFAULT_INVITE).replace(/^https?:\/\//i, "");

  return new EmbedBuilder()
    .setColor(TRANSCRIBE_COLOR)
    .setAuthor({ name: authorName, iconURL })
    .setTitle("🎙️ 💿 † Trascrizione del Vocale")
    .setDescription(description.slice(0, 3900))
    .setFooter({ text: `† · ${safeInvite}` })
    .setTimestamp(message.createdAt || new Date());
}

async function processVoiceTranscriptionMessage(message, client, cfg, options = {}) {
  const catchup = options.catchup === true;
  if (!looksLikeVoiceMessage(message)) return false;
  if (!isChannelAllowed(message.channelId, cfg)) return false;
  if (!catchup && isOnUserCooldown(message.author.id)) return false;

  const attachment = pickVoiceAttachment(message);
  if (!attachment?.url) return false;

  const duration = Number(attachment.duration);
  if (Number.isFinite(duration) && duration > cfg.maxDurationSec) return false;

  const messageId = String(message.id || "");
  if (!messageId || processingMessageIds.has(messageId)) return false;
  processingMessageIds.add(messageId);
  if (!catchup) touchUserCooldown(message.author.id);

  const tempFiles = [];
  try {
    const downloaded = await downloadAttachmentToTemp(attachment);
    tempFiles.push(downloaded);
    const prepared = await prepareAudioForTranscription(downloaded);
    if (prepared !== downloaded) tempFiles.push(prepared);

    const text = await transcribeAudioFile(prepared, cfg.language, cfg.provider);
    const embed = buildTranscriptionEmbed(message, text, cfg.invite);
    await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } }).catch(() => null);
    saveVoiceTranscriptionCheckpoint(message.channelId, message.id, message.createdTimestamp);
    return true;
  } catch (err) {
    const code = String(err?.code || err?.message || err || "");
    if (code === "transcription_not_configured" || String(err?.message) === "transcription_not_configured") {
      global.logger?.warn?.(
        "[VOICE TRANSCRIBE] Nessuna API configurata: imposta OPENAI_API_KEY o GROQ_API_KEY nel .env",
      );
    } else if (err?.code === "ATTACHMENT_GONE" || /attachment_download_failed status=404/.test(code)) {
      // CDN Discord scaduto / allegato rimosso (tipico su catchup di messaggi vecchi).
      saveVoiceTranscriptionCheckpoint(message.channelId, message.id, message.createdTimestamp);
      global.logger?.info?.("[VOICE TRANSCRIBE] Skip: allegato vocale non più scaricabile (404 CDN).");
    } else {
      global.logger?.warn?.("[VOICE TRANSCRIBE]", err?.message || err);
    }
    return false;
  } finally {
    processingMessageIds.delete(messageId);
    cleanupTempFiles(tempFiles);
  }
}

async function handleVoiceTranscriptionMessage(message, client) {
  const cfg = resolveTranscriptionConfig(client);
  if (!cfg) return false;
  return processVoiceTranscriptionMessage(message, client, cfg, { catchup: false });
}

function listTranscriptionChannels(client, cfg) {
  const rows = [];
  for (const guild of client.guilds.cache.values()) {
    for (const channel of guild.channels.cache.values()) {
      if (!channel?.isTextBased?.() || channel.isDMBased?.()) continue;
      if (!isChannelAllowed(channel.id, cfg)) continue;
      rows.push(channel);
    }
  }
  return rows;
}

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

async function catchupVoiceTranscriptionsForChannel(channel, client, cfg) {
  if (!channel?.messages?.fetch || !looksLikeVoiceMessage) return { scanned: 0, transcribed: 0 };
  const checkpoint = getVoiceTranscriptionCheckpoint(channel.id);
  const nowMs = Date.now();
  const fallbackCutoffMs = nowMs - cfg.restoreLookbackMs;
  const checkpointCutoffMs = checkpoint?.lastProcessedAt
    ? Number(checkpoint.lastProcessedAt) - 1500
    : fallbackCutoffMs;
  const cutoffMs = Math.max(fallbackCutoffMs, checkpointCutoffMs);

  const messages = await channel.messages.fetch({ limit: cfg.restoreFetchLimit }).catch(() => null);
  if (!messages?.size) return { scanned: 0, transcribed: 0 };

  const sorted = Array.from(messages.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);
  let scanned = 0;
  let transcribed = 0;

  for (const message of sorted) {
    if (!looksLikeVoiceMessage(message)) continue;
    scanned += 1;
    if (!isMessageAfterTranscriptionCheckpoint(message, checkpoint, cutoffMs)) continue;
    const ok = await processVoiceTranscriptionMessage(message, client, cfg, { catchup: true });
    if (ok) transcribed += 1;
    if (transcribed > 0 || ok) await sleep(RESTORE_MESSAGE_GAP_MS);
  }

  return { scanned, transcribed };
}

async function restorePendingVoiceTranscriptions(client) {
  const cfg = resolveTranscriptionConfig(client);
  if (!cfg || !cfg.restoreOnRestart) {
    reportRecoveryHealth("coffee_voice_transcription_restore", "skip", "disabled");
    return { channels: 0, transcribed: 0 };
  }
  if (!resolveTranscriptionProvider(cfg.provider)) {
    reportRecoveryHealth("coffee_voice_transcription_restore", "skip", "api_not_configured");
    return { channels: 0, transcribed: 0 };
  }

  const channels = listTranscriptionChannels(client, cfg);
  let transcribed = 0;
  let channelsTouched = 0;

  for (let i = 0; i < channels.length; i += RESTORE_CHANNEL_CONCURRENCY) {
    const batch = channels.slice(i, i + RESTORE_CHANNEL_CONCURRENCY);
    const results = await Promise.all(
      batch.map((channel) => catchupVoiceTranscriptionsForChannel(channel, client, cfg).catch(() => ({ scanned: 0, transcribed: 0 }))),
    );
    for (const row of results) {
      if (row.transcribed > 0) channelsTouched += 1;
      transcribed += Number(row.transcribed) || 0;
    }
  }

  reportRecoveryHealth(
    "coffee_voice_transcription_restore",
    "ok",
    `channels=${channels.length};transcribed=${transcribed}`,
  );
  if (transcribed > 0) {
    global.logger?.info?.(
      `[VOICE TRANSCRIBE] Recupero riavvio: ${transcribed} vocali trascritti su ${channelsTouched} canali`,
    );
  }
  return { channels: channels.length, transcribed };
}

module.exports = {
  handleVoiceTranscriptionMessage,
  buildTranscriptionEmbed,
  restorePendingVoiceTranscriptions,
};