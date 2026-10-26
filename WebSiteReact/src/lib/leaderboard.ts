import { SITE_ORIGIN } from "./site";

// Classifiche: GET /webhooks/site-users?board=…&page=…&perPage=…[&userId=…]

export type BoardId = "level" | "weekly" | "messages" | "voice" | "minigames";

export const BOARDS: { id: BoardId; label: string; unit: string }[] = [
  { id: "level", label: "Livello", unit: "EXP" },
  { id: "weekly", label: "Settimanale", unit: "EXP settimana" },
  { id: "messages", label: "Messaggi", unit: "messaggi" },
  { id: "voice", label: "Vocale", unit: "ore in vocale" },
  { id: "minigames", label: "Minigames", unit: "EXP minigames" },
];

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
  messagesTotal?: number;
  messagesWeekly?: number;
  messagesWeeklyBarPct?: number;
  voiceTotalSeconds?: number;
  voiceWeeklySeconds?: number;
  voiceWeeklyBarPct?: number;
  minigameTotalExp?: number;
  bestStreak?: number;
  minigameBarPct?: number;
};

export type LeaderPage = {
  board: BoardId;
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
  opts: { origin?: string; userId?: string; perPage?: number } = {},
): Promise<LeaderPage | null> {
  const q = new URLSearchParams({ board, page: String(page), perPage: String(opts.perPage ?? PER_PAGE) });
  if (opts.userId) {
    q.set("userId", opts.userId);
    q.set("id", opts.userId);
    q.set("searchUserId", opts.userId);
  }
  try {
    const r = await fetch(`${opts.origin ?? ""}/webhooks/site-users?${q}`, { cache: "no-store" });
    const j = await r.json();
    if (!j?.ok || !Array.isArray(j.rows)) return null;
    return {
      board,
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

export const loadBuildBoard = () => loadBoard("level", 1, { origin: SITE_ORIGIN });

const nf = new Intl.NumberFormat("it-IT");
export const fmt = (n?: number) => nf.format(Math.round(n ?? 0));
export const hours = (s?: number) => nf.format(Math.round((s ?? 0) / 3600));

/** Valore principale e barra per ogni classifica. */
export function metric(board: BoardId, r: LeaderRow): { main: string; sub?: string; pct: number } {
  switch (board) {
    case "level":
      return { main: `Lv. ${r.level ?? 0}`, sub: `${fmt(r.exp)} EXP`, pct: r.progressPercent ?? 0 };
    case "weekly":
      return { main: `${fmt(r.weeklyExp)} EXP`, sub: `Lv. ${r.level ?? 0}`, pct: r.weeklyBarPct ?? 0 };
    case "messages":
      return { main: fmt(r.messagesTotal), sub: `${fmt(r.messagesWeekly)} questa settimana`, pct: r.messagesWeeklyBarPct ?? 0 };
    case "voice":
      return { main: `${hours(r.voiceTotalSeconds)} h`, sub: `${hours(r.voiceWeeklySeconds)} h questa settimana`, pct: r.voiceWeeklyBarPct ?? 0 };
    case "minigames":
      return { main: `${fmt(r.minigameTotalExp)} EXP`, sub: `serie migliore ${r.bestStreak ?? 0}`, pct: r.minigameBarPct ?? 0 };
  }
}
