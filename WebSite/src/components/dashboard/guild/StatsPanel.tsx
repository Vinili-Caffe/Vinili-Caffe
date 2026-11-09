"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { Clock3, Handshake, Inbox, Star, Table2, Ticket, TrendingDown, TrendingUp } from "lucide-react";
import { cn } from "@/lib/cn";
import { loadGuildStats, type GuildStats } from "@/lib/dashboard-insights";
import { Notice, StatTile } from "./bits";

/* Palette validata (scripts/validate_palette.js, tema scuro su roast e chiaro su crema):
   serie 1 = aperti / partnership, serie 2 = chiusi. */
const PALETTE = "[--s1:#c98236] [--s2:#16a08f] light:[--s1:#b36b22] light:[--s2:#008a7c]";
const PERIODS = [7, 30, 90] as const;

function useWidth<T extends HTMLElement>() {
  const ref = useRef<T>(null);
  const [w, setW] = useState(640);
  useEffect(() => {
    const el = ref.current;
    if (!el || typeof ResizeObserver === "undefined") return;
    const ro = new ResizeObserver((e) => setW(Math.max(260, Math.round(e[0].contentRect.width))));
    ro.observe(el);
    return () => ro.disconnect();
  }, []);
  return [ref, w] as const;
}

function fmtDay(iso: string, long = false) {
  const d = new Date(`${iso}T12:00:00`);
  return d.toLocaleDateString("it-IT", long ? { weekday: "short", day: "numeric", month: "long" } : { day: "numeric", month: "short" });
}

function fmtDuration(ms: number | null) {
  if (ms == null) return "—";
  const h = ms / 3_600_000;
  if (h < 1) return `${Math.max(1, Math.round(ms / 60_000))} min`;
  if (h < 48) return `${h.toFixed(h < 10 ? 1 : 0).replace(".", ",")} ore`;
  return `${Math.round(h / 24)} giorni`;
}

function trend(now: number, prev: number) {
  if (!prev) return now ? "nuovo rispetto al periodo prima" : "come il periodo prima";
  const pct = Math.round(((now - prev) / prev) * 100);
  return pct === 0 ? "come il periodo prima" : `${pct > 0 ? "+" : ""}${pct}% sul periodo prima`;
}

function niceMax(v: number) {
  if (v <= 4) return 4;
  const pow = 10 ** Math.floor(Math.log10(v));
  const n = v / pow;
  return (n <= 2 ? 2 : n <= 5 ? 5 : 10) * pow;
}

/** Linee (1 o 2 serie) con griglia leggera, crosshair e tooltip al passaggio. */
function LineChart({ axis, series }: { axis: string[]; series: { name: string; color: string; values: number[] }[] }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = 200;
  const pad = { l: 34, r: 12, t: 12, b: 26 };
  const iw = width - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const max = niceMax(Math.max(1, ...series.flatMap((s) => s.values)));
  const x = (i: number) => pad.l + (axis.length <= 1 ? iw / 2 : (i / (axis.length - 1)) * iw);
  const y = (v: number) => pad.t + ih - (v / max) * ih;
  const ticks = [0, max / 2, max];
  const labelEvery = Math.ceil(axis.length / Math.max(2, Math.floor(iw / 70)));

  return (
    <div ref={ref} className="relative">
      <svg width={width} height={H} role="img" aria-label={series.map((s) => s.name).join(" e ")} className="block max-w-full overflow-visible">
        {ticks.map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={width - pad.r} y1={y(t)} y2={y(t)} stroke="currentColor" className="text-crema/[0.08]" strokeWidth={1} />
            <text x={pad.l - 6} y={y(t)} textAnchor="end" dominantBaseline="middle" className="fill-crema/55 text-[10px] tabular-nums">
              {Math.round(t)}
            </text>
          </g>
        ))}
        {axis.map((d, i) =>
          i % labelEvery === 0 || i === axis.length - 1 ? (
            <text key={d} x={x(i)} y={H - 8} textAnchor={i === 0 ? "start" : i === axis.length - 1 ? "end" : "middle"} className="fill-crema/55 text-[10px]">
              {fmtDay(d)}
            </text>
          ) : null,
        )}
        {series.map((s) => (
          <g key={s.name}>
            <path
              d={`M${s.values.map((v, i) => `${x(i)},${y(v)}`).join("L")}L${x(s.values.length - 1)},${y(0)}L${x(0)},${y(0)}Z`}
              fill={s.color}
              opacity={0.1}
            />
            <path d={`M${s.values.map((v, i) => `${x(i)},${y(v)}`).join("L")}`} fill="none" stroke={s.color} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
          </g>
        ))}
        {hover != null ? (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={pad.t} y2={pad.t + ih} stroke="currentColor" className="text-crema/30" strokeWidth={1} />
            {series.map((s) => (
              <circle key={s.name} cx={x(hover)} cy={y(s.values[hover] ?? 0)} r={4.5} fill={s.color} stroke="var(--color-roast, #1a110c)" strokeWidth={2} />
            ))}
          </g>
        ) : null}
        <rect
          x={pad.l}
          y={pad.t}
          width={iw}
          height={ih}
          fill="transparent"
          onMouseMove={(e) => {
            const r = (e.currentTarget as SVGRectElement).getBoundingClientRect();
            const i = Math.round(((e.clientX - r.left) / r.width) * (axis.length - 1));
            setHover(Math.max(0, Math.min(axis.length - 1, i)));
          }}
          onMouseLeave={() => setHover(null)}
        />
      </svg>
      {hover != null ? (
        <div
          className="pointer-events-none absolute top-1 z-10 min-w-36 rounded-lg bg-mocha px-3 py-2 text-xs shadow-[0_12px_30px_-12px_rgba(0,0,0,0.85)] ring-1 ring-sand/20"
          style={{ left: Math.min(Math.max(x(hover) + 12, 0), width - 160) }}
        >
          <p className="mb-1 font-semibold text-crema">{fmtDay(axis[hover], true)}</p>
          {series.map((s) => (
            <p key={s.name} className="flex items-center gap-2 text-crema/80">
              <span className="size-2 rounded-full" style={{ background: s.color }} aria-hidden />
              <span className="flex-1">{s.name}</span>
              <span className="font-semibold tabular-nums text-crema">{s.values[hover] ?? 0}</span>
            </p>
          ))}
        </div>
      ) : null}
    </div>
  );
}

/** Barre verticali di una sola serie (partnership al giorno). */
function BarChart({ axis, values, color, name }: { axis: string[]; values: number[]; color: string; name: string }) {
  const [ref, width] = useWidth<HTMLDivElement>();
  const [hover, setHover] = useState<number | null>(null);
  const H = 170;
  const pad = { l: 34, r: 8, t: 10, b: 26 };
  const iw = width - pad.l - pad.r;
  const ih = H - pad.t - pad.b;
  const max = niceMax(Math.max(1, ...values));
  const slot = iw / Math.max(1, values.length);
  const bw = Math.max(2, slot - 2);
  const labelEvery = Math.ceil(axis.length / Math.max(2, Math.floor(iw / 70)));
  return (
    <div ref={ref} className="relative">
      <svg width={width} height={H} role="img" aria-label={name} className="block max-w-full">
        {[0, max / 2, max].map((t) => (
          <g key={t}>
            <line x1={pad.l} x2={width - pad.r} y1={pad.t + ih - (t / max) * ih} y2={pad.t + ih - (t / max) * ih} stroke="currentColor" className="text-crema/[0.08]" />
            <text x={pad.l - 6} y={pad.t + ih - (t / max) * ih} textAnchor="end" dominantBaseline="middle" className="fill-crema/55 text-[10px] tabular-nums">
              {Math.round(t)}
            </text>
          </g>
        ))}
        {values.map((v, i) => {
          const h = (v / max) * ih;
          const bx = pad.l + i * slot + (slot - bw) / 2;
          const r = Math.min(4, bw / 2, h);
          return (
            <g key={axis[i]} onMouseEnter={() => setHover(i)} onMouseLeave={() => setHover(null)}>
              <rect x={pad.l + i * slot} y={pad.t} width={slot} height={ih} fill="transparent" />
              {v > 0 ? (
                <path
                  d={`M${bx},${pad.t + ih}V${pad.t + ih - h + r}Q${bx},${pad.t + ih - h} ${bx + r},${pad.t + ih - h}H${bx + bw - r}Q${bx + bw},${pad.t + ih - h} ${bx + bw},${pad.t + ih - h + r}V${pad.t + ih}Z`}
                  fill={color}
                  opacity={hover == null || hover === i ? 1 : 0.45}
                />
              ) : null}
            </g>
          );
        })}
        {axis.map((d, i) =>
          i % labelEvery === 0 || i === axis.length - 1 ? (
            <text key={d} x={pad.l + i * slot + slot / 2} y={H - 8} textAnchor={i === 0 ? "start" : i === axis.length - 1 ? "end" : "middle"} className="fill-crema/55 text-[10px]">
              {fmtDay(d)}
            </text>
          ) : null,
        )}
      </svg>
      {hover != null ? (
        <div
          className="pointer-events-none absolute top-1 z-10 rounded-lg bg-mocha px-3 py-2 text-xs shadow-[0_12px_30px_-12px_rgba(0,0,0,0.85)] ring-1 ring-sand/20"
          style={{ left: Math.min(Math.max(pad.l + hover * slot + 12, 0), width - 150) }}
        >
          <p className="font-semibold text-crema">{fmtDay(axis[hover], true)}</p>
          <p className="text-crema/80">
            <span className="font-semibold tabular-nums text-crema">{values[hover]}</span> {name.toLowerCase()}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** Barre orizzontali (voti, tipi di ticket): etichetta, barra, numero. */
function HBars({ rows, color }: { rows: { label: React.ReactNode; value: number }[]; color: string }) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="space-y-2">
      {rows.map((r, i) => (
        <li key={i} className="grid grid-cols-[6.5rem_minmax(0,1fr)_2.5rem] items-center gap-3 text-sm">
          <span className="truncate text-crema/80">{r.label}</span>
          <span className="h-2.5 overflow-hidden rounded-full bg-crema/[0.06]">
            <span className="block h-full rounded-full" style={{ width: `${(r.value / max) * 100}%`, background: color, minWidth: r.value ? 4 : 0 }} />
          </span>
          <span className="text-right font-semibold tabular-nums text-crema">{r.value}</span>
        </li>
      ))}
    </ul>
  );
}

function Card({ title, aside, children, className }: { title: string; aside?: React.ReactNode; children: React.ReactNode; className?: string }) {
  return (
    <section className={cn("rounded-2xl bg-espresso/45 p-4 ring-1 ring-sand/10 sm:p-5", className)}>
      <div className="mb-3 flex flex-wrap items-center justify-between gap-2">
        <h3 className="text-sm font-semibold text-crema">{title}</h3>
        {aside}
      </div>
      {children}
    </section>
  );
}

function Legend({ items }: { items: { name: string; color: string }[] }) {
  return (
    <span className="flex flex-wrap items-center gap-3 text-xs text-crema/70">
      {items.map((i) => (
        <span key={i.name} className="inline-flex items-center gap-1.5">
          <span className="h-0.5 w-4 rounded-full" style={{ background: i.color }} aria-hidden />
          {i.name}
        </span>
      ))}
    </span>
  );
}

function StatsSkeleton() {
  return (
    <div className="space-y-4" aria-busy aria-label="Caricamento statistiche">
      <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
        {Array.from({ length: 6 }, (_, i) => (
          <div key={i} className="flex items-center gap-3 rounded-xl bg-espresso/55 p-3 ring-1 ring-sand/10">
            <span className="size-9 animate-pulse rounded-lg bg-crema/[0.07]" />
            <span className="flex-1 space-y-1.5">
              <span className="block h-2.5 w-1/2 animate-pulse rounded bg-crema/[0.06]" />
              <span className="block h-5 w-1/3 animate-pulse rounded bg-crema/[0.09]" />
            </span>
          </div>
        ))}
      </div>
      <div className="h-64 animate-pulse rounded-2xl bg-crema/[0.04]" />
      <div className="grid gap-4 lg:grid-cols-2">
        <div className="h-48 animate-pulse rounded-2xl bg-crema/[0.04]" />
        <div className="h-48 animate-pulse rounded-2xl bg-crema/[0.04]" />
      </div>
    </div>
  );
}

export function StatsPanel({ guildId, token }: { guildId: string; token: string }) {
  const [days, setDays] = useState<number>(30);
  const [state, setState] = useState<{ key: string; stats: GuildStats | null; error: string } | null>(null);
  const [table, setTable] = useState(false);
  const key = `${guildId}:${days}`;

  useEffect(() => {
    let off = false;
    void loadGuildStats(token, guildId, days).then((r) => {
      if (!off) setState({ key, stats: r.ok ? r.stats : null, error: r.ok ? "" : r.message });
    });
    return () => {
      off = true;
    };
  }, [token, guildId, days, key]);

  const current = state && state.key === key ? state : null;
  const s = current?.stats;
  const c1 = "var(--s1)";
  const c2 = "var(--s2)";

  const ratingRows = useMemo(() => (s ? [5, 4, 3, 2, 1].map((n) => ({ label: `${"★".repeat(n)}`, value: s.tickets.ratings[n - 1] || 0 })) : []), [s]);

  return (
    <div className={cn("space-y-4", PALETTE)}>
      <div className="flex flex-wrap items-center justify-between gap-3">
        <p className="text-sm text-crema/70">Ticket e partnership del server negli ultimi giorni.</p>
        <div className="grid grid-cols-3 gap-1 rounded-lg bg-espresso/70 p-1 ring-1 ring-sand/10" role="radiogroup" aria-label="Periodo">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={days === p}
              onClick={() => setDays(p)}
              className={cn("rounded-md px-3 py-1 text-xs font-semibold transition-colors", days === p ? "bg-mocha text-crema ring-1 ring-sand/15" : "text-crema/60 hover:text-crema")}
            >
              {p} giorni
            </button>
          ))}
        </div>
      </div>

      {!current ? (
        <StatsSkeleton />
      ) : !s ? (
        <Notice>{current.error}</Notice>
      ) : (
        <>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-3">
            <StatTile icon={<Inbox />} tone="accent" label="Ticket aperti ora" value={s.tickets.openNow} />
            <StatTile icon={<Ticket />} label="Ticket nel periodo" value={s.tickets.opened} hint={trend(s.tickets.opened, s.tickets.openedPrev)} />
            <StatTile icon={<Clock3 />} label="Durata media" value={fmtDuration(s.tickets.avgResolutionMs)} hint="Da apertura a chiusura" />
            <StatTile
              icon={<Star />}
              tone={s.tickets.avgRating != null && s.tickets.avgRating >= 4 ? "ok" : "default"}
              label="Voto medio"
              value={s.tickets.avgRating != null ? `${String(s.tickets.avgRating).replace(".", ",")} / 5` : "—"}
              hint={s.tickets.ratingCount ? `${s.tickets.ratingCount} voti` : "Nessun voto"}
            />
            <StatTile icon={<Handshake />} tone="accent" label="Partnership" value={s.partnerships.total} hint={trend(s.partnerships.total, s.partnerships.prev)} />
            <StatTile
              icon={s.tickets.closed >= s.tickets.opened ? <TrendingDown /> : <TrendingUp />}
              tone={s.tickets.closed >= s.tickets.opened ? "ok" : "default"}
              label="Ticket chiusi"
              value={s.tickets.closed}
              hint={s.tickets.closed >= s.tickets.opened ? "Lo staff sta al passo" : "Ne arrivano più di quanti se ne chiudono"}
            />
          </div>

          <Card
            title="Ticket al giorno"
            aside={
              <span className="flex items-center gap-3">
                <Legend items={[{ name: "Aperti", color: c1 }, { name: "Chiusi", color: c2 }]} />
                <button type="button" onClick={() => setTable((v) => !v)} aria-pressed={table} className="inline-flex items-center gap-1 rounded-md px-2 py-1 text-xs text-crema/60 ring-1 ring-sand/15 hover:text-crema">
                  <Table2 className="size-3.5" aria-hidden /> {table ? "Grafico" : "Tabella"}
                </button>
              </span>
            }
          >
            {table ? (
              <div className="max-h-72 overflow-auto rounded-lg ring-1 ring-sand/10">
                <table className="w-full text-sm">
                  <thead className="sticky top-0 bg-mocha text-left text-xs text-crema/60">
                    <tr>
                      <th className="px-3 py-2 font-semibold">Giorno</th>
                      <th className="px-3 py-2 text-right font-semibold">Aperti</th>
                      <th className="px-3 py-2 text-right font-semibold">Chiusi</th>
                      <th className="px-3 py-2 text-right font-semibold">Partnership</th>
                    </tr>
                  </thead>
                  <tbody className="divide-y divide-sand/[0.07]">
                    {s.axis
                      .map((d, i) => ({ d, i }))
                      .reverse()
                      .map(({ d, i }) => (
                        <tr key={d}>
                          <td className="px-3 py-1.5 text-crema/80">{fmtDay(d, true)}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-crema">{s.tickets.openedByDay[i]}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-crema">{s.tickets.closedByDay[i]}</td>
                          <td className="px-3 py-1.5 text-right tabular-nums text-crema">{s.partnerships.byDay[i]}</td>
                        </tr>
                      ))}
                  </tbody>
                </table>
              </div>
            ) : (
              <LineChart
                axis={s.axis}
                series={[
                  { name: "Aperti", color: c1, values: s.tickets.openedByDay },
                  { name: "Chiusi", color: c2, values: s.tickets.closedByDay },
                ]}
              />
            )}
          </Card>

          <Card title="Partnership al giorno">
            {s.partnerships.total ? <BarChart axis={s.axis} values={s.partnerships.byDay} color={c1} name="Partnership" /> : <p className="py-6 text-center text-sm text-crema/60">Nessuna partnership in questo periodo.</p>}
          </Card>

          <div className="grid gap-4 lg:grid-cols-2">
            <Card title="Voti dei ticket">
              {s.tickets.ratingCount ? <HBars rows={ratingRows} color={c1} /> : <p className="py-6 text-center text-sm text-crema/60">Nessun voto in questo periodo.</p>}
            </Card>
            <Card title="Tipi di ticket">
              {s.tickets.types.length ? (
                <HBars rows={s.tickets.types.slice(0, 6).map((t) => ({ label: t.type.charAt(0).toUpperCase() + t.type.slice(1), value: t.count }))} color={c2} />
              ) : (
                <p className="py-6 text-center text-sm text-crema/60">Nessun ticket in questo periodo.</p>
              )}
            </Card>
            <Card title="Staff più attivo nei ticket">
              {s.tickets.topStaff.length ? (
                <ol className="space-y-1.5">
                  {s.tickets.topStaff.map((m, i) => (
                    <li key={m.userId} className="flex items-center gap-3 text-sm">
                      <span className="w-5 text-right text-xs tabular-nums text-crema/60">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-crema">{m.name || m.userId}</span>
                      <span className="text-xs text-crema/60">{m.claimed} presi · {m.closed} chiusi</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="py-6 text-center text-sm text-crema/60">Nessun ticket chiuso in questo periodo.</p>
              )}
            </Card>
            <Card title="Manager più attivi nelle partnership">
              {s.partnerships.topManagers.length ? (
                <ol className="space-y-1.5">
                  {s.partnerships.topManagers.map((m, i) => (
                    <li key={m.userId} className="flex items-center gap-3 text-sm">
                      <span className="w-5 text-right text-xs tabular-nums text-crema/60">{i + 1}</span>
                      <span className="min-w-0 flex-1 truncate text-crema">{m.name || m.userId}</span>
                      <span className="font-semibold tabular-nums text-crema">{m.count}</span>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="py-6 text-center text-sm text-crema/60">Nessuna partnership in questo periodo.</p>
              )}
            </Card>
          </div>
        </>
      )}
    </div>
  );
}
