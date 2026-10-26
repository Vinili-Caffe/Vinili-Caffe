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

type Invite = { approximate_member_count?: number; approximate_presence_count?: number };

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
    const r = await fetch(url, { cache: "no-store" });
    return r.ok ? ((await r.json()) as T) : null;
  } catch {
    return null;
  }
}

/** origin "" = stesso sito (beta → proxy al sito vero); in build si usa l'origine del sito vero */
export async function loadStats(origin = "", base: Stats = FALLBACK_STATS): Promise<Stats> {
  const [invite, extra] = await Promise.all([
    getJson<Invite>(`${origin}/discord-invite.json`),
    getJson<StatsExtra>(`${origin}/live-stats-extra.json`),
  ]);
  return merge(invite, extra, base);
}

export async function loadStatsBundle(
  origin = "",
  base: Stats = FALLBACK_STATS,
): Promise<{ stats: Stats; extra: StatsExtra | null }> {
  const [invite, extra] = await Promise.all([
    getJson<Invite>(`${origin}/discord-invite.json`),
    getJson<StatsExtra>(`${origin}/live-stats-extra.json`),
  ]);
  return { stats: merge(invite, extra, base), extra };
}

/** Valori reali al momento della build: la pagina nasce già con numeri veri, poi il client li aggiorna. */
export const loadBuildStats = () => loadStats(SITE_ORIGIN);
