"use client";

import { useCallback, useEffect, useState } from "react";
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

type RaceLane = { id: string; label: string; progress: number; place?: number };

function RaceTrack({
  lanes,
  youId,
}: {
  lanes: RaceLane[];
  youId: string | null;
}) {
  return (
    <div className="relative overflow-hidden rounded-2xl bg-[#05070f] p-3 ring-1 ring-[#2ea8ff]/25 sm:p-4">
      {/* circuito desertico */}
      <div
        className="pointer-events-none absolute inset-0 opacity-40"
        style={{
          backgroundImage:
            "repeating-linear-gradient(90deg, transparent, transparent 18px, rgba(201,162,39,0.08) 18px, rgba(201,162,39,0.08) 19px)",
        }}
        aria-hidden
      />
      <div className="pointer-events-none absolute inset-y-0 right-8 w-1 bg-gradient-to-b from-[#e4c76b]/80 via-[#e4c76b]/20 to-[#e4c76b]/80" aria-hidden />
      <p className="relative mb-3 text-center text-[0.6rem] font-semibold uppercase tracking-[0.28em] text-[#e4c76b]/80">
        Circuito · Tatooine
      </p>
      <ul className="relative space-y-3">
        {lanes.map((lane, i) => (
          <li key={lane.id} className="relative">
            <div className="mb-1 flex items-center justify-between text-[0.65rem]">
              <span className={cn("font-semibold", lane.id === youId ? "text-[#e4c76b]" : "text-crema/60")}>
                {i + 1}. {lane.label}
                {lane.id === youId ? " · tu" : ""}
              </span>
              {lane.place ? <span className="tabular-nums text-crema/45">{lane.place}°</span> : null}
            </div>
            <div className="relative h-8 overflow-hidden rounded-full bg-white/5 ring-1 ring-white/10">
              <div className="absolute inset-y-0 left-0 w-full bg-gradient-to-r from-[#1a2744]/80 to-transparent" />
              <motion.div
                className={cn(
                  "absolute top-1/2 flex size-7 -translate-y-1/2 items-center justify-center rounded-md text-[0.65rem] font-bold shadow-lg ring-1",
                  lane.id === youId
                    ? "bg-gradient-to-br from-[#e4c76b] to-[#c9a227] text-ink ring-white/40"
                    : "bg-[#2ea8ff]/90 text-ink ring-[#7dd3fc]/50",
                )}
                initial={{ left: "2%" }}
                animate={{ left: `${Math.min(92, 4 + lane.progress * 88)}%` }}
                transition={{ type: "tween", ease: "easeInOut", duration: 0.35 }}
              >
                ✦
              </motion.div>
            </div>
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
    const field = pods.map((p) => ({
      id: p.id,
      label: p.label,
      progress: 0,
      place: undefined as number | undefined,
    }));
    setLanes(field);
    setRacing(true);

    const steps = 18;
    for (let s = 1; s <= steps; s++) {
      await new Promise((r) => setTimeout(r, 110 + Math.random() * 40));
      setLanes((prev) =>
        prev.map((lane) => {
          const isYou = lane.id === podId;
          /* target: tuo posto determina progresso finale; altri sparpagliati */
          const target =
            isYou
              ? 1 - (place - 1) * 0.12
              : 0.35 + Math.random() * 0.55;
          const jitter = (Math.random() - 0.45) * 0.08;
          const next = Math.min(0.98, lane.progress + (target - lane.progress) * (0.18 + s * 0.02) + jitter);
          return { ...lane, progress: Math.max(lane.progress, next) };
        }),
      );
    }

    setLanes((prev) => {
      const sorted = [...prev].sort((a, b) => b.progress - a.progress);
      return prev.map((lane) => ({
        ...lane,
        progress: Math.min(0.98, lane.progress),
        place: sorted.findIndex((x) => x.id === lane.id) + 1,
      }));
    });
    await new Promise((r) => setTimeout(r, 700));
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
          <motion.div
            key="race"
            initial={{ opacity: 0, y: 12 }}
            animate={{ opacity: 1, y: 0 }}
            exit={{ opacity: 0 }}
          >
            <EventoPanel glow="blue" className="!p-3 sm:!p-4">
              <EventoKicker>Gara in corso</EventoKicker>
              <p className="mb-3 mt-1 text-center text-sm text-crema/65">I pod sfrecciano sul circuito…</p>
              <RaceTrack lanes={lanes} youId={pick} />
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
                <RaceTrack lanes={lanes} youId={pick} />
              </div>
            ) : null}
          </motion.div>
        ) : (
          <motion.div key="pick" initial={{ opacity: 0 }} animate={{ opacity: 1 }}>
            <EventoPanel glow="none" className="text-center">
              <Rocket className="mx-auto size-8 text-[#2ea8ff]" aria-hidden />
              <EventoKicker>Podracing Championship</EventoKicker>
              <p className="mt-2 text-sm text-crema/65">Scegli lo sguscio — poi vedi la gara sul circuito.</p>
            </EventoPanel>
          </motion.div>
        )}
      </AnimatePresence>

      {!racing ? (
        <ul className="grid gap-3">
          {pods.map((p, i) => {
            const selected = pick === p.id;
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
                  <span className="flex size-11 shrink-0 items-center justify-center rounded-xl bg-[#2ea8ff]/15 font-display text-lg text-[#2ea8ff] ring-1 ring-[#2ea8ff]/30">
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
