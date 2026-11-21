"use client";

import { useEffect, useMemo, useRef, useState } from "react";
import { motion } from "motion/react";
import { Eye, Flame, MousePointerClick, ThumbsUp } from "lucide-react";
import { loadListingAnalytics, saveListingGoals, type ListingAnalytics, type ListingGoals } from "@/lib/boards";
import { cn } from "@/lib/cn";
import { page } from "@/lib/site";
import { showToast } from "@/components/ui";
import { SmartLink } from "@/components/SmartLink";

const PERIODS = [7, 14, 30, 90] as const;
type Metric = "views" | "engagements" | "votes";
const GOAL_PRESETS: { label: string; goals: Partial<ListingGoals> }[] = [
  { label: "Primi 50 voti", goals: { votes: 50 } },
  { label: "100 visite", goals: { views: 100 } },
  { label: "200 interazioni", goals: { engagements: 200 } },
  { label: "Starter pack", goals: { views: 100, engagements: 50, votes: 50 } },
];

const METRICS: { id: Metric; label: string; icon: typeof Eye; hint: string }[] = [
  { id: "views", label: "Visite", icon: Eye, hint: "persone diverse che hanno aperto la pagina, al giorno" },
  { id: "engagements", label: "Interazioni", icon: MousePointerClick, hint: "click su Entra, link, voto e condivisione" },
  { id: "votes", label: "Voti", icon: ThumbsUp, hint: "voti ricevuti" },
];

/* palette categoriale calda (stessa famiglia del sito), assegnata in ordine fisso */
const CAT = ["#e0a465", "#8fb8ad", "#c9735a", "#b9a46e", "#8592c4", "#a884ad", "#77a477", "#9c8b7b"];

const SOURCE_LABEL: Record<string, string> = {
  search: "Ricerca",
  tag: "Tag",
  category: "Categoria",
  list: "Elenco",
  landing: "Ingresso vetrina",
  direct: "Link diretto",
  site: "Altre pagine del sito",
  external: "Altri siti",
};
const SOURCE_ORDER = ["search", "tag", "category", "list", "landing", "direct", "site", "external"];
const DEVICE_LABEL: Record<string, string> = { desktop: "Computer", mobile: "Telefono" };

const fmt = (n: number) => n.toLocaleString("it-IT");
const dayLabel = (d: string) => {
  const [y, m, dd] = d.split("-").map(Number);
  return new Date(y, (m || 1) - 1, dd || 1).toLocaleDateString("it-IT", { day: "2-digit", month: "short" });
};

/** Statistiche della scheda: andamento, fonti di traffico, paesi e dispositivi. */
export function AnalyticsTab({ listingId, token }: { listingId: string; token: string }) {
  const [days, setDays] = useState<number>(14);
  const [data, setData] = useState<ListingAnalytics | null>(null);
  const [err, setErr] = useState("");
  const [metric, setMetric] = useState<Metric>("views");
  const [goals, setGoals] = useState<ListingGoals>({ views: 0, engagements: 0, votes: 0 });
  const [goalBusy, setGoalBusy] = useState(false);

  useEffect(() => {
    let alive = true;
    setErr("");
    void loadListingAnalytics(token, listingId, days).then((r) => {
      if (!alive) return;
      if (!r.ok) return setErr(r.message);
      setData(r.data);
      if (r.data.goals) setGoals(r.data.goals);
    });
    return () => {
      alive = false;
    };
  }, [token, listingId, days]);

  async function onSaveGoals(next?: ListingGoals) {
    const payload = next ?? goals;
    setGoalBusy(true);
    const r = await saveListingGoals(token, listingId, payload);
    setGoalBusy(false);
    showToast(r.ok ? r.data.message || "Obiettivi salvati." : r.message, !r.ok);
    if (r.ok && r.data.goals) setGoals(r.data.goals);
    else if (r.ok) setGoals(payload);
  }

  function applyPreset(patch: Partial<ListingGoals>) {
    const next = { ...goals, ...patch };
    setGoals(next);
    void onSaveGoals(next);
  }

  return (
    <div className="space-y-10">
      <div className="flex flex-wrap items-end justify-between gap-4 border-b border-sand/10 pb-6">
        <div>
          <h2 className="font-display text-4xl font-semibold">Statistiche</h2>
          <p className="mt-1 text-crema/55">Come sta andando la tua scheda in vetrina.</p>
        </div>
        <div className="flex max-w-full overflow-x-auto rounded-full bg-roast p-1 ring-1 ring-sand/15" role="radiogroup" aria-label="Periodo">
          {PERIODS.map((p) => (
            <button
              key={p}
              type="button"
              role="radio"
              aria-checked={days === p}
              onClick={() => setDays(p)}
              className={cn("shrink-0 whitespace-nowrap rounded-full px-3 py-1.5 text-sm font-semibold transition-colors sm:px-3.5", days === p ? "bg-crema text-ink" : "text-crema/55 hover:text-crema")}
            >
              {p} giorni
            </button>
          ))}
        </div>
      </div>

      {err ? <p className="rounded-xl bg-ember/10 p-3 text-sm text-ember ring-1 ring-ember/25">{err}</p> : null}

      {/* andamento */}
      <section className="overflow-hidden rounded-3xl bg-roast/80 ring-1 ring-sand/12">
        <div className="grid grid-cols-3">
          {METRICS.map((m) => {
            const Icon = m.icon;
            const active = metric === m.id;
            return (
              <button
                key={m.id}
                type="button"
                onClick={() => setMetric(m.id)}
                aria-pressed={active}
                className={cn("min-w-0 p-4 text-left transition-colors sm:p-7", active ? "bg-roast" : "bg-espresso/60 hover:bg-espresso/30")}
              >
                <span className="flex items-center gap-1.5 truncate text-[0.6rem] font-semibold uppercase tracking-[0.12em] text-crema/50 sm:gap-2 sm:text-xs sm:tracking-[0.18em]">
                  <Icon className="size-3.5" /> {m.label}
                </span>
                <span className="mt-2 block font-display text-3xl font-semibold tabular-nums sm:text-4xl">{data ? fmt(data.totals[m.id]) : "—"}</span>
                {data?.delta ? <DeltaBadge value={data.delta[m.id]} prev={data.previousTotals?.[m.id] || 0} /> : null}
              </button>
            );
          })}
        </div>
        <div className="p-5 sm:p-7">
          {data ? <TrendChart series={data.series} metric={metric} /> : <div className="h-56 animate-pulse rounded-2xl bg-crema/5" />}
          <p className="mt-3 text-xs text-crema/40">{METRICS.find((m) => m.id === metric)?.hint}</p>
        </div>
      </section>

      {/* fonti */}
      <div>
        <h3 className="mb-4 font-display text-3xl font-semibold">Fonti di traffico</h3>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-[minmax(0,1.4fr)_minmax(0,1fr)]">
          <Card title="Da dove arrivano">
            {data ? (
              <DonutWithLegend
                entries={SOURCE_ORDER.filter((k) => (data.sources[k as keyof typeof data.sources] || 0) > 0).map((k) => ({ key: k, label: SOURCE_LABEL[k] || k, value: data.sources[k as keyof typeof data.sources] || 0 }))}
                empty="Ancora nessuna visita in questo periodo."
              />
            ) : (
              <div className="h-56 animate-pulse rounded-2xl bg-crema/5" />
            )}
          </Card>
          <Card title="Cosa hanno cercato">
            {data && data.leads.length ? (
              <ul className="max-h-72 divide-y divide-sand/10 overflow-y-auto pr-1">
                {data.leads.map((l, i) => (
                  <li key={i} className="flex items-center gap-3 py-3">
                    <span className="w-24 shrink-0 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-crema/45">{SOURCE_LABEL[l.source] || l.source}</span>
                    <span className="min-w-0 flex-1 truncate text-crema/85">{l.value || <span className="text-crema/35">—</span>}</span>
                    <span className="font-semibold tabular-nums text-crema">{fmt(l.count)}</span>
                  </li>
                ))}
              </ul>
            ) : (
              <p className="py-10 text-center text-sm text-crema/45">{data ? "Nessuna ricerca o tag ancora." : "…"}</p>
            )}
          </Card>
        </div>
      </div>

      {/* utenti */}
      <div>
        <h3 className="mb-4 font-display text-3xl font-semibold">Chi la guarda</h3>
        <div className="grid grid-cols-1 gap-5 lg:grid-cols-2">
          <Card title="Paesi">
            {data ? <Countries data={data.countries} /> : <div className="h-56 animate-pulse rounded-2xl bg-crema/5" />}
          </Card>
          <Card title="Dispositivi">
            {data ? (
              <DonutWithLegend
                entries={(["desktop", "mobile"] as const).filter((k) => (data.devices[k] || 0) > 0).map((k) => ({ key: k, label: DEVICE_LABEL[k], value: data.devices[k] || 0 }))}
                empty="Ancora nessuna visita in questo periodo."
              />
            ) : (
              <div className="h-56 animate-pulse rounded-2xl bg-crema/5" />
            )}
          </Card>
        </div>
      </div>

      {/* obiettivi */}
      <section className="rounded-3xl bg-roast/80 p-6 ring-1 ring-sand/12 sm:p-7">
        <div className="mb-5 flex flex-wrap items-end justify-between gap-3">
          <div>
            <h3 className="font-display text-3xl font-semibold">Obiettivi del periodo</h3>
            <p className="mt-1 text-sm text-crema/50">Traguardi personali per questi {days} giorni. Zero = nascosto.</p>
          </div>
          <button
            type="button"
            disabled={goalBusy}
            onClick={() => void onSaveGoals()}
            className="rounded-full bg-gradient-to-r from-caramel to-ember px-5 py-2 text-sm font-bold text-ink disabled:opacity-50"
          >
            {goalBusy ? "Salvo…" : "Salva obiettivi"}
          </button>
        </div>
        <div className="mb-5 flex flex-wrap gap-2">
          <span className="w-full text-xs font-semibold uppercase tracking-[0.16em] text-crema/45">Preset rapidi</span>
          {GOAL_PRESETS.map((p) => (
            <button
              key={p.label}
              type="button"
              disabled={goalBusy}
              onClick={() => applyPreset(p.goals)}
              className="rounded-full bg-crema/8 px-3.5 py-1.5 text-sm font-semibold text-crema/75 ring-1 ring-sand/15 transition hover:bg-crema/12 hover:text-crema disabled:opacity-50"
            >
              {p.label}
            </button>
          ))}
        </div>
        <div className="mb-6 flex flex-wrap items-start gap-3 rounded-2xl bg-caramel/10 p-4 ring-1 ring-caramel/25">
          <Flame className="mt-0.5 size-5 shrink-0 text-ember" />
          <p className="min-w-0 flex-1 text-sm text-crema/75">
            <span className="font-semibold text-crema">Streak 7:</span> attiva i promemoria in{" "}
            <SmartLink href={page(`/vetrina/modifica/?id=${encodeURIComponent(listingId)}&tab=voti`)} className="font-semibold text-ember hover:underline">
              Voti
            </SmartLink>{" "}
            e{" "}
            <SmartLink href={page(`/vetrina/modifica/?id=${encodeURIComponent(listingId)}&tab=bump`)} className="font-semibold text-ember hover:underline">
              Bump
            </SmartLink>{" "}
            per non perdere il ritmo settimanale.
          </p>
        </div>
        <div className="grid grid-cols-1 gap-5 sm:grid-cols-3">
          {METRICS.map((m) => {
            const target = goals[m.id] || 0;
            const cur = data?.totals[m.id] || 0;
            const pct = target > 0 ? Math.min(100, Math.round((cur / target) * 100)) : 0;
            return (
              <div key={m.id} className="rounded-2xl bg-espresso/50 p-4 ring-1 ring-sand/10">
                <label className="text-xs font-semibold uppercase tracking-[0.16em] text-crema/45">{m.label}</label>
                <input
                  type="number"
                  min={0}
                  max={1000000}
                  value={target || ""}
                  placeholder="—"
                  onChange={(e) => setGoals((g) => ({ ...g, [m.id]: Math.max(0, Math.floor(Number(e.target.value) || 0)) }))}
                  className="mt-2 w-full rounded-xl bg-roast px-3 py-2 font-display text-2xl tabular-nums text-crema outline-none ring-1 ring-sand/15 focus:ring-ember/40"
                />
                {target > 0 ? (
                  <div className="mt-3">
                    <div className="mb-1 flex justify-between text-xs text-crema/50">
                      <span>
                        {fmt(cur)} / {fmt(target)}
                      </span>
                      <span className="font-semibold text-crema/80">{pct}%</span>
                    </div>
                    <div className="h-2 overflow-hidden rounded-full bg-crema/10">
                      <motion.div className="h-full rounded-full bg-gradient-to-r from-caramel to-ember" initial={{ width: 0 }} animate={{ width: `${pct}%` }} transition={{ duration: 0.6, ease: [0.22, 1, 0.36, 1] }} />
                    </div>
                  </div>
                ) : (
                  <p className="mt-2 text-xs text-crema/35">Nessun obiettivo impostato</p>
                )}
              </div>
            );
          })}
        </div>
      </section>

      <p className="text-xs text-crema/40">Contiamo solo numeri per giorno: niente indirizzi IP né nomi. Le tue visite alla scheda non contano. Il confronto è con i {days} giorni precedenti.</p>
    </div>
  );
}

function DeltaBadge({ value, prev }: { value: number; prev: number }) {
  if (!value && !prev) return <span className="mt-1 block text-[0.65rem] text-crema/30">pari al periodo prima</span>;
  const up = value > 0;
  const flat = value === 0;
  const pct = prev > 0 ? Math.round((Math.abs(value) / prev) * 100) : null;
  return (
    <span className={cn("mt-1 block text-[0.7rem] font-semibold tabular-nums", flat ? "text-crema/40" : up ? "text-[#8fb8ad]" : "text-ember/90")}>
      {flat ? "≈" : up ? "▲" : "▼"} {flat ? "0" : fmt(Math.abs(value))}
      {pct != null ? ` (${pct}%)` : ""}
      <span className="font-normal text-crema/35"> vs prima</span>
    </span>
  );
}

function Card({ title, children }: { title: string; children: React.ReactNode }) {
  return (
    <section className="rounded-3xl bg-roast/80 p-6 ring-1 ring-sand/12 sm:p-7">
      <p className="mb-4 text-xs font-semibold uppercase tracking-[0.18em] text-crema/50">{title}</p>
      {children}
    </section>
  );
}

/** Area con linea sottile, griglia leggera e mirino al passaggio del mouse. */
function TrendChart({ series, metric }: { series: ListingAnalytics["series"]; metric: Metric }) {
  const W = 720;
  const H = 220;
  const P = { l: 34, r: 12, t: 12, b: 26 };
  const [hover, setHover] = useState<number | null>(null);
  const ref = useRef<SVGSVGElement>(null);
  const values = series.map((s) => s[metric]);
  const max = Math.max(4, ...values);
  const nice = Math.ceil(max / 4) * 4;
  const x = (i: number) => P.l + (series.length <= 1 ? 0 : (i / (series.length - 1)) * (W - P.l - P.r));
  const y = (v: number) => P.t + (1 - v / nice) * (H - P.t - P.b);
  const pts = values.map((v, i) => `${x(i).toFixed(1)},${y(v).toFixed(1)}`);
  const line = `M${pts.join(" L")}`;
  const area = `${line} L${x(values.length - 1).toFixed(1)},${y(0)} L${x(0).toFixed(1)},${y(0)} Z`;
  const ticks = [0, nice / 4, nice / 2, (nice * 3) / 4, nice];

  const onMove = (e: React.PointerEvent) => {
    const r = ref.current?.getBoundingClientRect();
    if (!r || series.length < 2) return;
    const px = ((e.clientX - r.left) / r.width) * W;
    const i = Math.round(((px - P.l) / (W - P.l - P.r)) * (series.length - 1));
    setHover(Math.max(0, Math.min(series.length - 1, i)));
  };

  const h = hover != null ? series[hover] : null;
  return (
    <div className="relative">
      <svg ref={ref} viewBox={`0 0 ${W} ${H}`} className="h-56 w-full touch-none" onPointerMove={onMove} onPointerLeave={() => setHover(null)} role="img" aria-label="Andamento nel periodo">
        <defs>
          <linearGradient id="vc-trend" x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#e0a465" stopOpacity="0.32" />
            <stop offset="100%" stopColor="#e0a465" stopOpacity="0" />
          </linearGradient>
        </defs>
        {ticks.map((t) => (
          <g key={t}>
            <line x1={P.l} x2={W - P.r} y1={y(t)} y2={y(t)} stroke="currentColor" className="text-crema/8" strokeWidth={1} />
            <text x={P.l - 8} y={y(t) + 4} textAnchor="end" className="fill-crema/35 text-[11px] tabular-nums">
              {Math.round(t)}
            </text>
          </g>
        ))}
        <motion.path key={`a-${metric}`} d={area} fill="url(#vc-trend)" initial={{ opacity: 0 }} animate={{ opacity: 1 }} transition={{ duration: 0.5 }} />
        <motion.path key={`l-${metric}`} d={line} fill="none" stroke="#e0a465" strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" initial={{ pathLength: 0 }} animate={{ pathLength: 1 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} />
        {hover != null ? (
          <g>
            <line x1={x(hover)} x2={x(hover)} y1={P.t} y2={H - P.b} stroke="currentColor" className="text-crema/25" strokeDasharray="3 3" />
            <circle cx={x(hover)} cy={y(values[hover])} r={5} fill="#e0a465" stroke="var(--color-roast)" strokeWidth={2} />
          </g>
        ) : null}
        <text x={P.l} y={H - 6} className="fill-crema/40 text-[11px]">
          {series[0] ? dayLabel(series[0].day) : ""}
        </text>
        <text x={W - P.r} y={H - 6} textAnchor="end" className="fill-crema/40 text-[11px]">
          {series.length ? dayLabel(series[series.length - 1].day) : ""}
        </text>
      </svg>
      {h ? (
        <div
          className="pointer-events-none absolute top-0 -translate-x-1/2 rounded-xl bg-espresso/95 px-3 py-2 text-xs shadow-xl ring-1 ring-sand/20"
          style={{ left: `${(x(hover!) / W) * 100}%` }}
        >
          <p className="text-crema/55">{dayLabel(h.day)}</p>
          <p className="font-semibold tabular-nums text-crema">
            {fmt(h[metric])} {METRICS.find((m) => m.id === metric)?.label.toLowerCase()}
          </p>
        </div>
      ) : null}
    </div>
  );
}

/** Ciambella con spazi tra le fette e legenda con percentuali. */
function DonutWithLegend({ entries, empty }: { entries: { key: string; label: string; value: number }[]; empty: string }) {
  const [hover, setHover] = useState<string | null>(null);
  const total = entries.reduce((a, e) => a + e.value, 0);
  const arcs = useMemo(() => {
    const R = 70;
    const C = 2 * Math.PI * R;
    const gap = entries.length > 1 ? 3 : 0;
    let acc = 0;
    return entries.map((e, i) => {
      const len = total ? (e.value / total) * C : 0;
      const a = { ...e, color: CAT[i % CAT.length], dash: `${Math.max(0, len - gap)} ${C}`, offset: -acc, R };
      acc += len;
      return a;
    });
  }, [entries, total]);

  if (!total) return <p className="py-10 text-center text-sm text-crema/45">{empty}</p>;
  const focus = arcs.find((a) => a.key === hover) || null;
  return (
    <div className="flex flex-col items-center gap-6 sm:flex-row sm:items-center">
      <div className="relative size-44 shrink-0">
        <svg viewBox="0 0 180 180" className="size-full -rotate-90">
          {arcs.map((a) => (
            <circle
              key={a.key}
              cx={90}
              cy={90}
              r={a.R}
              fill="none"
              stroke={a.color}
              strokeWidth={hover === a.key ? 22 : 18}
              strokeDasharray={a.dash}
              strokeDashoffset={a.offset}
              className="transition-[stroke-width] duration-200"
              onPointerEnter={() => setHover(a.key)}
              onPointerLeave={() => setHover(null)}
            />
          ))}
        </svg>
        <div className="pointer-events-none absolute inset-0 flex flex-col items-center justify-center text-center">
          <span className="font-display text-3xl font-semibold tabular-nums">{fmt(focus ? focus.value : total)}</span>
          <span className="text-xs text-crema/50">{focus ? focus.label : "in totale"}</span>
        </div>
      </div>
      <ul className="w-full min-w-0 flex-1 space-y-2">
        {arcs.map((a) => (
          <li
            key={a.key}
            onPointerEnter={() => setHover(a.key)}
            onPointerLeave={() => setHover(null)}
            className={cn("flex items-center gap-3 rounded-lg px-2 py-1 text-sm transition-colors", hover === a.key && "bg-crema/5")}
          >
            <span className="size-2.5 shrink-0 rounded-full" style={{ background: a.color }} />
            <span className="min-w-0 flex-1 truncate text-crema/85">{a.label}</span>
            <span className="tabular-nums text-crema/55">{((a.value / total) * 100).toFixed(1)}%</span>
          </li>
        ))}
      </ul>
    </div>
  );
}

const COUNTRY_NAME = (() => {
  try {
    return new Intl.DisplayNames(["it"], { type: "region" });
  } catch {
    return null;
  }
})();

/** Paesi: visibili solo sopra una soglia di visite, per la privacy. */
function Countries({ data }: { data: ListingAnalytics["countries"] }) {
  const sample = ["IT", "US", "DE", "ES", "FR", "GB"];
  const list = data.hidden ? sample.map((code, i) => ({ code, count: 40 - i * 6 })) : data.list;
  const shown = list.reduce((a, c) => a + c.count, 0);
  const other = Math.max(0, data.total - shown);
  return (
    <div className="relative">
      <ul className={cn("space-y-1", data.hidden && "pointer-events-none select-none blur-[6px]")} aria-hidden={data.hidden}>
        {list.map((c) => {
          const flag = `https://flagcdn.com/w40/${c.code.toLowerCase()}.png`;
          return (
            <li key={c.code} className="flex items-center gap-3 rounded-lg px-2 py-2 text-sm">
              { }
              <img src={flag} alt="" width={22} height={16} className="h-4 w-[22px] rounded-[3px] object-cover shadow-[0_0_0_1px_rgba(0,0,0,0.25)]" />
              <span className="min-w-0 flex-1 truncate text-crema/85">{COUNTRY_NAME?.of(c.code) || c.code}</span>
              <span className="font-semibold tabular-nums text-crema">{fmt(c.count)}</span>
            </li>
          );
        })}
        {!data.hidden && other > 0 ? (
          <li className="flex items-center gap-3 px-2 py-2 text-sm">
            <span className="min-w-0 flex-1 text-crema/60">Altri</span>
            <span className="tabular-nums text-crema/70">{fmt(other)}</span>
          </li>
        ) : null}
        {!data.hidden && !list.length ? <li className="py-10 text-center text-sm text-crema/45">Ancora nessun dato.</li> : null}
      </ul>
      {data.hidden ? (
        <div className="absolute inset-0 flex items-center justify-center p-6 text-center">
          <p className="max-w-xs text-sm text-crema/80">
            I paesi compaiono dopo {data.threshold} visite nel periodo, per proteggere la privacy di chi guarda.
          </p>
        </div>
      ) : null}
    </div>
  );
}
