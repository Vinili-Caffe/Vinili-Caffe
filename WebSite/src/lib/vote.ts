import { SITE_ORIGIN } from "./site";

// Voti: GET /webhooks/site-vote[?userId=…]. Con userId arrivano anche i tuoi voti e i cooldown per piattaforma.

export type PlatformId = "discadia" | "topgg";

export const PLATFORMS: { id: PlatformId; name: string; href: string; cooldownHours: number; tagline: string; accent: string }[] = [
  {
    id: "discadia",
    name: "Discadia",
    href: "https://discadia.com/vote/viniliecaffe/",
    cooldownHours: 24,
    tagline: "Ci aiuta a salire nella classifica dei server italiani.",
    accent: "#5ac8fa",
  },
  {
    id: "topgg",
    name: "Top.gg",
    href: "https://top.gg/discord/servers/832911595289169920/vote",
    cooldownHours: 12,
    tagline: "La vetrina più grande: ogni voto ci porta nuovi membri.",
    accent: "#ff3366",
  },
];

export type PlatformState = { lastVoteAt: string | null; nextVoteAt: string | null; canVote: boolean; cooldownHours: number };
export type VoteRow = { rank: number; userId: string; displayName: string; avatarUrl?: string; votes: number; topggVotes: number; discadiaVotes: number };
export type VoteData = {
  stats: { totalVotes: number; totalVoters: number; goal: number };
  personal: null | { votes: number; rank: number | null; topggVotes: number; discadiaVotes: number; topgg: PlatformState; discadia: PlatformState };
  rows: VoteRow[];
};

export class VoteLoadOfflineError extends Error {
  constructor() {
    super("offline");
    this.name = "VoteLoadOfflineError";
  }
}

export async function loadVote(opts: { origin?: string; userId?: string } = {}): Promise<VoteData | null> {
  try {
    const q = opts.userId ? `?userId=${encodeURIComponent(opts.userId)}` : "";
    const r = await fetch(`${opts.origin ?? ""}/webhooks/site-vote${q}`, { cache: "no-store" });
    const j = await r.json();
    if (!j?.ok || !Array.isArray(j.rows)) return null;
    const p = j.personal;
    return {
      stats: { totalVotes: Number(j.stats?.totalVotes) || 0, totalVoters: Number(j.stats?.totalVoters) || 0, goal: Number(j.stats?.goal) || 1000 },
      personal: p?.userId
        ? {
            votes: Number(p.votes) || 0,
            rank: p.rank ?? null,
            topggVotes: Number(p.topggVotes) || 0,
            discadiaVotes: Number(p.discadiaVotes) || 0,
            topgg: p.topgg,
            discadia: p.discadia,
          }
        : null,
      rows: j.rows.map((x: VoteRow) => ({ ...x, topggVotes: Number(x.topggVotes) || 0, discadiaVotes: Number(x.discadiaVotes) || 0 })),
    };
  } catch (e) {
    if (typeof navigator !== "undefined" && (navigator.onLine === false || e instanceof TypeError)) {
      throw new VoteLoadOfflineError();
    }
    return null;
  }
}

export const loadBuildVote = () => loadVote({ origin: SITE_ORIGIN });

/** "3 h 12 min" / "45 min" / "meno di un minuto" */
export function untilText(iso: string | null, now = Date.now()) {
  if (!iso) return null;
  const ms = new Date(iso).getTime() - now;
  if (ms <= 0) return null;
  const mins = Math.ceil(ms / 60000);
  if (mins < 1) return "meno di un minuto";
  const h = Math.floor(mins / 60);
  const m = mins % 60;
  return h ? `${h} h ${m} min` : `${m} min`;
}
