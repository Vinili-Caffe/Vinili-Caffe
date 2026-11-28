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
  /** online nelle ultime 24 ore, un punto ogni 15 minuti */
  onlineSeries?: { t: number; n: number }[];
};

export const FALLBACK_STATS: Stats = { members: 2300, online: 150, boosts: 45, staff: 11 };

type Invite = {
  approximate_member_count?: number;
  approximate_presence_count?: number;
  id?: string;
  icon?: string;
  guild?: { id?: string; icon?: string; premium_subscription_count?: number };
  profile?: { member_count?: number; online_count?: number; premium_subscription_count?: number };
};

function merge(invite: Invite | null, extra: StatsExtra | null, base: Stats): Stats {
  const inviteMembers =
    invite?.approximate_member_count ?? invite?.profile?.member_count ?? null;
  const inviteOnline =
    invite?.approximate_presence_count ?? invite?.profile?.online_count ?? null;
  const inviteBoosts =
    invite?.guild?.premium_subscription_count ??
    invite?.profile?.premium_subscription_count ??
    null;
  /* Preferisci invite live (proxy Discord) per membri/online/boost:
     live-stats-extra può restare indietro se il cron fallisce. */
  return {
    members: inviteMembers ?? extra?.guildMemberCount ?? base.members,
    online: inviteOnline ?? extra?.memberPulse?.onlineNow ?? base.online,
    boosts: inviteBoosts ?? extra?.guildBoostCount ?? base.boosts,
    staff: extra?.staffNoPm ?? base.staff,
  };
}

async function getJson<T>(url: string, fresh = false): Promise<T | null> {
  try {
    /* Build/SSR: cache HTTP/CDN. Client live: no-store + ?t= (niente header custom → no preflight CORS). */
    const href = fresh ? `${url}${url.includes("?") ? "&" : "?"}t=${Date.now()}` : url;
    const r = await fetch(href, { cache: fresh ? "no-store" : "default" });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

type StatsBundle = { stats: Stats; extra: StatsExtra | null; invite: Invite | null };

/** Dedup in-flight: Hero + LiveStats sulla home condividono un solo fetch (solo cache non-fresh). */
const inflightBundles = new Map<string, Promise<StatsBundle>>();

async function fetchStatsBundle(origin: string, base: Stats, fresh = false): Promise<StatsBundle> {
  /* Same-origin su www (rewrite → api): niente CORS. origin pieno solo in build/SSR. */
  const baseOrigin = String(origin || "").trim().replace(/\/+$/, "");
  const [invite, extra] = await Promise.all([
    getJson<Invite>(`${baseOrigin}/discord-invite.json`, fresh),
    getJson<StatsExtra>(`${baseOrigin}/live-stats-extra.json`, fresh),
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
  opts: { fresh?: boolean } = {},
): Promise<StatsBundle> {
  const fresh = opts.fresh === true;
  if (fresh) return fetchStatsBundle(origin, base, true);
  const key = `${origin}::${base.members}:${base.online}:${base.boosts}:${base.staff}`;
  const hit = inflightBundles.get(key);
  if (hit) return hit;
  const p = fetchStatsBundle(origin, base, false).finally(() => {
    inflightBundles.delete(key);
  });
  inflightBundles.set(key, p);
  return p;
}

/** Valori reali al momento della build: la pagina nasce già con numeri veri, poi il client li aggiorna. */
export const loadBuildStats = () => loadStats(SITE_ORIGIN);
