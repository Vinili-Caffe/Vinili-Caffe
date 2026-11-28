/** Classifiche utenti: parametri della richiesta e ordinamento nel database. */
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");

function parseIntSafe(v?, min?, max?, def?) {
  const n = parseInt(String(v || ""), 10);
  if (!Number.isFinite(n)) return def;
  return Math.min(max, Math.max(min, n));
}

function nInt(v?) {
  if (v == null || v === "") return 0;
  if (typeof v === "number" && Number.isFinite(v)) return Math.max(0, Math.floor(v));
  if (typeof v === "object" && v !== null && typeof v.toString === "function") {
    const x = Number(String(v.toString()).trim().replace(/[.,\s]/g, ""));
    return Number.isFinite(x) ? Math.max(0, Math.floor(x)) : 0;
  }
  const x = Number(String(v).trim().replace(/[.,\s]/g, ""));
  return Number.isFinite(x) ? Math.max(0, Math.floor(x)) : 0;
}

function resolveGuildId(client?) {
  return String(client?.config?.mainGuildId || IDs.guilds?.main || "").trim();
}

function parseBoard(raw?) {
  const b = String(raw || "level").trim().toLowerCase();
  if (b === "profile") return "profile";
  if (b === "birthdays") return "birthdays";
  if (b === "weekly" || b === "messages" || b === "voice" || b === "minigames" || b === "minigame") {
    return b === "minigame" ? "minigames" : b;
  }
  return "level";
}

function parsePeriod(raw?) {
  const p = String(raw || "alltime").trim().toLowerCase();
  if (p === "weekly" || p === "week" || p === "settimana" || p === "settimanale") return "weekly";
  if (p === "monthly" || p === "month" || p === "mese" || p === "mensile") return "monthly";
  if (p === "daily" || p === "day" || p === "oggi" || p === "giornaliero" || p === "giornaliera") return "daily";
  return "alltime";
}

/** board+period effettivi per ranking (board=weekly legacy → level+weekly). */
function resolveRankBoardPeriod(board?, period?) {
  const b = String(board || "level");
  const p = parsePeriod(period);
  if (b === "weekly") return { board: "level", period: "weekly", rowBoard: "weekly" };
  if (b === "level" && p === "weekly") return { board: "level", period: "weekly", rowBoard: "weekly" };
  if (b === "level" && p === "monthly") return { board: "level", period: "monthly", rowBoard: "monthly" };
  if (b === "level" && p === "daily") return { board: "level", period: "daily", rowBoard: "daily" };
  return { board: b, period: p, rowBoard: b };
}

function isComputedListBoard(rankBoard?, rankPeriod?) {
  if (rankBoard === "level" && (rankPeriod === "weekly" || rankPeriod === "monthly" || rankPeriod === "daily")) return true;
  if ((rankBoard === "messages" || rankBoard === "voice") && rankPeriod === "monthly") return true;
  return false;
}

function parseCalendarMonth(raw?, fallback?) {
  const n = Number.parseInt(String(raw || "").trim(), 10);
  if (Number.isFinite(n) && n >= 1 && n <= 12) return n;
  return fallback;
}

function parseCalendarYear(raw?, fallback?) {
  const n = Number.parseInt(String(raw || "").trim(), 10);
  if (Number.isFinite(n) && n >= 1970 && n <= 2100) return n;
  return fallback;
}

/** mgMonthly1: mese di Roma "YYYY-MM" — l'EXP mensile minigames vale solo se è del mese corrente */
function romeMonthKey(d = new Date()) {
  return new Intl.DateTimeFormat("en-CA", { timeZone: "Europe/Rome", year: "numeric", month: "2-digit" }).format(d).slice(0, 7);
}

/** campo dell'EXP minigames per il periodo */
function minigameField(period?) {
  const p = parsePeriod(period);
  return p === "weekly"
    ? "profile.totals.exp.minigame.weeklyExp"
    : p === "monthly"
      ? "profile.totals.exp.minigame.monthlyExp"
      : p === "daily"
        ? "profile.totals.exp.minigame.dailyExp"
        : "profile.totals.exp.minigame.totalExp";
}

/** EXP minigames del periodo (mese/giorno vecchio = 0) */
function minigameValue(doc?, period?) {
  const mg = doc?.profile?.totals?.exp?.minigame || {};
  const p = parsePeriod(period);
  if (p === "weekly") return nInt(mg.weeklyExp);
  if (p === "monthly") return mg.monthlyKey === romeMonthKey() ? nInt(mg.monthlyExp) : 0;
  if (p === "daily") {
    const { getRomeDayKey } = require("../../Community/utils/leaderboardHelpers") as typeof import("../../Community/utils/leaderboardHelpers");
    return mg.dailyKey === getRomeDayKey(new Date()) ? nInt(mg.dailyExp) : 0;
  }
  return nInt(mg.totalExp);
}

/** filtro "conta nel periodo" per le query minigames */
function minigameMatch(period?, min = 0) {
  const p = parsePeriod(period);
  const q: Record<string, any> = { [minigameField(p)]: { $gt: min } };
  if (p === "monthly") q["profile.totals.exp.minigame.monthlyKey"] = romeMonthKey();
  if (p === "daily") {
    const { getRomeDayKey } = require("../../Community/utils/leaderboardHelpers") as typeof import("../../Community/utils/leaderboardHelpers");
    q["profile.totals.exp.minigame.dailyKey"] = getRomeDayKey(new Date());
  }
  return q;
}

function boardQuery(board?, guildId?, period?) {
  const p = parsePeriod(period);
  const g = { guildId, "profile.totals.exp.totalExp": { $gt: 0 } };
  if (board === "level") return g;
  if (board === "weekly") return { ...g, "profile.totals.exp.weeklyExp": { $gt: 0 } };
  if (board === "messages") {
    if (p === "weekly") return { ...g, "profile.totals.messagesWeekly": { $gt: 0 } };
    if (p === "daily") {
      const { getRomeDayKey } = require("../../Community/utils/leaderboardHelpers") as typeof import("../../Community/utils/leaderboardHelpers");
      return {
        ...g,
        "profile.totals.messagesDailyKey": getRomeDayKey(new Date()),
        "profile.totals.messagesDaily": { $gt: 0 },
      };
    }
    return { ...g, "profile.totals.messagesTotal": { $gt: 0 } };
  }
  if (board === "voice") {
    if (p === "weekly") return { ...g, "profile.totals.voiceWeeklySeconds": { $gt: 0 } };
    if (p === "daily") {
      const { getRomeDayKey } = require("../../Community/utils/leaderboardHelpers") as typeof import("../../Community/utils/leaderboardHelpers");
      return {
        ...g,
        "profile.totals.voiceDailyKey": getRomeDayKey(new Date()),
        "profile.totals.voiceDailySeconds": { $gt: 0 },
      };
    }
    return { ...g, "profile.totals.voiceTotalSeconds": { $gt: 0 } };
  }
  if (board === "minigames") return { guildId, ...minigameMatch(p) };
  return g;
}

function boardSort(board?, period?) {
  const p = parsePeriod(period);
  if (board === "level") return { "profile.totals.exp.totalExp": -1 };
  if (board === "weekly") return { "profile.totals.exp.weeklyExp": -1 };
  if (board === "messages") {
    if (p === "weekly") return { "profile.totals.messagesWeekly": -1 };
    if (p === "daily") return { "profile.totals.messagesDaily": -1 };
    return { "profile.totals.messagesTotal": -1 };
  }
  if (board === "voice") {
    if (p === "weekly") return { "profile.totals.voiceWeeklySeconds": -1 };
    if (p === "daily") return { "profile.totals.voiceDailySeconds": -1 };
    return { "profile.totals.voiceTotalSeconds": -1 };
  }
  if (board === "minigames") return { [minigameField(p)]: -1 };
  return { "profile.totals.exp.totalExp": -1 };
}

function boardSelect() {
  return "userId profile.totals";
}

function numericSortExpr(board?, period?) {
  const p = parsePeriod(period);
  const sanitizeToLong = (fieldPath?) => ({
    $convert: {
      input: {
        $replaceAll: {
          input: {
            $replaceAll: {
              input: {
                $replaceAll: {
                  input: { $toString: fieldPath },
                  find: ".",
                  replacement: "",
                },
              },
              find: ",",
              replacement: "",
            },
          },
          find: " ",
          replacement: "",
        },
      },
      to: "long",
      onError: 0,
      onNull: 0,
    },
  });
  if (board === "messages") {
    if (p === "weekly") return sanitizeToLong("$profile.totals.messagesWeekly");
    if (p === "daily") return sanitizeToLong("$profile.totals.messagesDaily");
    return sanitizeToLong("$profile.totals.messagesTotal");
  }
  if (board === "voice") {
    if (p === "weekly") return sanitizeToLong("$profile.totals.voiceWeeklySeconds");
    if (p === "daily") return sanitizeToLong("$profile.totals.voiceDailySeconds");
    return sanitizeToLong("$profile.totals.voiceTotalSeconds");
  }
  return null;
}

function firstQueryString(val?) {
  if (val == null) return "";
  if (Array.isArray(val)) return String(val[0] ?? "").trim();
  return String(val).trim();
}

function parseSearchUserId(raw?) {
  const s = firstQueryString(raw).replace(/\D/g, "");
  if (!/^\d{17,20}$/.test(s)) return "";
  return s;
}

export = { romeMonthKey, minigameField, minigameValue, minigameMatch, parseIntSafe, nInt, resolveGuildId, parseBoard, parsePeriod, resolveRankBoardPeriod, isComputedListBoard, parseCalendarMonth, parseCalendarYear, boardQuery, boardSort, boardSelect, numericSortExpr, parseSearchUserId };
