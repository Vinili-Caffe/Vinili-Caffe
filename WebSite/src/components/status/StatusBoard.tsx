"use client";

import { DiscordContent } from "@/components/discord/DiscordContent";
import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import {
  CircleAlert,
  Clock,
  Coffee,
  Database,
  Disc3,
  Globe,
  Music,
  Vote,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import {
  beatTime,
  buildPastIncidentDays,
  buildResponseTimeSeries,
  DOWN,
  formatUptime,
  lastPing,
  lastStatus,
  loadLiveProcesses,
  loadStatus,
  MAINT,
  PENDING,
  UP,
  type Beat,
  type MetricPoint,
  type MetricRange,
  type PastIncidentDay,
  type ProcessLive,
  type Service,
  type StatusData,
} from "@/lib/status";
import { timeAgoMs } from "@/lib/time";
import { cn } from "@/lib/cn";

const REFRESH = 60;

const ICON_BY_NAME: [RegExp, LucideIcon][] = [
  [/sito/i, Globe],
  [/bot vinili/i, Disc3],
  [/bot caff/i, Coffee],
  [/database/i, Database],
  [/musica/i, Music],
  [/vot/i, Vote],
];
const iconFor = (name: string) => ICON_BY_NAME.find(([re]) => re.test(name))?.[1] ?? Globe;

const TONE = {
  [UP]: { led: "bg-emerald-400", glow: "shadow-[0_0_10px_2px_rgba(52,211,153,0.7)]", bar: "bg-emerald-400/85", text: "text-emerald-300", label: "Operativo" },
  [DOWN]: { led: "bg-red-500", glow: "shadow-[0_0_10px_2px_rgba(239,68,68,0.8)]", bar: "bg-red-500", text: "text-red-300", label: "Non raggiungibile" },
  [PENDING]: { led: "bg-amber-400", glow: "shadow-[0_0_10px_2px_rgba(251,191,36,0.7)]", bar: "bg-amber-400", text: "text-amber-300", label: "Rallentato" },
  [MAINT]: { led: "bg-sky-400", glow: "shadow-[0_0_10px_2px_rgba(56,189,248,0.7)]", bar: "bg-sky-400", text: "text-sky-300", label: "In manutenzione" },
} as const;
const tone = (s: number) => TONE[s as keyof typeof TONE] ?? TONE[PENDING];

const pct = (u: number | null) => (u == null ? "—" : `${(u * 100).toFixed(u >= 0.9995 ? 0 : 2).replace(".", ",")}%`);

function Equalizer({ on }: { on: boolean }) {
  return (
    <span className="flex h-8 items-end gap-[3px]" aria-hidden>
      {[0, 1, 2, 3, 4].map((i) => (
        <motion.span
          key={i}
          className={cn("h-[30px] w-[5px] origin-bottom rounded-full", on ? "bg-emerald-400" : "bg-amber-400")}
          initial={{ scaleY: 8 / 30 }}
          animate={on ? { scaleY: [8 / 30, 26 / 30, 12 / 30, 1, 10 / 30, 22 / 30, 8 / 30] } : { scaleY: 8 / 30 }}
          transition={on ? { duration: 1.6, repeat: Infinity, delay: i * 0.13, ease: "easeInOut" } : { duration: 0.4 }}
        />
      ))}
    </span>
  );
}

function BeatBar({ b, align }: { b: Beat; align: "left" | "center" | "right" }) {
  const t = beatTime(b.time);
  const label = `${t.toLocaleString("it-IT", { day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" })} · ${tone(b.status).label}${b.ping != null ? ` · ${b.ping} ms` : ""}`;
  return (
    <span className="group/beat relative flex-1">
      <span className={cn("block h-7 rounded-[3px] transition-transform group-hover/beat:scale-y-110", tone(b.status).bar)} />
      <span
        className={cn(
          "pointer-events-none invisible absolute bottom-full z-20 mb-2 whitespace-nowrap group-hover/beat:visible",
          align === "left" ? "left-0" : align === "right" ? "right-0" : "left-1/2 -translate-x-1/2",
        )}
      >
        <span className="block rounded-lg bg-espresso px-2 py-1 text-xs text-crema ring-1 ring-sand/20">{label}</span>
      </span>
    </span>
  );
}

function Channel({ s, i }: { s: Service; i: number }) {
  const st = lastStatus(s);
  const t = tone(st);
  const ping = lastPing(s);
  const Icon = iconFor(s.name);
  const beats = s.beats.slice(-40);
  const first = beats[0] ? beatTime(beats[0].time) : null;
  const mins = first ? Math.max(1, Math.round((Date.now() - first.getTime()) / 60000)) : null;
  return (
    <motion.li
      initial={{ opacity: 0, y: 14 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.05 * i, duration: 0.45, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-3xl bg-gradient-to-b from-mocha/70 to-roast/80 p-5 ring-1 ring-sand/12 sm:p-6"
    >
      <div className="flex items-center gap-3">
        <span className="relative flex size-11 shrink-0 items-center justify-center rounded-2xl bg-crema/5 text-caramel ring-1 ring-sand/15">
          <Icon className="size-5" />
          <span className={cn("absolute -right-0.5 -top-0.5 size-2.5 rounded-full", t.led, t.glow)} />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-xl font-semibold sm:text-2xl">{s.name}</p>
          <p className={cn("text-sm", t.text)}>
            {t.label}
            {ping != null && <span className="text-crema/45"> · {ping} ms</span>}
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-2xl font-semibold lining-nums text-sand sm:text-3xl">{pct(s.uptime24)}</p>
          <p className="text-xs text-crema/40">uptime 24h</p>
        </div>
      </div>
      <div className="mt-4 flex gap-[3px]">
        {beats.map((b, k) => (
          <BeatBar key={`${b.time}-${k}`} b={b} align={k < beats.length / 3 ? "left" : k > (beats.length * 2) / 3 ? "right" : "center"} />
        ))}
      </div>
      <div className="mt-1.5 flex justify-between text-[0.7rem] text-crema/35">
        <span>{mins != null ? `${mins} min fa` : ""}</span>
        <span>ora</span>
      </div>
    </motion.li>
  );
}

function ProcessCard({ p, i }: { p: ProcessLive; i: number }) {
  const Icon = /caff/i.test(p.name) ? Coffee : Disc3;
  const ok = p.ok;
  return (
    <motion.li
      initial={{ opacity: 0, y: 12 }}
      animate={{ opacity: 1, y: 0 }}
      transition={{ delay: 0.04 * i, duration: 0.4, ease: [0.22, 1, 0.36, 1] }}
      className="rounded-3xl bg-gradient-to-b from-mocha/70 to-roast/80 p-5 ring-1 ring-sand/12 sm:p-6"
    >
      <div className="flex items-center gap-3">
        <span className="relative flex size-11 shrink-0 items-center justify-center rounded-2xl bg-crema/5 text-caramel ring-1 ring-sand/15">
          <Icon className="size-5" />
          <span
            className={cn(
              "absolute -right-0.5 -top-0.5 size-2.5 rounded-full",
              ok ? "bg-emerald-400 shadow-[0_0_10px_2px_rgba(52,211,153,0.7)]" : "bg-red-500 shadow-[0_0_10px_2px_rgba(239,68,68,0.8)]",
            )}
          />
        </span>
        <div className="min-w-0 flex-1">
          <p className="truncate font-display text-xl font-semibold sm:text-2xl">{p.name}</p>
          <p className={cn("text-sm", ok ? "text-emerald-300" : "text-red-300")}>
            {ok ? "Processo attivo" : "Non raggiungibile"}
            {p.bot ? <span className="text-crema/40"> · {p.bot}</span> : null}
          </p>
        </div>
        <div className="text-right">
          <p className="font-display text-2xl font-semibold lining-nums text-sand sm:text-3xl">
            {p.gatewayPingMs != null ? `${p.gatewayPingMs}` : "—"}
            <span className="ml-1 text-sm font-normal text-crema/40">ms</span>
          </p>
          <p className="text-xs text-crema/40">gateway</p>
        </div>
      </div>
      <dl className="mt-4 grid grid-cols-2 gap-3 text-sm sm:grid-cols-4">
        <div className="rounded-2xl bg-crema/[0.04] px-3 py-2 ring-1 ring-sand/10">
          <dt className="text-xs text-crema/40">API Discord</dt>
          <dd className="mt-0.5 font-medium lining-nums text-sand">{p.restPingMs != null ? `${p.restPingMs} ms` : "—"}</dd>
        </div>
        <div className="rounded-2xl bg-crema/[0.04] px-3 py-2 ring-1 ring-sand/10">
          <dt className="text-xs text-crema/40">Database</dt>
          <dd className="mt-0.5 font-medium lining-nums text-sand">{p.mongoPingMs != null ? `${p.mongoPingMs} ms` : "—"}</dd>
        </div>
        <div className="rounded-2xl bg-crema/[0.04] px-3 py-2 ring-1 ring-sand/10">
          <dt className="text-xs text-crema/40">Uptime</dt>
          <dd className="mt-0.5 font-medium lining-nums text-sand">{formatUptime(p.uptimeSec)}</dd>
        </div>
        <div className="rounded-2xl bg-crema/[0.04] px-3 py-2 ring-1 ring-sand/10">
          <dt className="text-xs text-crema/40">{p.shard != null ? "Shard / RAM" : "RAM"}</dt>
          <dd className="mt-0.5 font-medium lining-nums text-sand">
            {p.shard != null ? `${p.shard}` : ""}
            {p.shard != null && p.memMb != null ? " · " : ""}
            {p.memMb != null ? `${p.memMb} MB` : p.shard == null ? "—" : ""}
          </dd>
        </div>
      </dl>
    </motion.li>
  );
}

function ResponseTimeChart({ points }: { points: MetricPoint[] }) {
  const current = points.length ? points[points.length - 1].ms : null;
  const width = 640;
  const height = 220;
  const padX = 12;
  const padY = 18;
  const maxY = Math.max(50, ...points.map((p) => p.ms)) * 1.15;
  const minY = 0;
  const innerW = width - padX * 2;
  const innerH = height - padY * 2;

  const coords = points.map((p, i) => {
    const x = padX + (points.length <= 1 ? innerW / 2 : (i / (points.length - 1)) * innerW);
    const y = padY + innerH - ((p.ms - minY) / (maxY - minY)) * innerH;
    return { x, y, ...p };
  });

  const line =
    coords.length > 1
      ? coords.map((c, i) => `${i === 0 ? "M" : "L"} ${c.x.toFixed(1)} ${c.y.toFixed(1)}`).join(" ")
      : "";
  const area =
    coords.length > 1
      ? `${line} L ${coords[coords.length - 1].x.toFixed(1)} ${(padY + innerH).toFixed(1)} L ${coords[0].x.toFixed(1)} ${(padY + innerH).toFixed(1)} Z`
      : "";

  const yTicks = [0.25, 0.5, 0.75, 1].map((f) => Math.round(maxY * f));
  const xLabels = coords.filter((_, i) => {
    if (coords.length <= 6) return true;
    const step = Math.ceil(coords.length / 6);
    return i % step === 0 || i === coords.length - 1;
  });

  return (
    <div className="rounded-3xl bg-gradient-to-b from-mocha/70 to-roast/80 p-5 ring-1 ring-sand/12 sm:p-6">
      <div className="flex items-start justify-between gap-3">
        <div>
          <p className="font-display text-xl font-semibold sm:text-2xl">Tempo di risposta API</p>
          <p className="mt-1 text-sm text-crema/45">Media dei controlli automatici sul sito</p>
        </div>
        <p className="font-display text-3xl font-semibold lining-nums text-sand">
          {current != null ? current : "—"}
          <span className="ml-1 text-base font-normal text-crema/40">ms</span>
        </p>
      </div>

      {coords.length > 1 ? (
        <div className="mt-4">
          <svg viewBox={`0 0 ${width} ${height}`} className="h-48 w-full sm:h-56" role="img" aria-label="Grafico latenza API">
            {yTicks.map((v) => {
              const y = padY + innerH - ((v - minY) / (maxY - minY)) * innerH;
              return (
                <g key={v}>
                  <line x1={padX} x2={width - padX} y1={y} y2={y} stroke="rgba(244,233,216,0.08)" strokeWidth="1" />
                  <text x={width - 4} y={y + 4} textAnchor="end" fill="rgba(244,233,216,0.35)" fontSize="11">
                    {v}
                  </text>
                </g>
              );
            })}
            <path d={area} fill="rgba(217,154,91,0.16)" />
            <path d={line} fill="none" stroke="#d99a5b" strokeWidth="2.5" strokeLinejoin="round" strokeLinecap="round" />
            {coords.map((c) => (
              <circle key={c.t} cx={c.x} cy={c.y} r="3" fill="#f4e9d8" stroke="#d99a5b" strokeWidth="1.5" />
            ))}
          </svg>
          <div className="mt-1 flex justify-between px-1 text-[0.7rem] text-crema/35">
            {xLabels.map((c) => (
              <span key={c.t}>{c.label}</span>
            ))}
          </div>
        </div>
      ) : (
        <p className="mt-8 text-center text-sm text-crema/45">Dati latenza non ancora disponibili.</p>
      )}
    </div>
  );
}

function PastIncidents({ days }: { days: PastIncidentDay[] }) {
  return (
    <section className="mt-10">
      <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-crema/40">Incidenti passati</h2>
      <ul className="mt-4 divide-y divide-sand/10">
        {days.map((d) => (
          <li key={d.key} className="flex flex-col gap-1 py-4 sm:flex-row sm:items-baseline sm:justify-between sm:gap-6">
            <p className="shrink-0 font-medium text-sand/90">{d.label}</p>
            <p className={cn("text-sm sm:text-right", d.ok ? "text-crema/45" : "text-amber-300")}>{d.detail}</p>
          </li>
        ))}
      </ul>
    </section>
  );
}

function UpdatedAgo({ atMs }: { atMs: number }) {
  const [now, setNow] = useState(() => Date.now());
  useEffect(() => {
    const id = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(id);
  }, []);
  const label = timeAgoMs(atMs, now);
  if (!label) return null;
  return <> · ultimo aggiornamento {label}</>;
}

function Countdown({ onDone, resetKey }: { onDone: () => void; resetKey: number }) {
  const [left, setLeft] = useState(REFRESH);
  useEffect(() => setLeft(REFRESH), [resetKey]);
  useEffect(() => {
    const id = window.setInterval(() => {
      if (document.hidden) return;
      setLeft((l) => (l <= 1 ? REFRESH : l - 1));
    }, 1000);
    return () => window.clearInterval(id);
  }, []);
  useEffect(() => {
    if (left === REFRESH) return;
    if (left === 1) {
      const t = window.setTimeout(onDone, 1000);
      return () => window.clearTimeout(t);
    }
  }, [left, onDone]);
  return (
    <span className="relative hidden size-12 shrink-0 items-center justify-center sm:flex" title="Prossimo aggiornamento">
      <svg viewBox="0 0 36 36" className="absolute inset-0 -rotate-90">
        <circle cx="18" cy="18" r="16" fill="none" stroke="rgba(244,233,216,0.1)" strokeWidth="2.5" />
        <circle
          cx="18"
          cy="18"
          r="16"
          fill="none"
          stroke="#d99a5b"
          strokeWidth="2.5"
          strokeLinecap="round"
          strokeDasharray={100.5}
          strokeDashoffset={100.5 * (1 - left / REFRESH)}
          style={{ transition: "stroke-dashoffset 1s linear" }}
        />
      </svg>
      <span className="text-xs tabular-nums text-crema/60">{left}s</span>
    </span>
  );
}

const RANGE_OPTS: { id: MetricRange; label: string }[] = [
  { id: "day", label: "Giorno" },
  { id: "week", label: "Settimana" },
  { id: "month", label: "Mese" },
];

export function StatusBoard({ initial }: { initial: StatusData | null }) {
  const [data, setData] = useState(initial);
  const [processes, setProcesses] = useState<ProcessLive[]>([]);
  const [error, setError] = useState(false);
  const [round, setRound] = useState(0);
  const [range, setRange] = useState<MetricRange>("day");

  const refresh = useCallback(async () => {
    const [d, live] = await Promise.all([loadStatus(""), loadLiveProcesses()]);
    if (d) {
      setData(d);
      setError(false);
    } else setError(true);
    setProcesses(live);
    setRound((n) => n + 1);
  }, []);
  useEffect(() => {
    refresh();
  }, [refresh]);

  const services = data?.services ?? [];
  const down = services.filter((s) => lastStatus(s) === DOWN);
  const slow = services.filter((s) => lastStatus(s) === PENDING);
  const maint = services.filter((s) => lastStatus(s) === MAINT);
  const allOk = services.length > 0 && !down.length && !slow.length && !maint.length;
  const headline = !services.length
    ? "Stato non disponibile"
    : allOk
      ? "Tutto in sintonia"
      : down.length
        ? `${down.length === 1 ? "Un servizio non risponde" : `${down.length} servizi non rispondono`}`
        : maint.length
          ? "Manutenzione in corso"
          : "Qualche servizio è rallentato";

  const series = useMemo(() => buildResponseTimeSeries(services, range), [services, range]);
  const pastDays = useMemo(() => buildPastIncidentDays(services, 7), [services]);

  return (
    <div className="mx-auto max-w-4xl px-6 pb-16">
      <motion.div
        initial={{ opacity: 0, scale: 0.98 }}
        animate={{ opacity: 1, scale: 1 }}
        className={cn(
          "flex items-center gap-5 rounded-3xl p-6 ring-1 sm:p-7",
          allOk ? "bg-emerald-500/[0.08] ring-emerald-400/30" : down.length ? "bg-red-500/[0.08] ring-red-400/35" : "bg-amber-500/[0.08] ring-amber-400/30",
        )}
      >
        <Equalizer on={allOk} />
        <div className="min-w-0 flex-1">
          <AnimatePresence mode="wait">
            <motion.p
              key={headline}
              initial={{ opacity: 0, y: 6 }}
              animate={{ opacity: 1, y: 0 }}
              exit={{ opacity: 0, y: -6 }}
              className="font-display text-3xl font-semibold leading-tight sm:text-4xl"
            >
              {headline}
            </motion.p>
          </AnimatePresence>
          <p className="mt-1 text-sm text-crema/55">
            {services.length} servizi monitorati
            {data?.fetchedAt ? <UpdatedAgo atMs={data.fetchedAt} /> : null}
            {error && " · ultimo aggiornamento non riuscito"}
          </p>
        </div>
        <Countdown onDone={refresh} resetKey={round} />
      </motion.div>

      {data?.incident && (
        <div className="mt-4 flex gap-3 rounded-2xl bg-red-500/[0.08] p-5 ring-1 ring-red-400/30">
          <CircleAlert className="mt-0.5 size-5 shrink-0 text-red-300" />
          <div>
            <p className="font-semibold">{data.incident.title}</p>
            {data.incident.content && <DiscordContent text={data.incident.content} className="mt-1 text-sm text-crema/70" />}
          </div>
        </div>
      )}
      {data?.maintenance.map((m) => (
        <div key={m.title} className="mt-4 flex gap-3 rounded-2xl bg-sky-500/[0.08] p-5 ring-1 ring-sky-400/30">
          <Wrench className="mt-0.5 size-5 shrink-0 text-sky-300" />
          <div>
            <p className="font-semibold">{m.title}</p>
            {m.description && <DiscordContent text={m.description} className="mt-1 text-sm text-crema/70" />}
          </div>
        </div>
      ))}

      {processes.length > 0 && (
        <section className="mt-10">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-crema/40">Processi live</h2>
          <p className="mt-2 text-sm text-crema/50">Gateway Discord, API, database, uptime e RAM — letti dai processi live.</p>
          <ul className="mt-4 space-y-3">
            {processes.map((p, i) => (
              <ProcessCard key={p.id} p={p} i={i} />
            ))}
          </ul>
        </section>
      )}

      <section className="mt-10">
        <div className="flex flex-wrap items-center justify-between gap-3">
          <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-crema/40">Metriche di sistema</h2>
          <div className="flex rounded-full bg-crema/[0.06] p-1 ring-1 ring-sand/12">
            {RANGE_OPTS.map((opt) => (
              <button
                key={opt.id}
                type="button"
                onClick={() => setRange(opt.id)}
                className={cn(
                  "rounded-full px-3 py-1.5 text-xs font-medium transition",
                  range === opt.id ? "bg-caramel text-espresso" : "text-crema/55 hover:text-crema/85",
                )}
              >
                {opt.label}
              </button>
            ))}
          </div>
        </div>
        <div className="mt-4">
          <ResponseTimeChart points={series} />
        </div>
      </section>

      <section className="mt-10">
        <h2 className="text-xs font-semibold uppercase tracking-[0.18em] text-crema/40">Servizi monitorati</h2>
        <ul className="mt-4 space-y-3">
          {services.map((s, i) => (
            <Channel key={s.id} s={s} i={i} />
          ))}
        </ul>
      </section>

      <PastIncidents days={pastDays} />

      <p className="mt-6 flex items-center justify-center gap-2 text-center text-xs text-crema/40">
        <Clock className="size-3.5" /> Ogni barra è un controllo automatico, circa uno al minuto. Passaci sopra per i dettagli.
      </p>
    </div>
  );
}
