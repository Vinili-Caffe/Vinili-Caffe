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
  return "alltime";
}

/** board+period effettivi per ranking (board=weekly legacy → level+weekly). */
function resolveRankBoardPeriod(board?, period?) {
  const b = String(board || "level");
  const p = parsePeriod(period);
  if (b === "weekly") return { board: "level", period: "weekly", rowBoard: "weekly" };
  if (b === "level" && p === "weekly") return { board: "level", period: "weekly", rowBoard: "weekly" };
  if (b === "level" && p === "monthly") return { board: "level", period: "monthly", rowBoard: "monthly" };
  return { board: b, period: p, rowBoard: b };
}

function isComputedListBoard(rankBoard?, rankPeriod?) {
  if (rankBoard === "level" && (rankPeriod === "weekly" || rankPeriod === "monthly")) return true;
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

function boardQuery(board?, guildId?, period?) {
  const p = parsePeriod(period);
  const g = { guildId, "profile.totals.exp.totalExp": { $gt: 0 } };
  if (board === "level") return g;
  if (board === "weekly") return { ...g, "profile.totals.exp.weeklyExp": { $gt: 0 } };
  if (board === "messages") {
    if (p === "weekly") return { ...g, "profile.totals.messagesWeekly": { $gt: 0 } };
    return { ...g, "profile.totals.messagesTotal": { $gt: 0 } };
  }
  if (board === "voice") {
    if (p === "weekly") return { ...g, "profile.totals.voiceWeeklySeconds": { $gt: 0 } };
    return { ...g, "profile.totals.voiceTotalSeconds": { $gt: 0 } };
  }
  if (board === "minigames") {
    if (p === "weekly") return { guildId, "profile.totals.exp.minigame.weeklyExp": { $gt: 0 } };
    return { guildId, "profile.totals.exp.minigame.totalExp": { $gt: 0 } };
  }
  return g;
}

function boardSort(board?, period?) {
  const p = parsePeriod(period);
  if (board === "level") return { "profile.totals.exp.totalExp": -1 };
  if (board === "weekly") return { "profile.totals.exp.weeklyExp": -1 };
  if (board === "messages") {
    if (p === "weekly") return { "profile.totals.messagesWeekly": -1 };
    return { "profile.totals.messagesTotal": -1 };
  }
  if (board === "voice") {
    if (p === "weekly") return { "profile.totals.voiceWeeklySeconds": -1 };
    return { "profile.totals.voiceTotalSeconds": -1 };
  }
  if (board === "minigames") {
    if (p === "weekly") return { "profile.totals.exp.minigame.weeklyExp": -1 };
    return { "profile.totals.exp.minigame.totalExp": -1 };
  }
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
    return sanitizeToLong("$profile.totals.messagesTotal");
  }
  if (board === "voice") {
    if (p === "weekly") return sanitizeToLong("$profile.totals.voiceWeeklySeconds");
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

export = { parseIntSafe, nInt, resolveGuildId, parseBoard, parsePeriod, resolveRankBoardPeriod, isComputedListBoard, parseCalendarMonth, parseCalendarYear, boardQuery, boardSort, boardSelect, numericSortExpr, parseSearchUserId };
