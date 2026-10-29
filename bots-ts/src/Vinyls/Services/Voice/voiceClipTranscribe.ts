const fs = require("fs") as typeof import("fs");
const { spawn } = require("child_process") as typeof import("child_process");
const ffmpegStatic = require("ffmpeg-static") as typeof import("ffmpeg-static");

function resolveTranscriptionProvider(preferred?) {
  const openaiKey = String(process.env.OPENAI_API_KEY || process.env.VOICE_TRANSCRIBE_API_KEY || "").trim();
  const groqKey = String(process.env.GROQ_API_KEY || "").trim();
  const pref = String(preferred || "auto").toLowerCase();
  if (pref === "openai" && openaiKey) return { kind: "openai", apiKey: openaiKey };
  if (pref === "groq" && groqKey) return { kind: "groq", apiKey: groqKey };
  if (groqKey) return { kind: "groq", apiKey: groqKey };
  if (openaiKey) return { kind: "openai", apiKey: openaiKey };
  return null;
}

function runFfmpegToMp3(inputPath?, outputPath?) {
  return new Promise((resolve?, reject?) => {
    const ffmpeg = ffmpegStatic || "ffmpeg";
    const args = ["-y", "-i", inputPath, "-ac", "1", "-ar", "16000", "-b:a", "64k", outputPath];
    const proc = spawn(ffmpeg, args, { stdio: ["ignore", "ignore", "pipe"] });
    let err = "";
    proc.stderr?.on("data", (chunk?) => {
      err += String(chunk || "");
    });
    proc.on("error", reject);
    proc.on("close", (code?) => {
      if (code === 0 && fs.existsSync(outputPath)) resolve(outputPath);
      else reject(new Error(err.trim() || `ffmpeg exit ${code}`));
    });
  });
}

async function prepareAudioForTranscription(sourcePath?) {
  const lower = String(sourcePath || "").toLowerCase();
  if (lower.endsWith(".mp3") || lower.endsWith(".wav") || lower.endsWith(".m4a")) {
    return sourcePath;
  }
  const mp3Path = sourcePath.replace(/\.[^.]+$/, "") + ".transcribe.mp3";
  await runFfmpegToMp3(sourcePath, mp3Path);
  return mp3Path;
}

async function postTranscriptionRequest({ provider, apiKey, filePath, language }) {
  const form = new FormData();
  const blob = new Blob([fs.readFileSync(filePath)], { type: "audio/mpeg" });
  form.append("file", blob, "clip.mp3");
  form.append("response_format", "json");
  if (language) form.append("language", language);

  if (provider === "groq") {
    form.append("model", "whisper-large-v3-turbo");
    const res = await fetch("https://api.groq.com/openai/v1/audio/transcriptions", {
      method: "POST",
      headers: { Authorization: `Bearer ${apiKey}` },
      body: form,
    });
    if (!res.ok) {
      const body = await res.text().catch(() => "");
      throw new Error(body || `groq transcribe ${res.status}`);
    }
    const data: any = await res.json();
    return String(data?.text || "").trim();
  }

  form.append("model", "whisper-1");
  const res = await fetch("https://api.openai.com/v1/audio/transcriptions", {
    method: "POST",
    headers: { Authorization: `Bearer ${apiKey}` },
    body: form,
  });
  if (!res.ok) {
    const body = await res.text().catch(() => "");
    throw new Error(body || `openai transcribe ${res.status}`);
  }
  const data: any = await res.json();
  return String(data?.text || "").trim();
}

async function transcribeClipAudioFile(filePath?, opts: Record<string, any> = {}) {
  const provider = resolveTranscriptionProvider(opts.provider);
  if (!provider) return { ok: false, text: "", reason: "transcription_not_configured" };
  let prepared = "";
  try {
    prepared = await prepareAudioForTranscription(filePath);
    const text = await postTranscriptionRequest({
      provider: provider.kind,
      apiKey: provider.apiKey,
      filePath: prepared,
      language: String(opts.language || "it").trim().toLowerCase().split("-")[0] || "it",
    });
    return { ok: true, text };
  } catch (err) {
    global.logger?.warn?.("[clip] transcribe:", err?.message || err);
    return { ok: false, text: "", reason: "transcription_failed" };
  } finally {
    if (prepared && prepared !== filePath) {
      try {
        fs.unlinkSync(prepared);
      } catch {
      }
    }
  }
}

export = { transcribeClipAudioFile, resolveTranscriptionProvider };