const cron = require("node-cron");
const axios = require("axios");
const Poll = require("../../Schemas/Poll/pollSchema");
const IDs = require("../../Utils/Config/ids");
const { createPollForGuild } = require("../../Commands/Admin/poll");
const { getClientChannelCached } = require("../../Utils/Interaction/interactionEntityCache");
const TIMEZONE = "Europe/Rome";
const COUNTER_FILTER_QUESTION = "__counter__";
const DEFAULT_WINDOW_START_HOUR = 19;
const DEFAULT_WINDOW_START_MINUTE = 0;
const DEFAULT_WINDOW_END_HOUR = 20;
const DEFAULT_WINDOW_END_MINUTE = 59;
const DEFAULT_SOURCES = ["openrouter", "local"];
const DEFAULT_OPENROUTER_MODELS = ["google/gemma-3-12b-it:free", "google/gemma-3-27b-it:free",];
const OPENROUTER_API_URL = "https://openrouter.ai/api/v1/chat/completions";
const OPENROUTER_MAX_ROUNDS = 2;
const OPENROUTER_RETRY_DELAY_MS = 1500;
const OPENROUTER_RATE_LIMIT_COOLDOWN_MS = 15 * 60 * 1000;
const GENERIC_OPENROUTER_MODEL_ALIASES = new Set(["openrouter/free", "openrouter/auto"]);
let openRouterCooldownUntil = 0;
const WARN_POLL_OPENROUTER_INTERVAL_MS = 60 * 1000;
let lastWarnPollOpenRouterAt = 0;

function warnPollOpenRouter(...args) {
  const now = Date.now();
  if (now - lastWarnPollOpenRouterAt < WARN_POLL_OPENROUTER_INTERVAL_MS) return;
  lastWarnPollOpenRouterAt = now;
  global.logger?.warn?.("[poll.auto]", ...args);
}

const LOCAL_ATTUALITA_POLLS = [
  { question: "Da dove segui soprattutto le notizie?", answers: ["TV", "Siti e app di news", "Social network", "Radio", "Passaparola"], },
  { question: "Quanto sei preoccupato per il cambiamento climatico?", answers: ["Molto", "Abbastanza", "Poco", "Per niente", "Non ci penso"], },
  { question: "Smart working: come preferisci lavorare?", answers: ["Solo da remoto", "Solo in sede", "Ibrido a scelta", "Ibrido obbligatorio", "Dipende dal ruolo"], },
  { question: "L'intelligenza artificiale nella vita quotidiana: come la vedi?", answers: ["Utile e positiva", "Utile ma da regolamentare", "Neutra", "Preoccupante", "La evito"], },
  { question: "Quale tema di attualità ti interessa di più?", answers: ["Ambiente e clima", "Economia e lavoro", "Politica e società", "Tecnologia", "Salute"], },
  { question: "Quanto ti senti informato sulla politica italiana?", answers: ["Molto", "Abbastanza", "Poco", "Per niente", "Non mi interessa"], },
  { question: "Dove ti informi prima su un fatto di cronaca?", answers: ["TG o telegiornali", "Siti di news", "Twitter/X o social", "Google", "Non seguo la cronaca"], },
  { question: "Il costo della vita: come lo stai vivendo?", answers: ["Con difficoltà", "Con qualche rinuncia", "Senza grandi problemi", "Non mi tocca", "Preferisco non pensarci"], },
  { question: "Quanto è importante per te la privacy online?", answers: ["Molto, la proteggo", "Abbastanza", "Poco", "Non ci penso", "Rinuncio per comodità"], },
  { question: "Come vedi il futuro dell'Europa?", answers: ["Più unita", "Come ora", "Più divisa", "Non so", "Non mi interessa"], },
  { question: "Quale problema sociale ti sta più a cuore?", answers: ["Disuguaglianze", "Immigrazione e integrazione", "Lavoro e giovani", "Salute e welfare", "Sicurezza"], },
  { question: "Le fonti di energia: quale direzione preferisci?", answers: ["Solo rinnovabili", "Mix con meno fossili", "Nucleare incluso", "Status quo", "Non ho un'opinione"], },
  { question: "Quanto ti fidi dei media tradizionali?", answers: ["Molto", "Abbastanza", "Poco", "Per niente", "Dipende dal mezzo"], },
  { question: "Tasse e welfare: come la pensi?", answers: ["Più tasse, più servizi", "Meno tasse", "Equilibrio", "Riforma radicale", "Non so"], },
  { question: "Come ti rapporti alle fake news?", answers: ["Le verifico sempre", "Cerco di verificare", "A volte ci cascano", "Non mi preoccupano", "Non so come verificarle"], },
  { question: "Lavoro e giovani: qual è la priorità?", answers: ["Contratti stabili", "Stipendio dignitoso", "Formazione", "Lavoro da remoto", "Menare meno"], },
  { question: "Salute pubblica: cosa conta di più?", answers: ["Prevenzione", "Ospedali e cure", "Mental health", "Ricerca", "Tutto uguale"], },
  { question: "Scuola e università: cosa cambieresti?", answers: ["Più fondi", "Programmi aggiornati", "Meno burocrazia", "Più meritocrazia", "Niente di particolare"], },
  { question: "Come vedi il ruolo dell'Italia in Europa?", answers: ["Più protagonista", "Come ora", "Più indipendente", "Non so", "Poco rilevante"], },
  { question: "Quale tema vorresti più dibattuto in TV?", answers: ["Ambiente", "Economia", "Diritti civili", "Lavoro", "Cronaca e giustizia"], },
  { question: "Quanto sei favorevole a leggi più severe sul clima?", answers: ["Molto", "Abbastanza", "Poco", "Contrario", "Indifferente"], },
  { question: "Dove investiresti più risorse pubbliche?", answers: ["Sanità", "Istruzione", "Infrastrutture", "Ambiente", "Sicurezza"], },
  { question: "Come giudichi l'informazione sui social?", answers: ["Utile se si filtra", "Troppo caotica", "Pericolosa", "Indispensabile", "La evito"], },
  { question: "Reddito e lavoro: qual è la priorità per il Paese?", answers: ["Lotta alla povertà", "Creare posti di lavoro", "Formazione", "Ridurre il precariato", "Tagliare le tasse"], },
];

function normalizeText(value) {
  return String(value || "")
    .replace(/\s+/g, " ")
    .trim();
}

function shuffle(list) {
  const arr = Array.isArray(list) ? [...list] : [];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function pickRandom(list) {
  const arr = Array.isArray(list) ? list : [];
  if (!arr.length) return null;
  return arr[Math.floor(Math.random() * arr.length)] || null;
}

function clampOptionCount(value, fallback) {
  const n = Number(value);
  if (!Number.isFinite(n)) return fallback;
  return Math.max(2, Math.min(10, Math.floor(n)));
}

function pickRandomFromRange(min, max) {
  const a = Math.min(min, max);
  const b = Math.max(min, max);
  return a + Math.floor(Math.random() * (b - a + 1));
}

function sleep(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

function isOpenRouterCoolingDown() {
  return Date.now() < Number(openRouterCooldownUntil || 0);
}

function startOpenRouterCooldown() {
  openRouterCooldownUntil = Date.now() + OPENROUTER_RATE_LIMIT_COOLDOWN_MS;
}

function resolveOpenRouterModels(cfg = {}) {
  const configuredModels = Array.isArray(cfg.openrouterModels) ? cfg.openrouterModels : String(process.env.OPENROUTER_MODEL || cfg.openrouterModel || "").split(",").map((entry) => entry.trim()).filter(Boolean);
  const sanitizedModels = configuredModels.map((entry) => String(entry || "").trim()).filter(Boolean).filter((entry) => !GENERIC_OPENROUTER_MODEL_ALIASES.has(entry.toLowerCase()));
  return sanitizedModels.length ? sanitizedModels : DEFAULT_OPENROUTER_MODELS;
}

function pickNextOptionTarget(client, cfg = {}) {
  const minOptions = clampOptionCount(cfg.minOptions, 4);
  const maxOptions = Math.max(minOptions, clampOptionCount(cfg.maxOptions, 5));
  const lowMax = Math.min(maxOptions, Math.max(minOptions, 4));
  const midMin = Math.max(minOptions, 5);
  const midMax = Math.min(maxOptions, 6);
  const highMin = Math.max(minOptions, 7);

  const pools = [];
  if (minOptions <= lowMax) pools.push({ key: "low", min: minOptions, max: lowMax });
  if (midMin <= midMax) pools.push({ key: "mid", min: midMin, max: midMax });
  if (highMin <= maxOptions) pools.push({ key: "high", min: highMin, max: maxOptions });
  if (!pools.length) return minOptions;

  const lastBand = String(client?._autoPollLastBand || "");
  let candidates = pools.filter((band) => band.key !== lastBand);
  if (!candidates.length) candidates = pools;
  const chosenBand = candidates[Math.floor(Math.random() * candidates.length)];
  const target = pickRandomFromRange(chosenBand.min, chosenBand.max);
  if (client) {
    client._autoPollLastBand = chosenBand.key;
    client._autoPollLastOptionCount = target;
  }
  return target;
}

function applyOptionCount(payload, cfg = {}, forcedTargetOptions = null) {
  if (!payload) return null;
  const minOptions = clampOptionCount(cfg.minOptions, 4);
  const maxOptions = Math.max(minOptions, clampOptionCount(cfg.maxOptions, 6));
  const targetOptions = Number.isFinite(Number(forcedTargetOptions)) ? Math.max(minOptions, Math.min(maxOptions, Math.floor(Number(forcedTargetOptions)))) : maxOptions;
  const answers = Array.isArray(payload.answers) ? payload.answers.map((x) => normalizeText(String(x || ""))).filter(Boolean) : [];
  if (answers.length < minOptions) return null;
  return {
    question: normalizeText(String(payload.question || "")),
    answers: shuffle(answers).slice(0, targetOptions),
  };
}

function getRomeDayBounds(now = new Date()) {
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit", });
  const parts = fmt.formatToParts(now).reduce((acc, part) => { if (part.type !== "literal") acc[part.type] = part.value; return acc; }, {});
  const year = Number(parts.year || 0);
  const month = Number(parts.month || 1);
  const day = Number(parts.day || 1);
  const startRome = createUtcFromRomeLocal(year, month, day, 0, 0, 0);
  const endRome = createUtcFromRomeLocal(year, month, day + 1, 0, 0, 0);
  return { startRome, endRome };
}

function getRomeTimeParts(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-GB", { timeZone: TIMEZONE, hour: "2-digit", minute: "2-digit", hour12: false, });
  const parts = formatter.formatToParts(date);
  const hour = Number(parts.find((part) => part.type === "hour")?.value || 0,);
  const minute = Number(parts.find((part) => part.type === "minute")?.value || 0,);
  return {
    hour: Number.isFinite(hour) ? hour : 0,
    minute: Number.isFinite(minute) ? minute : 0,
  };
}

function isWithinAutoPollWindow(now = new Date(), cfg = {}) {
  const startHour = Number.isFinite(Number(cfg?.windowStartHour)) ? Number(cfg.windowStartHour) : DEFAULT_WINDOW_START_HOUR;
  const startMinute = Number.isFinite(Number(cfg?.windowStartMinute)) ? Number(cfg.windowStartMinute) : DEFAULT_WINDOW_START_MINUTE;
  const endHour = Number.isFinite(Number(cfg?.windowEndHour)) ? Number(cfg.windowEndHour) : DEFAULT_WINDOW_END_HOUR;
  const endMinute = Number.isFinite(Number(cfg?.windowEndMinute)) ? Number(cfg.windowEndMinute) : DEFAULT_WINDOW_END_MINUTE;
  const { hour, minute } = getRomeTimeParts(now);
  const nowTotal = hour * 60 + minute;
  const startTotal = startHour * 60 + startMinute;
  const endTotal = endHour * 60 + endMinute;
  return nowTotal >= startTotal && nowTotal <= endTotal;
}

function getRomeOffsetMs(utcDate) {
  const formatter = new Intl.DateTimeFormat("en-US", { timeZone: TIMEZONE, timeZoneName: "shortOffset", hour: "2-digit", });
  const zoneName = formatter.formatToParts(utcDate).find((part) => part.type === "timeZoneName")?.value;
  const match = String(zoneName || "GMT+0").match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/i,);
  if (!match) return 0;
  const sign = match[1] === "-" ? -1 : 1;
  const hours = Number(match[2] || 0);
  const minutes = Number(match[3] || 0);
  return sign * (hours * 60 + minutes) * 60 * 1000;
}

function createUtcFromRomeLocal(year, month, day, hour, minute, second) {
  const baseUtcMs = Date.UTC(year, month - 1, day, hour, minute, second);
  const firstOffsetMs = getRomeOffsetMs(new Date(baseUtcMs));
  let utcMs = baseUtcMs - firstOffsetMs;
  const secondOffsetMs = getRomeOffsetMs(new Date(utcMs));
  if (secondOffsetMs !== firstOffsetMs) utcMs = baseUtcMs - secondOffsetMs;
  return new Date(utcMs);
}

function buildLocalAttualitaPoll(cfg = {}, forcedTargetOptions = null) {
  const picked = pickRandom(LOCAL_ATTUALITA_POLLS);
  if (!picked) return null;
  return applyOptionCount(
    {
      question: picked.question,
      answers: picked.answers,
    },
    cfg,
    forcedTargetOptions,
  );
}

function buildPollSignature(question, answers = []) {
  const q = normalizeText(String(question || "")).toLowerCase();
  const opts = Array.isArray(answers) ? answers.map((a) => normalizeText(String(a || "")).toLowerCase()).filter(Boolean) : [];
  const uniq = Array.from(new Set(opts)).sort();
  return `${q}||${uniq.join("|")}`;
}

async function hasManualPollToday(guildId) {
  const { startRome, endRome } = getRomeDayBounds();
  const count = await Poll.countDocuments({ guildId: String(guildId), domanda: { $ne: COUNTER_FILTER_QUESTION }, $or: [{ source: "manual" }, { source: { $exists: false } }], createdAt: { $gte: startRome, $lt: endRome }, }).catch(() => 0);
  return Number(count || 0) > 0;
}

async function hasAutoPollToday(guildId) {
  const { startRome, endRome } = getRomeDayBounds();
  const count = await Poll.countDocuments({ guildId: String(guildId), domanda: { $ne: COUNTER_FILTER_QUESTION }, source: "auto", createdAt: { $gte: startRome, $lt: endRome }, }).catch(() => 0);
  return Number(count || 0) > 0;
}

async function isDuplicateQuestion(guildId, question) {
  const normalized = normalizeText(question).toLowerCase();
  if (!normalized) return true;
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const existing = await Poll.findOne({
    guildId: String(guildId), domanda: { $regex: new RegExp(`^${escaped}$`, "i") },
    $or: [{ source: { $in: ["manual", "auto"] } }, { source: { $exists: false } }],
  }).lean().catch(() => null);
  return Boolean(existing);
}

async function isDuplicatePollContent(guildId, payload) {
  const signature = buildPollSignature(payload?.question, payload?.answers);
  if (!signature || signature === "||") return true;
  const rows = await Poll.find({ guildId: String(guildId), domanda: { $ne: COUNTER_FILTER_QUESTION }, $or: [{ source: { $in: ["manual", "auto"] } }, { source: { $exists: false } }], }, { domanda: 1, risposta1: 1, risposta2: 1, risposta3: 1, risposta4: 1, risposta5: 1, risposta6: 1, risposta7: 1, risposta8: 1, risposta9: 1, risposta10: 1, },).sort({ createdAt: -1, _id: -1 }).limit(400).lean().catch(() => []);

  for (const row of rows) {
    const rowAnswers = [row?.risposta1, row?.risposta2, row?.risposta3, row?.risposta4, row?.risposta5, row?.risposta6, row?.risposta7, row?.risposta8, row?.risposta9, row?.risposta10,];
    if (buildPollSignature(row?.domanda, rowAnswers) === signature) return true;
  }
  return false;
}

function extractStructuredText(responseData) {
  if (responseData && typeof responseData.output_text === "string") {
    return responseData.output_text;
  }
  const output = Array.isArray(responseData?.output) ? responseData.output : [];
  for (const item of output) {
    const content = Array.isArray(item?.content) ? item.content : [];
    for (const entry of content) {
      if (typeof entry?.text === "string" && entry.text.trim()) return entry.text;
    }
  }
  return "";
}

function unwrapJsonTextBlock(value) {
  const text = String(value || "").trim();
  if (!text) return "";
  const fencedMatch = text.match(/^```(?:json)?\s*([\s\S]*?)\s*```$/i);
  if (fencedMatch?.[1]) return fencedMatch[1].trim();
  return text;
}

function validateGeneratedPollPayload(payload, cfg = {}, forcedTargetOptions = null) {
  const question = normalizeText(payload?.question);
  const rawAnswers = Array.isArray(payload?.answers) ? payload.answers : [];
  const answers = [];
  const seen = new Set();

  for (const entry of rawAnswers) {
    const answer = normalizeText(entry);
    const key = answer.toLowerCase();
    if (!answer || seen.has(key)) continue;
    seen.add(key);
    answers.push(answer);
  }

  if (!question || question.length < 12 || question.length > 120) return null;
  if (!/\?$/.test(question)) return null;
  if (/qual e la tua opinione su/i.test(question)) return null;
  if (/quale museo nazionale/i.test(question)) return null;
  if (answers.length < 4) return null;
  if (answers.some((answer) => answer.length < 2 || answer.length > 55)) return null;

  return applyOptionCount({ question, answers }, cfg, forcedTargetOptions);
}

async function fetchPollFromOpenRouter(cfg = {}, forcedTargetOptions = null) {
  const apiKey = String(process.env.OPENROUTER_API_KEY || "").trim();
  if (!apiKey) return null;
  if (isOpenRouterCoolingDown()) return null;

  const models = resolveOpenRouterModels(cfg);
  if (!models.length) return null;
  const optionCount = Math.max(4, Math.min(6, Number(forcedTargetOptions || 5)));
  let lastError = null;

  for (const model of models) {
    const payload = {
      model, messages: [{ role: "system", content: "Genera sondaggi su argomenti di attualità per utenti italiani. " + "Scrivi solo in italiano naturale. " + "Le domande devono riguardare temi di attualità: cronaca, società, politica, ambiente, lavoro, tecnologia, economia, salute, diritti, Europa, media e informazione. " + "Le risposte devono essere coerenti tra loro, plausibili, corte e senza duplicati. " + "Non usare risposte meta come 'dipende', 'altro', 'non so' salvo se davvero sensate. " + "Non usare riferimenti a Discord, community, server o chat. " + "Non usare il formato 'Qual e la tua opinione su ...'. " + "Restituisci solo JSON valido con le chiavi question e answers.", }, {
        role: "user", content: `Genera un poll con ${optionCount} risposte.` +
          " Target: pubblico italiano." +
          " La domanda deve essere su un tema di attualità (cronaca, società, politica, ambiente, lavoro, tecnologia, economia, salute, diritti, media)." +
          " Domanda breve, chiara e che inviti a rispondere con opzioni concrete e realistiche." +
          ' Rispondi solo con JSON: {"question":"...","answers":["..."]}.',
      },
      ],
      max_tokens: 220,
      temperature: 0.7,
    };

    try {
      const response = await axios.post(OPENROUTER_API_URL, payload, {
        timeout: 20000, headers: {
          Authorization: `Bearer ${apiKey}`,
          "Content-Type": "application/json",
          "HTTP-Referer": "https://viniliecaffe.local",
          "X-Title": "Vinili e Caffe Bot",
        },
      });

      const choice = response?.data?.choices?.[0] || null;
      const finishReason = String(choice?.finish_reason || "");
      const content = choice?.message?.content || extractStructuredText(response?.data);
      if (!String(content || "").trim()) {
        lastError = new Error(`Empty OpenRouter content for model ${model} (${finishReason || "no_finish_reason"})`);
        continue;
      }

      const parsed = JSON.parse(unwrapJsonTextBlock(content) || "{}");
      const validated = validateGeneratedPollPayload(parsed, cfg, forcedTargetOptions);
      if (validated) return validated;

      lastError = new Error(`Invalid OpenRouter payload for model ${model}`);
    } catch (error) {
      const status = Number(error?.response?.status || 0);
      if (status === 429) startOpenRouterCooldown();
      if (status === 400) {
        const detail = error?.response?.data?.error?.message || error?.response?.data?.message || error?.response?.data;
        warnPollOpenRouter("OpenRouter 400 for model " + model + ":", detail || error?.message);
        lastError = error;
        continue;
      }
      if ([404, 429, 500, 502, 503, 504].includes(status)) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  if (lastError) {
    warnPollOpenRouter("all OpenRouter model attempts failed:", lastError?.message || lastError);
  }
  return null;
}

async function fetchPollFromOpenRouterWithRetry(cfg = {}, forcedTargetOptions = null) {
  const maxRounds = Math.max(1, Math.min(10, Math.floor(Number(cfg.openrouterRetryRounds || OPENROUTER_MAX_ROUNDS))),);
  const retryDelayMs = Math.max(0, Math.min(10000, Math.floor(Number(cfg.openrouterRetryDelayMs || OPENROUTER_RETRY_DELAY_MS))),);

  for (let round = 0; round < maxRounds; round += 1) {
    if (isOpenRouterCoolingDown()) break;
    const payload = await fetchPollFromOpenRouter(cfg, forcedTargetOptions).catch((error) => { global.logger?.warn?.("[poll.auto] OpenRouter round failed:", error?.message || error); return null; });
    if (payload?.question && Array.isArray(payload?.answers) && payload.answers.length >= 4) {
      return payload;
    }
    if (isOpenRouterCoolingDown()) break;
    if (round < maxRounds - 1 && retryDelayMs > 0) {
      await sleep(retryDelayMs);
    }
  }

  if (isOpenRouterCoolingDown()) {
    warnPollOpenRouter("OpenRouter cooling down after rate limit, falling back to local.");
  } else {
    warnPollOpenRouter("OpenRouter retries exhausted, falling back to local.");
  }
  return null;
}

async function pickPollCandidate(cfg = {}, forcedTargetOptions = null) {
  const configuredSources = Array.isArray(cfg.sources) && cfg.sources.length ? cfg.sources.map((v) => String(v || "").trim().toLowerCase()).filter(Boolean) : DEFAULT_SOURCES;
  const sources = shuffle(configuredSources.length ? configuredSources : DEFAULT_SOURCES);

  for (const source of sources) {
    let candidate = null;

    if (source === "openrouter") {
      candidate = await fetchPollFromOpenRouterWithRetry(cfg, forcedTargetOptions).catch((error) => {
        global.logger?.warn?.("[poll.auto] openrouter generation failed:", error?.message || error);
        return null;
      });
      if (!candidate) candidate = buildLocalAttualitaPoll(cfg, forcedTargetOptions);
    }

    if (!candidate && source === "local") {
      candidate = buildLocalAttualitaPoll(cfg, forcedTargetOptions);
    }

    if (candidate?.question && Array.isArray(candidate?.answers)) return candidate;
  }

  return buildLocalAttualitaPoll(cfg, forcedTargetOptions);
}

async function runAutoPoll(client) {
  const channelId = IDs.channels?.polls;
  if (!channelId) return;
  const pollChannel = client.channels.cache.get(channelId) || (await getClientChannelCached(client, String(channelId))) || (await client.channels.fetch(String(channelId)).catch(() => null));
  if (!pollChannel?.guild?.id || !pollChannel.isTextBased?.()) {
    return;
  }
  const guild = pollChannel.guild;

  if (await hasManualPollToday(guild.id)) return;
  if (await hasAutoPollToday(guild.id)) return;

  const cfg = client?.config?.autoPoll || {};
  if (cfg.enabled === false) return;
  if (!isWithinAutoPollWindow(new Date(), cfg)) return;

  const optionTarget = pickNextOptionTarget(client, cfg);
  let payload = null;

  for (let i = 0; i < 3; i += 1) {
    const candidate = await pickPollCandidate(cfg, optionTarget);
    if (!candidate?.question || !Array.isArray(candidate.answers) || candidate.answers.length < 4) {
      continue;
    }
    if (await isDuplicateQuestion(guild.id, candidate.question)) continue;
    if (await isDuplicatePollContent(guild.id, candidate)) continue;
    payload = candidate;
    break;
  }

  if (!payload) return;

  const result = await createPollForGuild(guild, { question: payload.question, answers: payload.answers, source: "auto", });
  if (!result?.ok) {
    global.logger?.warn?.("[poll.auto] createPollForGuild failed:", result?.error || "unknown");
  }
}

function startAutoPollLoop(client) {
  if (client._autoPollTask?.stop) {
    try {
      client._autoPollTask.stop();
    } catch (err) {
      global.logger?.warn?.("[autoPoll] ", err?.message || err);
    }
  }

  client._autoPollTask = cron.schedule(
    "0 20 * * *",
    () => {
      runAutoPoll(client).catch((error) => {
        global.logger?.error?.("[poll.auto] run failed:", error);
      });
    },
    { timezone: TIMEZONE },
  );
}

module.exports = { startAutoPollLoop, runAutoPoll };