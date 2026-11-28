"use client";

import { useId, useMemo, useState } from "react";
import { motion} from "motion/react";
import { useReducedMotionSafe } from "@/lib/use-reduced-motion-safe";

export type OnlinePoint = { t: number; n: number };

const W = 600;
const H = 140;
const PAD = { l: 8, r: 8, t: 12, b: 22 };

const hhmm = (t: number) => new Intl.DateTimeFormat("it-IT", { hour: "2-digit", minute: "2-digit", timeZone: "Europe/Rome" }).format(t);

/**
 * Online nelle ultime 24 ore (idea: bklit «live line chart»): la linea si disegna da sinistra,
 * area sfumata sotto, l'ultimo punto pulsa; passando sopra si legge ora e numero.
 */
export function OnlineLine({ series }: { series: OnlinePoint[] }) {
  const reduce = useReducedMotionSafe();
  const gid = useId().replace(/:/g, "");
  const [hover, setHover] = useState<number | null>(null);

  const geo = useMemo(() => {
    const pts = series.filter((p) => Number.isFinite(p.t) && Number.isFinite(p.n));
    if (pts.length < 2) return null;
    const t0 = pts[0]!.t;
    const t1 = pts[pts.length - 1]!.t;
    const lo = Math.min(...pts.map((p) => p.n));
    const hi = Math.max(...pts.map((p) => p.n));
    const span = Math.max(1, hi - lo);
    const x = (t: number) => PAD.l + ((t - t0) / Math.max(1, t1 - t0)) * (W - PAD.l - PAD.r);
    const y = (n: number) => PAD.t + (1 - (n - lo) / span) * (H - PAD.t - PAD.b);
    const xy = pts.map((p) => ({ ...p, x: x(p.t), y: y(p.n) }));
    /* curva morbida (Catmull-Rom → Bézier) */
    let d = `M ${xy[0]!.x} ${xy[0]!.y}`;
    for (let i = 0; i < xy.length - 1; i++) {
      const p0 = xy[i - 1] || xy[i]!;
      const p1 = xy[i]!;
      const p2 = xy[i + 1]!;
      const p3 = xy[i + 2] || p2;
      d += ` C ${p1.x + (p2.x - p0.x) / 6} ${p1.y + (p2.y - p0.y) / 6}, ${p2.x - (p3.x - p1.x) / 6} ${p2.y - (p3.y - p1.y) / 6}, ${p2.x} ${p2.y}`;
    }
    const area = `${d} L ${xy[xy.length - 1]!.x} ${H - PAD.b} L ${xy[0]!.x} ${H - PAD.b} Z`;
    return { xy, d, area, lo, hi };
  }, [series]);

  if (!geo) return null;
  const last = geo.xy[geo.xy.length - 1]!;
  const h = hover != null ? geo.xy[hover] : null;

  return (
    <div className="mb-4 rounded-2xl bg-black/20 p-3 ring-1 ring-sand/10">
      <div className="mb-1 flex items-baseline justify-between gap-2 px-1">
        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.2em] text-emerald-300/80">Ultime 24 ore</p>
        <p className="text-xs tabular-nums text-crema/55">
          {h ? (
            <>
              <b className="text-crema">{h.n}</b> online alle {hhmm(h.t)}
            </>
          ) : (
            <>
              min <b className="text-crema/80">{geo.lo}</b> · max <b className="text-crema/80">{geo.hi}</b>
            </>
          )}
        </p>
      </div>
      <svg
        viewBox={`0 0 ${W} ${H}`}
        className="h-36 w-full touch-none overflow-visible"
        role="img"
        aria-label={`Online nelle ultime 24 ore: da ${geo.lo} a ${geo.hi}`}
        onPointerMove={(e) => {
          const r = e.currentTarget.getBoundingClientRect();
          const px = ((e.clientX - r.left) / r.width) * W;
          let best = 0;
          geo.xy.forEach((p, i) => {
            if (Math.abs(p.x - px) < Math.abs(geo.xy[best]!.x - px)) best = i;
          });
          setHover(best);
        }}
        onPointerLeave={() => setHover(null)}
      >
        <defs>
          <linearGradient id={`og-${gid}`} x1="0" y1="0" x2="0" y2="1">
            <stop offset="0%" stopColor="#34d399" stopOpacity="0.35" />
            <stop offset="100%" stopColor="#34d399" stopOpacity="0" />
          </linearGradient>
        </defs>
        {/* griglia leggera */}
        {[0.25, 0.5, 0.75].map((f) => (
          <line key={f} x1={PAD.l} x2={W - PAD.r} y1={PAD.t + f * (H - PAD.t - PAD.b)} y2={PAD.t + f * (H - PAD.t - PAD.b)} stroke="rgba(244,233,216,0.06)" />
        ))}
        <motion.path
          d={geo.area}
          fill={`url(#og-${gid})`}
          initial={reduce ? false : { opacity: 0 }}
          animate={{ opacity: 1 }}
          transition={{ delay: 0.6, duration: 0.6 }}
        />
        <motion.path
          d={geo.d}
          fill="none"
          stroke="#34d399"
          strokeWidth="2.5"
          strokeLinecap="round"
          initial={reduce ? false : { pathLength: 0 }}
          animate={{ pathLength: 1 }}
          transition={{ duration: 1.4, ease: [0.22, 1, 0.36, 1] }}
          style={{ filter: "drop-shadow(0 0 6px rgba(52,211,153,0.5))" }}
        />
        {/* ultimo punto: adesso */}
        <circle cx={last.x} cy={last.y} r="4" fill="#34d399" />
        {!reduce ? (
          <motion.circle
            cx={last.x}
            cy={last.y}
            r="4"
            fill="none"
            stroke="#34d399"
            initial={{ r: 4, opacity: 0.8 }}
            animate={{ r: 14, opacity: 0 }}
            transition={{ duration: 1.6, repeat: Infinity, ease: "easeOut" }}
          />
        ) : null}
        {h ? (
          <>
            <line x1={h.x} x2={h.x} y1={PAD.t} y2={H - PAD.b} stroke="rgba(244,233,216,0.25)" strokeDasharray="3 3" />
            <circle cx={h.x} cy={h.y} r="5" fill="#0e0906" stroke="#34d399" strokeWidth="2" />
          </>
        ) : null}
        <text x={PAD.l} y={H - 4} fill="rgba(244,233,216,0.4)" fontSize="11">
          {hhmm(geo.xy[0]!.t)}
        </text>
        <text x={W - PAD.r} y={H - 4} fill="rgba(244,233,216,0.4)" fontSize="11" textAnchor="end">
          adesso
        </text>
      </svg>
    </div>
  );
}
