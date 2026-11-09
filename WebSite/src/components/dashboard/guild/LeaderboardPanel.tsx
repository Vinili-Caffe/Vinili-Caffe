"use client";

import { useEffect, useState } from "react";
import { ChevronLeft, ChevronRight, Crown, ExternalLink } from "lucide-react";
import { cn } from "@/lib/cn";
import { Notice, Subnav, miniBtn } from "./bits";

// API: GET /webhooks/site-dashboard/guilds/:id/leaderboard?category=&period=&page=
// Handler: MultiGuild/site/dashboard/siteDashboardLeaderboardApi.ts

type Category = "servers" | "partners" | "join";
type Period = "total" | "weekly" | "daily";

type Row = {
  rank: number;
  id: string;
  name: string;
  sub: string | null;
  iconUrl: string | null;
  inviteUrl: string | null;
  score: number;
  isSelf: boolean;
};

type Board = { rows: Row[]; self: Row | null; page: number; totalPages: number; total: number; unit: string };

const CATEGORIES: { id: Category; label: string; hint: string }[] = [
  { id: "servers", label: "Server", hint: "I server con più partnership fatte con Vinili." },
  { id: "partners", label: "Partner manager", hint: "Chi ha fatto più partnership in questo server." },
  { id: "join", label: "Ingressi", hint: "I server che hanno portato più persone con le partnership." },
];

const PERIODS: { id: Period; label: string }[] = [
  { id: "total", label: "Sempre" },
  { id: "weekly", label: "Settimana" },
  { id: "daily", label: "Oggi" },
];

function mapRow(raw: unknown): Row | null {
  if (!raw || typeof raw !== "object") return null;
  const r = raw as Record<string, unknown>;
  const isUser = r.userId != null;
  const id = String(isUser ? r.userId : r.guildId || "").trim();
  if (!id) return null;
  const name = String((isUser ? r.displayName : r.name) || id).trim();
  const username = isUser ? String(r.username || "").trim() : "";
  return {
    rank: Number(r.rank) || 0,
    id,
    name,
    sub: username && username !== name && username !== id ? `@${username}` : null,
    iconUrl: String((isUser ? r.avatarUrl : r.iconUrl) || "").trim() || null,
    inviteUrl: r.inviteUrl ? String(r.inviteUrl) : null,
    score: Math.max(0, Number(r.score) || 0),
    isSelf: r.isSelf === true,
  };
}

async function loadBoard(token: string, guildId: string, category: Category, period: Period, page: number): Promise<{ ok: true; board: Board } | { ok: false; message: string }> {
  try {
    const qs = new URLSearchParams({ category, period, page: String(page), perPage: "12", _: String(Date.now()) });
    const r = await fetch(`/webhooks/site-dashboard/guilds/${encodeURIComponent(guildId)}/leaderboard?${qs}`, {
      cache: "no-store",
      credentials: "omit",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    });
    const d = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (r.status !== 200 || d.ok === false) {
      return { ok: false, message: typeof d.message === "string" ? d.message : "Classifica non disponibile." };
    }
    const rows = (Array.isArray(d.rows) ? d.rows : []).map(mapRow).filter((x): x is Row => Boolean(x));
    return {
      ok: true,
      board: {
        rows,
        self: mapRow(d.self),
        page: Number(d.page) || 1,
        totalPages: Math.max(1, Number(d.totalPages) || 1),
        total: Number(d.total) || 0,
        unit: d.unit === "joins" ? "ingressi" : "partnership",
      },
    };
  } catch {
    return { ok: false, message: "Errore di rete." };
  }
}

const MEDAL = ["text-[#f2c14e]", "text-[#c9ced6]", "text-[#d08a52]"];

function RankRow({ row, unit, max }: { row: Row; unit: string; max: number }) {
  const pct = max > 0 ? Math.max(4, Math.round((row.score / max) * 100)) : 0;
  return (
    <li className={cn("relative flex items-center gap-3 px-4 py-2.5", row.isSelf && "bg-caramel/[0.08]")}>
      <span className="w-7 shrink-0 text-center font-display text-lg font-semibold tabular-nums text-crema/70">
        {row.rank <= 3 ? <Crown className={cn("mx-auto size-4.5", MEDAL[row.rank - 1])} aria-label={`${row.rank}°`} /> : row.rank}
      </span>
      {row.iconUrl ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img src={row.iconUrl} alt="" width={36} height={36} className="size-9 shrink-0 rounded-full object-cover ring-1 ring-sand/15" />
      ) : (
        <span className="flex size-9 shrink-0 items-center justify-center rounded-full bg-crema/[0.08] text-sm font-bold text-crema/80" aria-hidden>
          {(row.name.charAt(0) || "?").toUpperCase()}
        </span>
      )}
      <div className="min-w-0 flex-1">
        <p className="flex items-center gap-1.5 text-sm font-semibold text-crema">
          <span className="truncate">{row.name}</span>
          {row.isSelf ? <span className="shrink-0 rounded bg-caramel/20 px-1 py-px text-[0.6rem] font-bold uppercase text-ember">Tu</span> : null}
          {row.inviteUrl ? (
            <a href={row.inviteUrl} target="_blank" rel="noreferrer" className="shrink-0 text-crema/60 transition hover:text-crema" aria-label={`Invito di ${row.name}`}>
              <ExternalLink className="size-3.5" />
            </a>
          ) : null}
        </p>
        <div className="mt-1 h-1 overflow-hidden rounded-full bg-crema/[0.07]" aria-hidden>
          <div className={cn("h-full rounded-full", row.rank === 1 ? "bg-ember" : "bg-caramel/60")} style={{ width: `${pct}%` }} />
        </div>
      </div>
      <span className="shrink-0 text-right">
        <span className="block font-semibold tabular-nums text-crema">{row.score.toLocaleString("it-IT")}</span>
        <span className="block text-[0.65rem] text-crema/60">{unit}</span>
      </span>
    </li>
  );
}

export function LeaderboardPanel({ guildId, token }: { guildId: string; token: string }) {
  const [category, setCategory] = useState<Category>("servers");
  const [period, setPeriod] = useState<Period>("total");
  const [page, setPage] = useState(1);
  const [state, setState] = useState<{ loading: boolean; error: string; board: Board | null }>({ loading: true, error: "", board: null });

  useEffect(() => {
    let cancelled = false;
    void loadBoard(token, guildId, category, period, page).then((res) => {
      if (cancelled) return;
      setState(res.ok ? { loading: false, error: "", board: res.board } : { loading: false, error: res.message, board: null });
    });
    return () => {
      cancelled = true;
    };
  }, [token, guildId, category, period, page]);

  const pick = <T,>(set: (v: T) => void) => (v: T) => {
    set(v);
    setPage(1);
    setState((s) => ({ ...s, loading: true }));
  };

  const board = state.board;
  const cat = CATEGORIES.find((c) => c.id === category)!;
  const max = board?.rows.reduce((m, r) => Math.max(m, r.score), 0) || 0;
  const selfOutside = board?.self && !board.rows.some((r) => r.id === board.self?.id);

  return (
    <div className="space-y-4">
      <Subnav tabs={CATEGORIES.map((c) => ({ id: c.id, label: c.label }))} value={category} onChange={pick(setCategory)} label="Tipo di classifica" />

      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-crema/70">{cat.hint}</p>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-espresso/70 p-1 ring-1 ring-sand/10" role="radiogroup" aria-label="Periodo">
          {PERIODS.map((p) => (
            <button
              key={p.id}
              type="button"
              role="radio"
              aria-checked={period === p.id}
              onClick={() => pick(setPeriod)(p.id)}
              className={cn(
                "rounded-md px-3 py-1 text-xs font-semibold transition-colors",
                period === p.id ? "bg-mocha text-crema ring-1 ring-sand/15" : "text-crema/60 hover:text-crema",
              )}
            >
              {p.label}
            </button>
          ))}
        </div>
      </div>

      {state.error ? (
        <Notice>{state.error}</Notice>
      ) : state.loading && !board ? (
        <div className="space-y-1.5" aria-busy>
          {Array.from({ length: 6 }, (_, i) => (
            <div key={i} className="h-14 animate-pulse rounded-lg bg-crema/[0.04]" />
          ))}
        </div>
      ) : board && board.rows.length === 0 ? (
        <p className="rounded-xl border border-dashed border-sand/20 px-4 py-10 text-center text-sm text-crema/60">
          {category === "partners" ? "Nessun partner manager in classifica per questo periodo." : "Nessun dato per questo periodo."}
        </p>
      ) : board ? (
        <div className={cn("transition-opacity", state.loading && "opacity-60")}>
          <ol className="divide-y divide-sand/[0.07] overflow-hidden rounded-xl bg-espresso/45 ring-1 ring-sand/10">
            {board.rows.map((r) => (
              <RankRow key={r.id} row={r} unit={board.unit} max={max} />
            ))}
          </ol>
          {selfOutside && board.self ? (
            <div className="mt-2 overflow-hidden rounded-xl bg-espresso/45 ring-1 ring-caramel/30">
              <p className="px-4 pt-2 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-crema/60">{category === "partners" ? "La tua posizione" : "Questo server"}</p>
              <ol>
                <RankRow row={board.self} unit={board.unit} max={max} />
              </ol>
            </div>
          ) : null}
          {board.totalPages > 1 ? (
            <div className="mt-3 flex items-center justify-between gap-2">
              <span className="text-xs tabular-nums text-crema/60">
                Pagina {board.page} di {board.totalPages} · {board.total} in classifica
              </span>
              <div className="flex gap-1.5">
                <button type="button" className={miniBtn} disabled={board.page <= 1 || state.loading} onClick={() => setPage((p) => Math.max(1, p - 1))} aria-label="Pagina precedente">
                  <ChevronLeft className="size-3.5" />
                </button>
                <button type="button" className={miniBtn} disabled={board.page >= board.totalPages || state.loading} onClick={() => setPage((p) => p + 1)} aria-label="Pagina successiva">
                  <ChevronRight className="size-3.5" />
                </button>
              </div>
            </div>
          ) : null}
        </div>
      ) : null}
    </div>
  );
}
