import { apiUrl } from "./api";

export type WrappedChannel = {
  id: string;
  name: string | null;
  resolved?: boolean;
  count?: number;
  seconds?: number;
};

export type WrappedPayload = {
  ok: true;
  year: number;
  from?: string;
  to?: string;
  generatedAt: string;
  recentDays: number;
  user: {
    id: string;
    username: string;
    displayName: string;
    avatarUrl?: string | null;
    joinedAt?: string | null;
    daysInServer?: number | null;
  };
  archetype: { id: string; label: string; blurb: string; palette?: string };
  allTime: {
    level: number;
    totalExp: number;
    weeklyExp: number;
    allTimeRank: number;
    weeklyRank: number;
    pool: number;
    betterThanPct: number;
    messagesBetterThanPct: number;
    voiceBetterThanPct: number;
    minigameBetterThanPct: number;
    progressPercent: number;
    messagesTotal: number;
    messagesWeekly: number;
    messagesRank: number | null;
    voiceTotalSeconds: number;
    voiceWeeklySeconds: number;
    voiceRank: number | null;
    privateVoiceSeconds: number;
    disconnects: number;
    minigameTotalExp: number;
    minigameRank: number | null;
    bestStreak: number;
    currentStreak: number;
    avgMessagesPerDay: number | null;
    avgVoiceHoursPerWeek: number | null;
    coffeeCups: number;
    milestonesHit: number[];
    nextMilestone: number | null;
    balance: { messagesPct: number; voicePct: number };
    votesTotal: number;
    boosts: number;
    isBoosting?: boolean;
    nightMessages: number;
    gifsTotal?: number;
    imagesTotal?: number;
    mentionsMade?: number;
    mentionsReceived?: number;
    rolePings?: number;
    commandsTotal?: number;
    topEmoji?: { key: string; name: string; count: number } | null;
  };
  recent: {
    days: number;
    from: string;
    to: string;
    activeDays: number;
    messages: number;
    voiceSeconds: number;
    avgMessagesPerActiveDay: number;
    peakDay: { dateKey: string; label: string; messages: number; voiceSeconds: number } | null;
    owl: { hour: number; label: string; vibe: string; score: number } | null;
    nightMessages?: number;
    topTextChannels: WrappedChannel[];
    topVoiceChannels: WrappedChannel[];
  };
};

export type WrappedResult =
  | { status: "ok"; data: WrappedPayload }
  | { status: "auth" }
  | { status: "forbidden" }
  | { status: "disabled" }
  | { status: "error"; message?: string };

const nf = new Intl.NumberFormat("it-IT");

export const fmt = (n?: number | null) => nf.format(Math.round(n ?? 0));

export function hours(seconds?: number | null) {
  const s = Math.max(0, Number(seconds) || 0);
  if (s < 3600) return `${fmt(Math.round(s / 60))} min`;
  const h = s / 3600;
  if (h < 10) return `${(Math.round(h * 10) / 10).toLocaleString("it-IT")} h`;
  return `${fmt(Math.round(h))} h`;
}

export async function loadWrapped(token: string): Promise<WrappedResult> {
  try {
    const r = await fetch(apiUrl("/webhooks/site-wrapped"), {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });
    if (r.status === 401) return { status: "auth" };
    if (r.status === 403) return { status: "forbidden" };
    const j = await r.json().catch(() => null);
    if (r.status === 503 || j?.error === "wrapped_disabled") return { status: "disabled" };
    if (!r.ok || !j?.ok) {
      return { status: "error", message: String(j?.message || "Errore caricamento Wrapped.") };
    }
    return { status: "ok", data: j as WrappedPayload };
  } catch {
    return { status: "error", message: "Rete non disponibile." };
  }
}

export function buildShareText(data: WrappedPayload): string {
  const a = data.allTime;
  const name = data.user.displayName || data.user.username || "io";
  return [
    `✦ Vinili Wrapped ${data.year}`,
    `${name} · ${data.archetype.label}`,
    `Lv.${a.level} (#${a.allTimeRank}) · top ${a.betterThanPct}%`,
    `${fmt(a.messagesTotal)} msg · ${hours(a.voiceTotalSeconds)} in call`,
    a.votesTotal ? `${fmt(a.votesTotal)} voti` : null,
    `viniliecaffe.it/wrapped`,
  ]
    .filter(Boolean)
    .join("\n");
}
