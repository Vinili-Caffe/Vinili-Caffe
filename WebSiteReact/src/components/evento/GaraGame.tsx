"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
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

type RaceLane = { id: string; label: string; progress: number; place?: number; color: string };

/** Punto su ellisse (vista dall'alto del circuito). t 0..1 */
function ovalPoint(t: number, cx: number, cy: number, rx: number, ry: number) {
  const a = t * Math.PI * 2 - Math.PI / 2;
  return { x: cx + Math.cos(a) * rx, y: cy + Math.sin(a) * ry };
}

function CircuitRace({ lanes, youId }: { lanes: RaceLane[]; youId: string | null }) {
  const W = 640;
  const H = 360;
  const cx = W / 2;
  const cy = H / 2;
  const rx = 250;
  const ry = 118;

  const trackD = useMemo(() => {
    const pts: string[] = [];
    for (let i = 0; i <= 64; i++) {
      const p = ovalPoint(i / 64, cx, cy, rx, ry);
      pts.push(`${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`);
    }
    return `${pts.join(" ")} Z`;
  }, []);

  const innerD = useMemo(() => {
    const pts: string[] = [];
    for (let i = 0; i <= 64; i++) {
      const p = ovalPoint(i / 64, cx, cy, rx * 0.62, ry * 0.55);
      pts.push(`${i === 0 ? "M" : "L"}${p.x.toFixed(1)},${p.y.toFixed(1)}`);
    }
    return `${pts.join(" ")} Z`;
  }, []);

  return (
    <div className="relative overflow-hidden rounded-2xl bg-[#0a0c14] ring-1 ring-[#c9a227]/25">
      <svg viewBox={`0 0 ${W} ${H}`} className="h-auto w-full" role="img" aria-label="Circuito podracing">
        <defs>
          <radialGradient id="sandGlow" cx="50%" cy="50%" r="60%">
            <stop offset="0%" stopColor="#3d2a12" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#05070f" stopOpacity="1" />
          </radialGradient>
        </defs>
        <rect width={W} height={H} fill="url(#sandGlow)" />
        {/* dune */}
        <ellipse cx={120} cy={300} rx={90} ry={18} fill="#2a1c0c" opacity={0.5} />
        <ellipse cx={520} cy={70} rx={70} ry={14} fill="#2a1c0c" opacity={0.45} />
        {/* pista */}
        <path d={trackD} fill="none" stroke="#5c4a2a" strokeWidth={38} />
        <path d={trackD} fill="none" stroke="#c9a227" strokeWidth={2} strokeDasharray="10 8" opacity={0.55} />
        <path d={innerD} fill="none" stroke="#3a2f1a" strokeWidth={2} opacity={0.7} />
        {/* linea partenza */}
        {(() => {
          const a = ovalPoint(0, cx, cy, rx, ry);
          return <rect x={a.x - 6} y={a.y - 16} width={12} height={32} fill="#e4c76b" opacity={0.85} rx={2} />;
        })()}
        {lanes.map((lane, i) => {
          /* offset di corsia per non sovrapporsi */
          const laneRx = rx - 6 + i * 3;
          const laneRy = ry - 4 + i * 2;
          const p = ovalPoint(Math.min(0.98, lane.progress), cx, cy, laneRx, laneRy);
          return (
            <g key={lane.id}>
              <motion.circle
                cx={p.x}
                cy={p.y}
                r={lane.id === youId ? 11 : 9}
                fill={lane.color}
                stroke="#fff"
                strokeWidth={lane.id === youId ? 2.5 : 1.5}
                initial={false}
                animate={{ cx: p.x, cy: p.y }}
                transition={{ type: "tween", ease: "linear", duration: 0.28 }}
                filter="url(#none)"
                style={{ filter: `drop-shadow(0 0 6px ${lane.color})` }}
              />
              {lane.id === youId ? (
                <text x={p.x} y={p.y - 16} textAnchor="middle" fill="#e4c76b" fontSize={11} fontWeight={700}>
                  TU
                </text>
              ) : null}
            </g>
          );
        })}
      </svg>
      <ul className="absolute bottom-2 left-2 right-2 flex flex-wrap justify-center gap-2">
        {lanes.map((l) => (
          <li
            key={l.id}
            className={cn(
              "inline-flex items-center gap-1.5 rounded-full bg-black/55 px-2 py-0.5 text-[0.65rem] text-crema ring-1 ring-white/10",
              l.id === youId && "ring-[#e4c76b]/50",
            )}
          >
            <span className="size-2.5 rounded-full" style={{ background: l.color }} />
            {l.label}
            {l.place ? ` · ${l.place}°` : ""}
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

  const reload = useCallback(async () => {
    if (!ready) return;
    setLoading(true);
    const st = await fetchEventoGara(token);
    setLoading(false);
    if (!st?.ok) {
      showToast(st?.message || "Gara non disponibile.", true);
      return;
    }
    setPods(st.pods || []);
    setPick(st.pick || null);
    setResult(st.result || null);
    setCanPick(Boolean(st.canPick));
  }, [ready, token]);

  useEffect(() => {
    void reload();
  }, [reload]);

  async function runRaceAnimation(podId: string, place: number) {
    const field: RaceLane[] = pods.map((p, i) => ({
      id: p.id,
      label: p.label,
      progress: 0.02 * i,
      color: POD_COLORS[p.id] || `hsl(${(i * 55) % 360} 80% 55%)`,
    }));
    setLanes(field);
    setRacing(true);

    const steps = 22;
    for (let s = 1; s <= steps; s++) {
      await new Promise((r) => setTimeout(r, 100 + Math.random() * 35));
      setLanes((prev) =>
        prev.map((lane) => {
          const isYou = lane.id === podId;
          const target = isYou ? Math.max(0.72, 1 - (place - 1) * 0.11) : 0.4 + Math.random() * 0.52;
          const next = Math.min(0.99, lane.progress + (target - lane.progress) * (0.16 + s * 0.015) + (Math.random() - 0.4) * 0.04);
          return { ...lane, progress: Math.max(lane.progress, next) };
        }),
      );
    }

    setLanes((prev) => {
      const sorted = [...prev].sort((a, b) => b.progress - a.progress);
      return prev.map((lane) => ({
        ...lane,
        place: sorted.findIndex((x) => x.id === lane.id) + 1,
      }));
    });
    await new Promise((r) => setTimeout(r, 800));
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
              <EventoKicker>Gara in corso</EventoKicker>
              <p className="mb-3 mt-1 text-center text-sm text-crema/65">I pod sul circuito di Mos Espa…</p>
              <CircuitRace lanes={lanes} youId={pick} />
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
              <p className="mt-2 text-sm text-crema/65">Scegli lo sguscio — poi vedi i piloti sul tracciato.</p>
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
        <p className="text-center text-xs text-crema/45">La scelta e definitiva per lo slot corrente.</p>
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
