import { apiUrl } from "./api";

export type ContestPhase = "before" | "open" | "after" | "hidden" | "unknown";

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
  canSubmit?: boolean;
  canVote?: boolean;
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
    return j?.ok ? j : { ...(j || {}), ok: false, phase: (j?.phase as ContestPhase) || "unknown" } as ContestStatus;
  } catch {
    return null;
  }
}

export async function submitContestImage(
  eventKey: string,
  token: string,
  dataUrl: string,
): Promise<{ ok: boolean; message?: string; submission?: ContestSubmission; error?: string }> {
  const r = await fetch(apiUrl(`/webhooks/site-contest/${encodeURIComponent(eventKey)}/submit`), {
    method: "POST",
    headers: {
      Authorization: `Bearer ${token}`,
      Accept: "application/json",
      "Content-Type": "application/json",
    },
    body: JSON.stringify({ image: dataUrl }),
  });
  return r.json();
}

export async function fetchContestFeed(
  eventKey: string,
  token: string,
): Promise<{ ok: boolean; items: ContestSubmission[]; remaining?: number; message?: string }> {
  const r = await fetch(apiUrl(`/webhooks/site-contest/${encodeURIComponent(eventKey)}/feed`), {
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
): Promise<{ ok: boolean; message?: string }> {
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

export function formatRomeRange(startAt: string, endAt: string) {
  const fmt = (iso: string) =>
    new Date(iso).toLocaleString("it-IT", {
      timeZone: "Europe/Rome",
      weekday: "short",
      day: "numeric",
      month: "short",
      hour: "2-digit",
      minute: "2-digit",
    });
  return `${fmt(startAt)} → ${fmt(endAt)}`;
}
