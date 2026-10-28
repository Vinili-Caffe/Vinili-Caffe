"use client";

import { useId } from "react";
import { Coffee } from "lucide-react";

// Solchi: tanti cerchi sottili, alternando due neri → nitidi a qualsiasi dimensione
const GROOVES = Array.from({ length: 30 }, (_, i) => 19 + i * 1.02);

/** Il vinile di Vinili & Caffè, in SVG (il PNG del logo è 135px e si sgranava ingrandito). */
export function VinylRecord({ className, rpm = 33 }: { className?: string; rpm?: 33 | 45 }) {
  const uid = useId().replace(/:/g, "");
  const base = `vc-vinyl-base-${uid}`;
  const label = `vc-vinyl-label-${uid}`;
  const gold = `vc-vinyl-gold-${uid}`;
  const arc = `vc-vinyl-arc-${uid}`;
  const rpmLabel = rpm === 45 ? "45 GIRI · STEREO" : "33⅓ GIRI · STEREO";
  return (
    <svg viewBox="0 0 100 100" className={className} role="img" aria-label="Il vinile di Vinili & Caffè">
      <defs>
        <radialGradient id={base} cx="50%" cy="50%" r="50%">
          <stop offset="0.3" stopColor="#151515" />
          <stop offset="0.96" stopColor="#0b0b0b" />
          <stop offset="1" stopColor="#1e1e1e" />
        </radialGradient>
        <radialGradient id={label} cx="40%" cy="35%" r="70%">
          <stop offset="0" stopColor="#f6e6c8" />
          <stop offset="0.7" stopColor="#e3c493" />
          <stop offset="1" stopColor="#c9a46e" />
        </radialGradient>
        <linearGradient id={gold} x1="0" y1="0" x2="1" y2="1">
          <stop offset="0" stopColor="#f4e9d8" />
          <stop offset="0.45" stopColor="#d9b07a" />
          <stop offset="1" stopColor="#a87b4c" />
        </linearGradient>
        <path id={arc} d="M 22 50 A 28 28 0 0 1 78 50" />
      </defs>

      <circle cx="50" cy="50" r="49.5" fill={`url(#${base})`} />
      {GROOVES.map((r, i) => (
        <circle key={r} cx="50" cy="50" r={r} fill="none" stroke={i % 2 ? "#1d1d1d" : "#0d0d0d"} strokeWidth="0.55" />
      ))}
      <circle cx="50" cy="50" r="33.5" fill="none" stroke="#050505" strokeWidth="0.9" />

      <text fill={`url(#${gold})`} fontSize="4.2" letterSpacing="0.8">
        <textPath href={`#${arc}`} startOffset="50%" textAnchor="middle">
          Vinili &amp; Caffè
        </textPath>
      </text>

      <circle cx="50" cy="50" r="16.5" fill={`url(#${label})`} />
      <circle cx="50" cy="50" r="15.2" fill="none" stroke="#9c7447" strokeWidth="0.35" opacity="0.7" />
      <Coffee x="46" y="37" width="8" height="8" color="#5b3a22" strokeWidth={2} />
      <text x="50" y="55" fill="#6b4426" fontSize="5.2" textAnchor="middle" className="font-script">
        Caffè
      </text>
      {/* textLength: la riga resta dentro il bordo interno dell'etichetta (largo ~24 a quell'altezza) */}
      <text x="50" y="59.6" fill="#7a5130" fontSize="2.05" textAnchor="middle" textLength="19" lengthAdjust="spacingAndGlyphs" fontWeight="600">
        {rpmLabel}
      </text>
      <circle cx="50" cy="50" r="1.4" fill="#1a1a1a" />
    </svg>
  );
}
