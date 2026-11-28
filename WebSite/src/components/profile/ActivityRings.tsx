"use client";

import { motion} from "motion/react";
import { Activity } from "lucide-react";
import type { ProfileData } from "@/lib/profile";
import { Reveal } from "@/components/Reveal";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion-safe";

type Ring = { label: string; detail: string; pct: number; color: string; track: string };

/** anello SVG: si disegna dal vuoto fino alla percentuale (oltre il 100% resta pieno) */
function Arc({ r, pct, color, track, delay }: { r: number; pct: number; color: string; track: string; delay: number }) {
  const reduce = useReducedMotionSafe();
  const c = 2 * Math.PI * r;
  const p = Math.max(0, Math.min(1, pct / 100));
  return (
    <>
      <circle cx="80" cy="80" r={r} fill="none" stroke={track} strokeWidth="13" />
      <motion.circle
        cx="80"
        cy="80"
        r={r}
        fill="none"
        stroke={color}
        strokeWidth="13"
        strokeLinecap="round"
        strokeDasharray={c}
        initial={{ strokeDashoffset: c }}
        whileInView={{ strokeDashoffset: c * (1 - p) }}
        viewport={{ once: true }}
        transition={reduce ? { duration: 0 } : { delay, duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
        transform="rotate(-90 80 80)"
        style={{ filter: `drop-shadow(0 0 6px ${color}66)` }}
      />
    </>
  );
}

/**
 * Anelli attività del profilo (idea: Kokonut «apple activity card» / grafici a anello di bklit):
 * il livello che si riempie verso il prossimo, e messaggi e vocale di oggi rispetto alla media del giorno della settimana.
 */
export function ActivityRings({ p }: { p: ProfileData }) {
  const lv = p.level;
  const msgToday = p.messages?.messagesDaily ?? 0;
  const msgAvg = (p.messages?.messagesWeekly ?? 0) / 7;
  const vcToday = p.voice?.voiceDailySeconds ?? 0;
  const vcAvg = (p.voice?.voiceWeeklySeconds ?? 0) / 7;
  const min = (s: number) => (s >= 3600 ? `${Math.floor(s / 3600)} h ${Math.round((s % 3600) / 60)} min` : `${Math.round(s / 60)} min`);
  const vs = (today: number, avg: number) => (avg > 0 ? Math.round((today / avg) * 100) : today > 0 ? 100 : 0);

  const rings: Ring[] = [
    {
      label: "Livello",
      detail: lv ? `${Math.round(lv.progressPercent)}% verso il livello ${lv.level + 1}` : "nessun livello",
      pct: lv?.progressPercent ?? 0,
      color: "#f0b46e",
      track: "rgba(240,180,110,0.14)",
    },
    {
      label: "Messaggi oggi",
      detail: `${msgToday.toLocaleString("it-IT")} · ${vs(msgToday, msgAvg)}% della media`,
      pct: vs(msgToday, msgAvg),
      color: "#ff8a5c",
      track: "rgba(255,138,92,0.14)",
    },
    {
      label: "Vocale oggi",
      detail: `${min(vcToday)} · ${vs(vcToday, vcAvg)}% della media`,
      pct: vs(vcToday, vcAvg),
      color: "#6dcf8a",
      track: "rgba(109,207,138,0.14)",
    },
  ];
  if (!lv && !p.messages && !p.voice) return null;

  return (
    <Reveal>
      <div className="mb-5">
        <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-caramel">
          <Activity className="size-4" /> Oggi
        </p>
        <h2 className="mt-1.5 font-display text-3xl font-semibold sm:text-4xl">Gli anelli della giornata</h2>
      </div>
      <div className="flex flex-col items-center gap-6 rounded-3xl bg-gradient-to-b from-caramel/[0.1] via-roast/85 to-roast p-6 ring-1 ring-sand/12 sm:flex-row sm:gap-10 sm:p-8">
        <svg viewBox="0 0 160 160" className="size-44 shrink-0 sm:size-52" role="img" aria-label="Anelli attività di oggi">
          <Arc r={70} pct={rings[0]!.pct} color={rings[0]!.color} track={rings[0]!.track} delay={0} />
          <Arc r={54} pct={rings[1]!.pct} color={rings[1]!.color} track={rings[1]!.track} delay={0.15} />
          <Arc r={38} pct={rings[2]!.pct} color={rings[2]!.color} track={rings[2]!.track} delay={0.3} />
        </svg>
        <ul className="w-full space-y-4">
          {rings.map((r) => (
            <li key={r.label} className="flex items-center gap-3">
              <span className="size-3 shrink-0 rounded-full" style={{ background: r.color, boxShadow: `0 0 10px ${r.color}88` }} />
              <div className="min-w-0">
                <p className="text-sm font-semibold text-crema">{r.label}</p>
                <p className="text-sm tabular-nums text-crema/60">{r.detail}</p>
              </div>
            </li>
          ))}
          <li className="pt-1 text-xs text-crema/40">La media è quella di ogni giorno di questa settimana.</li>
        </ul>
      </div>
    </Reveal>
  );
}
