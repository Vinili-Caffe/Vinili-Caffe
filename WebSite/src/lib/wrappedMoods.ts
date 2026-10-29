/** Mood visivo + audio per ogni scheda Wrapped. */

export type WrappedMoodId =
  | "hello"
  | "days"
  | "messages"
  | "voice"
  | "support"
  | "boost"
  | "games"
  | "particular"
  | "role"
  | "share"
  | "default";

export type WrappedMood = {
  id: WrappedMoodId;
  /** Gradient CSS background */
  bg: string;
  glow: string;
  accent: string;
  particle: "vinyl" | "steam" | "spark" | "wave" | "star" | "coin" | "note" | "confetti";
  /** Frequenze motif (Hz) suonate in sequenza */
  motif: number[];
  motifKind: "arpeggio" | "chord" | "pulse" | "rise" | "twinkle";
};

const MOODS: Record<WrappedMoodId, WrappedMood> = {
  hello: {
    id: "hello",
    bg: "radial-gradient(120% 80% at 50% 20%, #4a2a18 0%, #1a100c 45%, #0a0604 100%)",
    glow: "rgba(240,180,110,0.35)",
    accent: "#f0b46e",
    particle: "vinyl",
    motif: [196, 247, 294, 392],
    motifKind: "arpeggio",
  },
  days: {
    id: "days",
    bg: "radial-gradient(100% 90% at 30% 10%, #3a2818 0%, #1c120e 50%, #0c0806 100%)",
    glow: "rgba(212,165,116,0.28)",
    accent: "#e8c49a",
    particle: "steam",
    motif: [220, 277, 330],
    motifKind: "chord",
  },
  messages: {
    id: "messages",
    bg: "radial-gradient(110% 85% at 70% 0%, #5a3018 0%, #24160f 48%, #0e0906 100%)",
    glow: "rgba(255,170,90,0.32)",
    accent: "#ffb86b",
    particle: "spark",
    motif: [523, 392, 523, 659],
    motifKind: "pulse",
  },
  voice: {
    id: "voice",
    bg: "radial-gradient(120% 90% at 50% 100%, #2a1810 0%, #120c18 40%, #080610 100%)",
    glow: "rgba(180,120,255,0.18)",
    accent: "#d4a574",
    particle: "wave",
    motif: [110, 147, 185, 220],
    motifKind: "pulse",
  },
  support: {
    id: "support",
    bg: "radial-gradient(100% 80% at 50% 0%, #3a2410 0%, #1a120c 55%, #0a0806 100%)",
    glow: "rgba(255,200,100,0.3)",
    accent: "#ffd27a",
    particle: "coin",
    motif: [349, 440, 523],
    motifKind: "twinkle",
  },
  boost: {
    id: "boost",
    bg: "radial-gradient(110% 90% at 20% 0%, #5a2810 0%, #2a140c 40%, #100808 100%)",
    glow: "rgba(255,140,60,0.4)",
    accent: "#ff9a4a",
    particle: "confetti",
    motif: [262, 330, 392, 523],
    motifKind: "rise",
  },
  games: {
    id: "games",
    bg: "radial-gradient(100% 85% at 80% 20%, #243018 0%, #141810 50%, #080a08 100%)",
    glow: "rgba(160,220,100,0.28)",
    accent: "#b8e070",
    particle: "note",
    motif: [392, 494, 587, 494],
    motifKind: "arpeggio",
  },
  particular: {
    id: "particular",
    bg: "radial-gradient(120% 100% at 50% 0%, #1a1030 0%, #100818 45%, #06040c 100%)",
    glow: "rgba(160,120,255,0.28)",
    accent: "#c4a0ff",
    particle: "star",
    motif: [185, 233, 277, 233],
    motifKind: "twinkle",
  },
  role: {
    id: "role",
    bg: "radial-gradient(100% 90% at 50% 30%, #4a3018 0%, #1c120c 50%, #0a0604 100%)",
    glow: "rgba(240,190,120,0.42)",
    accent: "#f5d09a",
    particle: "confetti",
    motif: [262, 330, 392, 523, 659],
    motifKind: "rise",
  },
  share: {
    id: "share",
    bg: "radial-gradient(110% 85% at 50% 10%, #3a2818 0%, #18110c 55%, #0a0705 100%)",
    glow: "rgba(212,160,100,0.3)",
    accent: "#e8c49a",
    particle: "vinyl",
    motif: [196, 247, 294],
    motifKind: "chord",
  },
  default: {
    id: "default",
    bg: "radial-gradient(100% 80% at 50% 0%, #2a1c14 0%, #120c0a 60%, #080604 100%)",
    glow: "rgba(200,150,100,0.25)",
    accent: "#f0b46e",
    particle: "spark",
    motif: [220, 277, 330],
    motifKind: "arpeggio",
  },
};

export function moodForStoryKey(key: string): WrappedMood {
  const k = String(key || "").toLowerCase();
  if (k in MOODS) return MOODS[k as WrappedMoodId];
  if (k === "support" || k.startsWith("vote")) return MOODS.support;
  return MOODS.default;
}
