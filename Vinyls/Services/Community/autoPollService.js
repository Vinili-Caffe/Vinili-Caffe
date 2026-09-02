const cron = require("node-cron");
const axios = require("axios");
const Poll = require("../../Schemas/Poll/pollSchema");
const IDs = require("../../Utils/Config/ids");
const { createPollForGuild } = require("../../Commands/Admin/poll");
const { LOCAL_POLLS_BANK } = require("../../Data/Polls/autoPollLocalBank");
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
const DEFAULT_OPENROUTER_RETRY_UNTIL_HOUR = 22;
const DEFAULT_DUPLICATE_LOOKBACK_DAYS = 21;
const DEFAULT_MAX_CANDIDATE_ATTEMPTS = 80;
const AUTO_POLL_RETRY_MS = 2 * 60 * 1000;
const AUTO_POLL_RETRY_JITTER_MS = 20_000;
const AUTO_POLL_NO_PAYLOAD_RETRY_MS = 15 * 60 * 1000;
const AUTO_POLL_NO_PAYLOAD_LOG_COOLDOWN_MS = 30 * 60 * 1000;
const AUTO_POLL_CRON_HOUR = 20;
const AUTO_POLL_CRON_MINUTE = 0;
const AUTO_POLL_RECOVERY_START_DELAY_MS = 12_000;
const AUTO_POLL_OPENROUTER_MAX_WAIT_MS = 45_000;
const DEFAULT_AUTO_POLL_SLOTS = [
  { hour: 14, minute: 30, key: "1430" },
  { hour: 20, minute: 0, key: "2000" },
];
const MIN_MAX_CANDIDATE_ATTEMPTS = 5;
const ABS_MAX_CANDIDATE_ATTEMPTS = 250;
const GENERIC_OPENROUTER_MODEL_ALIASES = new Set(["openrouter/free", "openrouter/auto"]);
let openRouterCooldownUntil = 0;

function resolveMinOptions(cfg = {}) {
  return clampOptionCount(cfg.minOptions, 2);
}

function resolveMaxOptions(cfg = {}) {
  const min = resolveMinOptions(cfg);
  return Math.max(min, clampOptionCount(cfg.maxOptions, 6));
}

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

function startOpenRouterCooldownWithRetryAfter(retryAfterMs) {
  const ms = Number.isFinite(Number(retryAfterMs)) ? Math.max(0, Number(retryAfterMs)) : OPENROUTER_RATE_LIMIT_COOLDOWN_MS;
  openRouterCooldownUntil = Date.now() + ms;
}

function parseRetryAfterMs(headers) {
  const retryAfterRaw = headers?.["retry-after"] || headers?.["Retry-After"];
  if (!retryAfterRaw) return null;

  if (typeof retryAfterRaw === "string") {
    const asNum = Number(retryAfterRaw);
    if (Number.isFinite(asNum) && asNum > 0) return asNum * 1000;
    const parsed = Date.parse(retryAfterRaw);
    if (Number.isFinite(parsed)) return Math.max(0, parsed - Date.now());
  }
  return null;
}

function resolveOpenRouterModels(cfg = {}) {
  const configuredModels = Array.isArray(cfg.openrouterModels) ? cfg.openrouterModels : String(process.env.OPENROUTER_MODEL || cfg.openrouterModel || "").split(",").map((entry) => entry.trim()).filter(Boolean);
  const sanitizedModels = configuredModels.map((entry) => String(entry || "").trim()).filter(Boolean).filter((entry) => !GENERIC_OPENROUTER_MODEL_ALIASES.has(entry.toLowerCase()));
  return sanitizedModels.length ? sanitizedModels : DEFAULT_OPENROUTER_MODELS;
}

function pickNextOptionTarget(client, cfg = {}) {
  const minOptions = resolveMinOptions(cfg);
  const maxOptions = resolveMaxOptions(cfg);
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

function applyOptionCount(payload, cfg = {}, forcedTargetOptions = null, options = {}) {
  if (!payload) return null;
  const shuffleAnswers = options.shuffleAnswers !== false;
  const minOptions = resolveMinOptions(cfg);
  const maxOptions = resolveMaxOptions(cfg);
  const targetOptions = Number.isFinite(Number(forcedTargetOptions)) ? Math.max(minOptions, Math.min(maxOptions, Math.floor(Number(forcedTargetOptions)))) : maxOptions;
  let answers = Array.isArray(payload.answers) ? payload.answers.map((x) => normalizeText(String(x || ""))).filter(Boolean) : [];
  if (answers.length < minOptions) return null;
  if (shuffleAnswers) answers = shuffle(answers);
  answers = answers.slice(0, targetOptions);
  return {
    question: normalizeText(String(payload.question || "")),
    answers,
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

function getDuplicateLookbackStart(cfg = {}) {
  const rawDays = Number(cfg?.duplicateLookbackDays);
  const days = Number.isFinite(rawDays)
    ? Math.max(1, Math.min(365, Math.floor(rawDays)))
    : DEFAULT_DUPLICATE_LOOKBACK_DAYS;
  return new Date(Date.now() - days * 24 * 60 * 60 * 1000);
}

function resolveMaxCandidateAttempts(cfg = {}) {
  const raw = Number(cfg?.maxCandidateAttempts);
  if (!Number.isFinite(raw)) return DEFAULT_MAX_CANDIDATE_ATTEMPTS;
  return Math.max(
    MIN_MAX_CANDIDATE_ATTEMPTS,
    Math.min(ABS_MAX_CANDIDATE_ATTEMPTS, Math.floor(raw)),
  );
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

function getAutoPollWindowBounds(cfg = {}) {
  const startHour = Number.isFinite(Number(cfg?.windowStartHour)) ? Number(cfg.windowStartHour) : DEFAULT_WINDOW_START_HOUR;
  const startMinute = Number.isFinite(Number(cfg?.windowStartMinute)) ? Number(cfg.windowStartMinute) : DEFAULT_WINDOW_START_MINUTE;
  const endHour = Number.isFinite(Number(cfg?.windowEndHour)) ? Number(cfg.windowEndHour) : DEFAULT_WINDOW_END_HOUR;
  const endMinute = Number.isFinite(Number(cfg?.windowEndMinute)) ? Number(cfg.windowEndMinute) : DEFAULT_WINDOW_END_MINUTE;
  return {
    startTotal: startHour * 60 + startMinute,
    endTotal: endHour * 60 + endMinute,
  };
}

function isWithinAutoPollWindow(now = new Date(), cfg = {}) {
  const { startTotal, endTotal } = getAutoPollWindowBounds(cfg);
  const { hour, minute } = getRomeTimeParts(now);
  const nowTotal = hour * 60 + minute;
  return nowTotal >= startTotal && nowTotal <= endTotal;
}

function getAutoPollScheduleParts(cfg = {}) {
  const hRaw = Number(cfg?.scheduleHour);
  const mRaw = Number(cfg?.scheduleMinute);
  const hour = Number.isFinite(hRaw) ? Math.min(23, Math.max(0, Math.floor(hRaw))) : AUTO_POLL_CRON_HOUR;
  const minute = Number.isFinite(mRaw) ? Math.min(59, Math.max(0, Math.floor(mRaw))) : AUTO_POLL_CRON_MINUTE;
  return { hour, minute };
}

function buildAutoPollCronExpression(cfg = {}) {
  const { hour, minute } = getAutoPollScheduleParts(cfg);
  return `${minute} ${hour} * * *`;
}

function isRomeTimeOnOrAfterDailyTrigger(now = new Date(), cfg = {}) {
  const { hour, minute } = getAutoPollScheduleParts(cfg);
  const triggerTotal = hour * 60 + minute;
  const { hour: rh, minute: rm } = getRomeTimeParts(now);
  return rh * 60 + rm >= triggerTotal;
}

function canRunAutoPollNow(now = new Date(), cfg = {}, catchUp = false) {
  if (isWithinAutoPollWindow(now, cfg)) return true;
  if (!catchUp) return false;
  const { startTotal } = getAutoPollWindowBounds(cfg);
  const { hour, minute } = getRomeTimeParts(now);
  const nowTotal = hour * 60 + minute;
  return nowTotal >= startTotal;
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

function msUntilRomeLocalHourDeadline(deadlineHour) {
  const h = Math.floor(Number(deadlineHour));
  if (!Number.isFinite(h) || h < 0 || h > 23) return 0;
  const now = new Date();
  const fmt = new Intl.DateTimeFormat("en-CA", { timeZone: TIMEZONE, year: "numeric", month: "2-digit", day: "2-digit" });
  const parts = fmt.formatToParts(now).reduce((acc, part) => {
    if (part.type !== "literal") acc[part.type] = part.value;
    return acc;
  }, {});
  const y = Number(parts.year || 0);
  const mo = Number(parts.month || 1);
  const d = Number(parts.day || 1);
  const targetUtc = createUtcFromRomeLocal(y, mo, d, h, 0, 0);
  return Math.max(0, targetUtc.getTime() - now.getTime());
}

function buildLocalAttualitaPoll(cfg = {}, forcedTargetOptions = null) {
  const picked = pickRandom(LOCAL_POLLS_BANK);
  if (!picked) return null;
  return applyOptionCount(
    { question: picked.question, answers: picked.answers },
    cfg,
    forcedTargetOptions,
    { shuffleAnswers: false },
  );
}

async function pickNonDuplicateLocalPoll(guildId, cfg = {}, forcedTargetOptions = null) {
  const order = shuffle([...Array(LOCAL_POLLS_BANK.length).keys()]);
  for (const idx of order) {
    const picked = LOCAL_POLLS_BANK[idx];
    if (!picked) continue;
    const candidate = applyOptionCount(
      { question: picked.question, answers: picked.answers },
      cfg,
      forcedTargetOptions,
      { shuffleAnswers: false },
    );
    if (!candidate?.question || !Array.isArray(candidate.answers) || candidate.answers.length < resolveMinOptions(cfg)) {
      continue;
    }
    if (await isDuplicateQuestion(guildId, candidate.question)) continue;
    return candidate;
  }
  return pickLocalPollByOldestReuse(guildId, cfg, forcedTargetOptions);
}

async function pickLocalPollByOldestReuse(guildId, cfg = {}, forcedTargetOptions = null) {
  const lookbackStart = getDuplicateLookbackStart(cfg);
  const rows = await Poll.find(
    {
      guildId: String(guildId),
      domanda: { $ne: COUNTER_FILTER_QUESTION },
      $or: [{ source: { $in: ["manual", "auto"] } }, { source: { $exists: false } }],
      createdAt: { $gte: lookbackStart },
    },
    { domanda: 1, createdAt: 1 },
  )
    .lean()
    .catch(() => []);

  const lastUsedByQuestion = new Map();
  for (const row of rows) {
    const key = normalizeText(String(row?.domanda || "")).toLowerCase();
    if (!key) continue;
    const ts = new Date(row?.createdAt || 0).getTime();
    if (!Number.isFinite(ts)) continue;
    const prev = lastUsedByQuestion.get(key) || 0;
    if (ts > prev) lastUsedByQuestion.set(key, ts);
  }

  const ranked = LOCAL_POLLS_BANK.map((picked, idx) => {
    const key = normalizeText(String(picked?.question || "")).toLowerCase();
    return {
      idx,
      picked,
      lastUsed: key ? (lastUsedByQuestion.get(key) || 0) : 0,
    };
  }).sort((a, b) => a.lastUsed - b.lastUsed);

  for (const entry of ranked) {
    const candidate = applyOptionCount(
      { question: entry.picked.question, answers: entry.picked.answers },
      cfg,
      forcedTargetOptions,
      { shuffleAnswers: false },
    );
    if (!candidate?.question || !Array.isArray(candidate.answers) || candidate.answers.length < resolveMinOptions(cfg)) {
      continue;
    }
    return candidate;
  }
  return buildLocalAttualitaPoll(cfg, forcedTargetOptions);
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

function resolveAutoPollSlots(cfg = {}) {
  const raw = Array.isArray(cfg.slots) ? cfg.slots : [];
  const parsed = raw
    .map((slot) => {
      const hourRaw = Number(slot?.hour);
      const minuteRaw = Number(slot?.minute);
      const hour = Number.isFinite(hourRaw) ? Math.min(23, Math.max(0, Math.floor(hourRaw))) : null;
      const minute = Number.isFinite(minuteRaw) ? Math.min(59, Math.max(0, Math.floor(minuteRaw))) : null;
      const key = String(slot?.key || "").trim() || (hour != null && minute != null ? `${hour}${String(minute).padStart(2, "0")}` : "");
      if (hour == null || minute == null || !key) return null;
      return { hour, minute, key, total: hour * 60 + minute };
    })
    .filter(Boolean);
  if (parsed.length) {
    return parsed.sort((a, b) => a.total - b.total);
  }
  const { hour, minute } = getAutoPollScheduleParts(cfg);
  return [{ hour, minute, key: `${hour}${String(minute).padStart(2, "0")}`, total: hour * 60 + minute }];
}

function getSlotEndTotal(slot, allSlots) {
  const idx = allSlots.findIndex((entry) => entry.key === slot.key);
  const next = idx >= 0 ? allSlots[idx + 1] : null;
  if (next) return next.total - 1;
  return 23 * 60 + 59;
}

function canRunAutoPollForSlot(now = new Date(), slot, allSlots, catchUp = false) {
  if (!slot) return false;
  const { hour, minute } = getRomeTimeParts(now);
  const nowTotal = hour * 60 + minute;
  const startTotal = slot.total;
  const endTotal = getSlotEndTotal(slot, allSlots);
  if (catchUp) return nowTotal >= startTotal && nowTotal <= endTotal;
  return nowTotal >= startTotal && nowTotal <= Math.min(endTotal, startTotal + 10);
}

function isRomeTimeOnOrAfterSlot(now = new Date(), slot) {
  if (!slot) return false;
  const { hour, minute } = getRomeTimeParts(now);
  return hour * 60 + minute >= slot.total;
}

function buildAutoPollCronExpressionForSlot(slot) {
  return `${slot.minute} ${slot.hour} * * *`;
}

function resolveAutoPollSlot(cfg = {}, slotKey = "") {
  const slots = resolveAutoPollSlots(cfg);
  const key = String(slotKey || "").trim();
  if (key) {
    const match = slots.find((slot) => slot.key === key);
    if (match) return match;
  }
  return slots[0] || null;
}

async function hasAutoPollTodayForSlot(guildId, slotKey) {
  const key = String(slotKey || "").trim();
  if (!key) return false;
  const { startRome, endRome } = getRomeDayBounds();
  const count = await Poll.countDocuments({
    guildId: String(guildId),
    domanda: { $ne: COUNTER_FILTER_QUESTION },
    source: "auto",
    autoSlot: key,
    createdAt: { $gte: startRome, $lt: endRome },
  }).catch(() => 0);
  return Number(count || 0) > 0;
}

async function getTodayAutoPollQuestions(guildId) {
  const { startRome, endRome } = getRomeDayBounds();
  const rows = await Poll.find({
    guildId: String(guildId),
    domanda: { $ne: COUNTER_FILTER_QUESTION },
    source: "auto",
    createdAt: { $gte: startRome, $lt: endRome },
  }, { domanda: 1 }).lean().catch(() => []);
  return new Set(
    rows
      .map((row) => normalizeText(String(row?.domanda || "")).toLowerCase())
      .filter(Boolean),
  );
}

async function isDuplicateQuestionToday(guildId, question, todayQuestions = null) {
  const normalized = normalizeText(question).toLowerCase();
  if (!normalized) return true;
  const set = todayQuestions || (await getTodayAutoPollQuestions(guildId));
  return set.has(normalized);
}

async function isDuplicateQuestion(guildId, question) {
  const normalized = normalizeText(question).toLowerCase();
  if (!normalized) return true;
  const escaped = normalized.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
  const lookbackStart = getDuplicateLookbackStart();
  const existing = await Poll.findOne({
    guildId: String(guildId),
    domanda: { $regex: new RegExp(`^${escaped}$`, "i") },
    $or: [{ source: { $in: ["manual", "auto"] } }, { source: { $exists: false } }],
    createdAt: { $gte: lookbackStart },
  }).lean().catch(() => null);
  return Boolean(existing);
}

async function isDuplicatePollContent(guildId, payload) {
  const signature = buildPollSignature(payload?.question, payload?.answers);
  if (!signature || signature === "||") return true;
  const lookbackStart = getDuplicateLookbackStart();
  const rows = await Poll.find({ guildId: String(guildId), domanda: { $ne: COUNTER_FILTER_QUESTION }, $or: [{ source: { $in: ["manual", "auto"] } }, { source: { $exists: false } }], }, { domanda: 1, risposta1: 1, risposta2: 1, risposta3: 1, risposta4: 1, risposta5: 1, risposta6: 1, risposta7: 1, risposta8: 1, risposta9: 1, risposta10: 1, },).sort({ createdAt: -1, _id: -1 }).limit(400).lean().catch(() => []);
  const scopedRows = rows.filter((row) => {
    const created = new Date(row?.createdAt || 0).getTime();
    return Number.isFinite(created) && created >= lookbackStart.getTime();
  });

  for (const row of scopedRows) {
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
  const fillerAnswerRe =
    /^(altro|dipende|non so|boh|idk|n\/a|nessuna|nessuno|tutte|entrambe|nessuna delle (?:precedenti|seguenti)|tutte le (?:precedenti|seguenti)|non mi interessa|preferisco non rispondere)$/i;

  for (const entry of rawAnswers) {
    const answer = normalizeText(entry);
    const key = answer.toLowerCase();
    if (!answer || seen.has(key)) continue;
    if (fillerAnswerRe.test(answer)) continue;
    seen.add(key);
    answers.push(answer);
  }

  if (!question || question.length < 10 || question.length > 140) return null;
  if (!/\?$/.test(question)) return null;
  if (/qual e la tua opinione su/i.test(question)) return null;
  if (/:\s*[^?]+\?$/.test(question)) return null;
  if (answers.length < resolveMinOptions(cfg)) return null;
  if (answers.some((answer) => answer.length < 1 || answer.length > 70)) return null;

  const qLower = question.toLowerCase();
  for (const answer of answers) {
    const aLower = answer.toLowerCase();
    if (aLower.length >= 5 && qLower.includes(aLower)) return null;
  }

  return applyOptionCount({ question, answers }, cfg, forcedTargetOptions);
}

async function fetchPollFromOpenRouter(cfg = {}, forcedTargetOptions = null) {
  const apiKey = String(process.env.OPENROUTER_API_KEY || "").trim();
  if (!apiKey) return null;
  if (isOpenRouterCoolingDown()) return null;

  const models = resolveOpenRouterModels(cfg);
  if (!models.length) return null;
  const optionCount = Math.max(
    resolveMinOptions(cfg),
    Math.min(resolveMaxOptions(cfg), Number(forcedTargetOptions || pickRandomFromRange(resolveMinOptions(cfg), Math.min(6, resolveMaxOptions(cfg))))),
  );
  let lastError = null;
  let had429 = false;

  for (const model of models) {
    if (isOpenRouterCoolingDown()) break;
    const payload = {
      model, messages: [{ role: "system", content: "Genera sondaggi su attualità per utenti italiani. Regole: (1) Italiano naturale, domande brevi che invoglino a votare. (2) Evita generiche tipo 'Quanto sei preoccupato per X' o 'Qual è la tua opinione su Y'. (3) Preferisci scelte concrete, preferenze chiare, fatti recenti o trend. (4) Temi: cronaca, società, politica, ambiente, lavoro, tech, economia, salute, diritti, Europa, media. (5) Ogni risposta deve essere un'opzione concreta e distinta: MAI 'Altro', 'Dipende', 'Non so', 'Boh'. (6) La domanda NON deve ripetere o anticipare una risposta (vietato 'Cosa preferisci: uscire con amici?'). (7) Niente riferimenti a Discord o community. (8) Output solo JSON: {\"question\":\"...\",\"answers\":[\"...\"]}.", }, {
        role: "user", content: `Genera un poll con ${optionCount} risposte. Domanda neutra che non contiene già una delle opzioni. Esempi OK: 'In inverno preferisci uscire o restare in casa?', 'Quale fonte di notizie usi di più?'. Opzioni tutte diverse e specifiche. Solo JSON.`,
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
          "X-Title": "Vinili e Caffè Bot",
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
      const status = Number(error?.response?.status || error?.status || 0);
      const msg = String(error?.message || "");
      const is429 = status === 429 || /status code\s*429/i.test(msg) || /\b429\b/.test(msg);
      if (is429) {
        had429 = true;
        const retryAfterMs = parseRetryAfterMs(error?.response?.headers || error?.headers);
        if (retryAfterMs != null) startOpenRouterCooldownWithRetryAfter(retryAfterMs);
        else startOpenRouterCooldown();
      }
      if (status === 400) {
        lastError = error;
        continue;
      }
      if (is429) {
        lastError = error;
        break;
      }
      if ([404, 429, 500, 502, 503, 504].includes(status)) {
        lastError = error;
        continue;
      }
      throw error;
    }
  }

  return null;
}

async function fetchPollFromOpenRouterWithRetry(cfg = {}, forcedTargetOptions = null, options = {}) {
  if (!String(process.env.OPENROUTER_API_KEY || "").trim()) return null;
  if (!resolveOpenRouterModels(cfg).length) return null;

  const maxRounds = Math.max(1, Math.min(10, Math.floor(Number(cfg.openrouterRetryRounds || OPENROUTER_MAX_ROUNDS))),);
  const retryDelayMs = Math.max(0, Math.min(10000, Math.floor(Number(cfg.openrouterRetryDelayMs || OPENROUTER_RETRY_DELAY_MS))),);
  const rawDeadline = Number(cfg.openrouterRetryUntilHour);
  const deadlineHour = Number.isFinite(rawDeadline)
    ? Math.min(23, Math.max(0, Math.floor(rawDeadline)))
    : DEFAULT_OPENROUTER_RETRY_UNTIL_HOUR;
  const rawMaxWait = Number(options?.maxTotalMs ?? cfg?.openrouterAutoPollMaxWaitMs);
  const maxTotalMs = Number.isFinite(rawMaxWait) && rawMaxWait > 0
    ? Math.max(5_000, Math.min(5 * 60 * 1000, Math.floor(rawMaxWait)))
    : null;
  const startedAt = Date.now();

  while (msUntilRomeLocalHourDeadline(deadlineHour) > 0) {
    if (maxTotalMs != null && Date.now() - startedAt >= maxTotalMs) break;
    for (let round = 0; round < maxRounds; round += 1) {
      if (maxTotalMs != null && Date.now() - startedAt >= maxTotalMs) break;
      if (isOpenRouterCoolingDown()) break;
      const payload = await fetchPollFromOpenRouter(cfg, forcedTargetOptions).catch(() => null);
      if (payload?.question && Array.isArray(payload?.answers) && payload.answers.length >= resolveMinOptions(cfg)) {
        return payload;
      }
      if (isOpenRouterCoolingDown()) break;
      if (round < maxRounds - 1 && retryDelayMs > 0) {
        const cap = msUntilRomeLocalHourDeadline(deadlineHour);
        const waitMs = cap > 0 ? Math.min(retryDelayMs, cap) : retryDelayMs;
        if (maxTotalMs != null) {
          const remaining = maxTotalMs - (Date.now() - startedAt);
          if (remaining <= 0) break;
          await sleep(Math.min(waitMs, remaining));
        } else {
          await sleep(waitMs);
        }
      }
    }

    if (maxTotalMs != null && Date.now() - startedAt >= maxTotalMs) break;

    const untilDeadline = msUntilRomeLocalHourDeadline(deadlineHour);
    if (untilDeadline <= 0) break;

    if (isOpenRouterCoolingDown()) {
      const untilCool = Math.max(0, Number(openRouterCooldownUntil || 0) - Date.now());
      const sleepMs = Math.min(untilCool, untilDeadline);
      if (maxTotalMs != null) {
        const remaining = maxTotalMs - (Date.now() - startedAt);
        if (remaining <= 0) break;
        if (sleepMs > 0) await sleep(Math.min(sleepMs, remaining));
      } else if (sleepMs > 0) {
        await sleep(sleepMs);
      }
      continue;
    }

    const stagger = Math.min(retryDelayMs > 0 ? retryDelayMs : 1500, untilDeadline);
    if (maxTotalMs != null) {
      const remaining = maxTotalMs - (Date.now() - startedAt);
      if (remaining <= 0) break;
      if (stagger > 0) await sleep(Math.min(stagger, remaining));
    } else if (stagger > 0) {
      await sleep(stagger);
    }
  }

  return null;
}

function resolveAutoPollSources(cfg = {}) {
  const configuredSources = Array.isArray(cfg.sources) && cfg.sources.length
    ? cfg.sources.map((v) => String(v || "").trim().toLowerCase()).filter(Boolean)
    : DEFAULT_SOURCES;
  const rank = (source) => {
    if (source === "local") return 0;
    if (source === "openrouter") return 1;
    return 2;
  };
  return [...new Set(configuredSources.length ? configuredSources : DEFAULT_SOURCES)].sort(
    (a, b) => rank(a) - rank(b),
  );
}

async function pickPollCandidate(cfg = {}, forcedTargetOptions = null, guildId = "") {
  const sources = resolveAutoPollSources(cfg);
  const openRouterWaitMs = Number.isFinite(Number(cfg?.openrouterAutoPollMaxWaitMs))
    ? Number(cfg.openrouterAutoPollMaxWaitMs)
    : AUTO_POLL_OPENROUTER_MAX_WAIT_MS;

  for (const source of sources) {
    if (source === "local") {
      const local = guildId
        ? await pickNonDuplicateLocalPoll(guildId, cfg, forcedTargetOptions)
        : buildLocalAttualitaPoll(cfg, forcedTargetOptions);
      if (local?.question && Array.isArray(local?.answers)) return local;
    }

    if (source === "openrouter") {
      const candidate = await fetchPollFromOpenRouterWithRetry(cfg, forcedTargetOptions, {
        maxTotalMs: openRouterWaitMs,
      }).catch(() => null);
      if (candidate?.question && Array.isArray(candidate?.answers)) return candidate;
    }
  }

  return buildLocalAttualitaPoll(cfg, forcedTargetOptions);
}

function clearAutoPollRetryTimer(client) {
  try {
    if (client?._autoPollRetryTimer) clearTimeout(client._autoPollRetryTimer);
  } catch (_) {}
  client._autoPollRetryTimer = null;
}

function scheduleAutoPollRetry(client, reason = "", slotKey = "") {
  clearAutoPollRetryTimer(client);
  const baseDelay = String(reason || "") === "no_payload"
    ? AUTO_POLL_NO_PAYLOAD_RETRY_MS
    : AUTO_POLL_RETRY_MS;
  const jitter = Math.floor(Math.random() * (AUTO_POLL_RETRY_JITTER_MS + 1));
  const delay = baseDelay + jitter;
  const pendingSlot = String(slotKey || client?._autoPollPendingSlot || "").trim();
  if (pendingSlot) client._autoPollPendingSlot = pendingSlot;
  client._autoPollRetryTimer = setTimeout(() => {
    client._autoPollRetryTimer = null;
    const retrySlot = String(client?._autoPollPendingSlot || "").trim() || null;
    runAutoPollAndMaybeScheduleRetry(client, { catchUp: true, slotKey: retrySlot }).catch((error) => {
      global.logger?.error?.("[poll.auto] retry run failed:", error);
    });
  }, delay);
  client._autoPollRetryTimer.unref?.();
}

async function runAutoPollAndMaybeScheduleRetry(client, pollOpts = {}) {
  let outcome;
  try {
    outcome = await runAutoPoll(client, pollOpts);
  } catch (error) {
    global.logger?.error?.("[poll.auto] run failed:", error);
    outcome = { retry: true, reason: "exception", slotKey: pollOpts?.slotKey || null };
  }
  if (outcome?.retry) {
    scheduleAutoPollRetry(client, outcome?.reason, outcome?.slotKey || pollOpts?.slotKey);
  } else {
    clearAutoPollRetryTimer(client);
    client._autoPollPendingSlot = null;
  }
}

async function runRecoveryAutoPollIfNeeded(client) {
  const cfg = client?.config?.autoPoll || {};
  if (cfg.enabled === false) return;
  const chatChannelId = IDs.channels?.chat;
  if (!chatChannelId) return;
  const chatChannel =
    client.channels.cache.get(chatChannelId) ||
    (await getClientChannelCached(client, String(chatChannelId)));
  const gid = chatChannel?.guild?.id || chatChannel?.guildId;
  if (!gid) return;

  const slots = resolveAutoPollSlots(cfg);
  const now = new Date();
  for (const slot of slots) {
    if (!isRomeTimeOnOrAfterSlot(now, slot)) continue;
    if (!canRunAutoPollForSlot(now, slot, slots, true)) continue;
    if (await hasAutoPollTodayForSlot(gid, slot.key)) continue;
    global.logger?.info?.(
      `[poll.auto] recovery slot ${slot.key}: nessun poll automatico oggi, tento la pubblicazione.`,
    );
    await runAutoPollAndMaybeScheduleRetry(client, { catchUp: true, slotKey: slot.key });
    return;
  }
}

async function runAutoPoll(client, pollOpts = {}) {
  const cfg = client?.config?.autoPoll || {};
  const catchUp = Boolean(pollOpts.catchUp);
  const slots = resolveAutoPollSlots(cfg);
  const slot = resolveAutoPollSlot(cfg, pollOpts.slotKey);
  if (cfg.enabled === false) {
    return { retry: false, reason: "disabled", slotKey: slot?.key || null };
  }
  if (!slot) {
    return { retry: false, reason: "no_slot", slotKey: null };
  }

  const channelId = IDs.channels?.chat;
  if (!channelId) {
    return { retry: false, reason: "no_channel_id", slotKey: slot.key };
  }
  const pollChannel =
    client.channels.cache.get(channelId) ||
    (await getClientChannelCached(client, String(channelId))) ||
    (await client.channels.fetch(String(channelId)).catch(() => null));
  if (!pollChannel?.guild?.id || !pollChannel.isTextBased?.()) {
    return { retry: true, reason: "channel_resolve", slotKey: slot.key };
  }
  const guild = pollChannel.guild;

  if (await hasAutoPollTodayForSlot(guild.id, slot.key)) {
    return { retry: false, reason: "auto_exists", slotKey: slot.key };
  }

  if (!canRunAutoPollForSlot(new Date(), slot, slots, catchUp)) {
    return { retry: false, reason: "outside_window", slotKey: slot.key };
  }

  client._autoPollPendingSlot = slot.key;
  global.logger?.info?.(
    `[poll.auto] slot ${slot.key}: avvio pubblicazione${catchUp ? " (recovery)" : ""}.`,
  );
  const optionTarget = pickNextOptionTarget(client, cfg);
  let payload = null;
  const maxAttempts = resolveMaxCandidateAttempts(cfg);
  const todayQuestions = await getTodayAutoPollQuestions(guild.id);

  for (let i = 0; i < maxAttempts && !payload; i += 1) {
    if (i > 0 && i % 20 === 0) await sleep(300);
    const candidate = await pickPollCandidate(cfg, optionTarget, guild.id);
    if (!candidate?.question || !Array.isArray(candidate.answers) || candidate.answers.length < resolveMinOptions(cfg)) {
      continue;
    }
    if (await isDuplicateQuestion(guild.id, candidate.question)) continue;
    if (await isDuplicatePollContent(guild.id, candidate)) continue;
    if (await isDuplicateQuestionToday(guild.id, candidate.question, todayQuestions)) continue;
    payload = candidate;
  }

  if (!payload) {
    payload = await pickNonDuplicateLocalPoll(guild.id, cfg, optionTarget);
    if (payload && await isDuplicateQuestionToday(guild.id, payload.question, todayQuestions)) {
      payload = null;
    }
  }

  if (!payload) {
    const now = Date.now();
    const lastWarnAt = Number(client?._autoPollNoPayloadWarnAt || 0);
    if (!Number.isFinite(lastWarnAt) || now - lastWarnAt >= AUTO_POLL_NO_PAYLOAD_LOG_COOLDOWN_MS) {
      client._autoPollNoPayloadWarnAt = now;
      global.logger?.warn?.(
        `[poll.auto] slot ${slot.key}: impossibile costruire un poll valido, riprovo più tardi se resta la finestra.`,
      );
    }
    return { retry: true, reason: "no_payload", slotKey: slot.key };
  }

  const result = await createPollForGuild(guild, {
    question: payload.question,
    answers: payload.answers,
    source: "auto",
    autoSlot: slot.key,
    publishInChat: true,
    useNativePoll: false,
    skipThread: true,
    skipReactions: true,
    skipChatAlert: true,
  });
  if (!result?.ok) {
    global.logger?.warn?.("[poll.auto] createPollForGuild failed:", result?.error || "unknown");
    return { retry: true, reason: "create_failed", slotKey: slot.key };
  }
  global.logger?.info?.(
    `[poll.auto] slot ${slot.key}: poll #${result.pollNumber} pubblicato in chat (${result.messageId}).`,
  );
  return { retry: false, reason: "success", slotKey: slot.key };
}

function startAutoPollLoop(client) {
  if (Array.isArray(client._autoPollTasks)) {
    for (const task of client._autoPollTasks) {
      try {
        task?.stop?.();
      } catch (err) {
        global.logger?.warn?.("[autoPoll] stop task:", err?.message || err);
      }
    }
  }
  client._autoPollTasks = [];
  if (client._autoPollTask?.stop) {
    try {
      client._autoPollTask.stop();
    } catch (err) {
      global.logger?.warn?.("[autoPoll] ", err?.message || err);
    }
  }
  client._autoPollTask = null;
  clearAutoPollRetryTimer(client);

  const scheduleCfg = client?.config?.autoPoll || {};
  if (scheduleCfg.enabled !== false && !String(process.env.OPENROUTER_API_KEY || "").trim()) {
    global.logger?.info?.("[poll.auto] OPENROUTER_API_KEY assente: i sondaggi useranno il banco locale.");
  }
  const slots = resolveAutoPollSlots(scheduleCfg);
  global.logger?.info?.(
    `[poll.auto] banco locale: ${LOCAL_POLLS_BANK.length} domande; slot: ${slots.map((s) => `${String(s.hour).padStart(2, "0")}:${String(s.minute).padStart(2, "0")}`).join(", ")}.`,
  );

  for (const slot of slots) {
    const task = cron.schedule(
      buildAutoPollCronExpressionForSlot(slot),
      () => {
        clearAutoPollRetryTimer(client);
        void runAutoPollAndMaybeScheduleRetry(client, { catchUp: false, slotKey: slot.key }).catch((error) => {
          global.logger?.error?.("[poll.auto] run failed:", error);
        });
      },
      { timezone: TIMEZONE },
    );
    client._autoPollTasks.push(task);
  }

  const recoveryTimer = setTimeout(() => {
    runRecoveryAutoPollIfNeeded(client).catch((err) => {
      global.logger?.error?.("[poll.auto] recovery on start failed:", err);
    });
  }, AUTO_POLL_RECOVERY_START_DELAY_MS);
  recoveryTimer.unref?.();
}

module.exports = { startAutoPollLoop, runAutoPoll, runAutoPollAndMaybeScheduleRetry };