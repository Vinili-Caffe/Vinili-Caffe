import { SITE_ORIGIN } from "./site";

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
};

export type SocialKey = "youtube" | "twitch" | "instagram" | "tiktok" | "x" | "github" | "website";

export type ListingFeatures = {
  paidTier?: "paid" | "free";
  paidFeaturesAvailable?: boolean;
  acceptsPartnerships?: boolean;
  requireVerification?: boolean;
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

export async function bumpListing(token: string, id: string) {
  const r = await fetch(`${BASE}/listings/${encodeURIComponent(id)}/bump`, {
    method: "POST",
    headers: auth(token),
  });
  return parse<{ listing: BoardListing; message?: string }>(r);
}

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
  return parse<{ listing: BoardListing; message?: string }>(r);
}

/* ── mod ── */

export async function modListPending(token: string, status = "pending") {
  const p = new URLSearchParams({ status });
  const r = await fetch(`${BASE}/mod/listings?${p}`, { headers: auth(token), cache: "no-store" });
  return parse<{ listings: BoardListing[] }>(r);
}

export async function modDecide(token: string, listingId: string, decision: "approve" | "reject" | "suspend", reason = "") {
  const r = await fetch(`${BASE}/mod/listings/${encodeURIComponent(listingId)}`, {
    method: "POST",
    headers: { ...auth(token), "Content-Type": "application/json" },
    body: JSON.stringify({ decision, reason }),
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
  { id: "bumps", label: "Riposizionate" },
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
