/** TTS: preparazione del testo (filtri, abbreviazioni, numeri, emoji). */
const { isCoffeePrefixCommandToken } = require("../../../shared/discord/coffeePrefixCommandTokens") as typeof import("../../../shared/discord/coffeePrefixCommandTokens");
const { stripUrlsForTts, softenAttachedDotsForTts } = require("../../../shared/discord/ttsTextSanitize") as typeof import("../../../shared/discord/ttsTextSanitize");

let emojiNameMap = null;
let nodeEmoji = null;

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

function booleanFromConfig(value?, fallback = false) {
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

function passesTtsContentFilters(message?, config?, prefix?) {
  if (!config?.tts?.enabled) return false;
  if (!message?.channel) return false;
  const rawContent = String(message.content ?? "");
  if (prefix && rawContent.startsWith(prefix)) return false;
  if (rawContent.startsWith("-")) return false;
  const coffeeCmd = rawContent.trim().match(/^,\s*([a-z0-9][\w-]*)/i);
  if (coffeeCmd && isCoffeePrefixCommandToken(coffeeCmd[1])) return false;
  return true;
}

function sanitizeText(text?) {
  if (!text) return "";
  let cleaned = softenAttachedDotsForTts(stripUrlsForTts(text));
  cleaned = cleaned.replace(/`{1,3}[^`]*`{1,3}/g, "").trim();
  cleaned = cleaned.replace(/<a?:([a-zA-Z0-9_]+):\d+>/g, (_?, name?) => ` emoji ${name} `);
  cleaned = cleaned.replace(/\p{Extended_Pictographic}/gu, (m?) => {
    const name = getUnicodeEmojiName(m);
    return name ? ` emoji ${name} ` : " emoji ";
  });
  cleaned = cleaned.replace(/\s+/g, " ").trim();
  return cleaned;
}

function normalizeCaseForTts(text?) {
  if (!text || typeof text !== "string") return text;
  const letters = text.replace(/\P{L}/gu, "");
  if (letters.length < 2) return text;
  const upper = text.replace(/\P{L}/gu, "").replace(/\P{Lu}/gu, "");
  if (upper.length / letters.length >= 0.8) return text.toLocaleLowerCase();
  return text;
}

const TTS_ABBREVIATIONS_IT = {
  tvb: "ti voglio bene",
  nn: "non",
  xk: "perché",
  xke: "perché",
  xché: "perché",
  xò: "però",
  xo: "però",
  cmq: "comunque",
  qnd: "quando",
  cn: "con",
  sn: "sono",
  pk: "perché",
  cm: "come",
  ke: "che",
  tt: "tutto",
  gg: "gg",
  wp: "well played",
  dv: "dove",
  qlk: "qualcosa",
  qlc: "qualcosa",
  cvd: "come volevasi dimostrare",
  gl: "buona fortuna",
  hf: "divertiti",
  msg: "messaggio",
  bday: "compleanno",
  gn: "buonanotte",
  gm: "buongiorno",
  cya: "ci vediamo",
  brb: "torno subito",
  gtg: "devo andare",
  g2g: "devo andare",
  atm: "al momento",
  rn: "adesso",
  irl: "nella vita reale",
  idc: "non mi interessa",
  prob: "probabilmente",
  def: "decisamente",
  tmi: "troppe informazioni",
  jk: "scherzo",
  mb: "colpa mia",
  dunno: "non so",
  lemme: "lasciami",
  gimme: "dammi",
  gotcha: "capito",
  wyd: "cosa fai",
  wbu: "e tu",
  hbu: "e tu",
  nbd: "niente di grave",
  diy: "fai da te",
  til: "oggi ho imparato",
  tba: "da annunciare",
  tbd: "da decidere",
  etc: "e così via",
  vs: "contro",
  approx: "circa",
  vc: "canale vocale",
  ggwp: "bella partita ben giocata",
  ggez: "bella partita facile",
  nt: "bel tentativo",
  ns: "bel colpo",
  glhf: "buona fortuna divertiti",
  f2p: "free to play",
  p2w: "pay to win",
  loot: "bottino"
};
const TTS_ABBREVIATIONS_EN = {
  tbh: "to be honest", btw: "by the way", imo: "in my opinion", idk: "I don't know",
  ik: "I know", omw: "on my way", np: "no problem", nvm: "never mind", ty: "thank you",
  thx: "thanks", pls: "please", ur: "your", bc: "because", ppl: "people",
  gg: "good game", wp: "well played", brb: "be right back", gtg: "got to go",
  g2g: "got to go", atm: "at the moment", rn: "right now", irl: "in real life",
  idc: "I don't care", smh: "shaking my head", imho: "in my humble opinion",
  tbf: "to be fair", afaik: "as far as I know", fyi: "for your information",
  lmao: "laughing my ass off", omg: "oh my god", ez: "easy",
  gl: "good luck", hf: "have fun", bbl: "be back later", bbs: "be back soon",
  cya: "see you", gn: "good night", gm: "good morning", tc: "take care",
  bday: "birthday", msg: "message", pic: "picture", vid: "video",
  asap: "as soon as possible", fr: "for real",
  rofl: "rolling on the floor laughing", roflmao: "rolling on the floor laughing my ass off",
  lmfao: "laughing my freaking ass off",
  omfg: "oh my god", ngl: "not gonna lie", lowkey: "kind of", highkey: "really",
  bet: "bet", slay: "slay", bussin: "really good",
  yeet: "yeet", vibe: "vibe", vibes: "vibes", sus: "suspicious", based: "based",
  cringe: "cringe", stan: "stalker fan", simp: "simp", drip: "style", flex: "flex",
  salty: "salty", tilted: "tilted", af: "as heck", asf: "as heck", istg: "I swear to god",
  tmi: "too much information", jk: "just kidding", jks: "just kidding", sry: "sorry",
  soz: "sorry", mb: "my bad", fwiw: "for what it's worth", tldr: "too long didn't read",
  imao: "in my arrogant opinion", iirc: "if I remember correctly", amirite: "am I right",
  tfw: "that feeling when", mfw: "my face when", mrw: "my reaction when",
  op: "overpowered", oc: "original content", obv: "obviously", obvs: "obviously",
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
  wdym: "what do you mean", wym: "what you mean", idgaf: "I don't give a heck",
  stfu: "be quiet", ig: "I guess", hmu: "hit me up", lmk: "let me know", ttyl: "talk to you later",
  ttys: "talk to you soon", ttfn: "ta ta for now", bfn: "bye for now", otw: "on the way",
  brt: "be right there", etc: "et cetera", vs: "versus", approx: "approximately",
  vc: "voice chat", ggwp: "good game well played",
  ggez: "good game easy", nt: "nice try", ns: "nice shot", glhf: "good luck have fun",
  oof: "oof", yolo: "you only live once", fomo: "fear of missing out",
  bae: "babe", bestie: "bestie", poggers: "poggers", kek: "kek",
  rekt: "wrecked", pwnd: "owned", noob: "newbie", newb: "newbie",
  nerf: "nerf", buff: "buff", f2p: "free to play", p2w: "pay to win", grind: "grind", loot: "loot", rng: "random",
  dps: "damage per second", main: "main", alt: "alt", smurf: "smurf", carry: "carry",
  tilt: "tilt", toxic: "toxic", ff: "forfeit", inv: "invite",
  dc: "disconnect", ratio: "ratio", copium: "copium", periodt: "period",
  tea: "tea", hc: "headcanon", fic: "fanfiction", fanfic: "fanfiction",
  collab: "collaboration", colab: "collaboration", promo: "promotion",
  o7: "salute", re: "regarding", fwd: "forward", cc: "carbon copy", nm: "never mind",
  qt: "cutie", bby: "baby", bruh: "bruh", fam: "family", homie: "homie", dawg: "dawg",
  peeps: "people", squad: "squad", crew: "crew", lit: "lit", fire: "fire", slaps: "slaps",
  banger: "banger", vibing: "vibing", chill: "chill", chilling: "chilling", deadass: "dead serious",
  ong: "on god", "no-cap": "no cap", capping: "lying", period: "period", facts: "facts",
  iconic: "iconic", legend: "legend", legendary: "legendary", king: "king", queen: "queen",
  ship: "ship", shipping: "shipping", otp: "one true pairing", au: "alternate universe",
  cosplay: "cosplay", merch: "merchandise", sponsored: "sponsored",
  wfh: "work from home", f2f: "face to face", ping: "ping",
  rpg: "role playing game", mmo: "massively multiplayer online", pvp: "player versus player",
  mob: "mob", boss: "boss", tryhard: "tryhard", sweat: "sweat", sweaty: "sweaty", patch: "patch", update: "update",
  ea: "early access", farm: "farm", farming: "farming", drop: "drop", crit: "critical",
  tank: "tank", healer: "healer", support: "support", boost: "boost", fed: "fed",
  report: "report", int: "intentional", surrender: "surrender", remake: "remake",
  queue: "queue", mute: "mute", block: "block", ban: "ban", banned: "banned",
  hack: "hack", hacker: "hacker", bug: "bug", glitch: "glitch", exploit: "exploit",
  meme: "meme", wholesome: "wholesome", cursed: "cursed", savage: "savage", roast: "roast",
  fandom: "fandom", ratioed: "ratioed",
};
function expandAbbreviationsForTts(text?, lang?) {
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

function normalizePausesForTts(text?) {
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
function numberToWordsItalian(n?) {
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

function numbersToWordsForTts(text?, lang?) {
  if (!text || typeof text !== "string") return text;
  const langBase = String(lang || "it").split("-")[0].toLowerCase();
  if (langBase !== "it") return text;
  return text.replace(/\b(\d{1,6})\b/g, (_?, digits?) => numberToWordsItalian(parseInt(digits, 10)));
}
function getUnicodeEmojiName(emoji?) {
  if (emojiNameMap && emojiNameMap[emoji]) {
    return emojiNameMap[emoji].replace(/_/g, " ");
  }
  if (nodeEmoji?.find) {
    const found = nodeEmoji.find(emoji);
    if (found?.key) return found.key.replace(/_/g, " ");
  }
  return null;
}

export = { booleanFromConfig, passesTtsContentFilters, sanitizeText, normalizeCaseForTts, expandAbbreviationsForTts, normalizePausesForTts, numbersToWordsForTts };
