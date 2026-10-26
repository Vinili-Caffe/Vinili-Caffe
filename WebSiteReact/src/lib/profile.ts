// Profilo utente: GET /webhooks/site-users?board=profile&userId=… (handler Vinyls/Utils/Web/siteUsersLeaderboardApi.js)
// La card +rank è una GIF generata da /webhooks/site-rank-card-public?userId=…
// Le impostazioni (compleanno, privacy, reazioni…) stanno in Personalizza, non qui.

export type DiscordRole = { id: string; name: string; color?: string; emoji?: string; iconUrl?: string };
export type SharedMember = { id: string; username?: string; displayName?: string; avatarUrl?: string; isOwner?: boolean };
export type CustomRole = DiscordRole & { color2?: string; colorMode?: "solid" | "gradient"; createdAt?: string; memberCount?: number; sharedMembers?: SharedMember[] };
export type CustomVoice = { id: string; name: string; emoji?: string; createdAt?: string; memberCount?: number; sharedMembers?: SharedMember[] };
export type Birthday = { day: number; month: number; birthYear?: number; showAge?: boolean; isToday?: boolean; age?: number; label?: string };
export type MultiplierSource = { key: string; label: string; type: string; multiplier: number; color?: string; active?: boolean; applied?: boolean };
export type Candy = { id: string; name: string; thumbUrl: string; silhouetteUrl: string; owned: boolean };

export type ProfileData = {
  userId: string;
  username: string;
  displayName: string;
  avatarUrl?: string;
  joinedAt?: string;
  inGuild: boolean;
  roles: DiscordRole[];
  birthday: Birthday | null;
  custom: { role: CustomRole | null; secondaryRole: CustomRole | null; voice: CustomVoice | null };
  multiplier: number;
  multiplierSources: MultiplierSource[];
  candy: { visible: boolean; ownedCount: number; total: number; items: Candy[] } | null;
  level: { rank?: number; level: number; exp: number; currentLevelExp: number; nextLevelExp: number; progressPercent: number } | null;
  weekly: { rank?: number; weeklyExp: number } | null;
  messages: { rank?: number; messagesTotal: number; messagesWeekly: number; messagesDaily: number } | null;
  voice: { rank?: number; voiceTotalSeconds: number; voiceWeeklySeconds: number; voiceDailySeconds: number } | null;
  minigames: { rank?: number; minigameTotalExp: number; minigameWeeklyExp: number; bestStreak: number; currentStreak: number } | null;
};

export type ProfileResult = { status: "ok"; data: ProfileData } | { status: "notfound" } | { status: "error" };

export const isUserId = (s: string | null | undefined): s is string => !!s && /^\d{17,20}$/.test(s);

/** Ruoli "separatore" del server (es. "ㅤㅤ・BADGEs・ㅤㅤ"): non sono ruoli veri. */
const isSeparator = (name: string) => /^[\sㅤㅤ]*[・•·-]/.test(name) || /ㅤ{2,}/.test(name);
export const cleanRole = (n: string) => n.replace(/^[\s ]*(?:༄|✦|✧|★|☆|◆|◇|•|·|❖|✵)+[\s ]*/u, "").trim() || n;

export async function loadProfile(userId: string, origin = ""): Promise<ProfileResult> {
  try {
    const q = new URLSearchParams({ board: "profile", userId, perPage: "1" });
    const r = await fetch(`${origin}/webhooks/site-users?${q}`, { cache: "no-store" });
    if (!r.ok) return { status: "error" };
    const j = await r.json();
    if (!j?.ok) return { status: "error" };
    if (j.notFound || !j.profile) return { status: "notfound" };
    const p = j.profile;
    const rows = j.rows && typeof j.rows === "object" ? j.rows : {};
    const cp = p.customProfile || {};
    const hc = p.halloweenCandy;
    return {
      status: "ok",
      data: {
        userId: String(p.userId || userId),
        username: String(p.username || rows.level?.username || ""),
        displayName: String(p.displayName || rows.level?.displayName || p.username || "Utente"),
        avatarUrl: p.avatarUrl || rows.level?.avatarUrl || undefined,
        joinedAt: p.joinedAt || undefined,
        inGuild: j.inGuild !== false && p.inGuild !== false,
        roles: (Array.isArray(p.roles) ? p.roles : []).filter((x: DiscordRole) => x?.name && !isSeparator(x.name)),
        birthday: p.birthday?.day && p.birthday?.month ? p.birthday : null,
        custom: { role: cp.role || null, secondaryRole: cp.secondaryRole || null, voice: cp.voice || null },
        multiplier: Number(rows.weekly?.expMultiplier ?? p.expMultiplierResolved ?? 1) || 1,
        multiplierSources: Array.isArray(p.weeklyMultiplierSources) ? p.weeklyMultiplierSources : [],
        candy: hc?.visible && Array.isArray(hc.items) ? { visible: true, ownedCount: Number(hc.ownedCount) || 0, total: Number(hc.total) || hc.items.length, items: hc.items } : null,
        level: rows.level || null,
        weekly: rows.weekly || null,
        messages: rows.messages || null,
        voice: rows.voice || null,
        minigames: rows.minigames || null,
      },
    };
  } catch {
    return { status: "error" };
  }
}

export const rankCardUrl = (userId: string) => `/webhooks/site-rank-card-public?userId=${encodeURIComponent(userId)}`;

/** Badge principali, in ordine, dai ruoli (stessi id del sito attuale). */
const BADGE_ROLES: [string, string][] = [
  ["1442568886988963923", "Founder"],
  ["1521562607339704442", "Manager"],
  ["1544831233404575835", "Staff del Mese"],
  ["1550462300291604551", "Staffer della Settimana"],
  ["1502322782602530977", "Director"],
  ["1544831228690046976", "High Staff"],
  ["1442568910070349985", "Staff"],
  ["1544831242510270464", "Partner Manager"],
  ["1544830838443741194", "Member of The Month"],
  ["1544830834849087630", "Top Weekly Text"],
  ["1544830836686200992", "Top Weekly Voc"],
  ["1544830832227782699", "MVP"],
  ["1544830868575625276", "VIP+"],
  ["1544830866616754257", "VIP"],
  ["1544830850552823849", "Double Booster"],
  ["1329497467481493607", "Booster"],
  ["1544830864565735515", "Donator"],
];
export function badges(roles: DiscordRole[]) {
  const ids = new Set(roles.map((r) => r.id));
  return BADGE_ROLES.filter(([id]) => ids.has(id)).map(([id, label]) => ({ id, label, iconUrl: roles.find((r) => r.id === id)?.iconUrl }));
}

/** Ruoli con scheda staff (/staff/profilo/). */
const STAFF_PROFILE_ROLE_IDS = new Set([
  "1442568886988963923", // Founder
  "1521562607339704442", // Manager
  "1544831233404575835", // Staff del Mese
  "1550462300291604551", // Staffer della Settimana
  "1502322782602530977", // Director
  "1544831228690046976", // High Staff
  "1442568910070349985", // Staff
  "1544831242510270464", // Partner Manager
]);

export function hasStaffProfile(roles: DiscordRole[]) {
  return roles.some((r) => STAFF_PROFILE_ROLE_IDS.has(r.id));
}

const nf = new Intl.NumberFormat("it-IT");
export const fmt = (n?: number) => nf.format(Math.round(n ?? 0));
export const hours = (s?: number) => nf.format(Math.round((s ?? 0) / 3600));
export const mult = (n: number) => `×${(Number.isFinite(n) && n > 0 ? n : 1).toFixed(1).replace(".", ",")}`;
export const dateIt = (iso?: string) => (iso ? new Date(iso).toLocaleDateString("it-IT", { day: "numeric", month: "long", year: "numeric" }) : "");

/** Fonti del moltiplicatore come le mostra il sito attuale: "Base" + ruoli. */
export function multiplierRows(src: MultiplierSource[]) {
  let base = 1;
  const list: MultiplierSource[] = [];
  for (const s of src) {
    const t = String(s.type || "").toLowerCase();
    if (t === "base" || t === "global" || t === "server" || t === "event") base = Math.max(base, Number(s.multiplier) || 1);
    else list.push(s);
  }
  return [{ key: "base", label: "Base", type: "base", multiplier: base, active: true } as MultiplierSource, ...list];
}
