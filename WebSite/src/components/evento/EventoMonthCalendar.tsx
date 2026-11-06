"use client";

import { useEffect, useMemo, useState } from "react";
import { fetchEventoCalendar, type EventoCalendarDayRow } from "@/lib/evento-api";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { EventoSkeleton } from "@/components/evento/EventoUi";

const WEEKDAYS = ["Lun", "Mar", "Mer", "Gio", "Ven", "Sab", "Dom"] as const;

const FEATURE_SHORT: Record<string, string> = {
  smistamento: "Smistamento",
  avvento: "Avvento",
  economy: "Economia",
  minigame_podrace: "Podrace",
  minigame_scova_pianeta: "Scova pianeta",
  minigame_ordine66: "Ordine 66",
  minigame_cacciatore_taglie: "Cacciatore",
  minigame_attacca_base: "Attacca base",
  minigame_caccia_ewok: "Caccia Ewok",
  minigame_proteggi_convoglio: "Proteggi",
  event_podracing_championship: "Championship",
  event_accademia: "Accademia",
  event_kyber: "Kyber",
  event_puzzle_kessel: "Puzzle",
  game_conquista_sistema: "Conquista",
  game_colleziona_pg: "Colleziona PG",
  game_colleziona_reliquie: "Reliquie",
  game_caccia_olocron: "Olocron",
};

function romeParts(now = new Date()) {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Rome",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(now)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  return {
    year: Number(parts.year),
    month: Number(parts.month),
    day: Number(parts.day),
  };
}

/** Prima di dic 2026 mostra già dicembre (mese evento); poi segue il mese Rome corrente. */
function activityViewMonth(now = new Date()) {
  const r = romeParts(now);
  if (r.year < 2026 || (r.year === 2026 && r.month < 12)) {
    return { year: 2026, month: 12, todayDay: null as number | null };
  }
  return { year: r.year, month: r.month, todayDay: r.day };
}

function monthLabelIt(year: number, month: number) {
  const d = new Date(Date.UTC(year, month - 1, 1));
  return new Intl.DateTimeFormat("it-IT", { month: "long", year: "numeric", timeZone: "UTC" }).format(d);
}

function isoDate(year: number, month: number, day: number) {
  return `${year}-${String(month).padStart(2, "0")}-${String(day).padStart(2, "0")}`;
}

/** Lunedì=0 … Domenica=6 per una data UTC midnight. */
function mondayIndex(year: number, month: number, day: number) {
  const wd = new Date(Date.UTC(year, month - 1, day)).getUTCDay(); // 0=Dom
  return wd === 0 ? 6 : wd - 1;
}

type DayBucket = {
  notes: string[];
  films: string[];
  ons: string[];
  offs: string[];
  advent?: number;
};

function bucketRows(rows: EventoCalendarDayRow[]): Map<string, DayBucket> {
  const map = new Map<string, DayBucket>();
  for (const row of rows) {
    const date = String(row.date || "").trim();
    if (!date) continue;
    let b = map.get(date);
    if (!b) {
      b = { notes: [], films: [], ons: [], offs: [] };
      map.set(date, b);
    }
    if (row.note) b.notes.push(String(row.note));
    if (row.film) b.films.push(String(row.film));
    if (row.advent != null) b.advent = Number(row.advent);
    for (const f of row.on || []) b.ons.push(String(f));
    for (const f of row.off || []) b.offs.push(String(f));
  }
  return map;
}

function linesForDay(b: DayBucket | undefined): string[] {
  if (!b) return [];
  const out: string[] = [];
  for (const f of b.films) out.push(f.replace(/^Star Wars:\s*/i, ""));
  for (const n of b.notes) out.push(n);
  for (const id of [...new Set(b.ons)]) {
    if (id === "avvento") continue;
    out.push(FEATURE_SHORT[id] || id);
  }
  for (const id of [...new Set(b.offs)]) {
    out.push(`Fine ${FEATURE_SHORT[id] || id}`);
  }
  /* dedupe short */
  return [...new Set(out)].slice(0, 3);
}

/** Calendario mensile (Europe/Rome): mese corrente con attività per giorno. */
export function EventoMonthCalendar({ embedded = false }: { embedded?: boolean }) {
  const { token, ready } = useAuth();
  const [rows, setRows] = useState<EventoCalendarDayRow[]>([]);
  const [loading, setLoading] = useState(true);
  const view = useMemo(() => activityViewMonth(), []);

  useEffect(() => {
    if (!ready) return;
    let alive = true;
    fetchEventoCalendar(token).then((r) => {
      if (!alive) return;
      setRows(r.ok ? r.days || [] : []);
      setLoading(false);
    });
    return () => {
      alive = false;
    };
  }, [ready, token]);

  const byDate = useMemo(() => bucketRows(rows), [rows]);

  const cells = useMemo(() => {
    const { year, month, todayDay } = view;
    const daysInMonth = new Date(Date.UTC(year, month, 0)).getUTCDate();
    const startPad = mondayIndex(year, month, 1);
    const total = Math.ceil((startPad + daysInMonth) / 7) * 7;
    const list: Array<{ key: string; day: number | null; iso: string | null; today: boolean }> = [];
    for (let i = 0; i < total; i++) {
      const dayNum = i - startPad + 1;
      if (dayNum < 1 || dayNum > daysInMonth) {
        list.push({ key: `pad-${i}`, day: null, iso: null, today: false });
        continue;
      }
      const iso = isoDate(year, month, dayNum);
      list.push({
        key: iso,
        day: dayNum,
        iso,
        today: todayDay != null && dayNum === todayDay,
      });
    }
    return list;
  }, [view]);

  if (loading) return <EventoSkeleton className="w-full" />;

  const body = (
    <div className="w-full">
      <p className="mb-3 text-center font-display text-lg capitalize text-crema sm:text-left">
        {monthLabelIt(view.year, view.month)}
      </p>

      <div className="mb-1.5 grid grid-cols-7 gap-1 text-center text-[0.55rem] font-semibold uppercase tracking-[0.18em] text-crema/40">
        {WEEKDAYS.map((d) => (
          <span key={d}>{d}</span>
        ))}
      </div>

      <ul className="grid grid-cols-7 gap-1">
        {cells.map((c) => {
          if (c.day == null || !c.iso) {
            return <li key={c.key} className="min-h-[4.5rem] rounded-lg bg-black/10 sm:min-h-[5.25rem]" aria-hidden />;
          }
          const bucket = byDate.get(c.iso);
          const lines = linesForDay(bucket);
          const has = lines.length > 0;
          return (
            <li
              key={c.key}
              className={cn(
                "flex min-h-[4.5rem] flex-col rounded-lg p-1.5 ring-1 sm:min-h-[5.25rem] sm:p-2",
                c.today
                  ? "bg-[#2ea8ff]/15 ring-[#2ea8ff]/55"
                  : has
                    ? "bg-black/35 ring-[#c9a227]/25"
                    : "bg-black/20 ring-white/5",
              )}
            >
              <span
                className={cn(
                  "text-[0.7rem] font-semibold tabular-nums",
                  c.today ? "text-[#7dd3fc]" : "text-crema/55",
                )}
              >
                {c.day}
              </span>
              <ul className="mt-0.5 space-y-0.5">
                {lines.map((line) => (
                  <li
                    key={line}
                    className="line-clamp-2 text-[0.5rem] leading-snug text-crema/75 sm:text-[0.55rem]"
                    title={line}
                  >
                    {line}
                  </li>
                ))}
              </ul>
            </li>
          );
        })}
      </ul>
    </div>
  );

  if (embedded) return body;
  return <div className="mx-auto max-w-4xl px-6 pb-12">{body}</div>;
}
