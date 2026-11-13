import { SITE_ORIGIN } from "./site";
import { apiUrl } from "./api";

/** Classifiche bot (partnership): GET /webhooks/site-bots-leaderboard */

export type BotsBoardId = "servers" | "partners" | "join";
export type BotsPeriodId = "total" | "weekly" | "daily";

export const BOTS_BOARDS: { id: BotsBoardId; label: string; hint: string }[] = [
  { id: "servers", label: "Server", hint: "I server con più partnership fatte con Vinili." },
  { id: "partners", label: "Partner manager", hint: "Chi ha fatto più partnership sul server principale." },
  { id: "join", label: "Ingressi", hint: "I server che hanno portato più persone con le partnership." },
];

export const BOTS_PERIODS: { id: BotsPeriodId; label: string }[] = [
  { id: "total", label: "Sempre" },
  { id: "weekly", label: "Settimana" },
  { id: "daily", label: "Oggi" },
];

export type BotsLeaderRow = {
  rank: number;
  id: string;
  displayName: string;
  username?: string | null;
  avatarUrl?: string | null;
  inviteUrl?: string | null;
  score: number;
  isSelf: boolean;
  kind: "user" | "guild";
};

export type BotsLeaderPage = {
  board: BotsBoardId;
  period: BotsPeriodId;
  page: number;
  totalPages: number;
  total: number;
  unit: string;
  rows: BotsLeaderRow[];
  self: BotsLeaderRow | null;
};

export function botsBoardUnit(board: BotsBoardId): string {
  return board === "join" ? "ingressi" : "partnership";
}

function mapRow(raw: unknown, category: BotsBoardId): BotsLeaderRow | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const isUser = category === "partners" || r.userId != null;
  const id = String(isUser ? r.userId : r.guildId || "").trim();
  if (!id) return null;
  const displayName = String((isUser ? r.displayName : r.name) || id).trim();
  const username = isUser ? String(r.username || "").trim() : "";
  return {
    rank: Number(r.rank) || 0,
    id,
    displayName,
    username: username && username !== displayName ? username : null,
    avatarUrl: String((isUser ? r.avatarUrl : r.iconUrl) || "").trim() || null,
    inviteUrl: r.inviteUrl ? String(r.inviteUrl) : null,
    score: Math.max(0, Number(r.score) || 0),
    isSelf: r.isSelf === true,
    kind: isUser ? "user" : "guild",
  };
}

export async function loadBotsBoard(
  board: BotsBoardId,
  page = 1,
  opts: { origin?: string; period?: BotsPeriodId; perPage?: number; userId?: string } = {},
): Promise<BotsLeaderPage | null> {
  const period = opts.period ?? "total";
  const q = new URLSearchParams({
    category: board,
    period,
    page: String(page),
    perPage: String(opts.perPage ?? 10),
  });
  if (opts.userId) q.set("userId", opts.userId);
  try {
    const base = opts.origin ?? "";
    const url = base
      ? `${base.replace(/\/$/, "")}/webhooks/site-bots-leaderboard?${q}`
      : apiUrl(`/webhooks/site-bots-leaderboard?${q}`);
    const r = await fetch(url, { cache: "no-store" });
    const j = (await r.json().catch(() => null)) as Record<string, unknown> | null;
    if (!j?.ok || !Array.isArray(j.rows)) return null;
    const cat = (["servers", "partners", "join"].includes(String(j.category)) ? j.category : board) as BotsBoardId;
    const periodOut = (["total", "weekly", "daily"].includes(String(j.period)) ? j.period : period) as BotsPeriodId;
    return {
      board: cat,
      period: periodOut,
      page: Number(j.page) || page,
      totalPages: Number(j.totalPages) || 1,
      total: Number(j.total) || j.rows.length,
      unit: j.unit === "joins" ? "ingressi" : "partnership",
      rows: j.rows.map((row) => mapRow(row, cat)).filter((x): x is BotsLeaderRow => Boolean(x)),
      self: mapRow(j.self, cat),
    };
  } catch {
    return null;
  }
}

export const loadBuildBotsBoard = () => loadBotsBoard("servers", 1, { origin: SITE_ORIGIN, period: "total" });

const nf = new Intl.NumberFormat("it-IT");
export const botsFmt = (n?: number) => nf.format(Math.round(n ?? 0));

export function botsMetric(rows: BotsLeaderRow[], row: BotsLeaderRow, unit: string): { main: string; sub?: string; pct: number } {
  const max = rows.reduce((m, r) => Math.max(m, r.score), 0) || row.score || 1;
  return {
    main: botsFmt(row.score),
    sub: unit,
    pct: max > 0 ? Math.max(2, Math.min(100, Math.round((row.score / max) * 100))) : 0,
  };
}
