const fs = require("fs");
const path = require("path");
const os = require("os");
const { spawn } = require("child_process");
const axios = require("axios");
const FormData = require("form-data");
const ffmpegStatic = require("ffmpeg-static");
const { EmbedBuilder } = require("discord.js");
const { accountUsername, userAvatarUrlDynamic } = require("../../Utils/Discord/guildDiscordIdentity");
const TRANSCRIBE_COLOR = 0x57f287;
const DEFAULT_INVITE = ".gg/viniliecaffe";
const processingMessageIds = new Set();
const userCooldownUntil = new Map();
const USER_COOLDOWN_MS = 8000;

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

function pickVoiceAttachment(message) {
  const attachments = [...(message?.attachments?.values?.() || [])];
  if (!attachments.length) return null;
  for (const att of attachments) {
    const ct = String(att.contentType || "").toLowerCase();
    const name = String(att.name || "").toLowerCase();
    if (ct.startsWith("audio/")) return att;
    if (name.endsWith(".ogg") || name.endsWith(".oga") || name.includes("voice-message")) return att;
  }
  if (attachments.length === 1 && !String(message.content || "").trim()) return attachments[0];
  return null;
}

function looksLikeVoiceMessage(message) {
  if (!message?.guild || message.author?.bot) return false;
  const att = pickVoiceAttachment(message);
  if (!att?.url) return false;
  const duration = Number(att.duration);
  if (Number.isFinite(duration) && duration > 0) return true;
  const ct = String(att.contentType || "").toLowerCase();
  if (ct.startsWith("audio/")) return true;
  const name = String(att.name || "").toLowerCase();
  return name.endsWith(".ogg") || name.includes("voice-message");
}

async function downloadAttachmentToTemp(attachment) {
  const ext = path.extname(String(attachment.name || "")) || ".ogg";
  const tmpPath = path.join(os.tmpdir(), `vc-voice-${Date.now()}-${Math.random().toString(36).slice(2)}${ext}`);
  const res = await axios.get(attachment.url, {
    responseType: "arraybuffer",
    timeout: 60000,
    maxContentLength: 25 * 1024 * 1024,
  });
  fs.writeFileSync(tmpPath, Buffer.from(res.data));
  return tmpPath;
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
  form.append("file", fs.createReadStream(filePath));
  form.append("response_format", "json");
  if (language) form.append("language", language);

  if (provider === "groq") {
    form.append("model", "whisper-large-v3-turbo");
    const res = await axios.post("https://api.groq.com/openai/v1/audio/transcriptions", form, {
      headers: { Authorization: `Bearer ${apiKey}`, ...form.getHeaders() },
      timeout: 120000,
      maxBodyLength: Infinity,
      maxContentLength: Infinity,
    });
    return String(res.data?.text || "").trim();
  }

  form.append("model", "whisper-1");
  const res = await axios.post("https://api.openai.com/v1/audio/transcriptions", form, {
    headers: { Authorization: `Bearer ${apiKey}`, ...form.getHeaders() },
    timeout: 120000,
    maxBodyLength: Infinity,
    maxContentLength: Infinity,
  });
  return String(res.data?.text || "").trim();
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

async function handleVoiceTranscriptionMessage(message, client) {
  const cfg = resolveTranscriptionConfig(client);
  if (!cfg) return false;
  if (!looksLikeVoiceMessage(message)) return false;
  if (!isChannelAllowed(message.channelId, cfg)) return false;
  if (isOnUserCooldown(message.author.id)) return false;

  const attachment = pickVoiceAttachment(message);
  if (!attachment?.url) return false;

  const duration = Number(attachment.duration);
  if (Number.isFinite(duration) && duration > cfg.maxDurationSec) return false;

  const messageId = String(message.id || "");
  if (!messageId || processingMessageIds.has(messageId)) return false;
  processingMessageIds.add(messageId);
  touchUserCooldown(message.author.id);

  const tempFiles = [];
  try {
    const downloaded = await downloadAttachmentToTemp(attachment);
    tempFiles.push(downloaded);
    const prepared = await prepareAudioForTranscription(downloaded);
    if (prepared !== downloaded) tempFiles.push(prepared);

    const text = await transcribeAudioFile(prepared, cfg.language, cfg.provider);
    const embed = buildTranscriptionEmbed(message, text, cfg.invite);
    await message.reply({ embeds: [embed], allowedMentions: { repliedUser: false } }).catch(() => null);
    return true;
  } catch (err) {
    const code = String(err?.message || err || "");
    if (code === "transcription_not_configured") {
      global.logger?.warn?.(
        "[VOICE TRANSCRIBE] Nessuna API configurata: imposta OPENAI_API_KEY o GROQ_API_KEY nel .env",
      );
    } else {
      global.logger?.warn?.("[VOICE TRANSCRIBE]", err?.message || err);
    }
    return false;
  } finally {
    processingMessageIds.delete(messageId);
    cleanupTempFiles(tempFiles);
  }
}

module.exports = { handleVoiceTranscriptionMessage, buildTranscriptionEmbed };