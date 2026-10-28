import { apiUrl } from "./api";

export type ContestPhase = "before" | "open" | "after" | "hidden" | "unknown";

export type ContestCategory = { id: string; label: string };

export type ContestStatus = {
  ok: boolean;
  eventKey: string;
  kind: string;
  title: string;
  blurb: string;
  startAt: string;
  endAt: string;
  phase: ContestPhase;
  publicOpen: boolean;
  staffPreview?: boolean;
  submissionCount?: number;
  mySubmissions?: ContestSubmission[];
  myVoteCount?: number;
  categories?: ContestCategory[];
  maxPerCategory?: number;
  canSubmitByCategory?: Record<string, { count: number; canSubmit: boolean }>;
  canSubmit?: boolean;
  canVote?: boolean;
  /** Ban solo sull’invio immagini: può ancora entrare e votare. */
  submitBanned?: boolean;
  submitBannedMessage?: string | null;
  message?: string;
  error?: string;
};

export type ContestSubmission = {
  id: string;
  imageUrl: string;
  category?: string;
  likes?: number;
  createdAt?: string | null;
  displayName?: string | null;
  avatarUrl?: string | null;
  userId?: string | null;
  rank?: number;
  nameBlurred?: boolean;
};

export type ContestLeaderboard = {
  ok: boolean;
  items: ContestSubmission[];
  podium?: ContestSubmission[];
  preview?: boolean;
  nameBlurred?: boolean;
  phase?: ContestPhase;
  category?: string;
  page?: number;
  pageSize?: number;
  total?: number;
  totalRest?: number;
  totalPages?: number;
  message?: string;
};

/** Contest in risalto (home card + pill nav). */
export type ContestHighlight = {
  ok: boolean;
  eventKey: string;
  kind: string;
  title: string;
  blurb: string;
  startAt: string;
  endAt: string;
  phase: ContestPhase;
  href: string;
  cta?: string;
  pillLabel?: string;
  promo?: boolean;
  promoUntil?: string | null;
  preview?: boolean;
  staffPreview?: boolean;
};

function mediaUrl(path: string) {
  if (!path) return "";
  if (/^https?:\/\//i.test(path)) return path;
  return apiUrl(path);
}

export function contestImageUrl(url: string) {
  return mediaUrl(url);
}

export async function fetchContestStatus(eventKey: string, token?: string | null): Promise<ContestStatus | null> {
  try {
    const r = await fetch(apiUrl(`/webhooks/site-contest/${encodeURIComponent(eventKey)}/status`), {
      cache: "no-store",
      headers: token ? { Authorization: `Bearer ${token}`, Accept: "application/json" } : { Accept: "application/json" },
    });
    const j = (await r.json()) as ContestStatus;
    return j?.ok ? j : ({ ...(j || {}), ok: false, phase: (j?.phase as ContestPhase) || "unknown" } as ContestStatus);
  } catch {
    return null;
  }
}

export async function fetchContestHighlight(token?: string | null): Promise<ContestHighlight | null> {
  try {
    const r = await fetch(apiUrl("/webhooks/site-contest/highlight"), {
      cache: "no-store",
      headers: token ? { Authorization: `Bearer ${token}`, Accept: "application/json" } : { Accept: "application/json" },
    });
    const j = (await r.json()) as { ok?: boolean; item?: ContestHighlight | null; staffPreview?: boolean };
    if (!j?.ok || !j.item) return null;
    return { ...j.item, staffPreview: Boolean(j.staffPreview || j.item.staffPreview) };
  } catch {
    return null;
  }
}

export async function submitContestImage(
  eventKey: string,
  token: string,
  dataUrl: string,
  category: string,
): Promise<{ ok: boolean; message?: string; submission?: ContestSubmission; error?: string }> {
  const r = await fetch(apiUrl(`/webhooks/site-contest/${encodeURIComponent(eventKey)}/submit`), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ image: dataUrl, category }),
  });
  return r.json();
}

export async function replaceContestImage(
  eventKey: string,
  token: string,
  dataUrl: string,
  category: string,
): Promise<{ ok: boolean; message?: string; submission?: ContestSubmission; error?: string }> {
  const r = await fetch(apiUrl(`/webhooks/site-contest/${encodeURIComponent(eventKey)}/replace`), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ image: dataUrl, category }),
  });
  return r.json();
}

export async function deleteContestImage(
  eventKey: string,
  token: string,
  category: string,
): Promise<{ ok: boolean; message?: string; error?: string }> {
  const r = await fetch(apiUrl(`/webhooks/site-contest/${encodeURIComponent(eventKey)}/delete`), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ category }),
  });
  return r.json();
}

export async function fetchContestFeed(
  eventKey: string,
  token: string,
  category: string,
): Promise<{ ok: boolean; items: ContestSubmission[]; remaining?: number; category?: string; message?: string }> {
  const q = new URLSearchParams({ category, limit: "20" });
  const r = await fetch(apiUrl(`/webhooks/site-contest/${encodeURIComponent(eventKey)}/feed?${q}`), {
    cache: "no-store",
    headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
  });
  return r.json();
}

export async function swipeContest(
  eventKey: string,
  token: string,
  submissionId: string,
  action: "like" | "pass",
): Promise<{ ok: boolean; skipped?: boolean; already?: boolean; message?: string; error?: string }> {
  const r = await fetch(apiUrl(`/webhooks/site-contest/${encodeURIComponent(eventKey)}/swipe`), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ submissionId, action }),
  });
  return r.json();
}

export async function fetchContestLeaderboard(
  eventKey: string,
  token: string | null | undefined,
  category: string,
  page = 1,
  pageSize = 10,
): Promise<ContestLeaderboard> {
  const q = new URLSearchParams({
    category,
    page: String(page),
    pageSize: String(pageSize),
  });
  const r = await fetch(apiUrl(`/webhooks/site-contest/${encodeURIComponent(eventKey)}/leaderboard?${q}`), {
    cache: "no-store",
    headers: token
      ? { Authorization: `Bearer ${token}`, Accept: "application/json" }
      : { Accept: "application/json" },
  });
  return r.json();
}

export async function seedContestDemo(
  eventKey: string,
  token: string,
  count = 8,
): Promise<{ ok: boolean; message?: string; added?: number }> {
  const r = await fetch(apiUrl(`/webhooks/site-contest/${encodeURIComponent(eventKey)}/seed-demo`), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ count }),
  });
  return r.json();
}

export async function clearContestDemo(
  eventKey: string,
  token: string,
): Promise<{ ok: boolean; message?: string }> {
  const r = await fetch(apiUrl(`/webhooks/site-contest/${encodeURIComponent(eventKey)}/clear-demo`), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: "{}",
  });
  return r.json();
}

function romeParts(iso: string) {
  const d = new Date(iso);
  const weekday = d.toLocaleDateString("it-IT", { timeZone: "Europe/Rome", weekday: "long" });
  const day = d.toLocaleDateString("it-IT", { timeZone: "Europe/Rome", day: "numeric" });
  const month = d.toLocaleDateString("it-IT", { timeZone: "Europe/Rome", month: "long" });
  const time = d.toLocaleTimeString("it-IT", {
    timeZone: "Europe/Rome",
    hour: "2-digit",
    minute: "2-digit",
  });
  return { weekday, day, month, time };
}

/** Testo compatto (legacy). */
export function formatRomeRange(startAt: string, endAt: string) {
  const a = romeParts(startAt);
  const b = romeParts(endAt);
  return `Dal ${a.day} ${a.month} ore ${a.time} al ${b.day} ${b.month} ore ${b.time}`;
}

export function contestWindowParts(startAt: string, endAt: string) {
  return { start: romeParts(startAt), end: romeParts(endAt) };
}
