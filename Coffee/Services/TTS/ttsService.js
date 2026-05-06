const { joinVoiceChannel, getVoiceConnection, createAudioPlayer, createAudioResource, AudioPlayerStatus, entersState, VoiceConnectionStatus, } = require("@discordjs/voice");
const { Readable } = require("stream");
const fs = require("fs");
const path = require("path");
const os = require("os");
const axios = require("axios");
const { readSnapshotWithMeta, writeSnapshotWithMeta } = require("../../../shared/recovery/snapshotStore");
const { registerShutdownFlush, armShutdownCheckpoint } = require("../../../shared/recovery/shutdownCheckpoint");
const {
  voiceFindOneAndUpdate,
  voiceDeleteOne,
  voiceDeleteManyInGuildIds,
  voiceFindManyLean,
  ttsUserLangFindManyLean,
  ttsUserLangFindOneLean,
  ttsUserLangUpsert,
} = require("../../../Vinyls/Utils/BotState/domainStatesStore");
const IDs = require("../../Utils/Config/ids");
const { getClientChannelCached, getClientGuildCached, getGuildMemberCached, } = require("../../Utils/Interaction/entityCache");
const MAX_TTS_QUEUE = 10000;
const ttsStates = new Map();
const guildLocks = new Map();
const lastSavedChannels = new Map();
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
  if (rawContent.startsWith("-")) return false;
  if (rawContent.startsWith("+")) return false;
  const isVoiceChannel = message.channel.isVoiceBased?.() && !message.channel.isThread?.();
  const isVoiceChannelThread = message.channel.isThread?.() && message.channel.parent?.isVoiceBased?.();
  const extraTextIds = [IDs.channels.noMic].filter(Boolean).map((id) => String(id));
  const channelIdStr = String(message.channel?.id ?? "");
  const parentIdStr = message.channel?.parentId ? String(message.channel.parentId) : "";
  const isExtraText = extraTextIds.some((id) => id === channelIdStr || id === parentIdStr,);
  return isVoiceChannel || isVoiceChannelThread || isExtraText;
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

const TTS_ABBREVIATIONS_IT = {
  tvb: "ti voglio bene", nn: "non", xk: "perché", xke: "perché", xché: "perché",
  xò: "però", xo: "però", cmq: "comunque", qnd: "quando", cn: "con", sn: "sono",
  pk: "perché", cm: "come", ke: "che", tt: "tutto", tb: "tanto bene", gg: "buon gioco",
  wp: "well played", dm: "messaggio privato", dv: "dove", qlk: "qualcosa", qlc: "qualcosa",
  fra: "fratello", cvd: "come volevasi dimostrare", aka: "noto anche come",
  asap: "il prima possibile", lol: "ride forte", lmao: "sto morendo dal ridere",
  omg: "oh mio dio", fyi: "per tua informazione", ez: "facile", gl: "buona fortuna",
  hf: "divertiti", msg: "messaggio", pic: "foto", vid: "video", bday: "compleanno",
  gn: "buonanotte", gm: "buongiorno", cya: "ci vediamo", brb: "torno subito",
  gtg: "devo andare", g2g: "devo andare", atm: "al momento", rn: "adesso",
  irl: "nella vita reale", idc: "non mi interessa", smh: "scuotendo la testa",
  imho: "a mio modesto parere", tbf: "a dire il vero", afaik: "per quanto ne so",
  bbl: "torno più tardi", bbs: "torno tra poco", tc: "stammi bene",
  rofl: "mi rotolo dal ridere", wtf: "che diavolo", wth: "che cavolo", ngl: "senza mentire",
  lowkey: "in segreto", highkey: "davvero", bet: "scommetto", yeet: "via", vibe: "vibrazione",
  sus: "sospetto", based: "basato", cringe: "imbarazzante", stan: "fan ossessionato",
  simp: "simp", drip: "stile", flex: "flex", salty: "incazzato", tilted: "tilting",
  istg: "giuro", tmi: "troppe informazioni", jk: "scherzo", sry: "scusa", mb: "colpa mia",
  fwiw: "per quel che vale", tldr: "in sintesi", iirc: "se ricordo bene", amirite: "ho ragione",
  tfw: "quella sensazione quando", mfw: "la mia faccia quando", mrw: "la mia reazione quando",
  oc: "contenuto originale", obv: "ovviamente", prob: "probabilmente",
  def: "decisamente", totes: "totalmente", srsly: "seriamente", rly: "davvero",
  probs: "probabilmente", kinda: "un po'", sorta: "un po'", gotta: "devo", wanna: "voglio",
  gonna: "sto per", dunno: "non so", lemme: "lasciami", gimme: "dammi", outta: "fuori da",
  lotta: "un sacco di", whatcha: "cosa stai", gotcha: "capito", wyd: "cosa fai", wbu: "e tu",
  hbu: "e tu", nbd: "niente di grave", tgif: "grazie a dio è venerdì", diy: "fai da te",
  faq: "domande frequenti", ama: "chiedimi qualsiasi cosa", eli5: "spiega in parole semplici",
  til: "oggi ho imparato", nah: "no", ikr: "lo so vero", eta: "orario previsto", psa: "avviso",
  tba: "da annunciare", tbd: "da decidere", nsfw: "non sicuro per il lavoro", sfw: "sicuro",
  iykyk: "se sai sai", icymi: "se te lo sei perso", ftr: "per la cronaca", jic: "per sicurezza",
  wdym: "cosa intendi", wym: "cosa intendi", idgaf: "non me ne importa", wth: "che cavolo",
  ig: "credo", hmu: "scrivimi", lmk: "fammi sapere", ttyl: "ci sentiamo dopo", ttys: "a presto",
  ttfn: "ciao per ora", otw: "in arrivo", brt: "arrivo subito", etc: "e così via",
  vs: "contro", approx: "circa", vc: "canale vocale",
  ggwp: "bella partita ben giocata", ggez: "bella partita facile", nt: "bel tentativo",
  ns: "bel colpo", glhf: "buona fortuna divertiti", rip: "riposa in pace", oof: "oof",
  yolo: "si vive una volta sola", fomo: "paura di perdersi qualcosa", bae: "tesoro",
  bestie: "migliore amica", bff: "migliori amici per sempre", goat: "il migliore di tutti",
  pog: "fantastico", poggers: "fantastico", kek: "lol", rekt: "distrutto", noob: "principiante", pro: "professionista", op: "troppo forte", f2p: "free to play",
  p2w: "pay to win", grind: "grindare", loot: "bottino", rng: "caso", dps: "danno al secondo",
  main: "main", smurf: "smurf", carry: "portare", tilt: "tilt",
  toxic: "tossico", ff: "forfeit", inv: "invita", mod: "moderatore",
  ratio: "ratio", copium: "copium", periodt: "punto", slay: "stai stupenda", tea: "pettegolezzo",
};
const TTS_ABBREVIATIONS_EN = {
  tbh: "to be honest", btw: "by the way", imo: "in my opinion", idk: "I don't know",
  ik: "I know", omw: "on my way", np: "no problem", nvm: "never mind", ty: "thank you",
  thx: "thanks", pls: "please", ur: "your", bc: "because", ppl: "people",
  gg: "good game", wp: "well played", brb: "be right back", gtg: "got to go",
  g2g: "got to go", atm: "at the moment", rn: "right now", irl: "in real life",
  idc: "I don't care", smh: "shaking my head", imho: "in my humble opinion",
  tbf: "to be fair", afaik: "as far as I know", fyi: "for your information",
  lol: "laugh out loud", lmao: "laughing my ass off", omg: "oh my god", ez: "easy",
  gl: "good luck", hf: "have fun", bbl: "be back later", bbs: "be back soon",
  cya: "see you", gn: "good night", gm: "good morning", tc: "take care",
  bday: "birthday", msg: "message", pic: "picture", vid: "video", aka: "also known as",
  asap: "as soon as possible", fr: "for real",
  rofl: "rolling on the floor laughing", roflmao: "rolling on the floor laughing my ass off",
  lmfao: "laughing my freaking ass off", wtf: "what the heck", wth: "what the hell",
  omfg: "oh my god", ngl: "not gonna lie", lowkey: "kind of", highkey: "really",
  bet: "bet", "no-cap": "no cap", cap: "lie", slay: "slay", bussin: "really good",
  yeet: "yeet", vibe: "vibe", vibes: "vibes", sus: "suspicious", based: "based",
  cringe: "cringe", stan: "stalker fan", simp: "simp", drip: "style", flex: "flex",
  salty: "salty", tilted: "tilted", af: "as heck", asf: "as heck", istg: "I swear to god",
  tmi: "too much information", jk: "just kidding", jks: "just kidding", sry: "sorry",
  soz: "sorry", mb: "my bad", fwiw: "for what it's worth", tldr: "too long didn't read",
  imao: "in my arrogant opinion", iirc: "if I remember correctly", amirite: "am I right",
  tfw: "that feeling when", mfw: "my face when", mrw: "my reaction when",
  op: "original poster", oc: "original content", obv: "obviously", obvs: "obviously",
  prob: "probably", probs: "probably", def: "definitely", legit: "legitimately",
  totes: "totally", srsly: "seriously", rly: "really", kinda: "kind of", sorta: "sort of",
  coulda: "could have", woulda: "would have", shoulda: "should have", gotta: "got to",
  wanna: "want to", gonna: "going to", dunno: "don't know", lemme: "let me", gimme: "give me",
  outta: "out of", lotta: "lot of", lotsa: "lots of", whatcha: "what are you", gotcha: "got you",
  betcha: "bet you", sup: "what's up", wyd: "what you doing", wbu: "what about you",
  hbu: "how about you", nbd: "no big deal", tgif: "thank god it's friday", diy: "do it yourself",
  faq: "frequently asked questions", ama: "ask me anything", eli5: "explain like I'm five",
  til: "today I learned", nah: "no", ikr: "I know right", eta: "estimated time of arrival",
  psa: "public service announcement", tba: "to be announced", tbd: "to be determined",
  nsfw: "not safe for work", sfw: "safe for work", iykyk: "if you know you know",
  icymi: "in case you missed it", ftr: "for the record", jic: "just in case",
  wdym: "what do you mean", wym: "what you mean", idgaf: "I don't give a fuck",
  stfu: "be quiet", ig: "I guess", hmu: "hit me up", lmk: "let me know", ttyl: "talk to you later",
  ttys: "talk to you soon", ttfn: "ta ta for now", bfn: "bye for now", otw: "on the way",
  brt: "be right there", etc: "et cetera", vs: "versus", approx: "approximately",
  afk: "away from keyboard", vc: "voice chat", ggwp: "good game well played",
  ggez: "good game easy", nt: "nice try", ns: "nice shot", glhf: "good luck have fun",
  rip: "rest in peace", oof: "oof", yolo: "you only live once", fomo: "fear of missing out",
  bae: "babe", bestie: "bestie", bff: "best friends forever", poggers: "poggers", kek: "kek",
  rekt: "wrecked", pwnd: "owned", noob: "newbie", newb: "newbie",
  op: "overpowered", nerf: "nerf", buff: "buff",
  f2p: "free to play", p2w: "pay to win", grind: "grind", loot: "loot", rng: "random",
  dps: "damage per second", main: "main", alt: "alt", smurf: "smurf", carry: "carry",
  tilt: "tilt", tilted: "tilted", toxic: "toxic", ff: "forfeit", inv: "invite",
  dc: "disconnect", mod: "moderator", ratio: "ratio", copium: "copium", periodt: "period",
  slay: "slay", tea: "tea", hc: "headcanon", fic: "fanfiction", fanfic: "fanfiction",
  collab: "collaboration", colab: "collaboration", promo: "promotion", hmu: "hit me up",
  o7: "salute", re: "regarding", fwd: "forward", cc: "carbon copy", nm: "never mind",
  qt: "cutie", bby: "baby", bruh: "bruh", fam: "family", homie: "homie", dawg: "dawg",
  peeps: "people", squad: "squad", crew: "crew", lit: "lit", fire: "fire", slaps: "slaps",
  banger: "banger", vibing: "vibing", chill: "chill", chilling: "chilling", deadass: "dead serious",
  ong: "on god", "no-cap": "no cap", capping: "lying", period: "period", facts: "facts",
  iconic: "iconic", legend: "legend", legendary: "legendary", king: "king", queen: "queen",
  ship: "ship", shipping: "shipping", otp: "one true pairing", au: "alternate universe",
  cosplay: "cosplay", cos: "cosplay", merch: "merchandise", sponsored: "sponsored",
  wfh: "work from home", f2f: "face to face", ping: "ping", fps: "frames per second",
  rpg: "role playing game", mmo: "massively multiplayer online", pvp: "player versus player",
  pve: "player versus environment", npc: "non player character", mob: "mob", boss: "boss",
  tryhard: "tryhard", sweat: "sweat", sweaty: "sweaty", patch: "patch", update: "update",
  ea: "early access", farm: "farm", farming: "farming", drop: "drop", crit: "critical",
  tank: "tank", healer: "healer", support: "support", boost: "boost", fed: "fed",
  report: "report", int: "intentional", surrender: "surrender", remake: "remake",
  queue: "queue", mute: "mute", block: "block", ban: "ban", banned: "banned",
  hack: "hack", hacker: "hacker", bug: "bug", glitch: "glitch", exploit: "exploit",
  meme: "meme", wholesome: "wholesome", cursed: "cursed", savage: "savage", roast: "roast",
  fandom: "fandom", ratioed: "ratioed",
};
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
const NUMBERS_IT_TENS = " zero dieci venti trenta quaranta cinquanta sessanta settanta ottanta novanta".split(" ");
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
    return NUMBERS_IT_TENS[tens].slice(0, -1) + NUMBERS_IT_0_19[ones];
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

function buildGoogleTtsUrl(
  text,
  lang,
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
      await new Promise((resolve) => { const t = setTimeout(resolve, 2000); t.unref?.(); });
      return fetchTtsAudio(url, provider, attempt + 1);
    }
    throw new Error(err?.message && !isAbortOrTimeoutError(err) ? err.message : `${provider}: richiesta annullata o timeout`);
  }
  const status = res?.status ?? 0;
  if (status >= 500 && status < 600 && attempt < maxAttempts) {
    await new Promise((resolve) => { const t = setTimeout(resolve, 2000); t.unref?.(); });
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
function sleep(ms) {
  return new Promise((r) => setTimeout(r, ms));
}
async function destroyGuildVoiceConnection(guildId) {
  const gid = String(guildId || "");
  if (!gid) return;
  const existing = getVoiceConnection(gid);
  if (existing) {
    try {
      existing.destroy();
    } catch (err) {
      global.logger?.warn?.("[TTS] destroy existing voice connection:", err?.message || err);
    }
  }
  await sleep(600);
}
async function ensureConnection(state, voiceChannel) {
  const lockedChannelId = getLockedChannelId(voiceChannel.guild.id);
  if (lockedChannelId && lockedChannelId !== voiceChannel.id) {
    return null;
  }
  if (state.connection?.joinConfig?.channelId === voiceChannel.id) {
    try {
      await entersState(state.connection, VoiceConnectionStatus.Ready, 5_000);
      return state.connection;
    } catch {
      try {
        state.connection.destroy();
      } catch (err) {
        global.logger?.warn?.("[TTS] connection destroy:", err?.message || err);
      }
      state.connection = null;
    }
  }
  if (state.connection) {
    try {
      state.connection.destroy();
    } catch (err) {
      global.logger?.warn?.("[TTS] connection destroy:", err?.message || err);
    }
    state.connection = null;
  }
  await destroyGuildVoiceConnection(voiceChannel.guild.id);
  const isIpDiscoveryError = (err) => {
    const msg = String(err?.message || "").toLowerCase();
    return msg.includes("ip discovery") || msg.includes("socket closed") || msg.includes("aborted") || msg.includes("signalling");
  };
  const maxAttempts = 5;
  for (let attempt = 1; attempt <= maxAttempts; attempt++) {
    let connection = null;
    try {
      connection = joinVoiceChannel({
        channelId: voiceChannel.id,
        guildId: voiceChannel.guild.id,
        adapterCreator: voiceChannel.guild.voiceAdapterCreator,
        selfDeaf: false,
      });
      state.connection = connection;
      state.guildId = voiceChannel.guild.id;
      state.channelId = voiceChannel.id;
      connection.subscribe(state.player);
      await entersState(connection, VoiceConnectionStatus.Ready, 25_000);
      setLockedChannel(voiceChannel.guild.id, voiceChannel.id);
      await saveVoiceState(voiceChannel.guild.id, voiceChannel.id);
      return connection;
    } catch (err) {
      if (connection) {
        try {
          connection.destroy();
        } catch (e) {
          global.logger?.warn?.("[TTS] connection destroy after error:", e?.message || e);
        }
        state.connection = null;
      }
      await destroyGuildVoiceConnection(voiceChannel.guild.id);
      if (isIpDiscoveryError(err) && attempt < maxAttempts) {
        const waitMs = Math.min(1500 * attempt, 8000);
        global.logger?.warn?.("[TTS] IP discovery / socket closed, retry in " + waitMs + "ms:", err?.message || err);
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
  const tmpPath = path.resolve(os.tmpdir(), `tts_${Date.now()}_${Math.random().toString(36).slice(2)}.mp3`,);
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
    const resource = createAudioResource(tmpPath);
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
  if (!shouldHandleMessage(message, config, prefix)) return;
  if (!message.member && message.guild?.members?.fetch) {
    try {
      message.member =
        (await getGuildMemberCached(message.guild, message.author?.id, {
          ttlMs: 20_000,
          preferFresh: true,
        })) || message.member;
    } catch (err) {
      global.logger?.warn?.("[TTS] member fetch:", err?.message || err);
    }
  }
  let voiceChannel = null;
  if (message.channel.isVoiceBased?.() && !message.channel.isThread?.()) {
    voiceChannel = message.channel;
  } else if (
    message.channel.isThread?.() &&
    message.channel.parent?.isVoiceBased?.()
  ) {
    voiceChannel = message.channel.parent;
  } else {
    voiceChannel = message.member?.voice?.channel;
  }
  if (!voiceChannel) return;
  const authorVoiceId = message.member?.voice?.channelId ?? null;
  if (!authorVoiceId || String(authorVoiceId) !== String(voiceChannel.id)) return;
  if (!voiceChannel.joinable) return;
  const lockedChannelId = getLockedChannelId(voiceChannel.guild.id);
  if (lockedChannelId && lockedChannelId !== voiceChannel.id) {
    return;
  }
  const autojoin = booleanFromConfig(config?.tts?.autojoin, false);
  if (!autojoin && !lockedChannelId) {
    return;
  }
  const state = getState(voiceChannel);
  const connection = await ensureConnection(state, voiceChannel).catch(() => null,);
  if (!connection) return;
  const includeUsername = booleanFromConfig(config?.tts?.includeUsername, false,);
  await hydrateUserTtsLangForUser(message.author?.id);
  const lang = getUserTtsLang(message.author?.id) || config?.tts?.lang || "it";
  const rawMessageText = message.cleanContent ?? message.content ?? "";
  let baseText = sanitizeText(typeof rawMessageText === "string" ? rawMessageText : String(rawMessageText),);
  if (!baseText || !baseText.trim()) return;
  baseText = expandAbbreviationsForTts(baseText, lang);
  const name = message.member?.displayName || message.member?.user?.username || message.author?.username || "Utente";
  let text = includeUsername ? `${name}: ${baseText}` : baseText;
  text = normalizeCaseForTts(text);
  text = normalizePausesForTts(text);
  text = numbersToWordsForTts(text, lang);
  enqueue(state, { voiceChannel, text, lang });
}
async function joinTtsChannel(voiceChannel) {
  if (!voiceChannel) return { ok: false, reason: "no_voice_channel" };
  if (!voiceChannel.joinable) return { ok: false, reason: "not_joinable" };
  const state = getState(voiceChannel);
  const connection = await ensureConnection(state, voiceChannel);
  if (!connection) return { ok: false, reason: "locked" };
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
      try {
        state.connection.destroy();
      } catch (err) {
        global.logger?.warn?.("[TTS] connection destroy:", err?.message || err);
      }
      state.connection = null;
    }
    ttsStates.delete(channelId);
  }
  guildLocks.delete(gid);
  persistTtsQueueSnapshotNow();
}

async function leaveTtsGuild(guildId, client) {
  let lockedChannelId = getLockedChannelId(guildId);
  if (!lockedChannelId) {
    lockedChannelId = findLockedChannelIdByGuild(guildId);
    if (lockedChannelId) setLockedChannel(guildId, lockedChannelId);
  }
  if (!lockedChannelId && client) {
    const guild = await getClientGuildCached(client, guildId, { ttlMs: 30_000 });
    const me = guild?.members?.me ?? (guild && client.user?.id ? await getGuildMemberCached(guild, client.user.id) : null);
    if (me?.voice?.channelId) {
      try {
        const existing = getVoiceConnection(String(guildId));
        if (existing) existing.destroy();
      } catch (err) {
        global.logger?.warn?.("[TTS] disconnect cleanup:", err?.message || err);
      }
      cleanupAllTtsStateForGuild(guildId);
    }
    await clearVoiceState(guildId);
    return { ok: true };
  }
  if (!lockedChannelId) return { ok: false, reason: "not_connected" };
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
      try {
        state.connection.destroy();
      } catch (err) {
        global.logger?.warn?.("[TTS] connection destroy:", err?.message || err);
      }
      state.connection = null;
    }
    clearLockedChannel(guildId, lockedChannelId);
    ttsStates.delete(lockedChannelId);
  } else {
    clearLockedChannel(guildId, lockedChannelId);
    cleanupAllTtsStateForGuild(guildId);
  }
  await clearVoiceState(guildId);
  persistTtsQueueSnapshotNow();
  return { ok: true };
}

async function saveVoiceState(guildId, channelId) {
  if (!guildId || !channelId) return;
  if (lastSavedChannels.get(guildId) === channelId) return;
  lastSavedChannels.set(guildId, channelId);
  try {
    await voiceFindOneAndUpdate(
      { guildId },
      { $set: { guildId, channelId, lockedChannelId: channelId, updatedAt: new Date() } },
      { upsert: true, new: true },
    );
  } catch (error) {
    global.logger?.error?.("[TTS] Failed to save voice state", error);
  }
}

async function clearVoiceState(guildId) {
  if (!guildId) return;
  lastSavedChannels.delete(guildId);
  try {
    await voiceDeleteOne({ guildId });
  } catch (error) {
    global.logger?.error?.("[TTS] Failed to clear voice state", error);
  }
}

async function restoreTtsConnections(client) {
  try {
    startTtsQueueSnapshotLoop(client);
    await warmUserTtsLangsFromDb();
    const autojoinEnabled = booleanFromConfig(client?.config?.tts?.autojoin, false,);
    if (!autojoinEnabled) {
      const guildIds = [...(client?.guilds?.cache?.keys?.() || [])];
      if (guildIds.length)
        await voiceDeleteManyInGuildIds(guildIds).catch(() => null);
      return;
    }
    await sleep(4500);
    const states = await voiceFindManyLean();
    for (const entry of states) {
      const channel = await getClientChannelCached(client, entry.channelId, { ttlMs: 30_000, });
      if (!channel || !channel.isVoiceBased?.()) continue;
      await joinTtsChannel(channel).catch((e) =>
        global.logger?.warn?.("[TTS] restore join skipped:", e?.message || e),
      );
      restoreTtsQueueForChannel(channel);
      await sleep(1200);
    }
  } catch (error) {
    global.logger?.error?.("[TTS] Failed to restore voice connections", error);
  }
}

module.exports = {
  handleTtsMessage,
  joinTtsChannel,
  leaveTtsGuild,
  setUserTtsLang,
  getUserTtsLang,
  hydrateUserTtsLangForUser,
  restoreTtsConnections,
};