import { SITE_ORIGIN } from "./site";

// Classifiche: GET /webhooks/site-users?board=…&period=…&page=…&perPage=…[&userId=…]

export type BoardId = "level" | "messages" | "voice" | "minigames";
export type PeriodId = "alltime" | "weekly" | "monthly";

export const BOARDS: { id: BoardId; label: string }[] = [
  { id: "level", label: "Livello" },
  { id: "messages", label: "Messaggi" },
  { id: "voice", label: "Vocale" },
  { id: "minigames", label: "Minigames" },
];

export const PERIODS: { id: PeriodId; label: string }[] = [
  { id: "alltime", label: "All-Time" },
  { id: "weekly", label: "Settimanale" },
  { id: "monthly", label: "Mensile" },
];

export function boardUnit(board: BoardId, period: PeriodId): string {
  switch (board) {
    case "level":
      return period === "weekly" ? "EXP settimana" : period === "monthly" ? "EXP mese" : "EXP";
    case "messages":
      return period === "weekly" ? "messaggi settimana" : period === "monthly" ? "messaggi mese" : "messaggi";
    case "voice":
      return period === "weekly" ? "ore settimana" : period === "monthly" ? "ore mese" : "ore in vocale";
    case "minigames":
      return period === "weekly" ? "EXP minigames settimana" : period === "monthly" ? "EXP minigames mese" : "EXP minigames";
  }
}

export type LeaderRow = {
  rank: number;
  userId: string;
  displayName: string;
  username?: string;
  avatarUrl?: string;
  level?: number;
  exp?: number;
  progressPercent?: number;
  weeklyExp?: number;
  weeklyBarPct?: number;
  monthlyExp?: number;
  monthlyBarPct?: number;
  messagesTotal?: number;
  messagesWeekly?: number;
  messagesMonthly?: number;
  messagesWeeklyBarPct?: number;
  voiceTotalSeconds?: number;
  voiceWeeklySeconds?: number;
  voiceMonthlySeconds?: number;
  voiceWeeklyBarPct?: number;
  minigameTotalExp?: number;
  minigameWeeklyExp?: number;
  bestStreak?: number;
  minigameBarPct?: number;
};

export type LeaderPage = {
  board: BoardId;
  period: PeriodId;
  page: number;
  totalPages: number;
  total: number;
  membersApprox?: number;
  rows: LeaderRow[];
  notFound?: boolean;
};

export const PER_PAGE = 10;

export async function loadBoard(
  board: BoardId,
  page = 1,
  opts: { origin?: string; userId?: string; perPage?: number; period?: PeriodId } = {},
): Promise<LeaderPage | null> {
  const period = opts.period ?? "alltime";
  const q = new URLSearchParams({
    board,
    period,
    page: String(page),
    perPage: String(opts.perPage ?? PER_PAGE),
  });
  if (opts.userId) {
    q.set("userId", opts.userId);
    q.set("id", opts.userId);
    q.set("searchUserId", opts.userId);
  }
  try {
    const r = await fetch(`${opts.origin ?? ""}/webhooks/site-users?${q}`, { cache: "no-store" });
    const j = await r.json();
    if (!j?.ok || !Array.isArray(j.rows)) return null;
    const periodOut = (["alltime", "weekly", "monthly"].includes(String(j.period)) ? j.period : period) as PeriodId;
    return {
      board,
      period: periodOut,
      page: Number(j.page) || page,
      totalPages: Number(j.totalPages) || 1,
      total: Number(j.total) || j.rows.length,
      membersApprox: j.stats?.membersApprox,
      rows: j.rows,
      notFound: !!j.notFound,
    };
  } catch {
    return null;
  }
}

export const loadBuildBoard = () => loadBoard("level", 1, { origin: SITE_ORIGIN, period: "alltime" });

const nf = new Intl.NumberFormat("it-IT");
export const fmt = (n?: number) => nf.format(Math.round(n ?? 0));
export const hours = (s?: number) => nf.format(Math.round((s ?? 0) / 3600));

/** Valore principale e barra per board + periodo attivo. */
export function metric(board: BoardId, period: PeriodId, r: LeaderRow): { main: string; sub?: string; pct: number } {
  switch (board) {
    case "level":
      if (period === "weekly") {
        return { main: `${fmt(r.weeklyExp)} EXP`, sub: `Lv. ${r.level ?? 0}`, pct: r.weeklyBarPct ?? 0 };
      }
      if (period === "monthly") {
        return { main: `${fmt(r.monthlyExp)} EXP`, sub: `Lv. ${r.level ?? 0}`, pct: r.monthlyBarPct ?? 0 };
      }
      return { main: `Lv. ${r.level ?? 0}`, sub: `${fmt(r.exp)} EXP`, pct: r.progressPercent ?? 0 };
    case "messages":
      if (period === "weekly") {
        return { main: fmt(r.messagesWeekly), pct: r.messagesWeeklyBarPct ?? 0 };
      }
      if (period === "monthly") {
        return { main: fmt(r.messagesMonthly), pct: r.messagesWeeklyBarPct ?? 0 };
      }
      return { main: fmt(r.messagesTotal), pct: r.messagesWeeklyBarPct ?? 0 };
    case "voice":
      if (period === "weekly") {
        return { main: `${hours(r.voiceWeeklySeconds)} h`, pct: r.voiceWeeklyBarPct ?? 0 };
      }
      if (period === "monthly") {
        return { main: `${hours(r.voiceMonthlySeconds)} h`, pct: r.voiceWeeklyBarPct ?? 0 };
      }
      return { main: `${hours(r.voiceTotalSeconds)} h`, pct: r.voiceWeeklyBarPct ?? 0 };
    case "minigames":
      if (period === "weekly") {
        return { main: `${fmt(r.minigameWeeklyExp)} EXP`, sub: `serie migliore ${r.bestStreak ?? 0}`, pct: r.minigameBarPct ?? 0 };
      }
      if (period === "monthly") {
        return { main: `${fmt(0)} EXP`, sub: "mensile non disponibile", pct: 0 };
      }
      return { main: `${fmt(r.minigameTotalExp)} EXP`, sub: `serie migliore ${r.bestStreak ?? 0}`, pct: r.minigameBarPct ?? 0 };
  }
}
