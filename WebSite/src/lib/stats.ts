import { SITE_ORIGIN } from "./site";

export type Stats = { members: number; online: number; boosts: number; staff: number };

export type StaffMember = {
  name: string;
  avatarUrl?: string;
  profileUrl?: string;
  isOwner?: boolean;
  isPaused?: boolean;
  isStaffDelMese?: boolean;
  roleLabel?: string;
};

export type StaffGroup = {
  roleId?: string;
  role: string;
  members: StaffMember[];
};

export type BoostMember = {
  name: string;
  avatarUrl?: string;
  profileUrl?: string;
  boostCount?: number;
};

export type HourSlot = {
  id?: string;
  label?: string;
  range?: string;
  pct?: number;
  hint?: string;
  hottest?: boolean;
};

export type StatsExtra = {
  guildMemberCount?: number;
  guildBoostCount?: number;
  staffNoPm?: number;
  staffHoverGroups?: StaffGroup[];
  boostHoverMembers?: BoostMember[];
  memberPulse?: {
    messages7d?: number;
    voiceSeconds7d?: number;
    activeMembers7d?: number;
    onlineNow?: number;
  };
  communityHours?: { slots?: HourSlot[]; blurb?: string };
};

export const FALLBACK_STATS: Stats = { members: 2300, online: 150, boosts: 45, staff: 11 };

type Invite = {
  approximate_member_count?: number;
  approximate_presence_count?: number;
  id?: string;
  icon?: string;
  guild?: { id?: string; icon?: string };
};

function merge(invite: Invite | null, extra: StatsExtra | null, base: Stats): Stats {
  return {
    members: extra?.guildMemberCount ?? invite?.approximate_member_count ?? base.members,
    online: invite?.approximate_presence_count ?? extra?.memberPulse?.onlineNow ?? base.online,
    boosts: extra?.guildBoostCount ?? base.boosts,
    staff: extra?.staffNoPm ?? base.staff,
  };
}

async function getJson<T>(url: string): Promise<T | null> {
  try {
    /* Preferisci cache HTTP/CDN (CF edge) invece di no-store: meno round-trip verso Canada. */
    const r = await fetch(url, { cache: "default" });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

type StatsBundle = { stats: Stats; extra: StatsExtra | null; invite: Invite | null };

/** Dedup in-flight: Hero + LiveStats sulla home condividono un solo fetch. */
const inflightBundles = new Map<string, Promise<StatsBundle>>();

async function fetchStatsBundle(origin: string, base: Stats): Promise<StatsBundle> {
  const [invite, extra] = await Promise.all([
    getJson<Invite>(`${origin}/discord-invite.json`),
    getJson<StatsExtra>(`${origin}/live-stats-extra.json`),
  ]);
  return { stats: merge(invite, extra, base), extra, invite };
}

/** origin "" = stesso sito (beta → proxy al sito vero); in build si usa l'origine del sito vero */
export async function loadStats(origin = "", base: Stats = FALLBACK_STATS): Promise<Stats> {
  const b = await loadStatsBundle(origin, base);
  return b.stats;
}

export async function loadStatsBundle(
  origin = "",
  base: Stats = FALLBACK_STATS,
): Promise<StatsBundle> {
  const key = `${origin}::${base.members}:${base.online}:${base.boosts}:${base.staff}`;
  const hit = inflightBundles.get(key);
  if (hit) return hit;
  const p = fetchStatsBundle(origin, base).finally(() => {
    inflightBundles.delete(key);
  });
  inflightBundles.set(key, p);
  return p;
}

/** Valori reali al momento della build: la pagina nasce già con numeri veri, poi il client li aggiorna. */
export const loadBuildStats = () => loadStats(SITE_ORIGIN);
