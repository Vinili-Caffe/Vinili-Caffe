/** TTS: sorgenti audio (Google, Edge, VoiceRSS) e buffer/stream. */
const { Readable } = require("stream") as typeof import("stream");
const fs = require("fs") as typeof import("fs");
const axios = require("axios") as typeof import("axios").default;
const crypto = require("crypto") as typeof import("crypto");
const WebSocket = require("ws") as typeof import("ws");

function buildGoogleTtsUrl(
  text?,
  lang?,
  baseHost = "https://translate.google.com",
  client = "tw-ob",
) {
  const q = encodeURIComponent(String(text || ""));
  const tl = encodeURIComponent(String(lang || "it"));
  const c = encodeURIComponent(String(client || "tw-ob"));
  return `${baseHost}/translate_tts?ie=UTF-8&client=${c}&tl=${tl}&q=${q}`;
}

const TTS_HEADERS = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", Accept: "audio/mpeg,audio/*;q=0.9,*/*;q=0.8", Referer: "https://translate.google.com/", };

const GOOGLE_TTS_GET_CLIENTS = ["tw-ob", "gtx"];

const GOOGLE_TTS_RPC = "jQ1olc";
const GOOGLE_TTS_BATCH_CHUNK = 100;
const GOOGLE_TTS_BATCH_HEADERS = {
  "User-Agent": TTS_HEADERS["User-Agent"],
  Accept: "*/*",
  Referer: "https://translate.google.com/",
  Origin: "https://translate.google.com",
  "Content-Type": "application/x-www-form-urlencoded;charset=utf-8",
};

function looksLikeMpegAudio(buffer?) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return false;
  if (buffer.subarray(0, 3).toString("ascii") === "ID3") return true;
  return buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
}

function readTtsErrorPreview(buffer?) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return "";
  return buffer.subarray(0, 240).toString("utf8").replace(/\s+/g, " ").trim();
}

function decodeGoogleTtsBase64Candidate(rawB64?) {
  const b64 = String(rawB64 || "")
    .replace(/\\\//g, "/")
    .replace(/\\u003d/gi, "=")
    .replace(/\s+/g, "")
    .trim();
  if (!b64 || b64.length < 32) return null;
  try {
    const audio = Buffer.from(b64, "base64");
    if (audio.length && looksLikeMpegAudio(audio)) return audio;
  } catch {
    return null;
  }
  return null;
}

function extractGoogleBatchexecuteMp3FromLine(line?) {
  const s = String(line || "");
    const audioSearch = s.match(/jQ1olc","\[\\"(.*)\\"]/);
  if (audioSearch?.[1]) {
    const mp3 = decodeGoogleTtsBase64Candidate(audioSearch[1]);
    if (mp3) return mp3;
  }
    const loose = s.match(/jQ1olc","\["([A-Za-z0-9+/=_\-]{32,})"\]/);
  if (loose?.[1]) {
    const mp3 = decodeGoogleTtsBase64Candidate(loose[1]);
    if (mp3) return mp3;
  }
  return null;
}

function extractGoogleBatchexecuteMp3FromRaw(raw?) {
  const text = String(raw || "");
  for (const line of text.split("\n")) {
    if (!line.includes("jQ1olc") && !line.includes("//OE")) continue;
    const fromLine = extractGoogleBatchexecuteMp3FromLine(line);
    if (fromLine) return fromLine;
  }
    const oe = text.match(/\/\/OE[A-Za-z0-9+/=]+/);
  if (oe?.[0]) {
    const mp3 = decodeGoogleTtsBase64Candidate(oe[0]);
    if (mp3) return mp3;
  }
    try {
    let body = text;
    if (body.startsWith(")]}'")) body = body.slice(4).trimStart();
    const first = body.split("\n").find((l?) => l.trim().startsWith("["));
    if (first) {
      const parsed = JSON.parse(first);
      const payload = parsed?.[0]?.[2];
      if (typeof payload === "string") {
        const inner = JSON.parse(payload);
        const b64 = Array.isArray(inner) ? inner[0] : null;
        const mp3 = decodeGoogleTtsBase64Candidate(b64);
        if (mp3) return mp3;
      }
    }
  } catch {
      }
  return null;
}

async function fetchGoogleTtsBatchexecuteChunk(text?, langBase?) {
  const parameter = [String(text || ""), String(langBase || "it"), null, "null"];
  const escapedParameter = JSON.stringify(parameter);
  const rpc = [[[GOOGLE_TTS_RPC, escapedParameter, null, "generic"]]];
  const body = `f.req=${encodeURIComponent(JSON.stringify(rpc))}&`;
  const url = "https://translate.google.com/_/TranslateWebserverUi/data/batchexecute";
  const res = await axios.post(url, body, {
    timeout: 20000,
    responseType: "text",
    headers: GOOGLE_TTS_BATCH_HEADERS,
    validateStatus: () => true,
  });
  const status = Number(res?.status || 0);
  if (status < 200 || status >= 300) {
    throw new Error(`GoogleTTS-batchexecute: HTTP ${status}`);
  }
  let raw = String(res.data || "");
  if (raw.startsWith(")]}'")) raw = raw.slice(4).trimStart();
  const mp3 = extractGoogleBatchexecuteMp3FromRaw(raw);
  if (mp3) return mp3;
  throw new Error("GoogleTTS-batchexecute: nessun audio nella risposta");
}

async function fetchGoogleTtsBatchexecuteConcat(textStr?, langBase?) {
  const s = String(textStr || "");
  const chunks = [];
  for (let i = 0; i < s.length; i += GOOGLE_TTS_BATCH_CHUNK) {
    const part = s.slice(i, i + GOOGLE_TTS_BATCH_CHUNK);
    if (!part.trim()) continue;
    const buf = await fetchGoogleTtsBatchexecuteChunk(part, langBase);
    chunks.push(buf);
    if (i + GOOGLE_TTS_BATCH_CHUNK < s.length) {
      await new Promise((r?) => {
        const t = setTimeout(r, 80);
        t.unref?.();
      });
    }
  }
  return chunks.length ? Buffer.concat(chunks) : null;
}

const EDGE_TTS_TRUSTED_TOKEN = "6A5AA1D4EAFF4E9FB37E23D68491D6F4";
const EDGE_TTS_CHROMIUM_FULL = "143.0.3650.75";
const EDGE_TTS_VOICE_BY_LANG = {
  it: "it-IT-ElsaNeural",
  en: "en-US-JennyNeural",
  es: "es-ES-ElviraNeural",
  fr: "fr-FR-DeniseNeural",
  de: "de-DE-KatjaNeural",
  pt: "pt-BR-FranciscaNeural",
  ru: "ru-RU-SvetlanaNeural",
  pl: "pl-PL-ZofiaNeural",
  nl: "nl-NL-FennaNeural",
  tr: "tr-TR-EmelNeural",
  ja: "ja-JP-NanamiNeural",
  zh: "zh-CN-XiaoxiaoNeural",
};

function edgeTtsSecMsGec() {
  const windowsEpoch = 11644473600n;
  const ticks = BigInt(Math.floor(Date.now() / 1000) + Number(windowsEpoch)) * 10000000n;
  const rounded = ticks - (ticks % 3000000000n);
  return crypto.createHash("sha256").update(`${rounded}${EDGE_TTS_TRUSTED_TOKEN}`, "ascii").digest("hex").toUpperCase();
}

function escapeXmlForSsml(text?) {
  return String(text || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;")
    .replace(/'/g, "&apos;");
}

function resolveEdgeTtsVoice(langBase?) {
  const key = String(langBase || "it").toLowerCase();
  return EDGE_TTS_VOICE_BY_LANG[key] || EDGE_TTS_VOICE_BY_LANG.it;
}

async function fetchEdgeTtsMp3(text?, langBase?) {
  const voice = resolveEdgeTtsVoice(langBase);
  const outputFormat = "audio-24khz-48kbitrate-mono-mp3";
  const chromeMajor = EDGE_TTS_CHROMIUM_FULL.split(".")[0];
  const gec = edgeTtsSecMsGec();
  const url =
    "wss://speech.platform.bing.com/consumer/speech/synthesize/readaloud/edge/v1" +
    `?TrustedClientToken=${EDGE_TTS_TRUSTED_TOKEN}` +
    `&Sec-MS-GEC=${gec}` +
    `&Sec-MS-GEC-Version=1-${EDGE_TTS_CHROMIUM_FULL}`;
  const chunks = [];
  await new Promise((resolve?, reject?) => {
    let settled = false;
    let ws;
    const fail = (err?) => {
      if (settled) return;
      settled = true;
      try {
        ws?.close();
      } catch (_) {}
      reject(err instanceof Error ? err : new Error(String(err || "EdgeTTS error")));
    };
    const done = () => {
      if (settled) return;
      settled = true;
      try {
        ws?.close();
      } catch (_) {}
      ((resolve as any)() as any);
    };
    const timer = setTimeout(() => fail(new Error("EdgeTTS: timeout")), 20000);
    timer.unref?.();
    ws = new WebSocket(url, {
      host: "speech.platform.bing.com",
      origin: "chrome-extension://jdiccldimpdaibmpdkjnbmckianbfold",
      headers: {
        Pragma: "no-cache",
        "Cache-Control": "no-cache",
        "User-Agent": `Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/${chromeMajor}.0.0.0 Safari/537.36 Edg/${chromeMajor}.0.0.0`,
      },
    });
    ws.on("error", (err?) => {
      clearTimeout(timer);
      fail(err);
    });
    ws.on("open", () => {
      ws.send(
        "Content-Type:application/json; charset=utf-8\r\nPath:speech.config\r\n\r\n" +
          JSON.stringify({
            context: {
              synthesis: {
                audio: {
                  metadataoptions: {
                    sentenceBoundaryEnabled: "false",
                    wordBoundaryEnabled: "false",
                  },
                  outputFormat,
                },
              },
            },
          }),
      );
      const requestId = crypto.randomBytes(16).toString("hex");
      const ssml =
        `<speak version="1.0" xmlns="http://www.w3.org/2001/10/synthesis" xml:lang="${String(langBase || "it")}">` +
        `<voice name="${voice}">${escapeXmlForSsml(text)}</voice></speak>`;
      ws.send(
        `X-RequestId:${requestId}\r\nContent-Type:application/ssml+xml\r\nPath:ssml\r\n\r\n${ssml}`,
      );
    });
    ws.on("message", (data?, isBinary?) => {
      if (isBinary) {
        const buf = Buffer.isBuffer(data) ? data : Buffer.from(data);
        const sep = Buffer.from("Path:audio\r\n");
        const idx = buf.indexOf(sep);
        if (idx !== -1) chunks.push(buf.subarray(idx + sep.length));
        return;
      }
      const message = Buffer.isBuffer(data) ? data.toString("utf8") : String(data || "");
      if (message.includes("Path:turn.end")) {
        clearTimeout(timer);
        done();
      }
    });
  });
  const out = Buffer.concat(chunks);
  if (!out.length) throw new Error("EdgeTTS: nessun audio nella risposta");
  return out;
}

function safeUnlinkTtsFile(filePath?) {
  if (!filePath) return;
  try {
    fs.unlinkSync(filePath);
  } catch (err) {
    const code = String(err?.code || "");
    const msg = String(err?.message || "");
    if (code === "ENOENT" || /ENOENT/i.test(msg)) return;
    global.logger?.warn?.("[TTS] unlink temp file:", msg || err);
  }
}

function isAbortOrTimeoutError(err?) {
  if (!err) return false;
  const name = String(err?.name || "").toLowerCase();
  const code = String(err?.code || "").toLowerCase();
  const msg = String(err?.message || "").toLowerCase();
  return name === "aborterror" || code === "econnaborted" || msg.includes("abort") || msg.includes("timeout");
}

const LANG_TO_VOICERSS = { it: "it-it", en: "en-gb", es: "es-es", fr: "fr-fr", de: "de-de", pt: "pt-pt", ru: "ru-ru", pl: "pl-pl", nl: "nl-nl", tr: "tr-tr", ja: "ja-jp", zh: "zh-cn", };
let voicerssDisabledByInactive = false;
let voicerssInactiveWarnLogged = false;
const TTS_INACTIVE_PLAY_LOG_COOLDOWN_MS = 5 * 60 * 1000;
let lastTtsInactivePlayLogAt = 0;

function disableVoiceRssIfInactiveHint(text?) {
  if (!/inactive/i.test(String(text || ""))) return;
  voicerssDisabledByInactive = true;
  if (!voicerssInactiveWarnLogged) {
    voicerssInactiveWarnLogged = true;
    global.logger?.warn?.(
      "[TTS] VoiceRSS: account/chiave non attiva. Rinnova la chiave o rimuovi TTS_VOICERSS_KEY. Nessuna nuova richiesta VoiceRSS fino al riavvio del bot.",
    );
  }
}

function logTtsPlayFailure(err?) {
  const msg = String(err?.message || err);
  if (/inactive|voicerss/i.test(msg) && /non audio|risposta non audio/i.test(msg)) {
    const now = Date.now();
    if (now - lastTtsInactivePlayLogAt < TTS_INACTIVE_PLAY_LOG_COOLDOWN_MS) return;
    lastTtsInactivePlayLogAt = now;
    global.logger?.warn?.("[TTS PLAY SKIP]", msg.slice(0, 220));
    return;
  }
  if (/GoogleTTS-batchexecute: nessun audio|EdgeTTS:|nessuna sorgente disponibile/i.test(msg)) {
    const now = Date.now();
    if (now - lastTtsInactivePlayLogAt < TTS_INACTIVE_PLAY_LOG_COOLDOWN_MS) return;
    lastTtsInactivePlayLogAt = now;
    global.logger?.warn?.("[TTS PLAY SKIP]", msg.slice(0, 220));
    return;
  }
  global.logger?.error?.("[TTS PLAY ERROR]", msg);
}

async function fetchTtsAudio(url?, provider = "TTS", attempt = 1) {
  const maxAttempts = 2;
  let res;
  try {
    res = await axios.get(url, {
      responseType: "arraybuffer",
      timeout: 15000,
      headers: TTS_HEADERS,
      validateStatus: () => true,
    });
  } catch (err) {
    if (isAbortOrTimeoutError(err) && attempt < maxAttempts) {
      await new Promise((r?) => setTimeout(r, 2000));
      return fetchTtsAudio(url, provider, attempt + 1);
    }
    throw new Error(err?.message && !isAbortOrTimeoutError(err) ? err.message : `${provider}: richiesta annullata o timeout`);
  }
  const status = res?.status ?? 0;
  if (status >= 500 && status < 600 && attempt < maxAttempts) {
    await new Promise((r?) => setTimeout(r, 2000));
    return fetchTtsAudio(url, provider, attempt + 1);
  }
  if (status < 200 || status >= 300) {
    throw new Error(`${provider}: HTTP ${status}`);
  }
  const data = Buffer.isBuffer(res?.data) ? res.data : Buffer.from(res?.data || []);
  if (data.length === 0) return null;
  const contentType = String(res?.headers?.["content-type"] || "").toLowerCase();
  const isTextLike = contentType.includes("text/") || contentType.includes("json") || contentType.includes("xml");
  const isAudio = contentType.includes("audio/") || looksLikeMpegAudio(data);
  if (!isAudio || isTextLike) {
    const preview = readTtsErrorPreview(data);
    if (provider === "VoiceRSS") {
      disableVoiceRssIfInactiveHint(preview);
    }
    throw new Error(
      `${provider}: risposta non audio${preview ? ` (${preview.slice(0, 160)})` : ""}`,
    );
  }
  return data;
}

const TTS_HTTP_SEGMENT_MAX = 380;

function splitTextForTtsSegments(text?, maxLen = TTS_HTTP_SEGMENT_MAX) {
  const s = String(text || "").trim();
  if (!s) return [];
  if (s.length <= maxLen) return [s];
  const out = [];
  let start = 0;
  while (start < s.length) {
    let end = Math.min(start + maxLen, s.length);
    if (end < s.length) {
      const space = s.lastIndexOf(" ", end);
      if (space > start + Math.floor(maxLen * 0.5)) end = space + 1;
    }
    const part = s.slice(start, end).trim();
    if (part) out.push(part);
    start = end;
  }
  return out.length ? out : [s];
}

async function createTtsStreamOnce(textStr?, lang?) {
  const rawLang = String(lang || "it").trim();
  const langLocale = rawLang.replace("_", "-");
  const langBase = langLocale.split("-")[0].toLowerCase();
  const googleLangCandidates = Array.from(new Set([langLocale, langBase].filter(Boolean)),);
  let lastErr = null;

  const hosts = ["https://translate.google.com.vn", "https://translate.google.com",];
  for (const baseHost of hosts) {
    for (const googleLang of googleLangCandidates) {
      for (const gClient of GOOGLE_TTS_GET_CLIENTS) {
        try {
          const url = buildGoogleTtsUrl(textStr, googleLang, baseHost, gClient);
          const data = await fetchTtsAudio(
            url,
            `GoogleTTS:${baseHost}:${googleLang}:${gClient}`,
          );
          if (data) return Readable.from(Buffer.from(data));
        } catch (err) {
          lastErr = err;
        }
      }
    }
  }
  try {
    const rpcBuf = await fetchGoogleTtsBatchexecuteConcat(textStr, langBase);
    if (rpcBuf?.length) return Readable.from(Buffer.from(rpcBuf));
  } catch (err) {
    lastErr = err;
  }
  try {
    const edgeBuf = await fetchEdgeTtsMp3(textStr, langBase);
    if (edgeBuf?.length) return Readable.from(Buffer.from(edgeBuf));
  } catch (err) {
    lastErr = err;
  }
  const voicerssKey = typeof process !== "undefined" && process.env && process.env.TTS_VOICERSS_KEY;
  if (voicerssKey && !voicerssDisabledByInactive) {
    try {
      const hl = LANG_TO_VOICERSS[langBase] || "it-it";
      const url = `https://api.voicerss.org/?key=${encodeURIComponent(voicerssKey)}&hl=${hl}&src=${encodeURIComponent(textStr)}&c=MP3`;
      const data = await fetchTtsAudio(url, "VoiceRSS");
      if (data) return Readable.from(Buffer.from(data));
    } catch (err) {
      lastErr = err;
      disableVoiceRssIfInactiveHint(err?.message);
    }
  }
  throw (
    lastErr || new Error("TTS: nessuna sorgente disponibile (Google/Edge/VoiceRSS).")
  );
}

async function createTtsStream(text?, lang?) {
  const full = String(text || "").trim();
  if (!full) throw new Error("TTS: testo vuoto");
  const segments = splitTextForTtsSegments(full);
  if (segments.length === 1) return createTtsStreamOnce(segments[0], lang);
  const buffers = [];
  for (const seg of segments) {
    const stream = await createTtsStreamOnce(seg, lang);
    const parts = [];
    for await (const chunk of stream) parts.push(chunk);
    buffers.push(Buffer.concat(parts));
  }
  return Readable.from(Buffer.concat(buffers));
}

async function createTtsBuffer(text?, lang?) {
  const stream = await createTtsStream(text, lang);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

export = { safeUnlinkTtsFile, logTtsPlayFailure, createTtsBuffer };
