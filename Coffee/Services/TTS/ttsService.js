const { joinVoiceChannel, getVoiceConnection, createAudioPlayer, createAudioResource, AudioPlayerStatus, entersState, VoiceConnectionStatus, StreamType, } = require("@discordjs/voice");
const { isVoiceTransportError, voiceTransportErrorMessage } = require("../../../shared/discord/voiceTransportErrors");
const { notifyBotPresenceVoiceActivity } = require("../../../shared/discord/botPresenceActivity");
const { Readable } = require("stream");
const fs = require("fs");
const path = require("path");
const os = require("os");
const axios = require("axios");
const prism = require("prism-media");
const ffmpegStatic = require("ffmpeg-static");
const { readSnapshotWithMeta, writeSnapshotWithMeta } = require("../../../shared/recovery/snapshotStore");
const { registerShutdownFlush, armShutdownCheckpoint } = require("../../../shared/recovery/shutdownCheckpoint");
const { voiceFindOneAndUpdate, voiceDeleteOne, voiceFindManyLeanForBot, ttsUserLangFindManyLean, ttsUserLangFindOneLean, ttsUserLangUpsert } = require("../../../Vinyls/Utils/BotState/domainStatesStore");
const IDs = require("../../Utils/Config/ids");
const { isCoffeePrefixCommandToken } = require("../../../shared/discord/coffeePrefixCommandTokens");
const { getClientChannelCached, getClientGuildCached, getGuildMemberCached } = require("../../Utils/Interaction/entityCache");
const { accountUsername } = require("../../Utils/Discord/guildDiscordIdentity");
const { EPHEMERAL_TTL_SHORT_MS, scheduleMessageDeletion } = require("../../Utils/Config/ephemeralMessageTtl");
const MAX_TTS_QUEUE = 10000;
const TTS_CATCHUP_FETCH_LIMIT = 100;
const TTS_CATCHUP_DEFAULT_LOOKBACK_MS = 30 * 1000;
const TTS_RESTORE_CONCURRENCY = 3;
const TTS_POST_JOIN_EMPTY_LEAVE_GRACE_MS = 6000;
const ttsStates = new Map();
const ttsLastJoinAtByGuild = new Map();
const guildLocks = new Map();
const lastSavedChannels = new Map();
const ttsJoinWarnCache = new Map();
const ttsVoiceDisconnectSuppress = new Map();
const TTS_QUEUE_SNAPSHOT_PATH = path.join(__dirname, "..", "..", "Data", "ttsQueueSnapshot.json");
const TTS_QUEUE_SNAPSHOT_INTERVAL_MS = 15000;
const TTS_QUEUE_MAX_PERSISTED_ITEMS = 300;
let emojiNameMap = null;
let nodeEmoji = null;
const userLangs = new Map();

function serializeTtsQueueItem(item) {
  const text = String(item?.text || "").trim();
  if (!text) return null;
  const lang = String(item?.lang || "it").trim() || "it";
  return { text, lang };
}

function persistTtsQueueSnapshotNow() {
  try {
    const queues = {};
    for (const [channelId, state] of ttsStates.entries()) {
      const gid = String(state?.guildId || "").trim();
      const cid = String(channelId || "").trim();
      if (!gid || !cid) continue;
      const queue = Array.isArray(state?.queue) ? state.queue.map(serializeTtsQueueItem).filter(Boolean) : [];
      if (!queue.length) continue;
      queues[gid] = { channelId: cid, queue: queue.slice(0, TTS_QUEUE_MAX_PERSISTED_ITEMS) };
    }
    writeSnapshotWithMeta({
      filePath: TTS_QUEUE_SNAPSHOT_PATH,
      walPath: `${TTS_QUEUE_SNAPSHOT_PATH}.wal`,
      key: "coffee_tts_queue",
      version: 1,
      payload: { queues },
    });
  } catch (err) {
    global.logger?.warn?.("[TTS] queue snapshot persist failed:", err?.message || err);
  }
}

function readTtsQueueSnapshotRaw() {
  const raw = readSnapshotWithMeta({
    filePath: TTS_QUEUE_SNAPSHOT_PATH,
    walPath: `${TTS_QUEUE_SNAPSHOT_PATH}.wal`,
    key: "coffee_tts_queue",
    version: 1,
    fallback: { queues: {} },
  });
  return raw?.queues && typeof raw.queues === "object" ? raw.queues : {};
}

function restoreTtsQueueForChannel(voiceChannel) {
  const guildId = String(voiceChannel?.guild?.id || "").trim();
  const channelId = String(voiceChannel?.id || "").trim();
  if (!guildId || !channelId) return;
  const queues = readTtsQueueSnapshotRaw();
  const row = queues[guildId];
  if (!row || String(row?.channelId || "") !== channelId) return;
  const state = getState(voiceChannel);
  if (Array.isArray(state.queue) && state.queue.length > 0) return;
  const pending = Array.isArray(row?.queue) ? row.queue : [];
  for (const item of pending) {
    const text = String(item?.text || "").trim();
    if (!text) continue;
    const lang = String(item?.lang || "it").trim() || "it";
    state.queue.push({ voiceChannel, text, lang });
  }
  if (!state.playing && state.queue.length) playNext(state);
}

function startTtsQueueSnapshotLoop(client) {
  if (client._ttsQueueSnapshotTimer) return;
  armShutdownCheckpoint();
  if (!client._ttsQueueSnapshotFlushRegistered) {
    client._ttsQueueSnapshotFlushRegistered = true;
    registerShutdownFlush("coffee_tts_queue", () => persistTtsQueueSnapshotNow());
  }
  client._ttsQueueSnapshotTimer = setInterval(() => {
    persistTtsQueueSnapshotNow();
  }, TTS_QUEUE_SNAPSHOT_INTERVAL_MS);
  client._ttsQueueSnapshotTimer.unref?.();
}

try {
  emojiNameMap = require("emoji-name-map");
} catch (error) {
  global.logger?.warn?.(
    "[TTS] emoji-name-map non disponibile:",
    error?.message || error,
  );
}
try {
  nodeEmoji = require("node-emoji");
} catch (error) {
  global.logger?.warn?.(
    "[TTS] node-emoji non disponibile:",
    error?.message || error,
  );
}

function booleanFromConfig(value, fallback = false) {
  if (typeof value === "boolean") return value;
  if (typeof value === "number") return value !== 0;
  const raw = String(value || "").trim().toLowerCase();
  if (["true", "1", "on", "yes", "si", "enabled", "attivo"].includes(raw))
    return true;
  if (
    ["false", "0", "off", "no", "disabled", "disattivo"].includes(raw)
  )
    return false;
  return fallback;
}

function shouldHandleMessage(message, config, prefix) {
  if (!config?.tts?.enabled) return false;
  if (!message?.channel) return false;
  const rawContent = String(message.content ?? "");
  if (prefix && rawContent.startsWith(prefix)) return false;
  if (rawContent.startsWith(",")) return false;
  if (rawContent.startsWith("+")) return false;
  if (rawContent.startsWith("-")) return false;
  const coffeeCmd = rawContent.trim().match(/^,\s*([a-z0-9][\w-]*)/i);
  if (coffeeCmd && isCoffeePrefixCommandToken(coffeeCmd[1])) return false;
  const isVoiceChannel = message.channel.isVoiceBased?.() && !message.channel.isThread?.();
  const isVoiceChannelThread = message.channel.isThread?.() && message.channel.parent?.isVoiceBased?.();
  const extraTextIds = [IDs.channels.noMic].filter(Boolean).map((id) => String(id));
  const channelIdStr = String(message.channel?.id ?? "");
  const parentIdStr = message.channel?.parentId ? String(message.channel.parentId) : "";
  const isExtraText = extraTextIds.some((id) => id === channelIdStr || id === parentIdStr,);
  return isVoiceChannel || isVoiceChannelThread || isExtraText;
}

/** Canale vocale per leggere il messaggio: se sei in duo ma scrivi nella chat di lounge, usa duo. */
function resolveTtsVoiceChannel(message) {
  const memberVoice = message.member?.voice?.channel ?? null;
  if (message.channel.isVoiceBased?.() && !message.channel.isThread?.()) {
    if (memberVoice && String(memberVoice.id) !== String(message.channel.id)) return memberVoice;
    return message.channel;
  }
  if (message.channel.isThread?.() && message.channel.parent?.isVoiceBased?.()) {
    const parent = message.channel.parent;
    if (memberVoice && String(memberVoice.id) !== String(parent.id)) return memberVoice;
    return parent;
  }
  return memberVoice;
}

function sanitizeText(text) {
  if (!text) return "";
  let cleaned = text
    .replace(/https?:\/\/\S+/gi, "")
    .replace(/\b(?:www\.)?[a-z0-9-]+\.[a-z]{2,}(?:\/\S*)?/gi, "")
    .replace(/\bdiscord\.gg\/\S+/gi, "")
    .replace(
      /\b[a-z0-9-]+\s*(?:\[\s*(?:dot|punto)\s*\]|\(\s*(?:dot|punto)\s*\)|\{\s*(?:dot|punto)\s*\}|dot|punto)\s*[a-z]{2,}(?:\/\S*)?/gi,
      "",
    )
    .replace(/\b[a-z]{2,}:\/\/\S+/gi, "")
    .replace(
      /\b\S+\.(?:com|net|org|gg|it|io|co|dev|app|me|xyz|ly|to|ai|tv|uk|de|fr|es|ru|jp|br|us|ca|au)\b\S*/gi,
      "",
    )
    .replace(/`{1,3}[^`]*`{1,3}/g, "")
    .trim();
  cleaned = cleaned.replace(/<a?:([a-zA-Z0-9_]+):\d+>/g, (_, name) => ` emoji ${name} `);
  cleaned = cleaned.replace(/\p{Extended_Pictographic}/gu, (m) => {
    const name = getUnicodeEmojiName(m);
    return name ? ` emoji ${name} ` : " emoji ";
  });
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return cleaned;
}

function normalizeCaseForTts(text) {
  if (!text || typeof text !== "string") return text;
  const letters = text.replace(/\P{L}/gu, "");
  if (letters.length < 2) return text;
  const upper = text.replace(/\P{L}/gu, "").replace(/\P{Lu}/gu, "");
  if (upper.length / letters.length >= 0.8) return text.toLocaleLowerCase();
  return text;
}

const TTS_ABBREVIATIONS_IT = { tvb: "ti voglio bene", nn: "non", xk: "perché", xke: "perché", xché: "perché", xò: "però", xo: "però", cmq: "comunque", qnd: "quando", cn: "con", sn: "sono", pk: "perché", cm: "come", ke: "che", tt: "tutto", gg: "gg", wp: "well played", dv: "dove", qlk: "qualcosa", qlc: "qualcosa", cvd: "come volevasi dimostrare", gl: "buona fortuna", hf: "divertiti", msg: "messaggio", bday: "compleanno", gn: "buonanotte", gm: "buongiorno", cya: "ci vediamo", brb: "torno subito", gtg: "devo andare", g2g: "devo andare", atm: "al momento", rn: "adesso", irl: "nella vita reale", idc: "non mi interessa", prob: "probabilmente", def: "decisamente", tmi: "troppe informazioni", jk: "scherzo", mb: "colpa mia", dunno: "non so", lemme: "lasciami", gimme: "dammi", gotcha: "capito", wyd: "cosa fai", wbu: "e tu", hbu: "e tu", nbd: "niente di grave", diy: "fai da te", til: "oggi ho imparato", tba: "da annunciare", tbd: "da decidere", etc: "e così via", vs: "contro", approx: "circa", vc: "canale vocale", ggwp: "bella partita ben giocata", ggez: "bella partita facile", nt: "bel tentativo", ns: "bel colpo", glhf: "buona fortuna divertiti", f2p: "free to play", p2w: "pay to win", loot: "bottino" };
const TTS_ABBREVIATIONS_EN = { tbh: "to be honest", btw: "by the way", imo: "in my opinion", idk: "I don't know", ik: "I know", omw: "on my way", np: "no problem", nvm: "never mind", ty: "thank you", thx: "thanks", pls: "please", ur: "your", bc: "because", ppl: "people", gg: "good game", wp: "well played", brb: "be right back", gtg: "got to go", g2g: "got to go", atm: "at the moment", rn: "right now", irl: "in real life", idc: "I don't care", smh: "shaking my head", imho: "in my humble opinion", tbf: "to be fair", afaik: "as far as I know", fyi: "for your information", lmao: "laughing my ass off", omg: "oh my god", ez: "easy", gl: "good luck", hf: "have fun", bbl: "be back later", bbs: "be back soon", cya: "see you", gn: "good night", gm: "good morning", tc: "take care", bday: "birthday", msg: "message", pic: "picture", vid: "video", asap: "as soon as possible", fr: "for real", rofl: "rolling on the floor laughing", roflmao: "rolling on the floor laughing my ass off", lmfao: "laughing my freaking ass off", omfg: "oh my god", ngl: "not gonna lie", lowkey: "kind of", highkey: "really", bet: "bet", slay: "slay", bussin: "really good", yeet: "yeet", vibe: "vibe", vibes: "vibes", sus: "suspicious", based: "based", cringe: "cringe", stan: "stalker fan", simp: "simp", drip: "style", flex: "flex", salty: "salty", tilted: "tilted", af: "as heck", asf: "as heck", istg: "I swear to god", tmi: "too much information", jk: "just kidding", jks: "just kidding", sry: "sorry", soz: "sorry", mb: "my bad", fwiw: "for what it's worth", tldr: "too long didn't read", imao: "in my arrogant opinion", iirc: "if I remember correctly", amirite: "am I right", tfw: "that feeling when", mfw: "my face when", mrw: "my reaction when", op: "overpowered", oc: "original content", obv: "obviously", obvs: "obviously", prob: "probably", probs: "probably", def: "definitely", legit: "legitimately", totes: "totally", srsly: "seriously", rly: "really", kinda: "kind of", sorta: "sort of", coulda: "could have", woulda: "would have", shoulda: "should have", gotta: "got to", wanna: "want to", gonna: "going to", dunno: "don't know", lemme: "let me", gimme: "give me", outta: "out of", lotta: "lot of", lotsa: "lots of", whatcha: "what are you", gotcha: "got you", betcha: "bet you", sup: "what's up", wyd: "what you doing", wbu: "what about you", hbu: "how about you", nbd: "no big deal", tgif: "thank god it's friday", diy: "do it yourself", faq: "frequently asked questions", ama: "ask me anything", eli5: "explain like I'm five", til: "today I learned", nah: "no", ikr: "I know right", eta: "estimated time of arrival", psa: "public service announcement", tba: "to be announced", tbd: "to be determined", nsfw: "not safe for work", sfw: "safe for work", iykyk: "if you know you know", icymi: "in case you missed it", ftr: "for the record", jic: "just in case", wdym: "what do you mean", wym: "what you mean", idgaf: "I don't give a heck", stfu: "be quiet", ig: "I guess", hmu: "hit me up", lmk: "let me know", ttyl: "talk to you later", ttys: "talk to you soon", ttfn: "ta ta for now", bfn: "bye for now", otw: "on the way", brt: "be right there", etc: "et cetera", vs: "versus", approx: "approximately", vc: "voice chat", ggwp: "good game well played", ggez: "good game easy", nt: "nice try", ns: "nice shot", glhf: "good luck have fun", oof: "oof", yolo: "you only live once", fomo: "fear of missing out", bae: "babe", bestie: "bestie", poggers: "poggers", kek: "kek", rekt: "wrecked", pwnd: "owned", noob: "newbie", newb: "newbie", nerf: "nerf", buff: "buff", f2p: "free to play", p2w: "pay to win", grind: "grind", loot: "loot", rng: "random", dps: "damage per second", main: "main", alt: "alt", smurf: "smurf", carry: "carry", tilt: "tilt", tilted: "tilted", toxic: "toxic", ff: "forfeit", inv: "invite", dc: "disconnect", ratio: "ratio", copium: "copium", periodt: "period", tea: "tea", hc: "headcanon", fic: "fanfiction", fanfic: "fanfiction", collab: "collaboration", colab: "collaboration", promo: "promotion", o7: "salute", re: "regarding", fwd: "forward", cc: "carbon copy", nm: "never mind", qt: "cutie", bby: "baby", bruh: "bruh", fam: "family", homie: "homie", dawg: "dawg", peeps: "people", squad: "squad", crew: "crew", lit: "lit", fire: "fire", slaps: "slaps", banger: "banger", vibing: "vibing", chill: "chill", chilling: "chilling", deadass: "dead serious", ong: "on god", "no-cap": "no cap", capping: "lying", period: "period", facts: "facts", iconic: "iconic", legend: "legend", legendary: "legendary", king: "king", queen: "queen", ship: "ship", shipping: "shipping", otp: "one true pairing", au: "alternate universe", cosplay: "cosplay", merch: "merchandise", sponsored: "sponsored", wfh: "work from home", f2f: "face to face", ping: "ping", rpg: "role playing game", mmo: "massively multiplayer online", pvp: "player versus player", mob: "mob", boss: "boss", tryhard: "tryhard", sweat: "sweat", sweaty: "sweaty", patch: "patch", update: "update", ea: "early access", farm: "farm", farming: "farming", drop: "drop", crit: "critical", tank: "tank", healer: "healer", support: "support", boost: "boost", fed: "fed", report: "report", int: "intentional", surrender: "surrender", remake: "remake", queue: "queue", mute: "mute", block: "block", ban: "ban", banned: "banned", hack: "hack", hacker: "hacker", bug: "bug", glitch: "glitch", exploit: "exploit", meme: "meme", wholesome: "wholesome", cursed: "cursed", savage: "savage", roast: "roast", fandom: "fandom", ratioed: "ratioed" };

function expandAbbreviationsForTts(text, lang) {
  if (!text || typeof text !== "string") return text;
  const langBase = String(lang || "it").split("-")[0].toLowerCase();
  const primary = langBase === "en" ? TTS_ABBREVIATIONS_EN : TTS_ABBREVIATIONS_IT;
  const secondary = langBase === "en" ? TTS_ABBREVIATIONS_IT : TTS_ABBREVIATIONS_EN;
  const map = { ...secondary, ...primary };
  let out = text;
  for (const [abbr, expansion] of Object.entries(map)) {
    const re = new RegExp(`\\b${abbr.replace(/[.*+?^${}()|[\]\\]/g, "\\$&")}\\b`, "gi");
    out = out.replace(re, expansion);
  }
  return out;
}

function normalizePausesForTts(text) {
  if (!text || typeof text !== "string") return text;
  return text
    .replace(/\s*\.{2,}\s*/g, ", ")
    .replace(/\s*\u2026+\s*/gu, ", ")
    .replace(/\s*,\s*,\s*/g, ", ")
    .replace(/\s+,/g, ",")
    .trim();
}

const NUMBERS_IT_0_19 = "zero uno due tre quattro cinque sei sette otto nove dieci undici dodici tredici quattordici quindici sedici diciassette diciotto diciannove".split(" ");
const NUMBERS_IT_TENS = "zero dieci venti trenta quaranta cinquanta sessanta settanta ottanta novanta".split(" ");

function numberToWordsItalian(n) {
  const num = Math.floor(Number(n));
  if (!Number.isFinite(num) || num < 0 || num > 999999) return String(n);
  if (num <= 19) return NUMBERS_IT_0_19[num];
  if (num < 100) {
    const tens = Math.floor(num / 10);
    const ones = num % 10;
    if (ones === 0) return NUMBERS_IT_TENS[tens];
    if (ones === 1) return NUMBERS_IT_TENS[tens].slice(0, -1) + "uno";
    if (ones === 8) return NUMBERS_IT_TENS[tens].slice(0, -1) + "otto";
    return NUMBERS_IT_TENS[tens] + NUMBERS_IT_0_19[ones];
  }
  if (num < 200) return num === 100 ? "cento" : "cento" + numberToWordsItalian(num - 100);
  if (num < 1000) {
    const h = Math.floor(num / 100);
    const rest = num % 100;
    const name = h === 1 ? "cento" : NUMBERS_IT_0_19[h] + "cento";
    return rest === 0 ? name : name + numberToWordsItalian(rest);
  }
  if (num < 2000) return num === 1000 ? "mille" : "mille" + numberToWordsItalian(num - 1000);
  if (num < 1000000) {
    const k = Math.floor(num / 1000);
    const rest = num % 1000;
    const thousands = k === 1 ? "mille" : numberToWordsItalian(k) + "mila";
    return rest === 0 ? thousands : thousands + numberToWordsItalian(rest);
  }
  return String(n);
}

function numbersToWordsForTts(text, lang) {
  if (!text || typeof text !== "string") return text;
  const langBase = String(lang || "it").split("-")[0].toLowerCase();
  if (langBase !== "it") return text;
  return text.replace(/\b(\d{1,6})\b/g, (_, digits) => numberToWordsItalian(parseInt(digits, 10)));
}

async function warmUserTtsLangsFromDb() {
  try {
    const rows = await ttsUserLangFindManyLean().catch(() => []);
    for (const row of rows || []) {
      if (row?.userId != null && row?.lang) {
        userLangs.set(String(row.userId).trim(), String(row.lang));
      }
    }
  } catch (err) {
    global.logger?.warn?.("[TTS] warmUserTtsLangsFromDb:", err?.message || err);
  }
}

async function hydrateUserTtsLangForUser(userId) {
  const uid = String(userId || "").trim();
  if (!uid || userLangs.has(uid)) return;
  const row = await ttsUserLangFindOneLean(uid).catch(() => null);
  userLangs.set(uid, row?.lang ? String(row.lang) : false);
}

function setUserTtsLang(userId, lang) {
  if (!userId) return;
  const uid = String(userId).trim();
  if (!uid) return;
  if (!lang) {
    userLangs.delete(uid);
    void ttsUserLangUpsert(uid, null).catch((err) =>
      global.logger?.warn?.("[TTS] persist user lang clear:", err?.message || err),
    );
    return;
  }
  userLangs.set(uid, String(lang));
  void ttsUserLangUpsert(uid, String(lang)).catch((err) =>
    global.logger?.warn?.("[TTS] persist user lang:", err?.message || err),
  );
}
function getUserTtsLang(userId) {
  if (userId == null) return null;
  const uid = String(userId).trim();
  const v = userLangs.get(uid);
  if (v === false) return null;
  if (typeof v === "string") return v;
  return null;
}
function getUnicodeEmojiName(emoji) {
  if (emojiNameMap && emojiNameMap[emoji]) {
    return emojiNameMap[emoji].replace(/_/g, " ");
  }
  if (nodeEmoji?.find) {
    const found = nodeEmoji.find(emoji);
    if (found?.key) return found.key.replace(/_/g, " ");
  }
  return null;
}

function buildGoogleTtsUrl(text, lang, baseHost = "https://translate.google.com", client = "tw-ob") {
  const q = encodeURIComponent(String(text || ""));
  const tl = encodeURIComponent(String(lang || "it"));
  const c = encodeURIComponent(String(client || "tw-ob"));
  return `${baseHost}/translate_tts?ie=UTF-8&client=${c}&tl=${tl}&q=${q}`;
}

const TTS_HEADERS = { "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36", Accept: "audio/mpeg,audio/*;q=0.9,*/*;q=0.8", Referer: "https://translate.google.com/", };
const GOOGLE_TTS_GET_CLIENTS = ["tw-ob", "gtx"];
const GOOGLE_TTS_RPC = "jQ1olc";
const GOOGLE_TTS_BATCH_CHUNK = 100;
const GOOGLE_TTS_BATCH_HEADERS = { "User-Agent": TTS_HEADERS["User-Agent"], Accept: "*/*", Referer: "https://translate.google.com/", Origin: "https://translate.google.com", "Content-Type": "application/x-www-form-urlencoded;charset=utf-8" };

function looksLikeMpegAudio(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length < 4) return false;
  if (buffer.subarray(0, 3).toString("ascii") === "ID3") return true;
  return buffer[0] === 0xff && (buffer[1] & 0xe0) === 0xe0;
}

function readTtsErrorPreview(buffer) {
  if (!Buffer.isBuffer(buffer) || buffer.length === 0) return "";
  return buffer.subarray(0, 240).toString("utf8").replace(/\s+/g, " ").trim();
}

function extractGoogleBatchexecuteMp3FromLine(line) {
  const audioSearch = String(line || "").match(/jQ1olc","\[\\"(.*)\\"]/);
  if (!audioSearch?.[1]) return null;
  const b64 = String(audioSearch[1]).replace(/\\\//g, "/").replace(/\s+/g, "").trim();
  if (!b64) return null;
  try {
    const audio = Buffer.from(b64, "base64");
    if (audio.length && looksLikeMpegAudio(audio)) return audio;
  } catch {
    return null;
  }
  return null;
}

async function fetchGoogleTtsBatchexecuteChunk(text, langBase) {
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
  for (const line of raw.split("\n")) {
    if (!line.includes("jQ1olc")) continue;
    const mp3 = extractGoogleBatchexecuteMp3FromLine(line);
    if (mp3) return mp3;
  }
  throw new Error("GoogleTTS-batchexecute: nessun audio nella risposta");
}

async function fetchGoogleTtsBatchexecuteConcat(textStr, langBase) {
  const s = String(textStr || "");
  const chunks = [];
  for (let i = 0; i < s.length; i += GOOGLE_TTS_BATCH_CHUNK) {
    const part = s.slice(i, i + GOOGLE_TTS_BATCH_CHUNK);
    if (!part.trim()) continue;
    const buf = await fetchGoogleTtsBatchexecuteChunk(part, langBase);
    chunks.push(buf);
    if (i + GOOGLE_TTS_BATCH_CHUNK < s.length) {
      await new Promise((r) => {
        const t = setTimeout(r, 80);
        t.unref?.();
      });
    }
  }
  return chunks.length ? Buffer.concat(chunks) : null;
}

function safeUnlinkTtsFile(filePath) {
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

function isAbortOrTimeoutError(err) {
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

function disableVoiceRssIfInactiveHint(text) {
  if (!/inactive/i.test(String(text || ""))) return;
  voicerssDisabledByInactive = true;
  if (!voicerssInactiveWarnLogged) {
    voicerssInactiveWarnLogged = true;
    global.logger?.warn?.(
      "[TTS] VoiceRSS: account/chiave non attiva. Rinnova la chiave o rimuovi TTS_VOICERSS_KEY. Nessuna nuova richiesta VoiceRSS fino al riavvio del bot.",
    );
  }
}

function logTtsPlayFailure(err) {
  const msg = String(err?.message || err);
  if (/inactive|voicerss/i.test(msg) && /non audio|risposta non audio/i.test(msg)) {
    const now = Date.now();
    if (now - lastTtsInactivePlayLogAt < TTS_INACTIVE_PLAY_LOG_COOLDOWN_MS) return;
    lastTtsInactivePlayLogAt = now;
    global.logger?.warn?.("[TTS PLAY SKIP]", msg.slice(0, 220));
    return;
  }
  global.logger?.error?.("[TTS PLAY ERROR]", msg);
}

async function fetchTtsAudio(url, provider = "TTS", attempt = 1) {
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
      await new Promise((r) => setTimeout(r, 2000));
      return fetchTtsAudio(url, provider, attempt + 1);
    }
    throw new Error(err?.message && !isAbortOrTimeoutError(err) ? err.message : `${provider}: richiesta annullata o timeout`);
  }
  const status = res?.status ?? 0;
  if (status >= 500 && status < 600 && attempt < maxAttempts) {
    await new Promise((r) => setTimeout(r, 2000));
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

/** Spezza solo per lunghezza URL (GET); il messaggio completo viene letto in sequenza. */
const TTS_HTTP_SEGMENT_MAX = 380;

function splitTextForTtsSegments(text, maxLen = TTS_HTTP_SEGMENT_MAX) {
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

async function createTtsStreamOnce(textStr, lang) {
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
    lastErr || new Error("TTS: nessuna sorgente disponibile (Google/VoiceRSS).")
  );
}

async function createTtsStream(text, lang) {
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

async function createTtsBuffer(text, lang) {
  const stream = await createTtsStream(text, lang);
  const chunks = [];
  for await (const chunk of stream) chunks.push(chunk);
  return Buffer.concat(chunks);
}

function getState(voiceChannel) {
  const key = voiceChannel.id;
  let state = ttsStates.get(key);
  if (!state) {
    const player = createAudioPlayer();
    state = {
      player,
      queue: [],
      connection: null,
      guildId: voiceChannel.guild.id,
      channelId: voiceChannel.id,
      playing: false,
      currentTtsFile: null,
    };
    player.on(AudioPlayerStatus.Idle, () => {
      if (state.currentTtsFile) {
        safeUnlinkTtsFile(state.currentTtsFile);
        state.currentTtsFile = null;
      }
      state.playing = false;
      playNext(state);
    });
    player.on("error", (err) => {
      global.logger.error("[TTS PLAYER ERROR]", err);
      state.playing = false;
      playNext(state);
    });
    ttsStates.set(key, state);
  }
  return state;
}
function getLockedChannelId(guildId) {
  if (guildId == null) return null;
  return guildLocks.get(String(guildId)) || null;
}
function setLockedChannel(guildId, channelId) {
  if (guildId != null && channelId != null)
    guildLocks.set(String(guildId), String(channelId));
}
function clearLockedChannel(guildId, channelId) {
  if (guildId == null) return;
  const locked = guildLocks.get(String(guildId));
  if (locked && String(locked) === String(channelId)) {
    guildLocks.delete(String(guildId));
  }
}
function markTtsVoiceJoinGrace(guildId) {
  if (guildId == null) return;
  ttsLastJoinAtByGuild.set(String(guildId), Date.now());
}
function isTtsPostJoinVoiceGraceActive(guildId, graceMs = TTS_POST_JOIN_EMPTY_LEAVE_GRACE_MS) {
  if (guildId == null) return false;
  const at = Number(ttsLastJoinAtByGuild.get(String(guildId)));
  if (!Number.isFinite(at)) return false;
  return Date.now() - at < graceMs;
}
function clearTtsPostJoinVoiceGrace(guildId) {
  if (guildId == null) return;
  ttsLastJoinAtByGuild.delete(String(guildId));
}

function markTtsVoiceDisconnectSuppress(guildId, ttlMs = 2800) {
  if (guildId == null) return;
  ttsVoiceDisconnectSuppress.set(String(guildId), Date.now() + ttlMs);
}

function shouldIgnoreTtsVoiceDisconnectFinalize(guildId) {
  const until = ttsVoiceDisconnectSuppress.get(String(guildId));
  return typeof until === "number" && Date.now() < until;
}

function attachTtsVoiceConnectionErrorHandler(connection, guildId, channelId = "") {
  if (!connection || connection.__vcTtsErrorHook) return;
  connection.__vcTtsErrorHook = true;
  connection.on("error", (err) => {
    const errMessage = voiceTransportErrorMessage(err);
    if (!isVoiceTransportError(err)) {
      global.logger?.warn?.("[TTS] voice connection error:", errMessage || err);
      return;
    }
    if (shouldLogTtsJoinWarning(guildId, channelId, errMessage)) {
      global.logger?.warn?.("[TTS] voice transport:", errMessage);
    }
  });
}

function attachTtsVoiceConnectionDisconnectHandler(connection, voiceChannel) {
  const guildId = String(voiceChannel?.guild?.id || "");
  if (!guildId || !connection || connection.__vcTtsDisconnectHook) return;
  connection.__vcTtsDisconnectHook = true;
  attachTtsVoiceConnectionErrorHandler(connection, guildId, String(voiceChannel?.id || ""));
  connection.on("stateChange", (_oldState, newState) => {
    if (newState.status !== VoiceConnectionStatus.Disconnected) return;
    const delayMs = 1000;
    setTimeout(() => {
      void (async () => {
        try {
          if (shouldIgnoreTtsVoiceDisconnectFinalize(guildId)) return;
          const client = voiceChannel.client;
          const guild = await getClientGuildCached(client, guildId).catch(() => null);
          if (!guild || !client?.user?.id) return;
          await guild.members.fetch({ user: client.user.id, force: true }).catch(() => null);
          const me = guild.members.me;
          if (me?.voice?.channelId) return;
          const hasLock = Boolean(getLockedChannelId(guildId) || findLockedChannelIdByGuild(guildId));
          if (hasLock) {
            await leaveTtsGuild(guildId, client);
          } else {
            await clearVoiceState(guildId, String(client.user.id));
            cleanupAllTtsStateForGuild(guildId);
          }
        } catch (_) {}
      })();
    }, delayMs);
  });
}

async function handleTtsBotVoiceMove({ voiceChannel, oldChannelId }) {
  if (!voiceChannel?.guild?.id || !voiceChannel?.id || !oldChannelId) return { ok: false, reason: "invalid" };
  const guildId = String(voiceChannel.guild.id);
  const oldId = String(oldChannelId);
  const newId = String(voiceChannel.id);
  if (!newId || !oldId || oldId === newId) return { ok: false, reason: "no_change" };

  let lockedChannelId = getLockedChannelId(guildId);
  if (!lockedChannelId) lockedChannelId = findLockedChannelIdByGuild(guildId);
  if (lockedChannelId && String(lockedChannelId) !== oldId) {
    return { ok: false, reason: "not_tts_channel" };
  }

  const oldState = ttsStates.get(oldId) || null;
  const newState = ttsStates.get(newId) || null;

  if (newState && newState !== oldState) {
    markTtsVoiceDisconnectSuppress(guildId);
    try { if (newState.connection) newState.connection.destroy(); } catch (_) { }
    ttsStates.delete(newId);
  }

  if (oldState) {
    ttsStates.delete(oldId);
    oldState.guildId = guildId;
    oldState.channelId = newId;
    if (oldState.connection?.joinConfig) {
      try { oldState.connection.joinConfig.channelId = newId; } catch (_) { }
    }
    try { oldState.connection?.subscribe?.(oldState.player); } catch (_) { }
    ttsStates.set(newId, oldState);
  }

  clearLockedChannel(guildId, oldId);
  setLockedChannel(guildId, newId);
  await saveVoiceState(guildId, newId, String(voiceChannel.client?.user?.id || ""));
  return { ok: true };
}
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}

function destroyVoiceConnectionSafe(connection, logPrefix = "[TTS] connection destroy:") {
  if (!connection) return false;
  const suppressGid = connection.joinConfig?.guildId;
  if (suppressGid) markTtsVoiceDisconnectSuppress(suppressGid);
  const status = String(connection?.state?.status || "");
  if (status === String(VoiceConnectionStatus.Destroyed)) return false;
  try {
    connection.destroy();
    return true;
  } catch (err) {
    const msg = String(err?.message || err || "");
    if (/already been destroyed/i.test(msg)) return false;
    global.logger?.warn?.(logPrefix, msg || err);
    return false;
  }
}

function getMusicVoiceCoordination() {
  try {
    return require("../Music/lavalinkMusicService");
  } catch {
    return null;
  }
}

function resolveMusicBlocksTtsForGuild(client, guildId) {
  const { resolveMusicBlocksTts } = require("../../../shared/discord/musicTtsVoiceGuard");
  return resolveMusicBlocksTts(client, guildId, getMusicVoiceCoordination());
}

function musicOwnsGuildVoice(guildId, client = null) {
  return resolveMusicBlocksTtsForGuild(client, guildId).blocked;
}

async function purgeTtsVoicePersistence(guildId, client) {
  if (guildId == null) return;
  const gid = String(guildId);
  markTtsVoiceDisconnectSuppress(gid);
  clearTtsPostJoinVoiceGrace(gid);
  clearGuildTtsLock(gid);
  cleanupAllTtsStateForGuild(gid);
  if (client?.user?.id) {
    await clearVoiceState(gid, String(client.user.id));
  }
}

function shouldLogTtsJoinWarning(guildId, channelId, errMessage, ttlMs = 30000) {
  const key = `${String(guildId || "")}:${String(channelId || "")}:${String(errMessage || "")}`;
  const now = Date.now();
  const lastAt = Number(ttsJoinWarnCache.get(key) || 0);
  if (now - lastAt < ttlMs) return false;
  ttsJoinWarnCache.set(key, now);
  return true;
}
async function destroyGuildVoiceConnection(guildId) {
  const gid = String(guildId || "");
  if (!gid) return;
  markTtsVoiceDisconnectSuppress(gid);
  const existing = getVoiceConnection(gid);
  if (existing) destroyVoiceConnectionSafe(existing, "[TTS] destroy existing voice connection:");
  await sleep(600);
}
async function ensureConnection(state, voiceChannel) {
  const musicBlock = resolveMusicBlocksTtsForGuild(voiceChannel.client, voiceChannel.guild.id);
  if (musicBlock.blocked) return null;
  const lockedChannelId = getLockedChannelId(voiceChannel.guild.id);
  if (lockedChannelId && lockedChannelId !== voiceChannel.id) {
    return null;
  }
  if (state.connection?.joinConfig?.channelId === voiceChannel.id) {
    try {
      await entersState(state.connection, VoiceConnectionStatus.Ready, 5_000);
      attachTtsVoiceConnectionDisconnectHandler(state.connection, voiceChannel);
      notifyBotPresenceVoiceActivity(voiceChannel.client);
      return state.connection;
    } catch {
      destroyVoiceConnectionSafe(state.connection);
      state.connection = null;
    }
  }
  if (state.connection) {
    destroyVoiceConnectionSafe(state.connection);
    state.connection = null;
  }
  markTtsVoiceDisconnectSuppress(voiceChannel.guild.id);
  await destroyGuildVoiceConnection(voiceChannel.guild.id);
  const isIpDiscoveryError = isVoiceTransportError;
  const maxAttempts = Math.max(1, Number(process.env.TTS_VOICE_JOIN_MAX_ATTEMPTS || 2));
  const readyTimeoutMs = Math.max(5_000, Number(process.env.TTS_VOICE_JOIN_READY_TIMEOUT_MS || 10_000));
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let connection = null;
    try {
      connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        selfDeaf: false,
      });
      attachTtsVoiceConnectionErrorHandler(connection, voiceChannel.guild.id, voiceChannel.id);
      state.connection = connection;
      state.guildId = voiceChannel.guild.id;
      state.channelId = voiceChannel.id;
      connection.subscribe(state.player);
      await entersState(connection, VoiceConnectionStatus.Ready, readyTimeoutMs);
      setLockedChannel(voiceChannel.guild.id, voiceChannel.id);
      await saveVoiceState(voiceChannel.guild.id, voiceChannel.id, String(voiceChannel.client?.user?.id || ""));
      markTtsVoiceJoinGrace(voiceChannel.guild.id);
      attachTtsVoiceConnectionDisconnectHandler(connection, voiceChannel);
      notifyBotPresenceVoiceActivity(voiceChannel.client);
      return connection;
    } catch (err) {
      if (connection) {
        destroyVoiceConnectionSafe(connection, "[TTS] connection destroy after error:");
        state.connection = null;
      }
      await destroyGuildVoiceConnection(voiceChannel.guild.id);
      if (isIpDiscoveryError(err) && attempt < maxAttempts) {
        const waitMs = Math.min(1500 * attempt, 8000);
        const errMessage = String(err?.message || err);
        if (
          shouldLogTtsJoinWarning(
            voiceChannel.guild?.id,
            voiceChannel.id,
            errMessage,
          )
        ) {
          global.logger?.warn?.(
            "[TTS] IP discovery / socket closed, retry in " + waitMs + "ms:",
            errMessage,
          );
        }
        await sleep(waitMs);
        continue;
      }
      global.logger?.warn?.("[TTS] voice join failed:", err?.message || err);
      throw err;
    }
  }
  return null;
}
async function playNext(state) {
  if (state.queue.length === 0) {
    state.playing = false;
    persistTtsQueueSnapshotNow();
    return;
  }
  const item = state.queue.shift();
  persistTtsQueueSnapshotNow();
  state.playing = true;
  const tmpPath = path.resolve(os.tmpdir(), `tts_${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`,
  );
  state.currentTtsFile = null;
  try {
    const connection = await ensureConnection(state, item.voiceChannel);
    if (!connection) {
      state.playing = false;
      playNext(state);
      return;
    }
    const buffer = await createTtsBuffer(item.text, item.lang);
    if (!buffer || buffer.length === 0) throw new Error("TTS buffer vuoto");
    fs.writeFileSync(tmpPath, buffer);
    state.currentTtsFile = tmpPath;
    const ffmpegArgs = ["-analyzeduration", "0", "-loglevel", "0", "-i", tmpPath, "-f", "s16le", "-ar", "48000", "-ac", "2",];
    const transcoder = new prism.FFmpeg({ args: ffmpegArgs, shell: false, command: ffmpegStatic || "ffmpeg", });
    const resource = createAudioResource(transcoder, { inputType: StreamType.Raw, inlineVolume: false, });
    state.player.play(resource);
  } catch (err) {
    logTtsPlayFailure(err);
    safeUnlinkTtsFile(tmpPath);
    state.currentTtsFile = null;
    state.playing = false;
    playNext(state);
  }
}
function enqueue(state, item) {
  if (state.queue.length >= MAX_TTS_QUEUE) return;
  state.queue.push(item);
  persistTtsQueueSnapshotNow();
  if (!state.playing) {
    playNext(state);
  }
}
async function handleTtsMessage(message, client, prefix) {
  const config = client?.config;
  if (message?.author?.bot) return;
  const guildId = message.guild?.id;
  if (!shouldHandleMessage(message, config, prefix)) return;
  if (!message.member && message.guild?.members?.fetch) {
    try {
      message.member =
        (await message.guild.members
          .fetch(message.author?.id)
          .catch(() => null)) || message.member;
    } catch (err) {
      global.logger?.warn?.("[TTS] member fetch:", err?.message || err);
    }
  }
  const voiceChannel = resolveTtsVoiceChannel(message);
  const lockedChannelId = guildId ? getLockedChannelId(guildId) : null;
  const autojoin = booleanFromConfig(config?.tts?.autojoin, false);
  if (!autojoin && !lockedChannelId) return;
  const activeConnectedChannelId = guildId ? findLockedChannelIdByGuild(guildId) : null;
  const canWarnMissingVoice = Boolean(activeConnectedChannelId || (guildId && isTtsPostJoinVoiceGraceActive(guildId)));
  if (!voiceChannel) {
    if (!canWarnMissingVoice) return;
    const warn = await message.reply("<a:VC_Alert:1482706673176150077> Devi essere in un canale vocale per usare il TTS.",);
    if (warn) scheduleMessageDeletion(warn, EPHEMERAL_TTL_SHORT_MS);
    return;
  }
  if (!voiceChannel.joinable) return;
  if (lockedChannelId && lockedChannelId !== voiceChannel.id) {
    return;
  }
  const includeUsername = booleanFromConfig(config?.tts?.includeUsername, false,);
  await hydrateUserTtsLangForUser(message.author?.id);
  const lang = getUserTtsLang(message.author?.id) || config?.tts?.lang || "it";
  const rawMessageText = message.cleanContent ?? message.content ?? "";
  let baseText = sanitizeText(typeof rawMessageText === "string" ? rawMessageText : String(rawMessageText),);
  if (!baseText || !baseText.trim()) return;
  const musicBlock = resolveMusicBlocksTtsForGuild(client, guildId);
  if (musicBlock.blocked) {
    const { buildMusicBlocksTtsUserMessage } = require("../../../shared/discord/musicTtsVoiceGuard");
    const warn = await message.reply(
      `<a:VC_Alert:1482706673176150077> ${buildMusicBlocksTtsUserMessage(musicBlock.channelId, prefix)}`,
    );
    if (warn) scheduleMessageDeletion(warn, EPHEMERAL_TTL_SHORT_MS);
    return;
  }
  const state = getState(voiceChannel);
  const connection = await ensureConnection(state, voiceChannel).catch(() => null,);
  if (!connection) return;
  baseText = expandAbbreviationsForTts(baseText, lang);
  const name = accountUsername(message.member || message.author);
  let text = includeUsername ? `${name}: ${baseText}` : baseText;
  text = normalizeCaseForTts(text);
  text = normalizePausesForTts(text);
  text = numbersToWordsForTts(text, lang);
  await saveTtsLastMessageProgress(voiceChannel.guild.id, voiceChannel.id, message.id, message.createdTimestamp, String(client?.user?.id || ""));
  enqueue(state, { voiceChannel, text, lang });
}
async function joinTtsChannel(voiceChannel) {
  if (!voiceChannel) return { ok: false, reason: "no_voice_channel" };
  if (!voiceChannel.joinable) return { ok: false, reason: "not_joinable" };
  const musicBlock = resolveMusicBlocksTtsForGuild(voiceChannel.client, voiceChannel.guild.id);
  if (musicBlock.blocked) {
    return { ok: false, reason: "music_active", musicChannelId: musicBlock.channelId };
  }
  const lockedChannelId = getLockedChannelId(voiceChannel.guild.id);
  if (lockedChannelId && String(lockedChannelId) !== String(voiceChannel.id)) {
    return { ok: false, reason: "locked" };
  }
  const state = getState(voiceChannel);
  const connection = await ensureConnection(state, voiceChannel).catch((err) => {
    global.logger?.warn?.("[TTS] joinTtsChannel failed:", err?.message || err);
    return null;
  });
  if (!connection) return { ok: false, reason: "join_failed" };
  return { ok: true };
}

async function armTtsChannel(voiceChannel) {
  if (!voiceChannel) return { ok: false, reason: "no_voice_channel" };
  if (!voiceChannel.joinable) return { ok: false, reason: "not_joinable" };
  const musicBlock = resolveMusicBlocksTtsForGuild(voiceChannel.client, voiceChannel.guild.id);
  if (musicBlock.blocked) {
    return { ok: false, reason: "music_active", musicChannelId: musicBlock.channelId };
  }
  setLockedChannel(voiceChannel.guild.id, voiceChannel.id);
  await saveVoiceState(voiceChannel.guild.id, voiceChannel.id, String(voiceChannel.client?.user?.id || ""));
  return { ok: true };
}
function findLockedChannelIdByGuild(guildId) {
  if (guildId == null) return null;
  const gid = String(guildId);
  for (const [channelId, state] of ttsStates.entries()) {
    if (state?.guildId && String(state.guildId) === gid && state.connection) {
      return channelId;
    }
  }
  return null;
}

function cleanupAllTtsStateForGuild(guildId) {
  if (guildId == null) return;
  const gid = String(guildId);
  for (const [channelId, state] of [...ttsStates.entries()]) {
    if (!state || String(state.guildId) !== gid) continue;
    state.queue = [];
    state.playing = false;
    if (state.currentTtsFile) {
      safeUnlinkTtsFile(state.currentTtsFile);
      state.currentTtsFile = null;
    }
    try {
      state.player.stop();
    } catch (err) {
      global.logger?.warn?.("[TTS] player stop:", err?.message || err);
    }
    if (state.connection) {
      destroyVoiceConnectionSafe(state.connection);
      state.connection = null;
    }
    ttsStates.delete(channelId);
  }
  guildLocks.delete(gid);
  clearTtsPostJoinVoiceGrace(gid);
  persistTtsQueueSnapshotNow();
}

async function leaveTtsGuild(guildId, client) {
  markTtsVoiceDisconnectSuppress(guildId);
  clearTtsPostJoinVoiceGrace(guildId);
  let lockedChannelId = getLockedChannelId(guildId);
  if (!lockedChannelId) {
    lockedChannelId = findLockedChannelIdByGuild(guildId);
    if (lockedChannelId) setLockedChannel(guildId, lockedChannelId);
  }
  if (!lockedChannelId && client) {
    const guild = await getClientGuildCached(client, guildId);
    const me = guild?.members?.me ?? (guild && client.user?.id ? await getGuildMemberCached(guild, client.user.id) : null);
    if (me?.voice?.channelId) {
      try {
        const existing = getVoiceConnection(String(guildId));
        if (existing) {
          destroyVoiceConnectionSafe(existing, "[TTS] disconnect cleanup:");
        } else {
          cleanupAllTtsStateForGuild(guildId);
        }
      } catch (err) {
        global.logger?.warn?.("[TTS] disconnect cleanup:", err?.message || err);
      }
      cleanupAllTtsStateForGuild(guildId);
    }
    await clearVoiceState(guildId, String(client?.user?.id || ""));
    return { ok: true };
  }
  if (!lockedChannelId) {
    await clearVoiceState(guildId, String(client?.user?.id || ""));
    persistTtsQueueSnapshotNow();
    return { ok: false, reason: "not_connected" };
  }
  const state = ttsStates.get(lockedChannelId);
  if (state) {
    state.queue = [];
    state.playing = false;
    if (state.currentTtsFile) {
      safeUnlinkTtsFile(state.currentTtsFile);
      state.currentTtsFile = null;
    }
    try {
      state.player.stop();
    } catch (err) {
      global.logger?.warn?.("[TTS] player stop:", err?.message || err);
    }
    if (state.connection) {
      destroyVoiceConnectionSafe(state.connection);
      state.connection = null;
    }
    clearLockedChannel(guildId, lockedChannelId);
    ttsStates.delete(lockedChannelId);
  } else {
    clearLockedChannel(guildId, lockedChannelId);
    cleanupAllTtsStateForGuild(guildId);
  }
  await clearVoiceState(guildId, String(client?.user?.id || ""));
  persistTtsQueueSnapshotNow();
  return { ok: true };
}

async function saveVoiceState(guildId, channelId, botUserId) {
  const bid = String(botUserId || "").trim();
  if (!guildId || !channelId || !bid) return;
  if (musicOwnsGuildVoice(guildId, null)) return;
  const dedupeKey = `${guildId}:${bid}`;
  if (lastSavedChannels.get(dedupeKey) === channelId) return;
  lastSavedChannels.set(dedupeKey, channelId);
  try {
    await voiceFindOneAndUpdate(
      { guildId, botUserId: bid },
      { $set: { channelId, lockedChannelId: channelId, updatedAt: new Date() } },
      { upsert: true, new: true },
    );
  } catch (error) {
    global.logger?.error?.("[TTS] Failed to save voice state", error);
  }
}

async function clearVoiceState(guildId, botUserId) {
  const bid = String(botUserId || "").trim();
  if (!guildId || !bid) return;
  lastSavedChannels.delete(`${guildId}:${bid}`);
  try {
    await voiceDeleteOne({ guildId, botUserId: bid });
  } catch (error) {
    global.logger?.error?.("[TTS] Failed to clear voice state", error);
  }
}

async function saveTtsLastMessageProgress(guildId, channelId, messageId, createdTimestamp, botUserId) {
  const bid = String(botUserId || "").trim();
  if (!guildId || !channelId || !messageId || !bid) return;
  if (musicOwnsGuildVoice(guildId)) return;
  const gid = String(guildId);
  const cid = String(channelId);
  const mid = String(messageId);
  const ts = createdTimestamp ? new Date(Number(createdTimestamp)) : new Date();
  try {
    await voiceFindOneAndUpdate(
      { guildId: gid, botUserId: bid },
      {
        $set: {
          channelId: cid,
          lockedChannelId: cid,
          lastTtsMessageId: mid,
          lastTtsProcessedAt: ts,
          updatedAt: new Date(),
        },
      },
      { upsert: true, new: true },
    );
  } catch (error) {
    global.logger?.error?.("[TTS] Failed to save last TTS message progress", error);
  }
}

async function enqueueTtsMessageFromHistory(message, client, voiceChannel, state, prefix) {
  const config = client?.config;
  if (!message || !client || !voiceChannel || !state) return;
  if (!shouldHandleMessage(message, config, prefix)) return;
  const includeUsername = booleanFromConfig(config?.tts?.includeUsername, false);
  await hydrateUserTtsLangForUser(message.author?.id);
  const lang = getUserTtsLang(message.author?.id) || config?.tts?.lang || "it";
  const rawMessageText = message.cleanContent ?? message.content ?? "";
  let baseText = sanitizeText(typeof rawMessageText === "string" ? rawMessageText : String(rawMessageText));
  if (!baseText || !baseText.trim()) return;
  baseText = expandAbbreviationsForTts(baseText, lang);
  const name = message.author?.username || "Utente";
  let text = includeUsername ? `${name}: ${baseText}` : baseText;
  text = normalizeCaseForTts(text);
  text = normalizePausesForTts(text);
  text = numbersToWordsForTts(text, lang);
  enqueue(state, { voiceChannel, text, lang });
  await saveTtsLastMessageProgress(voiceChannel.guild.id, voiceChannel.id, message.id, message.createdTimestamp, String(voiceChannel.client?.user?.id || ""));
}

async function catchupTtsMessagesForChannel(client, voiceChannel, lastProcessedAt, lastProcessedMessageId, prefix) {
  if (!voiceChannel?.messages?.fetch) return;
  const nowMs = Date.now();
  const baseCutoffMs = lastProcessedAt ? new Date(lastProcessedAt).getTime() : nowMs - TTS_CATCHUP_DEFAULT_LOOKBACK_MS;
  if (!Number.isFinite(baseCutoffMs)) return;

  const state = getState(voiceChannel);
  const messages = await voiceChannel.messages.fetch({ limit: TTS_CATCHUP_FETCH_LIMIT }).catch(() => null);
  if (!messages) return;

  const cutoffMs = Math.max(0, baseCutoffMs - 1500); // small grace to avoid edge duplicates
  const sorted = Array.from(messages.values()).sort((a, b) => a.createdTimestamp - b.createdTimestamp);

  for (const message of sorted) {
    if (state.queue.length >= MAX_TTS_QUEUE) break;
    if (
      lastProcessedMessageId &&
      String(message?.id || "") === String(lastProcessedMessageId)
    ) {
      continue;
    }
    if (message?.createdTimestamp <= cutoffMs) continue;
    if (message?.author?.bot) continue;
    await enqueueTtsMessageFromHistory(message, client, voiceChannel, state, prefix).catch(() => null);
  }
}

async function restoreTtsConnections(client) {
  try {
    startTtsQueueSnapshotLoop(client);
    await warmUserTtsLangsFromDb();
    if (!booleanFromConfig(client?.config?.tts?.restoreVoiceOnRestart, true)) {
      return;
    }
    const prefix = String(client?.config?.prefix || ",");
    const states = await voiceFindManyLeanForBot(String(client.user.id), { includeLegacyWithoutBot: false }).catch(() => []);

    for (let i = 0; i < states.length; i += TTS_RESTORE_CONCURRENCY) {
      const batch = states.slice(i, i + TTS_RESTORE_CONCURRENCY);
      await Promise.all(
        batch.map(async (entry) => {
          const channel = await getClientChannelCached(client, entry?.channelId);
          if (!channel || !channel.isVoiceBased?.()) return;
          const gid = String(channel.guild?.id || entry?.guildId || "");
          if (!gid) return;
          if (musicOwnsGuildVoice(gid, client)) {
            await purgeTtsVoicePersistence(gid, client);
            return;
          }
          const music = getMusicVoiceCoordination();
          const musicVc = typeof music?.getGuildMusicVoiceChannelId === "function"
            ? music.getGuildMusicVoiceChannelId(gid)
            : null;
          if (musicVc && String(musicVc) !== String(channel.id)) {
            await purgeTtsVoicePersistence(gid, client);
            return;
          }

          await joinTtsChannel(channel).catch((e) =>
            global.logger?.warn?.("[TTS] restore join skipped:", e?.message || e),
          );
          await catchupTtsMessagesForChannel(client, channel, entry?.lastTtsProcessedAt, entry?.lastTtsMessageId, prefix);
          restoreTtsQueueForChannel(channel);
        }),
      );
    }
  } catch (error) {
    global.logger?.error?.("[TTS] Failed to restore voice connections", error);
  }
}

function setTtsLockedChannel(guildId, channelId) {
  if (!guildId || !channelId) return;
  setLockedChannel(guildId, channelId);
}
function clearGuildTtsLock(guildId) {
  if (guildId == null) return;
  guildLocks.delete(String(guildId));
}

module.exports = { handleTtsMessage, armTtsChannel, joinTtsChannel, leaveTtsGuild, setTtsLockedChannel, clearGuildTtsLock, setUserTtsLang, getUserTtsLang, hydrateUserTtsLangForUser, restoreTtsConnections, handleTtsBotVoiceMove, isTtsPostJoinVoiceGraceActive, purgeTtsVoicePersistence };