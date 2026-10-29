"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { digEventoMiniera, fetchEventoMiniera } from "@/lib/evento-api";
import { useAuth } from "@/lib/auth";
import { showToast } from "@/components/ui/toast";
import { cn } from "@/lib/cn";
import {
  EventoBtn,
  EventoKicker,
  EventoLoginGate,
  EventoPanel,
  EventoSkeleton,
} from "@/components/evento/EventoUi";

const KYBER_HEX: Record<string, { glow: string; core: string; deep: string; label: string }> = {
  blu: { glow: "#1d8fff", core: "#7ec8ff", deep: "#0a4a9e", label: "Blu" },
  verde: { glow: "#12c26b", core: "#6dffb0", deep: "#0a6b3a", label: "Verde" },
};

type Find = { color: string; rare: boolean };

function styleFor(color: string) {
  const key = String(color || "").toLowerCase();
  if (key.includes("verd") || key.includes("green")) return KYBER_HEX.verde!;
  return KYBER_HEX.blu!;
}

/** Slot fissi nel filone di ghiaccio (dove spuntano i cristalli scavati). */
const VEIN_SLOTS = [
  { x: 18, y: 58, rot: -18, scale: 0.9 },
  { x: 38, y: 72, rot: 12, scale: 1.05 },
  { x: 55, y: 52, rot: -8, scale: 0.85 },
  { x: 72, y: 68, rot: 22, scale: 1 },
  { x: 28, y: 42, rot: 6, scale: 0.75 },
  { x: 64, y: 40, rot: -14, scale: 0.8 },
  { x: 46, y: 62, rot: 4, scale: 0.95 },
  { x: 82, y: 54, rot: -6, scale: 0.88 },
] as const;

function KyberCrystal({
  color,
  rare,
  className,
  size = 40,
  gid = "k",
}: {
  color: string;
  rare?: boolean;
  className?: string;
  size?: number;
  gid?: string;
}) {
  const s = styleFor(color);
  const id = `${gid}-${s.label}`;
  return (
    <svg
      width={size}
      height={size * 1.35}
      viewBox="0 0 40 54"
      className={cn("drop-shadow-lg", className)}
      aria-hidden
      style={{ filter: `drop-shadow(0 0 ${rare ? 14 : 8}px ${s.glow})` }}
    >
      <defs>
        <linearGradient id={id} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.85" />
          <stop offset="35%" stopColor={s.core} />
          <stop offset="100%" stopColor={s.deep} />
        </linearGradient>
      </defs>
      <path
        d="M20 2 L32 18 L26 52 L14 52 L8 18 Z"
        fill={`url(#${id})`}
        stroke={s.core}
        strokeWidth="1.2"
        strokeOpacity="0.7"
      />
      <path d="M20 2 L26 18 L20 48 L14 18 Z" fill="#fff" fillOpacity="0.28" />
      <path d="M14 18 L20 48 L8 18 Z" fill={s.deep} fillOpacity="0.35" />
    </svg>
  );
}

function PickaxeSvg({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 64 64" className={className} aria-hidden>
      <path
        d="M12 8c8-6 22-4 28 2l-6 6c-4-3-12-4-18-1L12 8Z"
        fill="#c9a227"
        stroke="#e4c76b"
        strokeWidth="1.5"
      />
      <path d="M34 14 L52 48" stroke="#6b4a28" strokeWidth="5" strokeLinecap="round" />
      <path d="M34 14 L52 48" stroke="#a67c52" strokeWidth="2.5" strokeLinecap="round" />
      <circle cx="52" cy="50" r="3" fill="#3a2818" />
    </svg>
  );
}

export function MinieraGame() {
  const { token, ready, login } = useAuth();
  const [loading, setLoading] = useState(true);
  const [remaining, setRemaining] = useState(0);
  const [canDig, setCanDig] = useState(false);
  const [finds, setFinds] = useState<Find[]>([]);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"idle" | "swing" | "crack" | "reveal">("idle");
  const [last, setLast] = useState<Find | null>(null);
  const [shake, setShake] = useState(0);
  const [chips, setChips] = useState<Array<{ id: number; x: number; y: number }>>([]);

  const reload = useCallback(
    async (opts?: { soft?: boolean }) => {
      if (!ready) return;
      if (!opts?.soft) setLoading(true);
      const st = await fetchEventoMiniera(token);
      if (!opts?.soft) setLoading(false);
      if (!st?.ok) {
        if (!opts?.soft) showToast(st?.message || "Miniera non disponibile.", true);
        return;
      }
      setRemaining(st.remaining ?? 0);
      setCanDig(Boolean(st.canDig));
      setFinds(st.finds || []);
    },
    [ready, token],
  );

  useEffect(() => {
    void reload();
  }, [reload]);

  const embedded = useMemo(() => finds.slice(-VEIN_SLOTS.length), [finds]);

  async function dig() {
    if (!token || busy || !canDig) return;
    setBusy(true);
    setLast(null);
    setPhase("swing");
    setShake((n) => n + 1);

    await new Promise((r) => setTimeout(r, 380));
    setPhase("crack");
    setChips(
      Array.from({ length: 10 }, (_, i) => ({
        id: Date.now() + i,
        x: 42 + (Math.random() - 0.5) * 28,
        y: 58 + (Math.random() - 0.5) * 16,
      })),
    );

    const out = await digEventoMiniera(token);
    if (!out?.ok) {
      setBusy(false);
      setPhase("idle");
      showToast(out?.message || "Estrazione fallita.", true);
      return;
    }

    await new Promise((r) => setTimeout(r, 220));
    setPhase("reveal");
    setLast(out.find || null);
    setRemaining(out.remaining ?? 0);
    setCanDig((out.remaining ?? 0) > 0);
    if (out.find) setFinds((f) => [...f, out.find!]);
    const label = styleFor(out.find?.color || "").label;
    showToast(out.find?.rare ? `Kyber ${label} RARO!` : `Kyber ${label}`);

    await new Promise((r) => setTimeout(r, 1200));
    setBusy(false);
    setPhase("idle");
    setChips([]);
  }

  if (loading) return <EventoSkeleton className="mx-auto max-w-lg px-6" />;
  if (!token) {
    return (
      <div className="mx-auto max-w-lg px-6">
        <EventoLoginGate label="Accedi per scavare cristalli Kyber nella miniera di Ilum." onLogin={login} />
      </div>
    );
  }

  const lastStyle = last ? styleFor(last.color) : null;
  const cracking = phase === "crack" || phase === "reveal";

  return (
    <div className="mx-auto max-w-lg space-y-5 px-6">
      <EventoPanel className="!overflow-hidden !p-0" glow="gold">
        {/* scena miniera di ghiaccio */}
        <motion.div
          className="relative aspect-[5/4] overflow-hidden"
          animate={busy ? { x: [0, -3, 3, -2, 2, 0], y: [0, 2, -1, 1, 0] } : { x: 0, y: 0 }}
          transition={{ duration: 0.35 }}
          key={shake}
        >
          {/* parete ghiaccio / roccia */}
          <div
            className="absolute inset-0"
            style={{
              background: `
                radial-gradient(ellipse 90% 70% at 50% 100%, rgba(46,168,255,0.18), transparent 55%),
                radial-gradient(ellipse 50% 40% at 20% 30%, rgba(126,200,255,0.12), transparent 50%),
                linear-gradient(180deg, #0b1528 0%, #132038 35%, #0a1424 70%, #05070f 100%)
              `,
            }}
            aria-hidden
          />
          {/* vene di ghiaccio */}
          <svg className="pointer-events-none absolute inset-0 h-full w-full opacity-50" aria-hidden>
            <path
              d="M0 40 Q80 60 120 30 T280 50 T400 20"
              fill="none"
              stroke="rgba(126,200,255,0.35)"
              strokeWidth="1.5"
            />
            <path
              d="M20 120 Q100 90 180 130 T360 100"
              fill="none"
              stroke="rgba(46,168,255,0.25)"
              strokeWidth="1"
            />
            <path
              d="M40 200 Q140 170 220 210 T400 180"
              fill="none"
              stroke="rgba(255,255,255,0.12)"
              strokeWidth="2"
            />
          </svg>
          {/* stalattiti */}
          <div className="pointer-events-none absolute inset-x-0 top-0 flex justify-around px-3" aria-hidden>
            {[22, 34, 18, 40, 26, 32, 16].map((h, i) => (
              <span
                key={i}
                className="block w-2.5 rounded-b-full bg-gradient-to-b from-[#9ec9ef]/70 via-[#2a4a6e]/80 to-transparent"
                style={{ height: h, boxShadow: "0 0 10px rgba(126,200,255,0.25)" }}
              />
            ))}
          </div>
          {/* pavimento neve/ghiaccio */}
          <div
            className="pointer-events-none absolute inset-x-0 bottom-0 h-[28%]"
            style={{
              background:
                "linear-gradient(180deg, transparent, rgba(180,210,240,0.08) 30%, rgba(20,35,55,0.95))",
              boxShadow: "inset 0 12px 24px rgba(126,200,255,0.08)",
            }}
            aria-hidden
          />

          {/* filone da scavare */}
          <motion.div
            className="absolute left-1/2 top-[42%] h-[42%] w-[78%] -translate-x-1/2 overflow-hidden rounded-[2rem]"
            style={{
              background:
                "linear-gradient(160deg, rgba(160,200,235,0.22), rgba(30,50,80,0.55) 40%, rgba(10,18,32,0.9))",
              boxShadow:
                "inset 0 0 0 1px rgba(180,220,255,0.25), inset 0 -20px 40px rgba(5,10,20,0.5), 0 0 40px rgba(46,168,255,0.12)",
            }}
            animate={
              cracking
                ? { filter: ["brightness(1)", "brightness(1.35)", "brightness(1.1)"] }
                : { filter: "brightness(1)" }
            }
            transition={{ duration: 0.35 }}
          >
            {/* crepe */}
            <svg className="absolute inset-0 h-full w-full" aria-hidden>
              <motion.path
                d="M40 20 L70 55 L55 90 L95 120"
                fill="none"
                stroke="rgba(220,240,255,0.55)"
                strokeWidth="1.5"
                initial={{ pathLength: 0.15, opacity: 0.35 }}
                animate={{
                  pathLength: cracking ? 1 : 0.2 + Math.min(embedded.length, 6) * 0.1,
                  opacity: cracking ? 0.9 : 0.4,
                }}
                transition={{ duration: 0.35 }}
              />
              <motion.path
                d="M160 10 L140 50 L170 80 L150 130"
                fill="none"
                stroke="rgba(126,200,255,0.45)"
                strokeWidth="1.2"
                initial={{ pathLength: 0.1 }}
                animate={{ pathLength: cracking ? 1 : 0.15 + Math.min(embedded.length, 5) * 0.12 }}
                transition={{ duration: 0.4 }}
              />
            </svg>

            {/* cristalli già scavati nel filone */}
            {embedded.map((f, i) => {
              const slot = VEIN_SLOTS[i % VEIN_SLOTS.length]!;
              return (
                <motion.div
                  key={`emb-${i}-${f.color}`}
                  className="absolute"
                  style={{
                    left: `${slot.x}%`,
                    top: `${slot.y}%`,
                    transform: `translate(-50%, -50%) rotate(${slot.rot}deg) scale(${slot.scale})`,
                  }}
                  initial={{ opacity: 0, scale: 0.2, y: 12 }}
                  animate={{ opacity: 1, scale: slot.scale, y: 0 }}
                  transition={{ type: "spring", stiffness: 260, damping: 16 }}
                >
                  <KyberCrystal color={f.color} rare={f.rare} size={28} gid={`vein-${i}`} />
                </motion.div>
              );
            })}

            {/* flash impatto */}
            <AnimatePresence>
              {phase === "crack" ? (
                <motion.div
                  key="flash"
                  className="absolute inset-0 bg-[#dff3ff]/25"
                  initial={{ opacity: 0 }}
                  animate={{ opacity: [0, 1, 0] }}
                  exit={{ opacity: 0 }}
                  transition={{ duration: 0.28 }}
                />
              ) : null}
            </AnimatePresence>
          </motion.div>

          {/* schegge di ghiaccio */}
          <AnimatePresence>
            {chips.map((c) => (
              <motion.span
                key={c.id}
                className="pointer-events-none absolute size-2 rounded-[2px] bg-[#cfe8ff]"
                style={{ left: `${c.x}%`, top: `${c.y}%` }}
                initial={{ opacity: 1, scale: 1, x: 0, y: 0, rotate: 0 }}
                animate={{
                  opacity: 0,
                  x: (Math.random() - 0.5) * 90,
                  y: 40 + Math.random() * 50,
                  rotate: Math.random() * 180,
                  scale: 0.3,
                }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.7 + Math.random() * 0.3 }}
              />
            ))}
          </AnimatePresence>

          {/* header */}
          <div className="absolute inset-x-0 top-3 z-10 text-center">
            <EventoKicker>Miniera di Ilum</EventoKicker>
            <p className="mt-1 font-display text-3xl text-crema drop-shadow-[0_2px_8px_rgba(0,0,0,0.8)]">
              {remaining}
            </p>
            <p className="text-xs uppercase tracking-[0.22em] text-crema/50">estrazioni rimaste</p>
          </div>

          {/* piccone */}
          <motion.div
            className="absolute bottom-[6%] left-[58%] z-20 origin-[30%_90%]"
            style={{ width: 72, height: 72 }}
            animate={
              phase === "swing" || phase === "crack"
                ? {
                    rotate: [-40, 48, 20],
                    x: [0, -18, -8],
                    y: [0, -14, 4],
                  }
                : phase === "reveal"
                  ? { rotate: 12, x: -4, y: 0 }
                  : { rotate: -28, x: 0, y: 0 }
            }
            transition={{ duration: 0.42, ease: [0.22, 1, 0.36, 1] }}
          >
            <PickaxeSvg className="h-full w-full drop-shadow-[0_10px_18px_rgba(0,0,0,0.65)]" />
          </motion.div>

          {/* reveal cristallo grosso */}
          <AnimatePresence mode="wait">
            {phase === "reveal" && last && lastStyle ? (
              <motion.div
                key={`reveal-${last.color}-${finds.length}`}
                className="absolute inset-x-0 bottom-[30%] z-30 flex flex-col items-center"
                initial={{ y: 36, opacity: 0, scale: 0.35 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ opacity: 0, y: -12, scale: 0.85 }}
                transition={{ type: "spring", stiffness: 240, damping: 15 }}
              >
                <KyberCrystal color={last.color} rare={last.rare} size={56} gid="reveal" />
                <p
                  className="mt-2 font-display text-xl drop-shadow-md"
                  style={{ color: lastStyle.core }}
                >
                  Kyber {lastStyle.label}
                  {last.rare ? " · raro" : ""}
                </p>
              </motion.div>
            ) : phase === "idle" && !busy ? (
              <motion.p
                key="hint"
                className="absolute inset-x-0 bottom-[32%] z-10 text-center text-sm text-crema/45"
                initial={{ opacity: 0 }}
                animate={{ opacity: 1 }}
              >
                {canDig ? "Colpisci il filone di ghiaccio…" : "Niente estrazioni rimaste oggi"}
              </motion.p>
            ) : null}
          </AnimatePresence>
        </motion.div>

        <div className="border-t border-sand/10 px-4 py-4 text-center sm:px-5">
          <EventoBtn className="w-full sm:w-auto" disabled={!canDig || busy} onClick={() => void dig()}>
            {busy ? (phase === "reveal" ? "Kyber trovato!" : "Scavo…") : "Scava Kyber"}
          </EventoBtn>
          <p className="mt-2 text-xs text-crema/45">Solo cristalli blu e verde — come nella lore Jedi.</p>
        </div>
      </EventoPanel>

      {finds.length ? (
        <EventoPanel glow="none">
          <EventoKicker>Bottino di oggi</EventoKicker>
          <ul className="mt-4 grid grid-cols-2 gap-2 sm:grid-cols-3">
            {finds.map((f, i) => {
              const s = styleFor(f.color);
              return (
                <li
                  key={`${f.color}-${i}`}
                  className="flex flex-col items-center gap-1 rounded-xl px-3 py-2.5 text-center text-sm"
                  style={{
                    background: `linear-gradient(160deg, ${s.glow}33, rgba(5,7,15,0.9))`,
                    boxShadow: `inset 0 0 0 1px ${s.glow}66`,
                  }}
                >
                  <KyberCrystal color={f.color} rare={f.rare} size={28} gid={`loot-${i}`} />
                  <span className="font-medium text-crema">{s.label}</span>
                  {f.rare ? <span className="text-[0.6rem] uppercase tracking-wider text-sand">raro</span> : null}
                </li>
              );
            })}
          </ul>
        </EventoPanel>
      ) : null}
    </div>
  );
}
