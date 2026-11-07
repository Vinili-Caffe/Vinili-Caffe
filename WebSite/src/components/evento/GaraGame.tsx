"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import { Flag, Rocket } from "lucide-react";
import { fetchEventoGara, pickEventoGara } from "@/lib/evento-api";
import { useAuth } from "@/lib/auth";
import { showToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import { garaPodIconUrl } from "@/lib/evento-gara-art";
import {
  EventoLoginGate,
  EventoPanel,
  EventoSkeleton,
  EventoTitle,
} from "@/components/evento/EventoUi";

function GaraPodAvatar({
  podId,
  label,
  color,
  className,
}: {
  podId: string;
  label: string;
  color: string;
  className?: string;
}) {
  const src = garaPodIconUrl(podId);
  return (
    <span
      className={cn(
        "relative size-12 shrink-0 overflow-hidden rounded-full ring-2 ring-white/30",
        className,
      )}
      style={{ boxShadow: `0 0 18px ${color}55` }}
    >
      {src ? (
        // eslint-disable-next-line @next/next/no-img-element
        <img
          src={src}
          alt={label}
          data-vc-lightbox-ignore
          className="size-full object-cover object-top"
          draggable={false}
        />
      ) : (
        <span className="block size-full" style={{ background: color }} aria-hidden />
      )}
    </span>
  );
}

const POD_COLORS: Record<string, string> = {
  sebulba: "#ef4444",
  anakin: "#f5c518",
  gasgano: "#34d399",
  teemto: "#38bdf8",
  ben: "#c084fc",
};

type GaraResult = {
  place: number;
  won: boolean;
  finishOrder?: string[];
};

type RaceLane = {
  id: string;
  label: string;
  progress: number;
  place: number;
  finished: boolean;
  color: string;
  laneBias: number;
};

type Pt = { x: number; y: number };

const W = 920;
const H = 540;

/** Tracciato stile GP (chicane, hairpin, rettilineo) — senso orario, start in alto. */
const TRACK_WAYPOINTS: Pt[] = [
  { x: 210, y: 78 },
  { x: 380, y: 62 },
  { x: 560, y: 58 },
  { x: 720, y: 78 },
  { x: 820, y: 130 },
  { x: 868, y: 210 },
  { x: 850, y: 300 },
  { x: 760, y: 360 },
  { x: 680, y: 410 },
  { x: 560, y: 455 },
  { x: 420, y: 478 },
  { x: 290, y: 455 },
  { x: 190, y: 400 },
  { x: 130, y: 320 },
  { x: 118, y: 230 },
  { x: 150, y: 145 },
  { x: 210, y: 78 },
];

function catmullRom(p0: Pt, p1: Pt, p2: Pt, p3: Pt, t: number): Pt {
  const t2 = t * t;
  const t3 = t2 * t;
  return {
    x:
      0.5 *
      (2 * p1.x +
        (-p0.x + p2.x) * t +
        (2 * p0.x - 5 * p1.x + 4 * p2.x - p3.x) * t2 +
        (-p0.x + 3 * p1.x - 3 * p2.x + p3.x) * t3),
    y:
      0.5 *
      (2 * p1.y +
        (-p0.y + p2.y) * t +
        (2 * p0.y - 5 * p1.y + 4 * p2.y - p3.y) * t2 +
        (-p0.y + 3 * p1.y - 3 * p2.y + p3.y) * t3),
  };
}

type BuiltTrack = {
  pts: Pt[];
  cum: number[];
  total: number;
  centerD: string;
};

function buildTrack(waypoints: Pt[], samplesPerSeg = 28): BuiltTrack {
  const n = waypoints.length - 1; /* ultimo = primo */
  const pts: Pt[] = [];
  for (let i = 0; i < n; i += 1) {
    const p0 = waypoints[(i - 1 + n) % n];
    const p1 = waypoints[i];
    const p2 = waypoints[(i + 1) % n];
    const p3 = waypoints[(i + 2) % n];
    for (let s = 0; s < samplesPerSeg; s += 1) {
      pts.push(catmullRom(p0, p1, p2, p3, s / samplesPerSeg));
    }
  }
  const cum = [0];
  for (let i = 1; i < pts.length; i += 1) {
    const dx = pts[i]!.x - pts[i - 1]!.x;
    const dy = pts[i]!.y - pts[i - 1]!.y;
    cum.push(cum[i - 1]! + Math.hypot(dx, dy));
  }
  const total = cum[cum.length - 1] || 1;
  const centerD = pts.map((p, i) => `${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`).join(" ") + " Z";
  return { pts, cum, total, centerD };
}

const TRACK = buildTrack(TRACK_WAYPOINTS);

function pointOnTrack(t01: number, laneOffset = 0): Pt & { angle: number } {
  const t = ((t01 % 1) + 1) % 1;
  const dist = t * TRACK.total;
  let lo = 0;
  let hi = TRACK.cum.length - 1;
  while (lo < hi) {
    const mid = (lo + hi) >> 1;
    if (TRACK.cum[mid]! < dist) lo = mid + 1;
    else hi = mid;
  }
  const i = Math.max(1, lo);
  const c0 = TRACK.cum[i - 1]!;
  const c1 = TRACK.cum[i]!;
  const u = c1 > c0 ? (dist - c0) / (c1 - c0) : 0;
  const a = TRACK.pts[i - 1]!;
  const b = TRACK.pts[i]!;
  const x = a.x + (b.x - a.x) * u;
  const y = a.y + (b.y - a.y) * u;
  const tx = b.x - a.x;
  const ty = b.y - a.y;
  const len = Math.hypot(tx, ty) || 1;
  const nx = -ty / len;
  const ny = tx / len;
  return {
    x: x + nx * laneOffset,
    y: y + ny * laneOffset,
    angle: Math.atan2(ty, tx),
  };
}

function easeOutCubic(t: number) {
  const x = Math.min(1, Math.max(0, t));
  return 1 - (1 - x) ** 3;
}

function resolveFinishOrder(pods: Array<{ id: string }>, youId: string, youPlace: number, apiOrder?: string[]) {
  const ids = pods.map((p) => p.id);
  if (apiOrder?.length) {
    const clean = apiOrder.map(String).filter((id) => ids.includes(id));
    for (const id of ids) if (!clean.includes(id)) clean.push(id);
    return clean;
  }
  const n = ids.length;
  const place = Math.min(Math.max(1, youPlace), n);
  const others = ids.filter((id) => id !== youId);
  const remaining = Array.from({ length: n }, (_, i) => i + 1).filter((p) => p !== place);
  const map = new Map<string, number>();
  map.set(youId, place);
  others.forEach((id, i) => map.set(id, remaining[i] ?? i + 1));
  return [...ids].sort((a, b) => (map.get(a) || 99) - (map.get(b) || 99));
}

/** Arrivi sparsi nell'ultimo tratto di una gara ~30s (1° ~22s … ultimo ~29s). */
function finishTimesForOrder(order: string[]) {
  const n = Math.max(1, order.length);
  const map = new Map<string, number>();
  order.forEach((id, i) => {
    const span = n <= 1 ? 0 : 0.24 / (n - 1);
    map.set(id, 0.72 + i * span);
  });
  return map;
}

/** Moto quasi lineare: i pallini restano visibili tutto il giro. */
function easeRace(t: number) {
  const x = Math.min(1, Math.max(0, t));
  return x * 0.88 + easeOutCubic(x) * 0.12;
}

function PlaceBadge({ place }: { place: number }) {
  if (place === 1) {
    return (
      <span className="inline-flex size-5 items-center justify-center rounded-full bg-gradient-to-b from-[#f5e6a3] to-[#c9a227] text-[0.6rem] font-bold text-ink shadow-[0_4px_10px_rgba(201,162,39,0.45)]" title="1°">
        1
      </span>
    );
  }
  if (place === 2) {
    return (
      <span className="inline-flex size-5 items-center justify-center rounded-full bg-gradient-to-b from-[#f0f0f0] to-[#9ca3af] text-[0.6rem] font-bold text-ink shadow-[0_4px_10px_rgba(156,163,175,0.4)]" title="2°">
        2
      </span>
    );
  }
  if (place === 3) {
    return (
      <span className="inline-flex size-5 items-center justify-center rounded-full bg-gradient-to-b from-[#e8b48a] to-[#b45309] text-[0.6rem] font-bold text-ink shadow-[0_4px_10px_rgba(180,83,9,0.4)]" title="3°">
        3
      </span>
    );
  }
  return <span className="inline-flex w-5 justify-center tabular-nums font-semibold text-crema/50">{place}</span>;
}

function LightsOverlay({ phase }: { phase: 0 | 1 | 2 | 3 | 4 }) {
  if (phase < 1) return null;
  return (
    <div className="pointer-events-none absolute inset-0 z-20 flex items-start justify-center pt-4 sm:pt-6">
      <div className="flex flex-col items-center gap-2">
        <div className="flex items-center gap-2.5 rounded-full bg-black/75 px-4 py-2.5 ring-1 ring-crema/15">
          {[1, 2, 3].map((i) => (
            <span
              key={i}
              className={cn(
                "size-4 rounded-full sm:size-5",
                phase >= i && phase < 4 ? "bg-rose-500 shadow-[0_8px_20px_rgba(244,63,94,0.7)]" : "bg-crema/15",
                phase >= 4 && "bg-emerald-400 shadow-[0_8px_20px_rgba(52,211,153,0.6)]",
              )}
            />
          ))}
        </div>
        {phase >= 4 ? (
          <p className="font-display text-3xl font-semibold tracking-[0.12em] text-emerald-300 drop-shadow-[0_10px_28px_rgba(16,185,129,0.55)] sm:text-4xl">
            VIA!
          </p>
        ) : null}
      </div>
    </div>
  );
}

function DotRacer({
  x,
  y,
  color,
  you,
  label,
  finished,
  racing,
  trail,
}: {
  x: number;
  y: number;
  color: string;
  you?: boolean;
  label: string;
  finished?: boolean;
  racing?: boolean;
  trail: Pt[];
}) {
  const r = you ? 11 : 9;
  return (
    <g opacity={finished && !racing ? 0.88 : 1}>
      {trail.map((p, i) => (
        <circle
          key={i}
          cx={p.x}
          cy={p.y}
          r={r * (0.35 + i * 0.12)}
          fill={color}
          opacity={0.08 + i * 0.07}
        />
      ))}
      {you ? <circle cx={x} cy={y} r={r + 7} fill="none" stroke={color} strokeWidth={1.4} opacity={0.45} /> : null}
      <circle
        cx={x}
        cy={y}
        r={r + 2.5}
        fill={color}
        opacity={0.28}
        filter={you ? "url(#dotGlow)" : undefined}
      />
      <circle cx={x} cy={y} r={r} fill={color} stroke="#fff8e7" strokeWidth={you ? 2.4 : 1.4} />
      <circle cx={x - r * 0.25} cy={y - r * 0.3} r={r * 0.28} fill="#fff" opacity={0.45} />
      <title>{label}</title>
    </g>
  );
}

function CircuitRace({
  lanes,
  youId,
  racing,
  lights,
}: {
  lanes: RaceLane[];
  youId: string | null;
  racing?: boolean;
  lights?: 0 | 1 | 2 | 3 | 4;
}) {
  const standings = useMemo(
    () => [...lanes].sort((a, b) => a.place - b.place || b.progress - a.progress),
    [lanes],
  );
  const start = pointOnTrack(0, 0);

  const racers = useMemo(() => {
    return lanes.map((lane, i) => {
      const mid = (lanes.length - 1) / 2;
      const baseLane = (i - mid) * 7.5;
      const wobble = racing && !lane.finished ? lane.laneBias * 40 : 0;
      const t = Math.min(0.9992, Math.max(0, lane.progress));
      const p = pointOnTrack(t, baseLane + wobble);
      const trail: Pt[] = [];
      if (racing && !lane.finished) {
        for (let k = 5; k >= 1; k -= 1) {
          const tp = Math.max(0, t - k * 0.008);
          trail.push(pointOnTrack(tp, baseLane + wobble * 0.55));
        }
      }
      return { lane, p, trail };
    });
  }, [lanes, racing]);

  return (
    <div className="relative overflow-hidden rounded-2xl bg-[#0a0c10] ring-1 ring-[#c9a227]/28">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Circuito Mos Espa GP">
        <defs>
          <radialGradient id="gpSky" cx="50%" cy="20%" r="80%">
            <stop offset="0%" stopColor="#3d2814" />
            <stop offset="55%" stopColor="#14100c" />
            <stop offset="100%" stopColor="#060508" />
          </radialGradient>
          <linearGradient id="asphalt" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#2e2e32" />
            <stop offset="50%" stopColor="#1c1c20" />
            <stop offset="100%" stopColor="#121214" />
          </linearGradient>
          <filter id="dotGlow" x="-80%" y="-80%" width="260%" height="260%">
            <feGaussianBlur stdDeviation="4" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
          <pattern id="kerb" width="14" height="8" patternUnits="userSpaceOnUse" patternTransform="rotate(18)">
            <rect width="7" height="8" fill="#f5f0e6" />
            <rect x="7" width="7" height="8" fill="#dc2626" />
          </pattern>
        </defs>

        <rect width={W} height={H} fill="url(#gpSky)" />
        {/* runoff / ghiaia */}
        <ellipse cx={200} cy={480} rx={220} ry={50} fill="#2a1c10" opacity={0.55} />
        <ellipse cx={760} cy={60} rx={180} ry={40} fill="#241808" opacity={0.45} />
        <ellipse cx={480} cy={280} rx={160} ry={90} fill="#1a140e" opacity={0.35} />

        {/* tribune */}
        <rect x={340} y={210} width={200} height={46} rx={3} fill="#16120e" opacity={0.9} />
        <rect x={352} y={218} width={176} height={8} fill="#c9a227" opacity={0.22} />
        <text x={440} y={248} textAnchor="middle" fill="#e4c76b" fontSize={12} opacity={0.7} letterSpacing="2">
          MOS ESPA GP
        </text>

        {/* cordolo esterno */}
        <path d={TRACK.centerD} fill="none" stroke="url(#kerb)" strokeWidth={38} strokeLinejoin="round" opacity={0.85} />
        {/* asfalto */}
        <path
          d={TRACK.centerD}
          fill="none"
          stroke="url(#asphalt)"
          strokeWidth={28}
          strokeLinejoin="round"
          strokeLinecap="round"
        />
        {/* linea centrale tratteggiata */}
        <path
          d={TRACK.centerD}
          fill="none"
          stroke="#e4c76b"
          strokeWidth={1.4}
          strokeDasharray="10 12"
          opacity={racing ? 0.55 : 0.35}
          className={racing ? "vc-gara-dash" : undefined}
        />
        {/* bordo interno sottile */}
        <path d={TRACK.centerD} fill="none" stroke="#8a7350" strokeWidth={1.2} opacity={0.35} />

        {/* start/finish */}
        {Array.from({ length: 8 }).map((_, i) => (
          <rect
            key={i}
            x={start.x - 14}
            y={start.y - 16 + i * 4}
            width={28}
            height={4}
            fill={i % 2 === 0 ? "#f5f0e6" : "#111"}
            transform={`rotate(${(start.angle * 180) / Math.PI} ${start.x} ${start.y})`}
            opacity={0.95}
          />
        ))}
        <text
          x={start.x}
          y={start.y - 28}
          textAnchor="middle"
          fill="#e4c76b"
          fontSize={11}
          fontWeight={700}
          opacity={0.85}
        >
          START / FINISH
        </text>

        <text x={780} y={200} fill="#e4c76b" fontSize={10} opacity={0.35}>
          T1
        </text>
        <text x={520} y={470} fill="#e4c76b" fontSize={10} opacity={0.35}>
          T8
        </text>

        {racers.map(({ lane, p, trail }) => (
          <DotRacer
            key={lane.id}
            x={p.x}
            y={p.y}
            color={lane.color}
            you={lane.id === youId}
            label={lane.label}
            finished={lane.finished}
            racing={racing}
            trail={trail}
          />
        ))}
      </svg>

      {racing ? <LightsOverlay phase={lights ?? 0} /> : null}

      {/* Classifica solo a fine gara — durante la corsa resta nascosta. */}
      {!racing && standings.length ? (
        <ol className="absolute right-2 top-2 z-10 flex w-[9.5rem] flex-col gap-0.5 sm:right-3 sm:top-3 sm:w-44">
          {standings.map((l) => (
            <li
              key={l.id}
              className={cn(
                "flex items-center gap-2 rounded-md bg-black/75 px-2 py-1 text-[0.7rem] text-crema ring-1 ring-white/10 backdrop-blur-sm",
                l.id === youId && "ring-[#e4c76b]/55",
              )}
            >
              <PlaceBadge place={l.place} />
              <span className="size-2.5 shrink-0 rounded-full" style={{ background: l.color }} />
              <span className="min-w-0 flex-1 truncate font-medium">{l.label}</span>
              {l.finished ? <span className="text-[0.6rem] text-emerald-300">FIN</span> : null}
            </li>
          ))}
        </ol>
      ) : null}
    </div>
  );
}

export function GaraGame() {
  const { token, ready, login } = useAuth();
  const reduceMotion = useReducedMotion();
  const [loading, setLoading] = useState(true);
  const [pods, setPods] = useState<Array<{ id: string; label: string }>>([]);
  const [pick, setPick] = useState<string | null>(null);
  const [result, setResult] = useState<GaraResult | null>(null);
  const [canPick, setCanPick] = useState(false);
  const [busy, setBusy] = useState(false);
  const [racing, setRacing] = useState(false);
  const [lanes, setLanes] = useState<RaceLane[]>([]);
  const [lapHint, setLapHint] = useState("Griglia di partenza");
  const [lights, setLights] = useState<0 | 1 | 2 | 3 | 4>(0);
  const raceGenRef = useRef(0);
  const racingRef = useRef(false);
  const rafRef = useRef<number | null>(null);
  const raceBoxRef = useRef<HTMLDivElement | null>(null);

  const reload = useCallback(
    async (opts?: { soft?: boolean }) => {
      if (!ready) return;
      /* Non resettare la UI mentre la gara è in corso (soft reload / refetch). */
      if (racingRef.current && opts?.soft) return;
      if (!opts?.soft) setLoading(true);
      const st = await fetchEventoGara(token);
      if (!opts?.soft) setLoading(false);
      if (!st?.ok) {
        if (!opts?.soft) showToast(st?.message || "Gara non disponibile.", true);
        return;
      }
      if (racingRef.current) return;
      setPods(st.pods || []);
      setPick(st.pick || null);
      setResult((st.result as GaraResult | null) || null);
      setCanPick(Boolean(st.canPick));
    },
    [ready, token],
  );

  useEffect(() => {
    void reload();
    return () => {
      raceGenRef.current += 1;
      racingRef.current = false;
      if (rafRef.current) cancelAnimationFrame(rafRef.current);
    };
  }, [reload]);

  async function runRaceAnimation(podId: string, place: number, finishOrder?: string[]) {
    const gen = ++raceGenRef.current;
    if (rafRef.current) cancelAnimationFrame(rafRef.current);

    const order = resolveFinishOrder(pods, podId, place, finishOrder);
    const finishAt = finishTimesForOrder(order);
    const placeOf = new Map(order.map((id, i) => [id, i + 1]));

    const field: RaceLane[] = pods.map((p, i) => ({
      id: p.id,
      label: p.label,
      progress: 0.003 * i,
      place: placeOf.get(p.id) || i + 1,
      finished: false,
      color: POD_COLORS[p.id] || `hsl(${(i * 55) % 360} 80% 55%)`,
      laneBias: (i - (pods.length - 1) / 2) * 0.04,
    }));
    racingRef.current = true;
    setLanes(field);
    setRacing(true);
    setLights(0);
    setLapHint("Semaforo…");
    requestAnimationFrame(() => {
      raceBoxRef.current?.scrollIntoView({ behavior: "smooth", block: "nearest" });
    });

    const cancelled = () => raceGenRef.current !== gen;
    /* Anche con reduced-motion: gara breve ma visibile (non skip istantaneo). */
    const DURATION_MS = reduceMotion ? 9000 : 30000;

    for (const phase of [1, 2, 3] as const) {
      if (cancelled()) break;
      setLights(phase);
      await new Promise((r) => setTimeout(r, reduceMotion ? 220 : 480));
    }
    if (!cancelled()) {
      setLights(4);
      setLapHint("Via!");
      await new Promise((r) => setTimeout(r, reduceMotion ? 180 : 360));
    }
    if (!cancelled()) setLights(0);

    if (!cancelled()) {
      const t0 = performance.now();
      await new Promise<void>((resolve) => {
        const tick = (now: number) => {
          if (cancelled()) {
            resolve();
            return;
          }
          const raw = Math.min(1, (now - t0) / DURATION_MS);

          if (raw < 0.22) setLapHint("Stretto delle Dune");
          else if (raw < 0.48) setLapHint("Canyon dei Tusken");
          else if (raw < 0.7) setLapHint("Terra dei Jawa");
          else if (raw < 0.88) setLapHint("Valle dei due Soli");
          else setLapHint("Arrivo al traguardo");

          const next: RaceLane[] = field.map((lane, i) => {
            const ft = finishAt.get(lane.id) ?? 0.9;
            const local = Math.min(1, raw / ft);
            const progress = easeRace(local);
            const finished = raw >= ft;
            const laneBias = lane.laneBias * 0.9 + Math.sin(now / 580 + i * 1.9) * 0.012;
            return {
              ...lane,
              progress: finished ? 1 : progress,
              finished,
              laneBias,
              place: 0,
            };
          });

          const ranked = [...next].sort((a, b) => {
            if (a.finished !== b.finished) return a.finished ? -1 : 1;
            if (a.finished && b.finished) return (finishAt.get(a.id) ?? 1) - (finishAt.get(b.id) ?? 1);
            return b.progress - a.progress;
          });
          ranked.forEach((lane, idx) => {
            lane.place = idx + 1;
          });

          setLanes(next.map((l) => ({ ...l })));

          if (raw < 1) rafRef.current = requestAnimationFrame(tick);
          else resolve();
        };
        rafRef.current = requestAnimationFrame(tick);
      });
    }

    if (!cancelled()) {
      setLanes((prev) =>
        prev.map((lane) => {
          const pl = placeOf.get(lane.id) || 99;
          return {
            ...lane,
            progress: Math.max(0.02, 1 - (pl - 1) * 0.014),
            place: pl,
            finished: true,
          };
        }),
      );
      setLapHint("Bandiera a scacchi");
      await new Promise((r) => setTimeout(r, reduceMotion ? 600 : 1500));
    }

    if (raceGenRef.current === gen) {
      racingRef.current = false;
      setRacing(false);
      setLights(0);
    }
  }

  async function choose(podId: string) {
    if (!token || busy || !canPick || racingRef.current) return;
    setBusy(true);
    setPick(podId);
    setCanPick(false);
    setResult(null);

    /* Mostra subito la griglia (semaforo) mentre arriva l’esito API. */
    const preview: RaceLane[] = pods.map((p, i) => ({
      id: p.id,
      label: p.label,
      progress: 0.003 * i,
      place: i + 1,
      finished: false,
      color: POD_COLORS[p.id] || `hsl(${(i * 55) % 360} 80% 55%)`,
      laneBias: (i - (pods.length - 1) / 2) * 0.04,
    }));
    racingRef.current = true;
    setLanes(preview);
    setRacing(true);
    setLights(1);
    setLapHint("Semaforo…");

    const out = await pickEventoGara(token, podId);
    if (!out?.ok) {
      racingRef.current = false;
      raceGenRef.current += 1;
      setRacing(false);
      setLights(0);
      setLanes([]);
      setPick(null);
      setCanPick(true);
      setBusy(false);
      showToast(out?.message || "Scelta non riuscita.", true);
      return;
    }
    const place = out.result?.place ?? 3;
    const won = Boolean(out.result?.won);
    const finishOrder = out.result?.finishOrder;
    await runRaceAnimation(podId, place, finishOrder);
    const reward = (out.result as { reward?: { crateId?: string; exp?: number } | null } | undefined)?.reward;
    setResult({ place, won, finishOrder });
    setBusy(false);
    const crateLabel =
      reward?.crateId === "omega"
        ? "Cassa Omega"
        : reward?.crateId === "beta"
          ? "Cassa Beta"
          : reward?.crateId === "alpha"
            ? "Cassa Alpha"
            : null;
    if (crateLabel) {
      showToast(`${place}° posto · ${crateLabel}${reward?.exp ? ` + ${reward.exp} exp` : ""}`);
    } else {
      showToast(won ? "Gara terminata!" : `${place}° posto`);
    }
    void reload({ soft: true });
  }

  if (loading) return <EventoSkeleton className="mx-auto max-w-2xl px-6" />;
  if (!token) {
    return (
      <div className="mx-auto max-w-lg px-6">
        <EventoLoginGate label="Accedi per scegliere lo sguscio e gareggiare." onLogin={login} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-2xl space-y-5 px-6">
      <AnimatePresence mode="wait">
        {racing ? (
          <motion.div
            key="race"
            ref={raceBoxRef}
            initial={{ opacity: 0, y: 10 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.28, ease: [0.22, 1, 0.36, 1] }}
          >
            <EventoPanel glow="blue" className="!overflow-visible !p-3 sm:!p-4">
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <h2 className="font-display text-2xl font-semibold text-crema">Gara in corso</h2>
                  <p className="mt-1 text-sm text-crema/70">{lapHint}</p>
                </div>
                <span className="rounded-full bg-[#c9a227]/15 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wider text-[#e4c76b] ring-1 ring-[#c9a227]/35">
                  Circuito di Mos Espa
                </span>
              </div>
              <CircuitRace lanes={lanes} youId={pick} racing lights={lights} />
            </EventoPanel>
          </motion.div>
        ) : result ? (
          <motion.div
            key="res"
            initial={{ opacity: 0, scale: 0.97 }}
            animate={{ opacity: 1, scale: 1 }}
            transition={{ duration: 0.32, ease: [0.22, 1, 0.36, 1] }}
          >
            <EventoPanel className="text-center" glow={result.won ? "gold" : "blue"}>
              <Flag className="mx-auto size-9 text-sand" aria-hidden />
              <EventoTitle>{result.won ? "Vittoria!" : `${result.place}° posto`}</EventoTitle>
              {pick ? (
                <p className="mt-2 text-sm text-crema/65">
                  Sguscio: {pods.find((p) => p.id === pick)?.label || pick}
                </p>
              ) : null}
              <p className="mt-3 text-xs text-crema/45">Prossimo gara fra 3 ore.</p>
            </EventoPanel>
            {lanes.length ? (
              <div className="mt-4">
                <CircuitRace lanes={lanes} youId={pick} />
              </div>
            ) : null}
          </motion.div>
        ) : (
          <motion.div key="pick" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <EventoPanel glow="none" className="text-center">
              <Rocket className="mx-auto size-8 text-[#2ea8ff]" aria-hidden />
              <h2 className="mt-2 font-display text-2xl font-semibold text-crema">Gran premio di Mos Espa</h2>
              <p className="mt-2 text-sm text-crema/65">
                Scegli lo sguscio e vinci tra: Cassa Omega, Cassa Beta, Cassa Alpha.
              </p>
            </EventoPanel>
          </motion.div>
        )}
      </AnimatePresence>

      {!racing ? (
        <ul className="grid gap-3 sm:grid-cols-1">
          {pods.map((p) => {
            const selected = pick === p.id;
            const color = POD_COLORS[p.id] || "#e4c76b";
            return (
              <li key={p.id}>
                <button
                  type="button"
                  disabled={!canPick || busy}
                  onClick={() => void choose(p.id)}
                  className={cn(
                    "group relative flex w-full items-center gap-4 overflow-hidden rounded-2xl px-4 py-4 text-left ring-1 transition",
                    selected
                      ? "bg-gradient-to-r from-[#c9a227]/25 to-[#2ea8ff]/15 ring-[#c9a227]/55"
                      : "bg-black/40 ring-cyan-300/15 backdrop-blur-sm hover:ring-cyan-300/40",
                    "disabled:opacity-45",
                  )}
                >
                  <GaraPodAvatar podId={p.id} label={p.label} color={color} />
                  <span className="min-w-0 flex-1">
                    <span className="block font-display text-xl text-crema">{p.label}</span>
                    <span className="text-xs uppercase tracking-[0.2em] text-crema/45">
                      {selected ? "Selezionato" : canPick ? "Tocca per gareggiare" : "Bloccato"}
                    </span>
                  </span>
                </button>
              </li>
            );
          })}
        </ul>
      ) : null}
    </div>
  );
}