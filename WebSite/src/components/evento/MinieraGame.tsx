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
  blu: { glow: "#3aa0ff", core: "#9ad4ff", deep: "#0c3d8a", label: "Blu" },
  verde: { glow: "#1ad97a", core: "#7dffb8", deep: "#0a5c36", label: "Verde" },
};

type Find = { color: string; rare: boolean };
type StandingRow = { factionId: string; label: string; crystals: number; participants: number };

function styleFor(color: string) {
  const key = String(color || "").toLowerCase();
  if (key.includes("verd") || key.includes("green")) return KYBER_HEX.verde!;
  return KYBER_HEX.blu!;
}

const VEIN_SLOTS = [
  { x: 16, y: 62, rot: -22, scale: 0.92 },
  { x: 34, y: 74, rot: 14, scale: 1.08 },
  { x: 52, y: 54, rot: -10, scale: 0.86 },
  { x: 70, y: 70, rot: 20, scale: 1.02 },
  { x: 26, y: 44, rot: 8, scale: 0.78 },
  { x: 62, y: 42, rot: -16, scale: 0.82 },
  { x: 44, y: 66, rot: 4, scale: 0.96 },
  { x: 80, y: 56, rot: -8, scale: 0.9 },
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
      height={size * 1.4}
      viewBox="0 0 44 62"
      className={cn("drop-shadow-lg", className)}
      aria-hidden
      style={{ filter: `drop-shadow(0 0 ${rare ? 16 : 9}px ${s.glow})` }}
    >
      <defs>
        <linearGradient id={`${id}-body`} x1="0.15" y1="0" x2="0.9" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.92" />
          <stop offset="28%" stopColor={s.core} />
          <stop offset="72%" stopColor={s.glow} />
          <stop offset="100%" stopColor={s.deep} />
        </linearGradient>
        <linearGradient id={`${id}-edge`} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#fff" stopOpacity="0.55" />
          <stop offset="100%" stopColor={s.deep} stopOpacity="0.2" />
        </linearGradient>
      </defs>
      <path
        d="M22 1.5 L36 16 L40 30 L30 58 L14 58 L4 30 L8 16 Z"
        fill={`url(#${id}-body)`}
        stroke={s.core}
        strokeWidth="1.1"
        strokeOpacity="0.75"
      />
      <path d="M22 1.5 L28 18 L22 54 L16 18 Z" fill="#fff" fillOpacity="0.32" />
      <path d="M16 18 L22 54 L8 30 L8 16 Z" fill={s.deep} fillOpacity="0.38" />
      <path d="M28 18 L36 16 L40 30 L30 58 L22 54 Z" fill={`url(#${id}-edge)`} fillOpacity="0.45" />
      {rare ? (
        <circle cx="22" cy="28" r="3.2" fill="#fff" fillOpacity="0.7">
          <animate attributeName="opacity" values="0.35;0.9;0.35" dur="1.6s" repeatCount="indefinite" />
        </circle>
      ) : null}
    </svg>
  );
}

/** Piccone da miniera Ilum: testa in metallo freddo + manico in legno cerato. */
function PickaxeSvg({ className }: { className?: string }) {
  return (
    <svg viewBox="0 0 96 96" className={className} aria-hidden>
      <defs>
        <linearGradient id="px-head" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#e8f2ff" />
          <stop offset="45%" stopColor="#9eb4d0" />
          <stop offset="100%" stopColor="#4a5d78" />
        </linearGradient>
        <linearGradient id="px-blade" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#f4fbff" />
          <stop offset="100%" stopColor="#6d849e" />
        </linearGradient>
        <linearGradient id="px-wood" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#c48a52" />
          <stop offset="40%" stopColor="#8b5a32" />
          <stop offset="100%" stopColor="#4a2e18" />
        </linearGradient>
        <linearGradient id="px-wrap" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#d7b56a" />
          <stop offset="100%" stopColor="#7a5a28" />
        </linearGradient>
      </defs>
      {/* manico */}
      <path
        d="M42 28 C46 36 58 58 70 78"
        fill="none"
        stroke="url(#px-wood)"
        strokeWidth="7.5"
        strokeLinecap="round"
      />
      <path
        d="M42 28 C46 36 58 58 70 78"
        fill="none"
        stroke="#e8c090"
        strokeWidth="2.2"
        strokeLinecap="round"
        opacity="0.35"
      />
      {/* wrapping vicino alla testa */}
      <path
        d="M40 30 C42 34 46 40 50 46"
        fill="none"
        stroke="url(#px-wrap)"
        strokeWidth="9"
        strokeLinecap="round"
        opacity="0.95"
      />
      <path
        d="M41 32 C43 35 46 40 49 44"
        fill="none"
        stroke="#3a2814"
        strokeWidth="1.1"
        strokeDasharray="2 3"
        opacity="0.55"
      />
      {/* testa a mezzaluna */}
      <path
        d="M14 22 C22 8 40 6 52 14 C44 18 34 22 26 30 C20 28 16 26 14 22 Z"
        fill="url(#px-head)"
        stroke="#dbe7f5"
        strokeWidth="1.2"
      />
      {/* punta dente */}
      <path d="M14 22 L6 34 L18 28 Z" fill="url(#px-blade)" stroke="#c5d4e6" strokeWidth="0.8" />
      {/* punta corta opposta */}
      <path d="M50 14 L58 20 L48 22 Z" fill="#7a8fa8" stroke="#c5d4e6" strokeWidth="0.7" />
      {/* riflesso lama */}
      <path d="M20 16 C28 10 40 10 48 15" fill="none" stroke="#fff" strokeWidth="1.4" opacity="0.55" />
      {/* pomello */}
      <circle cx="71" cy="79" r="4.2" fill="#3a2818" stroke="#6b4a28" strokeWidth="1" />
      <circle cx="71" cy="79" r="1.6" fill="#c49a6c" opacity="0.5" />
    </svg>
  );
}

/** Parete di ghiaccio Ilum — SVG scenografico a piena scena. */
function IceCavernBackdrop({ cracking }: { cracking: boolean }) {
  return (
    <svg className="absolute inset-0 h-full w-full" viewBox="0 0 400 320" preserveAspectRatio="xMidYMid slice" aria-hidden>
      <defs>
        <radialGradient id="cave-amb" cx="50%" cy="70%" r="70%">
          <stop offset="0%" stopColor="#1a3a5c" stopOpacity="0.55" />
          <stop offset="55%" stopColor="#0a1528" stopOpacity="0.2" />
          <stop offset="100%" stopColor="#03060c" stopOpacity="0" />
        </radialGradient>
        <linearGradient id="wall-ice" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#1a2f4a" />
          <stop offset="40%" stopColor="#0e1c30" />
          <stop offset="100%" stopColor="#060b14" />
        </linearGradient>
        <linearGradient id="ice-shine" x1="0" y1="0" x2="1" y2="1">
          <stop offset="0%" stopColor="#b8dcff" stopOpacity="0.45" />
          <stop offset="50%" stopColor="#4a8ec8" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#0a1828" stopOpacity="0.05" />
        </linearGradient>
        <linearGradient id="floor-snow" x1="0" y1="0" x2="0" y2="1">
          <stop offset="0%" stopColor="#9ec8ef" stopOpacity="0" />
          <stop offset="35%" stopColor="#6a9cc0" stopOpacity="0.12" />
          <stop offset="100%" stopColor="#0a121e" stopOpacity="0.95" />
        </linearGradient>
        <linearGradient id="spike" x1="0.5" y1="0" x2="0.5" y2="1">
          <stop offset="0%" stopColor="#d4eaff" stopOpacity="0.85" />
          <stop offset="55%" stopColor="#6aa0d0" stopOpacity="0.55" />
          <stop offset="100%" stopColor="#1a3050" stopOpacity="0" />
        </linearGradient>
        <filter id="soft-glow" x="-20%" y="-20%" width="140%" height="140%">
          <feGaussianBlur stdDeviation="3" result="b" />
          <feMerge>
            <feMergeNode in="b" />
            <feMergeNode in="SourceGraphic" />
          </feMerge>
        </filter>
      </defs>

      <rect width="400" height="320" fill="url(#wall-ice)" />
      <ellipse cx="200" cy="280" rx="220" ry="120" fill="url(#cave-amb)" />

      {/* strati di ghiaccio laterali */}
      <path
        d="M0 40 C40 60 55 120 30 180 C10 230 0 260 0 320 L0 40 Z"
        fill="url(#ice-shine)"
        opacity="0.55"
      />
      <path
        d="M400 50 C360 70 350 130 375 190 C395 240 400 270 400 320 L400 50 Z"
        fill="url(#ice-shine)"
        opacity="0.45"
      />

      {/* vene cristalline */}
      <g fill="none" stroke="#8ec8ff" strokeOpacity="0.28" filter="url(#soft-glow)">
        <path d="M20 90 C80 70 120 110 180 85 C240 60 280 100 360 70" strokeWidth="1.4" />
        <path d="M40 160 C100 140 140 190 210 155 C270 130 310 175 380 150" strokeWidth="1" />
        <path d="M10 220 C90 200 150 240 230 210 C300 185 340 230 400 205" strokeWidth="1.2" />
      </g>
      <g fill="none" stroke="#fff" strokeOpacity="0.1">
        <path d="M60 50 C100 80 90 130 130 150" strokeWidth="0.8" />
        <path d="M300 40 C280 90 320 120 290 170" strokeWidth="0.8" />
      </g>

      {/* stalattiti */}
      {[
        [28, 0, 38],
        [62, 0, 52],
        [98, 0, 30],
        [140, 0, 58],
        [188, 0, 42],
        [230, 0, 64],
        [278, 0, 36],
        [318, 0, 50],
        [358, 0, 28],
        [386, 0, 44],
      ].map(([x, y, h], i) => (
        <path
          key={i}
          d={`M${x} ${y} L${(x as number) + 7} ${y} L${(x as number) + 3.5} ${(y as number) + (h as number)} Z`}
          fill="url(#spike)"
          opacity={0.7 + (i % 3) * 0.08}
        />
      ))}

      {/* pavimento neve */}
      <path d="M0 250 C80 235 160 255 200 248 C260 238 340 255 400 245 L400 320 L0 320 Z" fill="url(#floor-snow)" />
      <ellipse cx="200" cy="290" rx="160" ry="18" fill="#b8d8f5" opacity="0.06" />

      {/* bagliore filone */}
      <ellipse
        cx="200"
        cy="175"
        rx="130"
        ry="70"
        fill={cracking ? "#9ad4ff" : "#3a7ab0"}
        opacity={cracking ? 0.22 : 0.1}
      >
        {cracking ? (
          <animate attributeName="opacity" values="0.1;0.32;0.14" dur="0.35s" repeatCount="1" />
        ) : null}
      </ellipse>
    </svg>
  );
}

function IceVein({
  cracking,
  embedded,
  phase,
}: {
  cracking: boolean;
  embedded: Find[];
  phase: string;
}) {
  return (
    <motion.div
      className="absolute left-1/2 top-[38%] h-[48%] w-[82%] -translate-x-1/2 overflow-hidden"
      style={{
        borderRadius: "42% 48% 38% 44% / 36% 40% 48% 44%",
        background:
          "linear-gradient(155deg, rgba(190,220,255,0.38) 0%, rgba(90,140,190,0.28) 28%, rgba(28,52,82,0.72) 62%, rgba(8,14,26,0.92) 100%)",
        boxShadow:
          "inset 0 0 0 1.5px rgba(210,235,255,0.35), inset 0 -28px 50px rgba(4,10,22,0.55), inset 0 20px 40px rgba(180,220,255,0.12), 0 0 50px rgba(70,160,255,0.16)",
      }}
      animate={
        cracking
          ? { filter: ["brightness(1)", "brightness(1.45)", "brightness(1.12)"] }
          : { filter: "brightness(1)" }
      }
      transition={{ duration: 0.35 }}
    >
      <svg className="absolute inset-0 h-full w-full" viewBox="0 0 220 140" preserveAspectRatio="none" aria-hidden>
        <defs>
          <linearGradient id="crack-glow" x1="0" y1="0" x2="1" y2="1">
            <stop offset="0%" stopColor="#eaf6ff" stopOpacity="0.9" />
            <stop offset="100%" stopColor="#5ab0ff" stopOpacity="0.35" />
          </linearGradient>
        </defs>
        <motion.path
          d="M30 18 L55 48 L42 78 L78 105 L60 130"
          fill="none"
          stroke="url(#crack-glow)"
          strokeWidth="1.6"
          initial={{ pathLength: 0.12, opacity: 0.35 }}
          animate={{
            pathLength: cracking ? 1 : 0.18 + Math.min(embedded.length, 6) * 0.1,
            opacity: cracking ? 0.95 : 0.4,
          }}
          transition={{ duration: 0.35 }}
        />
        <motion.path
          d="M170 12 L155 42 L178 68 L152 98 L168 128"
          fill="none"
          stroke="#9ad4ff"
          strokeWidth="1.3"
          strokeOpacity="0.55"
          initial={{ pathLength: 0.1 }}
          animate={{ pathLength: cracking ? 1 : 0.14 + Math.min(embedded.length, 5) * 0.12 }}
          transition={{ duration: 0.4 }}
        />
        <motion.path
          d="M100 8 L95 40 L110 70 L90 110"
          fill="none"
          stroke="#fff"
          strokeWidth="0.9"
          strokeOpacity="0.25"
          initial={{ pathLength: 0.08 }}
          animate={{ pathLength: cracking ? 0.95 : 0.1 + Math.min(embedded.length, 4) * 0.1 }}
          transition={{ duration: 0.38 }}
        />
      </svg>

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
            <KyberCrystal color={f.color} rare={f.rare} size={30} gid={`vein-${i}`} />
          </motion.div>
        );
      })}

      <AnimatePresence>
        {phase === "crack" ? (
          <motion.div
            key="flash"
            className="absolute inset-0"
            style={{
              background:
                "radial-gradient(circle at 48% 55%, rgba(220,240,255,0.55), rgba(120,190,255,0.15) 45%, transparent 70%)",
            }}
            initial={{ opacity: 0 }}
            animate={{ opacity: [0, 1, 0] }}
            exit={{ opacity: 0 }}
            transition={{ duration: 0.3 }}
          />
        ) : null}
      </AnimatePresence>
    </motion.div>
  );
}

export function MinieraGame() {
  const { token, ready, login } = useAuth();
  const [loading, setLoading] = useState(true);
  const [remaining, setRemaining] = useState(0);
  const [canDig, setCanDig] = useState(false);
  const [finds, setFinds] = useState<Find[]>([]);
  const [standings, setStandings] = useState<StandingRow[]>([]);
  const [busy, setBusy] = useState(false);
  const [phase, setPhase] = useState<"idle" | "swing" | "crack" | "reveal">("idle");
  const [last, setLast] = useState<Find | null>(null);
  const [shake, setShake] = useState(0);
  const [chips, setChips] = useState<Array<{ id: number; x: number; y: number; rot: number; w: number }>>([]);

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
      setStandings(Array.isArray(st.standings?.factions) ? st.standings!.factions! : []);
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

    await new Promise((r) => setTimeout(r, 420));
    setPhase("crack");
    setChips(
      Array.from({ length: 14 }, (_, i) => ({
        id: Date.now() + i,
        x: 40 + (Math.random() - 0.5) * 32,
        y: 55 + (Math.random() - 0.5) * 18,
        rot: Math.random() * 360,
        w: 3 + Math.random() * 5,
      })),
    );

    const out = await digEventoMiniera(token);
    if (!out?.ok) {
      setBusy(false);
      setPhase("idle");
      showToast(out?.message || "Estrazione fallita.", true);
      return;
    }

    await new Promise((r) => setTimeout(r, 240));
    setPhase("reveal");
    setLast(out.find || null);
    setRemaining(out.remaining ?? 0);
    setCanDig((out.remaining ?? 0) > 0);
    if (out.find) setFinds((f) => [...f, out.find!]);
    if (Array.isArray(out.standings?.factions)) setStandings(out.standings!.factions!);
    const label = styleFor(out.find?.color || "").label;
    showToast(out.find?.rare ? `Kyber ${label} RARO!` : `Kyber ${label}`);

    await new Promise((r) => setTimeout(r, 1300));
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
  const maxCrystals = Math.max(1, ...standings.map((s) => s.crystals), 1);

  return (
    <div className="mx-auto max-w-lg space-y-5 px-6">
      <EventoPanel className="!overflow-hidden !p-0" glow="gold">
        <motion.div
          className="relative aspect-[5/4] overflow-hidden"
          animate={busy ? { x: [0, -4, 4, -2, 2, 0], y: [0, 2, -2, 1, 0] } : { x: 0, y: 0 }}
          transition={{ duration: 0.38 }}
          key={shake}
        >
          <IceCavernBackdrop cracking={cracking} />

          <IceVein cracking={cracking} embedded={embedded} phase={phase} />

          {/* schegge */}
          <AnimatePresence>
            {chips.map((c) => (
              <motion.span
                key={c.id}
                className="pointer-events-none absolute rounded-[1px]"
                style={{
                  left: `${c.x}%`,
                  top: `${c.y}%`,
                  width: c.w,
                  height: c.w * 1.4,
                  background: "linear-gradient(160deg, #f0f7ff, #7eb4e0)",
                  boxShadow: "0 0 6px rgba(160,210,255,0.6)",
                }}
                initial={{ opacity: 1, scale: 1, x: 0, y: 0, rotate: c.rot }}
                animate={{
                  opacity: 0,
                  x: (Math.random() - 0.5) * 110,
                  y: 50 + Math.random() * 60,
                  rotate: c.rot + 120 + Math.random() * 80,
                  scale: 0.25,
                }}
                exit={{ opacity: 0 }}
                transition={{ duration: 0.75 + Math.random() * 0.25 }}
              />
            ))}
          </AnimatePresence>

          <div className="absolute inset-x-0 top-3 z-10 text-center">
            <EventoKicker>Miniera di Ilum</EventoKicker>
            <p className="mt-1 font-display text-3xl text-crema drop-shadow-[0_2px_10px_rgba(0,0,0,0.85)]">
              {remaining}
            </p>
            <p className="text-xs uppercase tracking-[0.22em] text-crema/50">estrazioni rimaste</p>
          </div>

          <motion.div
            className="absolute bottom-[4%] left-[54%] z-20 origin-[32%_88%]"
            style={{ width: 96, height: 96 }}
            animate={
              phase === "swing" || phase === "crack"
                ? { rotate: [-48, 55, 18], x: [0, -22, -10], y: [0, -18, 6] }
                : phase === "reveal"
                  ? { rotate: 14, x: -6, y: 0 }
                  : { rotate: -32, x: 0, y: 0 }
            }
            transition={{ duration: 0.46, ease: [0.22, 1, 0.36, 1] }}
          >
            <PickaxeSvg className="h-full w-full drop-shadow-[0_12px_22px_rgba(0,0,0,0.7)]" />
          </motion.div>

          <AnimatePresence mode="wait">
            {phase === "reveal" && last && lastStyle ? (
              <motion.div
                key={`reveal-${last.color}-${finds.length}`}
                className="absolute inset-x-0 bottom-[28%] z-30 flex flex-col items-center"
                initial={{ y: 40, opacity: 0, scale: 0.3 }}
                animate={{ y: 0, opacity: 1, scale: 1 }}
                exit={{ opacity: 0, y: -14, scale: 0.85 }}
                transition={{ type: "spring", stiffness: 240, damping: 15 }}
              >
                <KyberCrystal color={last.color} rare={last.rare} size={64} gid="reveal" />
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
                className="absolute inset-x-0 bottom-[30%] z-10 text-center text-sm text-crema/45"
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
          <p className="mt-2 text-xs text-crema/45">
            Fine evento: fazione 1ª → cassa Beta · 2ª → cassa Alpha (solo chi ha scavato).
          </p>
        </div>
      </EventoPanel>

      {standings.length > 0 ? (
        <EventoPanel glow="none">
          <EventoKicker>Cristalli per fazione</EventoKicker>
          <ul className="mt-4 space-y-3">
            {standings.map((row, i) => (
              <li key={row.factionId}>
                <div className="mb-1 flex items-baseline justify-between gap-2 text-sm">
                  <span className="font-medium text-crema">
                    {i === 0 ? "◆ " : ""}
                    {row.label}
                  </span>
                  <span className="tabular-nums text-crema/60">
                    {row.crystals} · {row.participants} scavatori
                  </span>
                </div>
                <div className="h-1.5 overflow-hidden rounded-full bg-crema/10">
                  <div
                    className="h-full rounded-full transition-all duration-500"
                    style={{
                      width: `${Math.max(6, (row.crystals / maxCrystals) * 100)}%`,
                      background:
                        i === 0
                          ? "linear-gradient(90deg, #c9a227, #e4c76b)"
                          : "linear-gradient(90deg, #4a6a8a, #8eb0d0)",
                    }}
                  />
                </div>
              </li>
            ))}
          </ul>
        </EventoPanel>
      ) : null}

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
