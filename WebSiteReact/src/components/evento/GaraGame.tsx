"use client";

import { useCallback, useEffect, useMemo, useRef, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Flag, Rocket } from "lucide-react";
import { fetchEventoGara, pickEventoGara } from "@/lib/evento-api";
import { useAuth } from "@/lib/auth";
import { showToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import {
  EventoBtn,
  EventoKicker,
  EventoLoginGate,
  EventoPanel,
  EventoSkeleton,
  EventoTitle,
} from "@/components/evento/EventoUi";

const POD_COLORS: Record<string, string> = {
  sebulba: "#ef4444",
  anakin: "#eab308",
  gasgano: "#22c55e",
  teemto: "#3b82f6",
  ben: "#a855f7",
};

type RaceLane = {
  id: string;
  label: string;
  progress: number;
  place?: number;
  color: string;
  /** corsia laterale -1..1 */
  laneBias: number;
};

const W = 720;
const H = 420;
const CX = W / 2;
const CY = H / 2 + 8;
const RX = 268;
const RY = 138;

/** Punto su ellisse (t 0..1, partenza in alto). */
function ovalPoint(t: number, rx = RX, ry = RY, cx = CX, cy = CY) {
  const a = t * Math.PI * 2 - Math.PI / 2;
  return { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry, angle: a };
}

function trackPath(rx: number, ry: number, steps = 96) {
  const pts: string[] = [];
  for (let i = 0; i <= steps; i++) {
    const p = ovalPoint(i / steps, rx, ry);
    pts.push(`${i === 0 ? "M" : "L"}${p.x.toFixed(2)},${p.y.toFixed(2)}`);
  }
  return `${pts.join(" ")} Z`;
}

function easeInOutCubic(t: number) {
  return t < 0.5 ? 4 * t * t * t : 1 - Math.pow(-2 * t + 2, 3) / 2;
}

/** Assegna piazzamenti: tu = place, gli altri riempiono i posti restanti. */
function assignPlaces(youId: string, youPlace: number, ids: string[]) {
  const n = ids.length;
  const place = Math.min(Math.max(1, youPlace), n);
  const others = ids.filter((id) => id !== youId);
  const remaining = Array.from({ length: n }, (_, i) => i + 1).filter((p) => p !== place);
  // mescola leggero
  for (let i = remaining.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [remaining[i], remaining[j]] = [remaining[j]!, remaining[i]!];
  }
  const map = new Map<string, number>();
  map.set(youId, place);
  others.forEach((id, i) => map.set(id, remaining[i] ?? i + 1));
  return map;
}

function PodMarker({
  x,
  y,
  angle,
  color,
  you,
  label,
}: {
  x: number;
  y: number;
  angle: number;
  color: string;
  you?: boolean;
  label: string;
}) {
  const deg = (angle * 180) / Math.PI + 90;
  return (
    <g transform={`translate(${x} ${y}) rotate(${deg})`}>
      {/* scia motore */}
      <ellipse cx={-14} cy={0} rx={10} ry={3.5} fill={color} opacity={0.35} />
      <ellipse cx={-10} cy={0} rx={6} ry={2.2} fill="#fff" opacity={0.45} />
      {/* corpo sguscio */}
      <ellipse cx={2} cy={0} rx={14} ry={6.5} fill={color} stroke="#fff" strokeWidth={you ? 2 : 1.2} />
      <ellipse cx={6} cy={0} rx={5} ry={3.2} fill="#0a0c14" opacity={0.55} />
      <rect x={-4} y={-2.2} width={10} height={4.4} rx={1.5} fill="#1a1208" opacity={0.5} />
      {/* ali/pod engines */}
      <rect x={-8} y={-9} width={9} height={3.2} rx={1} fill={color} opacity={0.9} />
      <rect x={-8} y={5.8} width={9} height={3.2} rx={1} fill={color} opacity={0.9} />
      {you ? (
        <text x={0} y={-16} textAnchor="middle" fill="#e4c76b" fontSize={11} fontWeight={700} transform={`rotate(${-deg})`}>
          TU
        </text>
      ) : null}
      <title>{label}</title>
    </g>
  );
}

function CircuitRace({
  lanes,
  youId,
  racing,
}: {
  lanes: RaceLane[];
  youId: string | null;
  racing?: boolean;
}) {
  const outer = useMemo(() => trackPath(RX, RY), []);
  const mid = useMemo(() => trackPath(RX * 0.78, RY * 0.72), []);
  const inner = useMemo(() => trackPath(RX * 0.55, RY * 0.48), []);
  const asphalt = useMemo(() => trackPath(RX * 0.9, RY * 0.86), []);

  const start = ovalPoint(0);

  return (
    <div className="relative overflow-hidden rounded-2xl ring-1 ring-[#c9a227]/30">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Circuito Mos Espa">
        <defs>
          <radialGradient id="desertSky" cx="50%" cy="18%" r="75%">
            <stop offset="0%" stopColor="#5a3a18" />
            <stop offset="45%" stopColor="#2a1a0c" />
            <stop offset="100%" stopColor="#08060a" />
          </radialGradient>
          <linearGradient id="asphaltGrad" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#3a342c" />
            <stop offset="50%" stopColor="#2a2620" />
            <stop offset="100%" stopColor="#1c1814" />
          </linearGradient>
          <filter id="softGlow" x="-40%" y="-40%" width="180%" height="180%">
            <feGaussianBlur stdDeviation="3" result="b" />
            <feMerge>
              <feMergeNode in="b" />
              <feMergeNode in="SourceGraphic" />
            </feMerge>
          </filter>
        </defs>

        <rect width={W} height={H} fill="url(#desertSky)" />
        {/* dune */}
        <ellipse cx={90} cy={360} rx={140} ry={36} fill="#2c1c0c" opacity={0.7} />
        <ellipse cx={620} cy={70} rx={110} ry={28} fill="#241808" opacity={0.55} />
        <ellipse cx={360} cy={400} rx={200} ry={40} fill="#1a1208" opacity={0.5} />
        {/* rocce */}
        <ellipse cx={60} cy={120} rx={22} ry={10} fill="#3a2a18" opacity={0.6} />
        <ellipse cx={660} cy={280} rx={28} ry={12} fill="#3a2a18" opacity={0.5} />

        {/* tribune stilizzate */}
        <rect x={CX - 70} y={CY - 42} width={140} height={28} rx={4} fill="#1a140e" opacity={0.85} />
        <rect x={CX - 60} y={CY - 36} width={120} height={8} fill="#c9a227" opacity={0.25} />
        <text x={CX} y={CY - 18} textAnchor="middle" fill="#e4c76b" fontSize={10} opacity={0.7}>
          MOS ESPA
        </text>

        {/* bordo esterno sabbia */}
        <path d={outer} fill="none" stroke="#6b542e" strokeWidth={52} opacity={0.85} />
        {/* asfalto */}
        <path d={asphalt} fill="none" stroke="url(#asphaltGrad)" strokeWidth={34} />
        {/* linee corsia */}
        <path
          d={mid}
          fill="none"
          stroke="#e4c76b"
          strokeWidth={1.6}
          strokeDasharray="14 10"
          opacity={0.55}
        />
        <path d={outer} fill="none" stroke="#c9a227" strokeWidth={2.2} opacity={0.4} />
        <path d={inner} fill="none" stroke="#8a7340" strokeWidth={2} opacity={0.55} />

        {/* cordoli a scacchi partenza */}
        {Array.from({ length: 8 }).map((_, i) => {
          const odd = i % 2 === 0;
          return (
            <rect
              key={i}
              x={start.x - 10}
              y={start.y - 18 + i * 4.5}
              width={20}
              height={4.5}
              fill={odd ? "#f5f0e6" : "#1a1208"}
              opacity={0.9}
            />
          );
        })}
        <text x={start.x + 28} y={start.y + 4} fill="#e4c76b" fontSize={11} fontWeight={700} opacity={0.8}>
          START
        </text>

        {/* pod */}
        {lanes.map((lane, i) => {
          const bias = lane.laneBias ?? (i - (lanes.length - 1) / 2) * 0.035;
          const rx = RX * (0.72 + bias);
          const ry = RY * (0.66 + bias * 0.9);
          const t = Math.min(0.999, Math.max(0, lane.progress));
          const p = ovalPoint(t, rx, ry);
          return (
            <g key={lane.id} filter={lane.id === youId ? "url(#softGlow)" : undefined}>
              <PodMarker
                x={p.x}
                y={p.y}
                angle={p.angle}
                color={lane.color}
                you={lane.id === youId}
                label={lane.label}
              />
            </g>
          );
        })}

        {/* bandiera in gara */}
        {racing ? (
          <g transform={`translate(${start.x - 36}, ${start.y - 48})`}>
            <rect x={0} y={0} width={2} height={36} fill="#c9a227" />
            <motion.rect
              x={2}
              y={0}
              width={18}
              height={12}
              fill="#e4c76b"
              animate={{ x: [2, 5, 2] }}
              transition={{ duration: 1.2, repeat: Infinity }}
            />
          </g>
        ) : null}
      </svg>

      <ul className="absolute bottom-2 left-2 right-2 flex flex-wrap justify-center gap-1.5">
        {[...lanes]
          .sort((a, b) => (a.place ?? 99) - (b.place ?? 99) || b.progress - a.progress)
          .map((l, idx) => (
            <li
              key={l.id}
              className={cn(
                "inline-flex items-center gap-1.5 rounded-full bg-black/65 px-2 py-0.5 text-[0.65rem] text-crema ring-1 ring-white/10 backdrop-blur-sm",
                l.id === youId && "ring-[#e4c76b]/55",
              )}
            >
              <span className="tabular-nums text-crema/50">{l.place ?? idx + 1}°</span>
              <span className="size-2 rounded-full" style={{ background: l.color }} />
              {l.label}
            </li>
          ))}
      </ul>
    </div>
  );
}

export function GaraGame() {
  const { token, ready, login } = useAuth();
  const [loading, setLoading] = useState(true);
  const [pods, setPods] = useState<Array<{ id: string; label: string }>>([]);
  const [pick, setPick] = useState<string | null>(null);
  const [result, setResult] = useState<{ place: number; won: boolean } | null>(null);
  const [canPick, setCanPick] = useState(false);
  const [busy, setBusy] = useState(false);
  const [racing, setRacing] = useState(false);
  const [lanes, setLanes] = useState<RaceLane[]>([]);
  const [lapHint, setLapHint] = useState("Griglia di partenza…");
  const cancelRef = useRef(false);

  const reload = useCallback(
    async (opts?: { soft?: boolean }) => {
      if (!ready) return;
      if (!opts?.soft) setLoading(true);
      const st = await fetchEventoGara(token);
      if (!opts?.soft) setLoading(false);
      if (!st?.ok) {
        if (!opts?.soft) showToast(st?.message || "Gara non disponibile.", true);
        return;
      }
      setPods(st.pods || []);
      setPick(st.pick || null);
      setResult(st.result || null);
      setCanPick(Boolean(st.canPick));
    },
    [ready, token],
  );

  useEffect(() => {
    void reload();
    return () => {
      cancelRef.current = true;
    };
  }, [reload]);

  async function runRaceAnimation(podId: string, place: number) {
    cancelRef.current = false;
    const placeMap = assignPlaces(
      podId,
      place,
      pods.map((p) => p.id),
    );

    const field: RaceLane[] = pods.map((p, i) => ({
      id: p.id,
      label: p.label,
      progress: 0.01 + i * 0.008,
      color: POD_COLORS[p.id] || `hsl(${(i * 55) % 360} 80% 55%)`,
      laneBias: (i - (pods.length - 1) / 2) * 0.04,
    }));
    setLanes(field);
    setRacing(true);
    setLapHint("Semáforo…");

    // countdown semaforo
    await new Promise((r) => setTimeout(r, 900));
    if (cancelRef.current) return;
    setLapHint("Via!");

    const DURATION_MS = 11000;
    const t0 = performance.now();
    // tempi di arrivo diversi per piazzamento (1° arriva prima)
    const finishAt = new Map<string, number>();
    placeMap.forEach((pl, id) => {
      finishAt.set(id, 0.78 + (pl - 1) * 0.045 + Math.random() * 0.012);
    });

    await new Promise<void>((resolve) => {
      const tick = (now: number) => {
        if (cancelRef.current) {
          resolve();
          return;
        }
        const raw = Math.min(1, (now - t0) / DURATION_MS);
        const e = easeInOutCubic(raw);

        if (raw < 0.25) setLapHint("Primo settore");
        else if (raw < 0.55) setLapHint("Sorpassi sul rettilineo…");
        else if (raw < 0.82) setLapHint("Ultimo giro");
        else setLapHint("Arrivo!");

        setLanes((prev) => {
          const next = prev.map((lane) => {
            const targetT = finishAt.get(lane.id) ?? 0.9;
            const base = Math.min(0.995, e * (targetT / 0.92));
            const jostle =
              raw < 0.85
                ? Math.sin(now / 280 + lane.label.length * 2) * 0.018 +
                  Math.sin(now / 510 + (placeMap.get(lane.id) || 1) * 3) * 0.012
                : 0;
            const progress = Math.min(0.998, Math.max(lane.progress, base + jostle * 0.45));
            return {
              ...lane,
              progress,
              laneBias: lane.laneBias * 0.98 + Math.sin(now / 700 + lane.label.length) * 0.008,
            };
          });
          const ranked = [...next].sort((a, b) => b.progress - a.progress);
          return next.map((lane) => ({
            ...lane,
            place: ranked.findIndex((x) => x.id === lane.id) + 1,
          }));
        });

        if (raw < 1) {
          requestAnimationFrame(tick);
        } else {
          resolve();
        }
      };
      requestAnimationFrame(tick);
    });

    if (cancelRef.current) return;

    // freeze piazzamenti finali coerenti con API
    setLanes((prev) =>
      prev.map((lane) => ({
        ...lane,
        progress: Math.min(0.998, (finishAt.get(lane.id) ?? 0.9) + 0.01),
        place: placeMap.get(lane.id),
      })),
    );
    setLapHint("Bandiera a scacchi");
    await new Promise((r) => setTimeout(r, 1400));
    setRacing(false);
  }

  async function choose(podId: string) {
    if (!token || busy || !canPick) return;
    setBusy(true);
    const out = await pickEventoGara(token, podId);
    if (!out?.ok) {
      setBusy(false);
      showToast(out?.message || "Scelta non riuscita.", true);
      return;
    }
    setPick(podId);
    setCanPick(false);
    const place = out.result?.place ?? 3;
    const won = Boolean(out.result?.won);
    await runRaceAnimation(podId, place);
    setResult(out.result || { place, won });
    setBusy(false);
    showToast(won ? "Hai vinto la gara!" : `Arrivo ${place}°`);
    void reload({ soft: true });
  }

  if (loading) return <EventoSkeleton className="mx-auto max-w-xl px-6" />;
  if (!token) {
    return (
      <div className="mx-auto max-w-lg px-6">
        <EventoLoginGate label="Accedi per scegliere lo sguscio e lanciare la gara su Tatooine." onLogin={login} />
      </div>
    );
  }

  return (
    <div className="mx-auto max-w-xl space-y-5 px-6">
      <AnimatePresence mode="wait">
        {racing ? (
          <motion.div key="race" initial={{ opacity: 0, y: 12 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0 }}>
            <EventoPanel glow="blue" className="!p-3 sm:!p-4">
              <div className="mb-3 flex items-end justify-between gap-3">
                <div>
                  <EventoKicker>Gara in corso</EventoKicker>
                  <p className="mt-1 text-sm text-crema/70">{lapHint}</p>
                </div>
                <span className="rounded-full bg-[#c9a227]/15 px-2.5 py-1 text-[0.65rem] font-semibold uppercase tracking-wider text-[#e4c76b] ring-1 ring-[#c9a227]/35">
                  Circuito Mos Espa
                </span>
              </div>
              <CircuitRace lanes={lanes} youId={pick} racing />
            </EventoPanel>
          </motion.div>
        ) : result ? (
          <motion.div key="res" initial={{ opacity: 0, scale: 0.96 }} animate={{ opacity: 1, scale: 1 }}>
            <EventoPanel className="text-center" glow={result.won ? "gold" : "blue"}>
              <Flag className="mx-auto size-9 text-sand" aria-hidden />
              <EventoKicker>Esito slot</EventoKicker>
              <EventoTitle>{result.won ? "Vittoria!" : `${result.place}° posto`}</EventoTitle>
              {pick ? (
                <p className="mt-2 text-sm text-crema/65">
                  Sguscio: {pods.find((p) => p.id === pick)?.label || pick}
                </p>
              ) : null}
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
              <EventoKicker>Podracing Championship</EventoKicker>
              <p className="mt-2 text-sm text-crema/65">
                Scegli lo sguscio — la corsa sul deserto dura circa 12 secondi.
              </p>
            </EventoPanel>
          </motion.div>
        )}
      </AnimatePresence>

      {!racing ? (
        <ul className="grid gap-3">
          {pods.map((p, i) => {
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
                      : "bg-roast/80 ring-sand/15 hover:ring-sky-400/40",
                    "disabled:opacity-45",
                  )}
                >
                  <span
                    className="flex size-11 shrink-0 items-center justify-center rounded-full font-display text-lg text-ink ring-2 ring-white/30"
                    style={{ background: color }}
                  >
                    {i + 1}
                  </span>
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

      {!canPick && !result && !racing ? (
        <p className="text-center text-sm text-crema/55">Gara non selezionabile in questo slot.</p>
      ) : null}
      {canPick && !racing ? (
        <p className="text-center text-xs text-crema/45">La scelta è definitiva per lo slot corrente.</p>
      ) : null}
      {result && !canPick && !racing ? (
        <div className="text-center">
          <EventoBtn variant="ghost" onClick={() => void reload()}>
            Aggiorna
          </EventoBtn>
        </div>
      ) : null}
    </div>
  );
}
