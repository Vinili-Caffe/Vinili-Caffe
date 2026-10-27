"use client";

import { useCallback, useEffect, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import { Crosshair, Gamepad2, Loader2, MessageSquare, Mic, Search, Sparkles, TrendingUp, Trophy, X, type LucideIcon } from "lucide-react";
import { BOARDS, loadBoard, metric, type BoardId, type LeaderPage, type LeaderRow } from "@/lib/leaderboard";
import { useAuth } from "@/lib/auth";
import { page } from "@/lib/site";
import { cn } from "@/lib/cn";
import { useLiveRefresh } from "@/lib/use-live-refresh";
import { Avatar } from "@/components/Avatar";
import { Pagination } from "@/components/ui/Pagination";
import { ShowMoreButton } from "@/components/ui/ShowMore";

const BOARD_ICONS: Record<BoardId, LucideIcon> = {
  level: TrendingUp,
  weekly: Sparkles,
  messages: MessageSquare,
  voice: Mic,
  minigames: Gamepad2,
};

// i primi 3: oro, argento, bronzo
const PODIUM = [
  { label: "Disco d'oro", grooves: "#e9c46a", label2: "from-amber-200 to-amber-600", glow: "rgba(240,190,90,0.4)", ring: "ring-amber-300/55" },
  { label: "Disco d'argento", grooves: "#c5cad3", label2: "from-slate-100 to-slate-400", glow: "rgba(200,210,225,0.35)", ring: "ring-slate-200/50" },
  { label: "Disco di bronzo", grooves: "#cd7f32", label2: "from-orange-300 to-amber-800", glow: "rgba(205,127,50,0.35)", ring: "ring-orange-400/45" },
];

const profileHref = (id: string) => page(`/user/?id=${id}`);

function PodiumDisc({ row, place, board, me }: { row: LeaderRow; place: 0 | 1 | 2; board: BoardId; me: boolean }) {
  const p = PODIUM[place];
  const m = metric(board, row);
  const size = place === 0 ? "size-28 sm:size-52" : "size-24 sm:size-44";
  return (
    <motion.a
      href={profileHref(row.userId)}
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: [0.1, 0, 0.2][place], duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      whileHover="hover"
      className={cn("group flex min-w-0 flex-col items-center text-center", place === 0 ? "order-2 sm:-mt-6" : place === 1 ? "order-1" : "order-3")}
    >
      <div className="relative">
        <div className="absolute inset-[-14%] rounded-full blur-2xl" style={{ background: `radial-gradient(circle, ${p.glow}, transparent 65%)` }} />
        {/* il disco: gira solo all'hover (a riposo zero CPU) */}
        <motion.div
          variants={{ hover: { rotate: 180 } }}
          transition={{ duration: 1.6, ease: "easeInOut" }}
          className={cn("relative rounded-full shadow-[0_20px_40px_-15px_rgba(0,0,0,0.9)] ring-1", size, p.ring)}
          style={{
            background: `repeating-radial-gradient(circle, #0b0b0b 0 1.5px, #1b1b1b 1.5px 3px), radial-gradient(circle, transparent 60%, ${p.grooves}33 61%, transparent 75%)`,
            backgroundBlendMode: "screen",
          }}
        >
          <div
            className="absolute inset-0 rounded-full opacity-60 mix-blend-screen"
            style={{ background: `conic-gradient(from 0deg, transparent, ${p.grooves}55, transparent 30%, transparent 50%, ${p.grooves}44, transparent 80%)` }}
          />
          <div className={cn("absolute inset-[30%] overflow-hidden rounded-full bg-gradient-to-br p-[6%]", p.label2)}>
            <Avatar userId={row.userId} src={row.avatarUrl} name={row.displayName} className="size-full" />
          </div>
        </motion.div>
        <span
          className={cn(
            "absolute -bottom-1 left-1/2 flex size-7 -translate-x-1/2 text-base lining-nums sm:size-9 items-center justify-center rounded-full bg-gradient-to-br font-display text-lg font-bold text-espresso shadow-lg ring-2 ring-espresso",
            p.label2,
          )}
        >
          {row.rank}
        </span>
      </div>
      <p className="mt-4 text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-crema/45 sm:text-[0.68rem] sm:tracking-[0.25em]">{p.label}</p>
      <p className={cn("mt-1 max-w-full truncate font-display text-lg font-semibold sm:max-w-[12rem] sm:text-2xl", me && "text-ember")}>{row.displayName}</p>
      <p className="mt-0.5 text-sm font-semibold text-sand">{m.main}</p>
      {m.sub && <p className="text-xs text-crema/45">{m.sub}</p>}
    </motion.a>
  );
}

function Row({ row, board, me, flash }: { row: LeaderRow; board: BoardId; me: boolean; flash?: boolean }) {
  const m = metric(board, row);
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      id={`u-${row.userId}`}
      className={cn(
        "scroll-mt-32 border-b border-sand/10 last:border-b-0",
        me && "bg-caramel/[0.08]",
        flash && "bg-caramel/15",
      )}
    >
      <a href={profileHref(row.userId)} className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-crema/[0.04] sm:gap-4 sm:px-6">
        <span className="w-10 shrink-0 text-center font-mono text-sm tabular-nums text-crema/45">#{row.rank}</span>
        <Avatar userId={row.userId} src={row.avatarUrl} name={row.displayName} className="size-10 shrink-0" />
        <span className="min-w-0 flex-1">
          <span className={cn("block truncate font-medium", me ? "text-ember" : "text-crema")}>
            {row.displayName}
            {me && <span className="ml-2 rounded-full bg-caramel/20 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-ember">tu</span>}
          </span>
          {/* barra: verso il prossimo livello / rispetto al primo della settimana */}
          <span className="mt-1.5 block h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-crema/8">
            <motion.span
              className="block h-full rounded-full bg-gradient-to-r from-caramel to-ember"
              initial={{ width: 0 }}
              animate={{ width: `${Math.max(2, Math.min(100, m.pct))}%` }}
              transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
            />
          </span>
        </span>
        <span className="shrink-0 text-right">
          <span className="block font-semibold tabular-nums text-sand">{m.main}</span>
          {m.sub && <span className="hidden text-xs text-crema/45 sm:block">{m.sub}</span>}
        </span>
      </a>
    </motion.li>
  );
}

export function LeaderboardBrowser({ initial }: { initial: LeaderPage | null }) {
  const { user } = useAuth();
  const [board, setBoard] = useState<BoardId>("level");
  const [pageNum, setPageNum] = useState(1);
  const [data, setData] = useState<LeaderPage | null>(initial);
  const [podium, setPodium] = useState<LeaderRow[]>(initial?.rows.slice(0, 3) ?? []);
  const [listLoading, setListLoading] = useState(!initial);
  const [boardBoot, setBoardBoot] = useState(!initial);
  const [query, setQuery] = useState("");
  const [found, setFound] = useState<{ row: LeaderRow | null; id: string } | null>(null);
  const [searching, setSearching] = useState(false);
  const [listVisible, setListVisible] = useState(50);
  const first = useRef(true);
  const LIST_CHUNK = 50;

  // cambio classifica → prima pagina + ricarica podio
  useEffect(() => {
    setPageNum(1);
    setListVisible(LIST_CHUNK);
  }, [board]);

  useEffect(() => {
    setListVisible(LIST_CHUNK);
  }, [pageNum]);

  useEffect(() => {
    /* Boot con `initial`: niente secondo round-trip (Speed Insights /classifiche). */
    if (first.current && initial && board === "level") {
      setBoardBoot(false);
      return;
    }
    let alive = true;
    setBoardBoot(true);
    loadBoard(board, 1).then((d) => {
      if (!alive) return;
      if (d) setPodium(d.rows.slice(0, 3));
      setBoardBoot(false);
    });
    return () => {
      alive = false;
    };
  }, [board, initial]);

  useEffect(() => {
    if (first.current && initial && board === "level" && pageNum === 1) {
      first.current = false;
      setListLoading(false);
      return;
    }
    first.current = false;
    let alive = true;
    setListLoading(true);
    setFound(null);
    loadBoard(board, pageNum).then((d) => {
      if (!alive) return;
      setData(d);
      if (d && pageNum === 1) setPodium(d.rows.slice(0, 3));
      setListLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [board, pageNum, initial]);

  useLiveRefresh(
    async () => {
      const [list, topPage] = await Promise.all([loadBoard(board, pageNum), loadBoard(board, 1)]);
      if (list) setData(list);
      if (topPage) setPodium(topPage.rows.slice(0, 3));
    },
    { intervalMs: 120_000, boot: false, topics: ["live_stats", "vote"] },
  );

  const search = useCallback(
    async (id: string) => {
      const clean = id.trim();
      if (!/^\d{15,22}$/.test(clean)) {
        setFound({ row: null, id: clean });
        return;
      }
      setSearching(true);
      const res = await loadBoard(board, 1, { userId: clean, perPage: 10 });
      setSearching(false);
      const row = res?.rows.find((r) => r.userId === clean) ?? null;
      setFound({ row, id: clean });
    },
    [board],
  );

  const page = data?.page ?? pageNum;
  const top = podium;
  const rest = page === 1 ? (data?.rows.slice(3) ?? []) : (data?.rows ?? []);
  const restVisible = rest.length > LIST_CHUNK ? rest.slice(0, listVisible) : rest;
  const restRemaining = rest.length > LIST_CHUNK ? Math.max(0, rest.length - listVisible) : 0;
  const boardInfo = BOARDS.find((b) => b.id === board)!;
  const podiumLoading = boardBoot && top.length === 0;

  return (
    <div className="mx-auto max-w-5xl px-6 pb-16">
      {/* classifiche */}
      <LayoutGroup id="boards">
        <div className="flex flex-wrap justify-center gap-2" role="tablist" aria-label="Classifiche">
          {BOARDS.map((b) => {
            const active = board === b.id;
            const Icon = BOARD_ICONS[b.id];
            return (
              <button
                key={b.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setBoard(b.id)}
                className={cn(
                  "relative isolate inline-flex items-center gap-2 rounded-full px-4 py-2 text-sm font-medium transition-colors",
                  active ? "text-espresso" : "text-crema/70 hover:text-crema",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="board-pill"
                    className="absolute inset-0 -z-10 rounded-full bg-gradient-to-b from-crema to-sand"
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  />
                )}
                {!active && <span className="absolute inset-0 -z-10 rounded-full bg-crema/6 ring-1 ring-sand/15" />}
                <Icon className="size-4" />
                {b.label}
              </button>
            );
          })}
        </div>
      </LayoutGroup>

      <p className="mt-4 text-center text-sm text-crema/50">
        {data ? `${data.total.toLocaleString("it-IT")} membri in classifica · ordinati per ${boardInfo.unit}` : " "}
      </p>

      {/* podio: sempre top 3 della board, indipendente dalla pagina lista */}
      <div className="relative mt-12 min-h-[18rem]">
        <AnimatePresence mode="wait">
          {podiumLoading ? (
            <motion.div key="load" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="flex h-72 items-center justify-center text-crema/50">
              <Loader2 className="size-6 animate-spin" />
            </motion.div>
          ) : top.length ? (
            <motion.div key={board} exit={{ opacity: 0, y: -10 }} className="grid grid-cols-3 items-end gap-2 sm:gap-8">
              {top.map((r, i) => (
                <PodiumDisc key={r.userId} row={r} place={i as 0 | 1 | 2} board={board} me={r.userId === user?.id} />
              ))}
            </motion.div>
          ) : (
            <motion.p key="empty" className="py-20 text-center text-crema/60">
              Nessun dato in classifica al momento.
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {/* trova */}
      <div className="mt-14 flex flex-col gap-3 sm:flex-row">
        <form
          onSubmit={(e) => {
            e.preventDefault();
            search(query);
          }}
          className="relative flex-1"
        >
          <Search className="pointer-events-none absolute left-5 top-1/2 z-10 size-5 -translate-y-1/2 text-crema/40" />
          <input
            inputMode="numeric"
            value={query}
            onChange={(e) => setQuery(e.target.value.replace(/[^\d]/g, ""))}
            placeholder="Cerca un utente per ID Discord…"
            aria-label="ID Discord da cercare"
            className="w-full rounded-2xl bg-roast/80 py-4 pl-14 pr-24 text-base text-crema ring-1 ring-sand/15 placeholder:text-crema/35 focus:outline-none focus:ring-2 focus:ring-caramel/60"
          />
          <button
            type="submit"
            disabled={!query || searching}
            className="absolute right-2 top-1/2 -translate-y-1/2 rounded-xl bg-crema/10 px-4 py-2 text-sm font-semibold text-crema ring-1 ring-sand/20 transition-colors hover:bg-crema/15 disabled:opacity-40"
          >
            {searching ? <Loader2 className="size-4 animate-spin" /> : "Cerca"}
          </button>
        </form>
        {user && (
          <button
            type="button"
            onClick={() => {
              setQuery(user.id);
              search(user.id);
            }}
            className="inline-flex items-center justify-center gap-2 rounded-2xl bg-gradient-to-b from-caramel/30 to-caramel/10 px-5 py-4 text-sm font-semibold text-crema ring-1 ring-caramel/40 transition-colors hover:from-caramel/40"
          >
            <Crosshair className="size-4" /> La mia posizione
          </button>
        )}
      </div>

      <AnimatePresence>
        {found && (
          <motion.div
            initial={{ opacity: 0, height: 0 }}
            animate={{ opacity: 1, height: "auto" }}
            exit={{ opacity: 0, height: 0 }}
            className="overflow-hidden"
          >
            <div className="mt-3 overflow-hidden rounded-2xl bg-roast/80 ring-1 ring-caramel/30">
              <div className="flex items-center justify-between px-4 pt-3 text-xs uppercase tracking-[0.2em] text-crema/40 sm:px-6">
                <span>Risultato · {boardInfo.label}</span>
                <button type="button" onClick={() => setFound(null)} aria-label="Chiudi risultato" className="rounded-full p-1 hover:bg-crema/10">
                  <X className="size-4" />
                </button>
              </div>
              {found.row ? (
                <ul>
                  <Row row={found.row} board={board} me={found.row.userId === user?.id} />
                </ul>
              ) : (
                <p className="px-4 py-4 text-sm text-crema/65 sm:px-6">
                  {/^\d{15,22}$/.test(found.id)
                    ? "Questo utente non è (ancora) in questa classifica."
                    : "Inserisci un ID Discord valido (solo numeri, 17-20 cifre)."}
                </p>
              )}
            </div>
          </motion.div>
        )}
      </AnimatePresence>

      {/* classifica paginata (podio resta fisso sopra) */}
      <div id="lb-list" className="scroll-mt-28">
        {listLoading ? (
          <div className="mt-6 flex h-40 items-center justify-center text-crema/45">
            <Loader2 className="size-5 animate-spin" />
          </div>
        ) : rest.length > 0 ? (
          <div className="mt-6 overflow-hidden rounded-3xl bg-roast/70 ring-1 ring-sand/12">
            <div className="flex items-center gap-2 border-b border-sand/10 px-4 py-3 text-xs uppercase tracking-[0.2em] text-crema/40 sm:px-6">
              <Trophy className="size-3.5" /> {page === 1 ? "Classifica" : `Pagina ${page}`}
            </div>
            <ul>
              {restVisible.map((r) => (
                <Row key={r.userId} row={r} board={board} me={r.userId === user?.id} />
              ))}
            </ul>
            <ShowMoreButton
              remaining={restRemaining}
              onClick={() => setListVisible((n) => n + LIST_CHUNK)}
            />
          </div>
        ) : null}
      </div>
      {data && data.totalPages > 1 && (
        <Pagination page={data.page} totalPages={data.totalPages} onChange={setPageNum} scrollToId="lb-list" />
      )}
    </div>
  );
}
