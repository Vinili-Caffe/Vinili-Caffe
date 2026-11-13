"use client";

import { useEffect, useRef, useState } from "react";
import { AnimatePresence, LayoutGroup, motion } from "motion/react";
import {
  Building2,
  Calendar,
  CalendarDays,
  ExternalLink,
  Infinity as InfinityIcon,
  Trophy,
  UserRound,
  Users,
  type LucideIcon,
} from "lucide-react";
import {
  BOTS_BOARDS,
  BOTS_PERIODS,
  botsBoardUnit,
  botsFmt,
  botsMetric,
  loadBotsBoard,
  type BotsBoardId,
  type BotsLeaderPage,
  type BotsLeaderRow,
  type BotsPeriodId,
} from "@/lib/bots-leaderboard";
import { useAuth } from "@/lib/auth";
import { page } from "@/lib/site";
import { cn } from "@/lib/cn";
import { Avatar } from "@/components/Avatar";
import { Pagination } from "@/components/ui/Pagination";
import { ShowMoreButton } from "@/components/ui/ShowMore";

const BOARD_ICONS: Record<BotsBoardId, LucideIcon> = {
  servers: Building2,
  partners: UserRound,
  join: Users,
};

const PERIOD_ICONS: Record<BotsPeriodId, LucideIcon> = {
  total: InfinityIcon,
  weekly: CalendarDays,
  daily: Calendar,
};

const PODIUM = [
  { label: "Disco d'oro", grooves: "#e9c46a", label2: "from-amber-200 to-amber-600", glow: "rgba(240,190,90,0.4)", ring: "ring-amber-300/55" },
  { label: "Disco d'argento", grooves: "#c5cad3", label2: "from-slate-100 to-slate-400", glow: "rgba(200,210,225,0.35)", ring: "ring-slate-200/50" },
  { label: "Disco di bronzo", grooves: "#cd7f32", label2: "from-orange-300 to-amber-800", glow: "rgba(205,127,50,0.35)", ring: "ring-orange-400/45" },
];

function rowHref(row: BotsLeaderRow) {
  if (row.kind === "user") return page(`/user/?id=${row.id}`);
  return row.inviteUrl || null;
}

function Face({ row, className }: { row: BotsLeaderRow; className?: string }) {
  if (row.kind === "user") {
    return <Avatar userId={row.id} src={row.avatarUrl || undefined} name={row.displayName} className={className} />;
  }
  if (row.avatarUrl) {
    // eslint-disable-next-line @next/next/no-img-element
    return <img src={row.avatarUrl} alt="" className={cn("object-cover", className)} />;
  }
  return (
    <span className={cn("flex items-center justify-center bg-crema/10 font-bold text-crema/80", className)} aria-hidden>
      {(row.displayName.charAt(0) || "?").toUpperCase()}
    </span>
  );
}

function PodiumDisc({
  row,
  place,
  unit,
  rows,
}: {
  row: BotsLeaderRow;
  place: 0 | 1 | 2;
  unit: string;
  rows: BotsLeaderRow[];
}) {
  const p = PODIUM[place];
  const m = botsMetric(rows, row, unit);
  const size = place === 0 ? "size-28 sm:size-52" : "size-24 sm:size-44";
  const href = rowHref(row);
  const className = cn(
    "group flex min-w-0 flex-col items-center text-center",
    place === 0 ? "order-2 sm:-mt-6" : place === 1 ? "order-1" : "order-3",
  );
  const body = (
    <>
      <div className="relative">
        <div className="absolute inset-[-14%] rounded-full blur-2xl" style={{ background: `radial-gradient(circle, ${p.glow}, transparent 65%)` }} />
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
            <Face row={row} className="size-full rounded-full" />
          </div>
        </motion.div>
        <span
          className={cn(
            "absolute -bottom-1 left-1/2 flex size-7 -translate-x-1/2 items-center justify-center rounded-full bg-gradient-to-br text-base font-display font-bold text-espresso shadow-lg ring-2 ring-espresso lining-nums sm:size-9 sm:text-lg",
            p.label2,
          )}
        >
          {row.rank}
        </span>
      </div>
      <p className="mt-4 text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-crema/45 sm:text-[0.68rem] sm:tracking-[0.25em]">{p.label}</p>
      <p className={cn("mt-1 max-w-full truncate font-display text-lg font-semibold sm:max-w-[12rem] sm:text-2xl", row.isSelf && "text-ember")}>
        {row.displayName}
      </p>
      <p className="mt-0.5 text-sm font-semibold text-sand">{m.main}</p>
      {m.sub && <p className="text-xs text-crema/45">{m.sub}</p>}
    </>
  );
  if (href) {
    return (
      <motion.a
        href={href}
        {...(row.kind === "guild" ? { target: "_blank", rel: "noreferrer" } : {})}
        initial={{ opacity: 0, y: 30 }}
        animate={{ opacity: 1, y: 0 }}
        transition={{ delay: [0.1, 0, 0.2][place], duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
        whileHover="hover"
        className={className}
      >
        {body}
      </motion.a>
    );
  }
  return (
    <motion.div
      initial={{ opacity: 0, y: 30 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: [0.1, 0, 0.2][place], duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
      whileHover="hover"
      className={className}
    >
      {body}
    </motion.div>
  );
}

function Row({ row, unit, rows }: { row: BotsLeaderRow; unit: string; rows: BotsLeaderRow[] }) {
  const m = botsMetric(rows, row, unit);
  const href = rowHref(row);
  const inner = (
    <>
      <span className="w-10 shrink-0 text-center font-mono text-sm tabular-nums text-crema/45">#{row.rank}</span>
      <Face row={row} className="size-10 shrink-0 rounded-full" />
      <span className="min-w-0 flex-1">
        <span className={cn("flex items-center gap-1.5 truncate font-medium", row.isSelf ? "text-ember" : "text-crema")}>
          <span className="truncate">{row.displayName}</span>
          {row.isSelf && (
            <span className="shrink-0 rounded-full bg-caramel/20 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-ember">
              {row.kind === "user" ? "tu" : "vinili"}
            </span>
          )}
          {row.kind === "guild" && row.inviteUrl ? <ExternalLink className="size-3.5 shrink-0 text-crema/40" aria-hidden /> : null}
        </span>
        {row.username ? <span className="block truncate text-xs text-crema/45">@{row.username}</span> : null}
        <span className="mt-1.5 block h-1.5 w-full max-w-xs overflow-hidden rounded-full bg-crema/8">
          <motion.span
            className="block h-full rounded-full bg-gradient-to-r from-caramel to-ember"
            initial={{ width: 0 }}
            animate={{ width: `${m.pct}%` }}
            transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }}
          />
        </span>
      </span>
      <span className="shrink-0 text-right">
        <span className="block font-semibold tabular-nums text-sand">{m.main}</span>
        {m.sub && <span className="hidden text-xs text-crema/45 sm:block">{m.sub}</span>}
      </span>
    </>
  );
  return (
    <motion.li
      layout="position"
      initial={{ opacity: 0, y: 10 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ duration: 0.3 }}
      className={cn("scroll-mt-32 border-b border-sand/10 last:border-b-0", row.isSelf && "bg-caramel/[0.08]")}
    >
      {href ? (
        <a
          href={href}
          {...(row.kind === "guild" ? { target: "_blank", rel: "noreferrer" } : {})}
          className="flex items-center gap-3 px-4 py-3 transition-colors hover:bg-crema/[0.04] sm:gap-4 sm:px-6"
        >
          {inner}
        </a>
      ) : (
        <div className="flex items-center gap-3 px-4 py-3 sm:gap-4 sm:px-6">{inner}</div>
      )}
    </motion.li>
  );
}

export function BotsLeaderboardBrowser({ initial }: { initial: BotsLeaderPage | null }) {
  const { user } = useAuth();
  const [board, setBoard] = useState<BotsBoardId>("servers");
  const [period, setPeriod] = useState<BotsPeriodId>("total");
  const [pageNum, setPageNum] = useState(1);
  const [data, setData] = useState<BotsLeaderPage | null>(initial);
  const [podium, setPodium] = useState<BotsLeaderRow[]>(initial?.rows.slice(0, 3) ?? []);
  const [listLoading, setListLoading] = useState(!initial);
  const [boardBoot, setBoardBoot] = useState(!initial);
  const [listVisible, setListVisible] = useState(50);
  const first = useRef(true);
  const LIST_CHUNK = 50;

  useEffect(() => {
    setPageNum(1);
    setListVisible(LIST_CHUNK);
  }, [board, period]);

  useEffect(() => {
    setListVisible(LIST_CHUNK);
  }, [pageNum]);

  useEffect(() => {
    if (first.current && initial && board === "servers" && period === "total") {
      setBoardBoot(false);
      return;
    }
    let alive = true;
    setBoardBoot(true);
    setPodium([]);
    loadBotsBoard(board, 1, { period, userId: user?.id }).then((d) => {
      if (!alive) return;
      if (d && d.board === board && d.period === period) setPodium(d.rows.slice(0, 3));
      setBoardBoot(false);
    });
    return () => {
      alive = false;
    };
  }, [board, period, initial, user?.id]);

  useEffect(() => {
    if (first.current && initial && board === "servers" && period === "total" && pageNum === 1) {
      first.current = false;
      setListLoading(false);
      return;
    }
    first.current = false;
    let alive = true;
    setListLoading(true);
    setData(null);
    loadBotsBoard(board, pageNum, { period, userId: user?.id }).then((d) => {
      if (!alive) return;
      if (d && (d.board !== board || d.period !== period)) {
        setListLoading(false);
        return;
      }
      setData(d);
      if (d && pageNum === 1) setPodium(d.rows.slice(0, 3));
      setListLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [board, period, pageNum, initial, user?.id]);

  const dataReady = Boolean(data && data.board === board && data.period === period);
  const page = dataReady ? (data!.page ?? pageNum) : pageNum;
  const top = dataReady ? podium : [];
  const rest = dataReady ? (page === 1 ? data!.rows.slice(3) : data!.rows) : [];
  const restVisible = rest.length > LIST_CHUNK ? rest.slice(0, listVisible) : rest;
  const restRemaining = rest.length > LIST_CHUNK ? Math.max(0, rest.length - listVisible) : 0;
  const boardInfo = BOTS_BOARDS.find((b) => b.id === board)!;
  const unit = dataReady ? data!.unit : botsBoardUnit(board);
  const podiumLoading = boardBoot || listLoading || !dataReady;
  const metricRows = dataReady ? data!.rows : [];
  const selfOutside = dataReady && data!.self && !data!.rows.some((r) => r.id === data!.self?.id);

  return (
    <div className="mx-auto max-w-5xl px-6 pb-16">
      <LayoutGroup id="bots-boards">
        <div className="flex flex-wrap justify-center gap-2" role="tablist" aria-label="Classifiche bot">
          {BOTS_BOARDS.map((b) => {
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
                    layoutId="bots-board-pill"
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

      <LayoutGroup id="bots-periods">
        <div className="mt-3 flex flex-wrap justify-center gap-2" role="tablist" aria-label="Periodo">
          {BOTS_PERIODS.map((p) => {
            const active = period === p.id;
            const Icon = PERIOD_ICONS[p.id];
            return (
              <button
                key={p.id}
                type="button"
                role="tab"
                aria-selected={active}
                onClick={() => setPeriod(p.id)}
                className={cn(
                  "relative isolate inline-flex items-center gap-2 rounded-full px-3.5 py-1.5 text-xs font-medium transition-colors sm:text-sm",
                  active ? "text-espresso" : "text-crema/65 hover:text-crema",
                )}
              >
                {active && (
                  <motion.span
                    layoutId="bots-period-pill"
                    className="absolute inset-0 -z-10 rounded-full bg-gradient-to-b from-crema to-sand"
                    transition={{ type: "spring", stiffness: 400, damping: 32 }}
                  />
                )}
                {!active && <span className="absolute inset-0 -z-10 rounded-full bg-crema/6 ring-1 ring-sand/15" />}
                <Icon className="size-3.5 sm:size-4" />
                {p.label}
              </button>
            );
          })}
        </div>
      </LayoutGroup>

      <p className="mt-4 text-center text-sm text-crema/50">
        {dataReady
          ? `${botsFmt(data!.total)} in classifica · ${boardInfo.hint}`
          : boardInfo.hint}
      </p>

      <div className="relative mt-12 min-h-[18rem]">
        <AnimatePresence mode="wait">
          {podiumLoading ? (
            <motion.div key="load" initial={{ opacity: 0 }} animate={{ opacity: 1 }} exit={{ opacity: 0 }} className="grid h-72 grid-cols-3 items-end gap-2 sm:gap-8" aria-busy aria-label="Caricamento podio">
              {[1, 0, 2].map((place) => (
                <div key={place} className="flex flex-col items-center gap-3">
                  <span className={`animate-pulse rounded-full bg-crema/[0.08] ${place === 0 ? "size-24 sm:size-28" : "size-20 sm:size-24"}`} />
                  <span className="h-3.5 w-20 animate-pulse rounded bg-crema/[0.08]" />
                  <span className={`w-full animate-pulse rounded-t-2xl bg-crema/[0.05] ${place === 0 ? "h-24" : place === 1 ? "h-16" : "h-12"}`} />
                </div>
              ))}
            </motion.div>
          ) : top.length ? (
            <motion.div key={`${board}-${period}`} exit={{ opacity: 0, y: -10 }} className="grid grid-cols-3 items-end gap-2 sm:gap-8">
              {top.map((r, i) => (
                <PodiumDisc key={r.id} row={r} place={i as 0 | 1 | 2} unit={unit} rows={metricRows.length ? metricRows : top} />
              ))}
            </motion.div>
          ) : (
            <motion.p key="empty" className="py-20 text-center text-crema/60">
              Nessun dato per questo periodo.
            </motion.p>
          )}
        </AnimatePresence>
      </div>

      {selfOutside && data?.self ? (
        <div className="mt-10 overflow-hidden rounded-2xl bg-gradient-to-b from-caramel/[0.08] via-roast/85 to-roast ring-1 ring-caramel/30">
          <div className="px-4 pt-3 text-xs uppercase tracking-[0.2em] text-crema/40 sm:px-6">
            {board === "partners" ? "La tua posizione" : "Vinili & Caffè"}
          </div>
          <ul>
            <Row row={data.self} unit={unit} rows={[...metricRows, data.self]} />
          </ul>
        </div>
      ) : null}

      <div id="bots-lb-list" className="scroll-mt-28">
        {listLoading ? (
          <div className="mt-6 overflow-hidden rounded-3xl bg-roast/85 ring-1 ring-sand/12" aria-busy aria-label="Caricamento classifica">
            {Array.from({ length: 7 }, (_, i) => (
              <div key={i} className="flex items-center gap-3 border-b border-sand/10 px-4 py-3 last:border-0 sm:px-6">
                <span className="h-4 w-6 animate-pulse rounded bg-crema/[0.07]" />
                <span className="size-10 animate-pulse rounded-full bg-crema/[0.08]" />
                <span className="flex-1 space-y-1.5">
                  <span className="block h-3.5 animate-pulse rounded bg-crema/[0.08]" style={{ width: `${55 - i * 4}%` }} />
                  <span className="block h-3 w-1/4 animate-pulse rounded bg-crema/[0.05]" />
                </span>
                <span className="h-5 w-14 animate-pulse rounded bg-crema/[0.07]" />
              </div>
            ))}
          </div>
        ) : rest.length > 0 ? (
          <div className="mt-6 overflow-hidden rounded-3xl bg-gradient-to-b from-caramel/[0.1] via-roast/85 to-roast ring-1 ring-sand/12">
            <div className="flex items-center gap-2 border-b border-sand/10 px-4 py-3 text-xs uppercase tracking-[0.2em] text-crema/40 sm:px-6">
              <Trophy className="size-3.5" /> {page === 1 ? "Classifica" : `Pagina ${page}`}
            </div>
            <ul>
              {restVisible.map((r) => (
                <Row key={r.id} row={r} unit={unit} rows={metricRows} />
              ))}
            </ul>
            <ShowMoreButton remaining={restRemaining} onClick={() => setListVisible((n) => n + LIST_CHUNK)} />
          </div>
        ) : null}
      </div>
      {data && data.totalPages > 1 && (
        <Pagination page={data.page} totalPages={data.totalPages} onChange={setPageNum} scrollToId="bots-lb-list" />
      )}
    </div>
  );
}
