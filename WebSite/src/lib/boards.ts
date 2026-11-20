import { SITE_ORIGIN } from "./site";
import type { MsgDraft, PickerChannel, PickerEmoji, PickerRole } from "./dashboard-community";

/** Bacheca: directory pubblica bot/server — API /webhooks/site-boards (Vinili/Utils/Web/siteBoardsApi.js). */

export type BoardKind = "server" | "bot";
export type BoardSort = "score" | "new" | "bumps" | "votes" | "reviews";
export type ListingStatus = "draft" | "pending" | "approved" | "rejected" | "suspended";

export type BoardListing = {
  id: string;
  kind: BoardKind | string;
  discordId: string;
  slug: string;
  status: ListingStatus | string;
  ownerUserId: string;
  authorName: string;
  authorAvatarUrl: string;
  name: string;
  tagline: string;
  description: string;
  tags: string[];
  categories: string[];
  locales: string[];
  locale: string;
  visitorNotes: string;
  siteUrl: string;
  inviteUrl: string;
  botInviteUrl: string;
  bannerUrl: string;
  iconUrl: string;
  nsfw: boolean;
  /** solo nella scheda completa (in elenco è vuoto) */
  features: ListingFeatures | string[];
  socials?: Partial<Record<SocialKey, string>>;
  stats?: ListingStats;
  score: number;
  votes30d: number;
  votesMonth: number;
  bumps7d: number;
  bumpedAt: string | null;
  ratingAvg: number;
  reviewsCount: number;
  accent: string;
  createdAt: string | null;
  updatedAt: string | null;
  moderation?: { notes: string; reviewedBy: string; reviewedAt: string | null; rejectReason: string };
  /* schede bot */
  prefix?: string;
  supportUrl?: string;
  supportListingId?: string;
  serverCount?: number;
  commands?: BotCommand[];
  supportServer?: { id: string; name: string; slug: string; iconUrl: string; inviteUrl: string; members: number } | null;
};

export type BotCommand = { name: string; description: string; type: "slash" | "user" | "message" | "prefix"; usage: string; category: string };

export type SocialKey = "youtube" | "twitch" | "instagram" | "tiktok" | "x" | "github" | "website";

export type ListingFeatures = {
  paidTier?: "paid" | "free";
  paidFeaturesAvailable?: boolean;
  acceptsPartnerships?: boolean;
  requireVerification?: boolean;
  /** bot */
  webInterface?: boolean;
  userInstallable?: boolean;
};

export type ListingStats = {
  members?: number;
  name?: string;
  guildTag?: string;
  guildTagBadgeUrl?: string;
  guildTagBadgeColor?: string;
  refreshedAt?: string;
};

export function listingFeatures(l: BoardListing): ListingFeatures {
  return l.features && !Array.isArray(l.features) ? l.features : {};
}

export type BoardsConfig = {
  ok: boolean;
  enabled: boolean;
  publicOpen: boolean;
  voteCooldownHours: number;
  bumpCooldownHours: number;
  maxTags: number;
  maxCategories: number;
  maxLocales: number;
  maxMarkdownChars: number;
  minTaglineChars: number;
  minDescriptionChars: number;
  categories: string[];
  /** categorie dei bot (diverse da quelle dei server) */
  botCategories?: string[];
  locales: string[];
  categoryLabels: Record<string, string>;
  localeLabels: Record<string, string>;
  suggestedTags: string[];
  botInviteUrl: string;
  voteCountdownSeconds: number;
  voteAdSeconds: number;
  turnstileSiteKey: string;
  turnstileRequired: boolean;
  message?: string;
};

export type ListingsPage = {
  ok: boolean;
  page: number;
  perPage: number;
  total: number;
  listings: BoardListing[];
  enabled: boolean;
  publicOpen: boolean;
  message?: string;
};

export type ApiResult<T> = { ok: true; data: T } | { ok: false; status: number; message: string; error?: string };

const BASE = "/webhooks/site-boards";

function auth(token?: string | null): HeadersInit {
  const h: Record<string, string> = { Accept: "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

async function parse<T>(r: Response): Promise<ApiResult<T & { ok?: boolean; message?: string; error?: string; status?: number }>> {
  let j: Record<string, unknown> | null = null;
  try {
    j = (await r.json()) as Record<string, unknown>;
  } catch {
    j = null;
  }
  if (!j || typeof j !== "object") {
    return { ok: false, status: r.status, message: "Risposta non valida." };
  }
  if (j.ok === false || (r.status >= 400 && j.ok !== true)) {
    return {
      ok: false,
      status: Number(j.status) || r.status,
      message: String(j.message || "Errore."),
      error: j.error ? String(j.error) : undefined,
    };
  }
  return { ok: true, data: j as T & { ok?: boolean } };
}

export async function loadBoardsConfig(origin = "", token?: string | null): Promise<BoardsConfig | null> {
  try {
    const r = await fetch(`${origin}${BASE}/config`, { headers: auth(token), cache: "no-store" });
    const j = await r.json();
    if (!j?.ok) return null;
    return j as BoardsConfig;
  } catch {
    return null;
  }
}

export const loadBuildBoardsConfig = () => loadBoardsConfig(SITE_ORIGIN);

export type ListingsQuery = {
  kind?: BoardKind | "";
  q?: string;
  tag?: string;
  category?: string;
  locale?: string;
  guildTag?: string;
  sort?: BoardSort;
  page?: number;
  perPage?: number;
};

export async function loadListings(query: ListingsQuery = {}, token?: string | null, origin = ""): Promise<ListingsPage | null> {
  try {
    const p = new URLSearchParams();
    if (query.kind) p.set("kind", query.kind);
    if (query.q) p.set("q", query.q);
    if (query.tag) p.set("tag", query.tag);
    if (query.category) p.set("category", query.category);
    if (query.locale) p.set("locale", query.locale);
    if (query.guildTag) p.set("guildTag", query.guildTag);
    if (query.sort) p.set("sort", query.sort);
    p.set("page", String(query.page || 1));
    p.set("perPage", String(query.perPage || 24));
    const r = await fetch(`${origin}${BASE}/listings?${p}`, { headers: auth(token), cache: "no-store" });
    const j = await r.json();
    if (!j || typeof j !== "object") return null;
    return {
      ok: !!j.ok,
      page: Number(j.page) || 1,
      perPage: Number(j.perPage) || 0,
      total: Number(j.total) || 0,
      listings: Array.isArray(j.listings) ? (j.listings as BoardListing[]) : [],
      enabled: j.enabled !== false,
      publicOpen: !!j.publicOpen,
      message: j.message ? String(j.message) : undefined,
    };
  } catch {
    return null;
  }
}

export const loadBuildListings = (q: ListingsQuery = {}) => loadListings(q, null, SITE_ORIGIN);

export async function loadListing(slug: string, token?: string | null): Promise<ApiResult<{ listing: BoardListing; publicOpen: boolean }>> {
  const r = await fetch(`${BASE}/listings/${encodeURIComponent(slug)}`, { headers: auth(token), cache: "no-store" });
  return parse(r);
}

export async function loadTags(token?: string | null): Promise<string[]> {
  try {
    const r = await fetch(`${BASE}/tags`, { headers: auth(token), cache: "no-store" });
    const j = await r.json();
    if (!j?.ok) return [];
    return Array.isArray(j.tags) ? j.tags.map(String) : [];
  } catch {
    return [];
  }
}

export async function checkStaffAccess(token: string): Promise<boolean> {
  try {
    const r = await fetch("/webhooks/site-staff-access", { headers: auth(token), cache: "no-store" });
    const j = await r.json();
    return !!j?.ok;
  } catch {
    return false;
  }
}

export async function loadMine(token: string): Promise<ApiResult<{ listings: BoardListing[] }>> {
  const r = await fetch(`${BASE}/me/listings`, { headers: auth(token), cache: "no-store" });
  return parse(r);
}

export async function loadClaimableServers(token: string): Promise<ApiResult<{ guilds: { id: string; name: string; iconUrl?: string }[] }>> {
  const r = await fetch(`${BASE}/me/claimable-servers`, { headers: auth(token), cache: "no-store" });
  return parse(r);
}

export type CreateListingBody = {
  kind: BoardKind;
  discordId: string;
  name?: string;
  tagline?: string;
  description?: string;
  tags?: string[];
  categories?: string[];
  locales?: string[];
  inviteUrl?: string;
  botInviteUrl?: string;
  siteUrl?: string;
  nsfw?: boolean;
  socials?: Partial<Record<SocialKey, string>>;
  features?: ListingFeatures;
  accent?: string;
  visitorNotes?: string;
  bannerUrl?: string;
  /** bot */
  prefix?: string;
  supportUrl?: string;
  submit?: boolean;
};

export async function createListing(token: string, body: CreateListingBody) {
  const r = await fetch(`${BASE}/listings`, {
    method: "POST",
    headers: { ...auth(token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parse<{ listing: BoardListing; resumed?: boolean; message?: string }>(r);
}

export async function patchListing(token: string, id: string, body: Record<string, unknown>) {
  const r = await fetch(`${BASE}/listings/${encodeURIComponent(id)}`, {
    method: "PATCH",
    headers: { ...auth(token), "Content-Type": "application/json" },
    body: JSON.stringify(body),
  });
  return parse<{ listing: BoardListing }>(r);
}

export async function submitListing(token: string, id: string) {
  const r = await fetch(`${BASE}/listings/${encodeURIComponent(id)}/submit`, {
    method: "POST",
    headers: auth(token),
  });
  return parse<{ listing: BoardListing; message?: string }>(r);
}

export async function deleteMyListing(token: string, id: string) {
  const r = await fetch(`${BASE}/me/listings/${encodeURIComponent(id)}`, {
    method: "DELETE",
    headers: auth(token),
  });
  return parse<{ message?: string }>(r);
}

/** Bandiera (codice paese flagcdn) per ogni lingua della vetrina. */
const LOCALE_COUNTRY: Record<string, string> = {
  it: "it", en: "gb", es: "es", fr: "fr", de: "de", pt: "pt", ru: "ru", zh: "cn", ja: "jp", ko: "kr", ar: "sa", nl: "nl",
  pl: "pl", tr: "tr", hi: "in", id: "id", uk: "ua", vi: "vn", ro: "ro", sv: "se", cs: "cz", da: "dk", el: "gr", fi: "fi",
  hu: "hu", no: "no", th: "th", he: "il", bn: "bd", ms: "my", fil: "ph", ca: "es-ct", sk: "sk", bg: "bg", hr: "hr", sr: "rs",
  sl: "si", et: "ee", lv: "lv", lt: "lt", fa: "ir", ur: "pk", sw: "ke", af: "za", sq: "al", ka: "ge", hy: "am", az: "az",
  kk: "kz", uz: "uz", mn: "mn", ne: "np", si: "lk", my: "mm", km: "kh", lo: "la", am: "et", ga: "ie", cy: "gb-wls",
  eu: "es-pv", gl: "es-ga", is: "is", mt: "mt", lb: "lu", be: "by", mk: "mk", bs: "ba", ta: "in", te: "in", yo: "ng",
};

export function localeFlagUrl(locale: string, w = 40) {
  const c = LOCALE_COUNTRY[String(locale || "").toLowerCase()];
  return c ? `https://flagcdn.com/w${w}/${c}.png` : "";
}

export type ListingActivity = {
  available: boolean;
  days: number;
  activeDays?: number;
  /** media giornaliera per fascia oraria, 0–23 (ora italiana) */
  hours: number[];
  peakHour?: number | null;
  perDay?: number;
};

export async function loadListingActivity(id: string, token?: string | null) {
  const r = await fetch(`${BASE}/listings/${encodeURIComponent(id)}/activity`, { headers: auth(token) });
  return parse<ListingActivity>(r);
}

/** Ricarica da Discord nome, icona, banner, membri e tag di una scheda server. */
export async function refreshMyListing(token: string, id: string) {
  const r = await fetch(`${BASE}/me/listings/${encodeURIComponent(id)}/refresh`, {
    method: "POST",
    headers: auth(token),
  });
  return parse<{ listing: BoardListing; message?: string }>(r);
}

/** Crea un nuovo invito permanente per una scheda server già esistente. */
export async function regenerateListingInvite(token: string, id: string) {
  const r = await fetch(`${BASE}/listings/${encodeURIComponent(id)}/generate-invite`, {
    method: "POST",
    headers: { ...auth(token), "Content-Type": "application/json" },
    body: "{}",
  });
  return parse<{ inviteUrl: string; listing?: BoardListing; message?: string }>(r);
}

/** Attiva o toglie il promemoria per rivotare (sull'ultimo voto dato). */
export async function setVoteReminder(token: string, listingId: string, enable: boolean) {
  const r = await fetch(`${BASE}/listings/${encodeURIComponent(listingId)}/vote-reminder`, {
    method: "POST",
    headers: { ...auth(token), "Content-Type": "application/json" },
    body: JSON.stringify({ enable }),
  });
  return parse<{ remindAt: string | null; enabled: boolean }>(r);
}

export async function bumpListing(token: string, id: string) {
  const r = await fetch(`${BASE}/listings/${encodeURIComponent(id)}/bump`, {
    method: "POST",
    headers: auth(token),
  });
  return parse<{ listing?: BoardListing; message?: string; bumpedAt?: string; nextBumpAt?: string }>(r);
}

/** Schede collegate: bot in vetrina presenti nel server, o server in vetrina dove c'è il bot. */
export async function loadRelatedListings(id: string, token?: string | null) {
  const r = await fetch(`${BASE}/listings/${encodeURIComponent(id)}/related`, { headers: auth(token) });
  return parse<{ kind: BoardKind; items: BoardListing[] }>(r);
}

/** Un bump ogni 2 ore per scheda. */
export const BUMP_COOLDOWN_MS = 2 * 60 * 60 * 1000;

export async function reportListing(token: string, id: string, reason: string) {
  const r = await fetch(`${BASE}/listings/${encodeURIComponent(id)}/report`, {
    method: "POST",
    headers: { ...auth(token), "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
  return parse<{ message?: string }>(r);
}

/* ── voto scheda (sessione + countdown + sponsor) ── */

export type VoteSession = {
  sessionId: string;
  expiresInSec: number;
  countdownSeconds: number;
  adSeconds: number;
  turnstileSiteKey: string;
  turnstileRequired: boolean;
  ads: { provider: string; minWatchSeconds?: number };
};

export async function startVoteSession(token: string, listingId: string) {
  const r = await fetch(`${BASE}/listings/${encodeURIComponent(listingId)}/vote-session`, {
    method: "POST",
    headers: auth(token),
  });
  return parse<VoteSession>(r);
}

export async function progressVoteSession(token: string, listingId: string, sessionId: string, step: "countdown" | "ad", markStart?: boolean) {
  const r = await fetch(`${BASE}/listings/${encodeURIComponent(listingId)}/vote-progress`, {
    method: "POST",
    headers: { ...auth(token), "Content-Type": "application/json" },
    body: JSON.stringify({ sessionId, step, markStart: markStart === true }),
  });
  return parse<{ step: string }>(r);
}

export async function castListingVote(token: string, listingId: string, sessionId: string, opts: { turnstileToken?: string; remind?: boolean } = {}) {
  const r = await fetch(`${BASE}/listings/${encodeURIComponent(listingId)}/vote`, {
    method: "POST",
    headers: { ...auth(token), "Content-Type": "application/json" },
    body: JSON.stringify({
      sessionId,
      turnstileToken: opts.turnstileToken || "",
      remind: opts.remind === true,
    }),
  });
  return parse<{ listing: BoardListing; message?: string; remindAt?: string | null }>(r);
}

/* ── mod ── */

export async function modListPending(token: string, status = "pending") {
  const p = new URLSearchParams({ status });
  const r = await fetch(`${BASE}/mod/listings?${p}`, { headers: auth(token), cache: "no-store" });
  return parse<{ listings: BoardListing[] }>(r);
}

export async function modDecide(token: string, listingId: string, decision: "approve" | "reject" | "suspend", reason = "", notes = "") {
  const r = await fetch(`${BASE}/mod/listings/${encodeURIComponent(listingId)}`, {
    method: "POST",
    headers: { ...auth(token), "Content-Type": "application/json" },
    body: JSON.stringify({ decision, reason, notes }),
  });
  return parse<{ listing: BoardListing; message?: string }>(r);
}

export function labelOf(map: Record<string, string> | undefined, key: string) {
  if (map && map[key]) return map[key];
  return key.replace(/-/g, " ");
}

export function kindLabel(kind: string) {
  return kind === "bot" ? "Bot" : "Server";
}

export function statusLabel(status: string) {
  switch (status) {
    case "draft":
      return "Bozza";
    case "pending":
      return "In revisione";
    case "approved":
      return "Pubblicata";
    case "rejected":
      return "Rifiutata";
    case "suspended":
      return "Sospesa";
    default:
      return status;
  }
}

export const SORTS: { id: BoardSort; label: string }[] = [
  { id: "score", label: "In vetrina" },
  { id: "new", label: "Nuove" },
  { id: "votes", label: "Più votate" },
  { id: "bumps", label: "Ultimo bump" },
  { id: "reviews", label: "Stelle" },
];

/* ── recensioni ── */

export type ReviewSort = "relevant" | "newest" | "highest";

export type BoardReview = {
  id: string;
  listingId: string;
  userId: string;
  rating: number;
  content: string;
  status: string;
  authorName: string;
  authorAvatarUrl: string;
  likeCount: number;
  likedByMe: boolean;
  createdAt: string | null;
  reply: { content: string; at: string | null; authorId: string } | null;
};

export type ReviewsPage = {
  ratingAvg: number;
  reviewsCount: number;
  distribution: Record<string, number> | number[];
  reviews: BoardReview[];
  page: number;
  perPage: number;
  totalPages: number;
  mine: BoardReview | null;
  canReview: boolean;
  isOwner: boolean;
  canReply: boolean;
};

export async function loadReviews(token: string | null | undefined, listingId: string, sort: ReviewSort = "relevant", pageNum = 1) {
  const p = new URLSearchParams({ sort, page: String(pageNum), perPage: "6" });
  const r = await fetch(`${BASE}/listings/${encodeURIComponent(listingId)}/reviews?${p}`, { headers: auth(token), cache: "no-store" });
  return parse<ReviewsPage>(r);
}

export async function createReview(token: string, listingId: string, rating: number, content: string) {
  const r = await fetch(`${BASE}/listings/${encodeURIComponent(listingId)}/reviews`, {
    method: "POST",
    headers: { ...auth(token), "Content-Type": "application/json" },
    body: JSON.stringify({ rating, content }),
  });
  return parse<{ review?: BoardReview; message?: string }>(r);
}

export async function likeReview(token: string, reviewId: string) {
  const r = await fetch(`${BASE}/reviews/${encodeURIComponent(reviewId)}/like`, { method: "POST", headers: auth(token) });
  return parse<{ likeCount?: number; liked?: boolean; review?: BoardReview }>(r);
}

export async function reportReview(token: string, reviewId: string, reason: string) {
  const r = await fetch(`${BASE}/reviews/${encodeURIComponent(reviewId)}/report`, {
    method: "POST",
    headers: { ...auth(token), "Content-Type": "application/json" },
    body: JSON.stringify({ reason }),
  });
  return parse<{ message?: string }>(r);
}

export async function replyReview(token: string, reviewId: string, content: string, clear = false) {
  const r = await fetch(`${BASE}/reviews/${encodeURIComponent(reviewId)}/reply`, {
    method: "POST",
    headers: { ...auth(token), "Content-Type": "application/json" },
    body: JSON.stringify({ content, clear }),
  });
  return parse<{ review?: BoardReview; message?: string }>(r);
}

/** Distribuzione stelle 1…5 da array o mappa. */
export function starDistribution(d: ReviewsPage["distribution"] | undefined): number[] {
  const out = [0, 0, 0, 0, 0];
  if (Array.isArray(d)) d.slice(0, 5).forEach((n, i) => (out[i] = Number(n) || 0));
  else if (d && typeof d === "object") for (let k = 1; k <= 5; k += 1) out[k - 1] = Number((d as Record<string, number>)[k] ?? (d as Record<string, number>)[String(k)]) || 0;
  return out;
}

export const SOCIAL_LABELS: Record<SocialKey, string> = {
  website: "Sito",
  youtube: "YouTube",
  twitch: "Twitch",
  instagram: "Instagram",
  tiktok: "TikTok",
  x: "X",
  github: "GitHub",
};

/* ── strumenti del modulo Invia (come la vecchia bacheca) ── */

export type ListingTransfer = { toUserId: string; toName: string; toAvatarUrl: string; expiresAt: string | null };

export async function loadMyListing(token: string, id: string) {
  const r = await fetch(`${BASE}/me/listings/${encodeURIComponent(id)}`, { headers: auth(token), cache: "no-store" });
  return parse<{ listing: BoardListing & { markdown?: string }; transfer?: ListingTransfer | null }>(r);
}

/* ── statistiche ── */

export type TrackEvent = "view" | "invite" | "link" | "vote" | "share";
export type TrafficSource = "search" | "tag" | "category" | "list" | "landing" | "direct" | "site" | "external";

/** Registra una visita o un click sulla pagina pubblica (non blocca mai la pagina). */
export function trackListing(id: string, event: TrackEvent, extra: { source?: TrafficSource; lead?: string; device?: "desktop" | "mobile" } = {}, token?: string | null) {
  if (!id) return;
  try {
    void fetch(`${BASE}/listings/${encodeURIComponent(id)}/track`, {
      method: "POST",
      headers: { ...auth(token), "Content-Type": "application/json" },
      body: JSON.stringify({ event, ...extra }),
      keepalive: true,
    }).catch(() => null);
  } catch {
    /* niente */
  }
}

export type ListingAnalytics = {
  days: number;
  totals: { views: number; engagements: number; votes: number };
  series: { day: string; views: number; engagements: number; votes: number }[];
  sources: Partial<Record<TrafficSource, number>>;
  leads: { source: string; value: string; count: number }[];
  devices: Partial<Record<"desktop" | "mobile", number>>;
  actions: Partial<Record<TrackEvent, number>>;
  countries: { threshold: number; hidden: boolean; list: { code: string; count: number }[]; total: number };
};

export async function loadListingAnalytics(token: string, id: string, days = 14) {
  const r = await fetch(`${BASE}/me/listings/${encodeURIComponent(id)}/analytics?days=${days}`, { headers: auth(token), cache: "no-store" });
  return parse<ListingAnalytics>(r);
}

/* ── voti nel server della scheda ── */

export type VoteHookConfig = {
  enabled: boolean;
  channelId: string | null;
  roleId: string | null;
  hours: number;
  thanksEnabled: boolean;
  draft: MsgDraft;
  reminderMode: "dm" | "site";
  reminderDraft: MsgDraft;
};
export type VoteHookData = {
  config: VoteHookConfig;
  botInGuild: boolean;
  guild: { id: string; name: string } | null;
  bot: { id: string; name: string; avatarUrl: string } | null;
  pickers: { textChannels: PickerChannel[]; roles: PickerRole[]; emojis: PickerEmoji[]; categories: PickerChannel[] };
  serviceName: string;
  /** EXP dei voti solo sul server principale. */
  isMainGuild?: boolean;
};

export async function loadVoteHook(token: string, id: string) {
  const r = await fetch(`${BASE}/me/listings/${encodeURIComponent(id)}/vote-hook`, { headers: auth(token), cache: "no-store" });
  return parse<VoteHookData>(r);
}

export async function saveVoteHook(token: string, id: string, config: VoteHookConfig) {
  const r = await fetch(`${BASE}/me/listings/${encodeURIComponent(id)}/vote-hook`, {
    method: "PATCH",
    headers: { ...auth(token), "Content-Type": "application/json" },
    body: JSON.stringify({ config }),
  });
  return parse<{ config: VoteHookConfig; message?: string }>(r);
}

export async function testVoteHook(token: string, id: string, config: VoteHookConfig) {
  const r = await fetch(`${BASE}/me/listings/${encodeURIComponent(id)}/vote-hook/test`, {
    method: "POST",
    headers: { ...auth(token), "Content-Type": "application/json" },
    body: JSON.stringify({ config }),
  });
  return parse<{ message?: string }>(r);
}

/* ── recensioni nel server della scheda ── */

export type ReviewHookConfig = {
  enabled: boolean;
  channelId: string | null;
  roleId: string | null;
  thanksEnabled: boolean;
  draft: MsgDraft;
  /** Solo server principale: livelli una tantum. Altri server → 0. */
  rewardLevels: number;
};
export type ReviewHookData = {
  config: ReviewHookConfig;
  botInGuild: boolean;
  guild: { id: string; name: string } | null;
  bot: { id: string; name: string; avatarUrl: string } | null;
  pickers: { textChannels: PickerChannel[]; roles: PickerRole[]; emojis: PickerEmoji[]; categories: PickerChannel[] };
  serviceName: string;
  seededFromMain?: boolean;
  isMainGuild?: boolean;
  listingLink?: string;
};

export async function loadReviewHook(token: string, id: string) {
  const r = await fetch(`${BASE}/me/listings/${encodeURIComponent(id)}/review-hook`, { headers: auth(token), cache: "no-store" });
  return parse<ReviewHookData>(r);
}

export async function saveReviewHook(token: string, id: string, config: ReviewHookConfig) {
  const r = await fetch(`${BASE}/me/listings/${encodeURIComponent(id)}/review-hook`, {
    method: "PATCH",
    headers: { ...auth(token), "Content-Type": "application/json" },
    body: JSON.stringify({ config }),
  });
  return parse<{ config: ReviewHookConfig; message?: string }>(r);
}

export async function testReviewHook(token: string, id: string, config: ReviewHookConfig) {
  const r = await fetch(`${BASE}/me/listings/${encodeURIComponent(id)}/review-hook/test`, {
    method: "POST",
    headers: { ...auth(token), "Content-Type": "application/json" },
    body: JSON.stringify({ config }),
  });
  return parse<{ message?: string }>(r);
}

/* ── passaggio della scheda ── */

export type TransferUser = { id: string; name: string; username: string; avatarUrl: string };
export type IncomingTransfer = { listingId: string; name: string; iconUrl: string; fromName: string; fromUserId: string; requestedAt: string | null; expiresAt: string | null };

export async function lookupTransferUser(token: string, userId: string) {
  const r = await fetch(`${BASE}/me/transfer-user?userId=${encodeURIComponent(userId)}`, { headers: auth(token), cache: "no-store" });
  return parse<{ user: TransferUser }>(r);
}

export async function requestListingTransfer(token: string, id: string, toUserId: string) {
  const r = await fetch(`${BASE}/me/listings/${encodeURIComponent(id)}/transfer`, {
    method: "POST",
    headers: { ...auth(token), "Content-Type": "application/json" },
    body: JSON.stringify({ toUserId }),
  });
  return parse<{ transfer: ListingTransfer; message?: string }>(r);
}

export async function cancelListingTransfer(token: string, id: string) {
  const r = await fetch(`${BASE}/me/listings/${encodeURIComponent(id)}/transfer`, { method: "DELETE", headers: auth(token) });
  return parse<{ message?: string }>(r);
}

export async function loadIncomingTransfers(token: string) {
  const r = await fetch(`${BASE}/me/transfers`, { headers: auth(token), cache: "no-store" });
  return parse<{ transfers: IncomingTransfer[] }>(r);
}

export async function respondListingTransfer(token: string, id: string, accept: boolean) {
  const r = await fetch(`${BASE}/me/transfers/${encodeURIComponent(id)}/respond`, {
    method: "POST",
    headers: { ...auth(token), "Content-Type": "application/json" },
    body: JSON.stringify({ accept }),
  });
  return parse<{ accepted: boolean; message?: string }>(r);
}

/** Nome, icona, banner e invito del server (genera l’invito se il bot è dentro). */
export async function loadGuildDefaults(token: string, guildId: string) {
  const r = await fetch(`${BASE}/guild-defaults`, {
    method: "POST",
    headers: { ...auth(token), "Content-Type": "application/json" },
    body: JSON.stringify({ guildId }),
  });
  return parse<{ inviteUrl: string; bannerUrl: string; name: string; iconUrl: string }>(r);
}

export async function generateGuildInvite(token: string, guildId: string, listingId?: string) {
  const r = await fetch(`${BASE}/generate-invite`, {
    method: "POST",
    headers: { ...auth(token), "Content-Type": "application/json" },
    body: JSON.stringify({ guildId, listingId }),
  });
  return parse<{ inviteUrl: string; bannerUrl?: string }>(r);
}

export type ProbeKind = "invite" | "bot_invite" | "website" | "banner" | SocialKey;

/** Controlla che un link esista davvero; `value` è il link normalizzato. */
export async function probeLink(token: string, kind: ProbeKind, value: string) {
  const r = await fetch(`${BASE}/probe-link`, {
    method: "POST",
    headers: { ...auth(token), "Content-Type": "application/json" },
    body: JSON.stringify({ kind, value }),
  });
  return parse<{ found: boolean; empty?: boolean; value?: string; label?: string; reason?: string }>(r);
}

/** Banner: immagine come data URL (PNG, JPG, WEBP, GIF, max 2,5 MB). */
export async function uploadBanner(token: string, dataUrl: string) {
  const r = await fetch(`${BASE}/me/banner-upload`, {
    method: "POST",
    headers: { ...auth(token), "Content-Type": "application/json" },
    body: JSON.stringify({ image: dataUrl }),
  });
  return parse<{ url: string; bannerUrl: string; message?: string }>(r);
}

/* ── schede bot ── */

/** Categorie giuste per il tipo di scheda. */
export function categoriesFor(cfg: BoardsConfig | null | undefined, kind: string) {
  return (kind === "bot" ? cfg?.botCategories : cfg?.categories) || [];
}

export async function loadBotDefaults(token: string, botId: string) {
  const r = await fetch(`${BASE}/bot-defaults?id=${encodeURIComponent(botId)}`, { headers: auth(token), cache: "no-store" });
  return parse<{ name: string; iconUrl: string }>(r);
}

export type BotApiInfo = { hasKey: boolean; keyHint: string; createdAt: string | null; lastPostAt: string | null; serverCount: number; serverCountAt: string | null; commandsCount: number; own: boolean };

export async function loadBotApi(token: string, id: string) {
  const r = await fetch(`${BASE}/me/listings/${encodeURIComponent(id)}/bot-api`, { headers: auth(token), cache: "no-store" });
  return parse<{ api: BotApiInfo; commands: BotCommand[] }>(r);
}

export async function regenBotApiKey(token: string, id: string) {
  const r = await fetch(`${BASE}/me/listings/${encodeURIComponent(id)}/bot-api/key`, { method: "POST", headers: auth(token) });
  return parse<{ key: string; api: BotApiInfo; message?: string }>(r);
}

export async function saveBotCommands(token: string, id: string, commands: BotCommand[]) {
  const r = await fetch(`${BASE}/me/listings/${encodeURIComponent(id)}/commands`, {
    method: "PUT",
    headers: { ...auth(token), "Content-Type": "application/json" },
    body: JSON.stringify({ commands }),
  });
  return parse<{ commands: BotCommand[]; message?: string }>(r);
}

export type SupportCandidate = { id: string; name: string; slug: string; iconUrl: string };

export async function loadSupportCandidates(token: string, id: string) {
  const r = await fetch(`${BASE}/me/listings/${encodeURIComponent(id)}/support`, { headers: auth(token), cache: "no-store" });
  return parse<{ servers: SupportCandidate[] }>(r);
}

export async function setSupportServer(token: string, id: string, serverListingId: string | null) {
  const r = await fetch(`${BASE}/me/listings/${encodeURIComponent(id)}/support`, {
    method: "PUT",
    headers: { ...auth(token), "Content-Type": "application/json" },
    body: JSON.stringify({ serverListingId }),
  });
  return parse<{ support: SupportCandidate | null; message?: string }>(r);
}

/** Indirizzo pubblico dell'API delle statistiche (per gli esempi). */
export const BOT_STATS_API_URL = "https://api.viniliecaffe.it/webhooks/site-boards/api/bots/stats";

/* ── bump nel server della scheda ── */

export type BumpHookConfig = {
  enabled: boolean;
  thanksEnabled: boolean;
  channelId: string | null;
  draft: MsgDraft;
  rewardRoleId: string | null;
  hours: number;
  reminderEnabled: boolean;
  reminderChannelId: string | null;
  reminderRoleId: string | null;
  reminderDraft: MsgDraft;
};
export type BumpHookData = Omit<VoteHookData, "config"> & { config: BumpHookConfig; isMain?: boolean; bumpedAt: string | null };

export async function loadBumpHook(token: string, id: string) {
  const r = await fetch(`${BASE}/me/listings/${encodeURIComponent(id)}/bump-hook`, { headers: auth(token), cache: "no-store" });
  return parse<BumpHookData>(r);
}

export async function saveBumpHook(token: string, id: string, config: BumpHookConfig) {
  const r = await fetch(`${BASE}/me/listings/${encodeURIComponent(id)}/bump-hook`, {
    method: "PATCH",
    headers: { ...auth(token), "Content-Type": "application/json" },
    body: JSON.stringify({ config }),
  });
  return parse<{ config: BumpHookConfig; message?: string }>(r);
}

export async function testBumpHook(token: string, id: string, config: BumpHookConfig, which: "thanks" | "reminder") {
  const r = await fetch(`${BASE}/me/listings/${encodeURIComponent(id)}/bump-hook/test`, {
    method: "POST",
    headers: { ...auth(token), "Content-Type": "application/json" },
    body: JSON.stringify({ config, which }),
  });
  return parse<{ message?: string }>(r);
}
