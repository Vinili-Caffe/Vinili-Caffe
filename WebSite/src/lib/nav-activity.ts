"use client";

import { useCallback, useEffect, useMemo, useState } from "react";
import { useAuth } from "@/lib/auth";
import { useLiveRefresh } from "@/lib/use-live-refresh";

/** Path normalizzati (senza trailing slash) per badge / last-seen. */
export const NAV_ACTIVITY_PATHS = {
  confessionale: "/confessionale",
  feedback: "/feedback",
  reviews: "/recensioni",
  bacheca: "/bacheca",
  quiz: "/quiz",
  wrapped: "/wrapped",
  vote: "/vote",
  tickets: "/tickets",
} as const;

export type NavActivityPath = (typeof NAV_ACTIVITY_PATHS)[keyof typeof NAV_ACTIVITY_PATHS];

type NavActivitySummary = {
  confessionaleLatestAt: number;
  feedbackLatestAt: number;
  reviewsLatestAt: number;
  bachecaLatestAt: number;
  quizDayStartAt: number;
  wrappedMonthStartAt: number;
  voteCanVote: boolean;
  ticketsUnclaimed: number;
  isTicketStaff: boolean;
};

type SeenMap = Record<string, number>;

const LS_KEY = "vc_nav_feat_seen_v1";
const CHROME_PREFS = "/webhooks/site-chrome-prefs";
const ACTIVITY_API = "/webhooks/site-nav-activity";
const SEEN_EVENT = "vc:nav-feat-seen";

function normalizePath(raw?: string | null): string {
  const s = String(raw || "").trim().split("?")[0].split("#")[0];
  if (!s) return "";
  const withSlash = s.startsWith("/") ? s : `/${s}`;
  return withSlash.replace(/\/+$/, "") || "/";
}

export function navActivityPathFromHref(href?: string | null): NavActivityPath | "" {
  const p = normalizePath(href);
  if (!p) return "";
  for (const key of Object.values(NAV_ACTIVITY_PATHS)) {
    if (p === key || p.startsWith(`${key}/`)) return key;
  }
  return "";
}

function readLocalSeen(): SeenMap {
  try {
    const raw = localStorage.getItem(LS_KEY);
    if (!raw) return {};
    const parsed = JSON.parse(raw) as SeenMap;
    if (!parsed || typeof parsed !== "object") return {};
    const out: SeenMap = {};
    for (const [k, v] of Object.entries(parsed)) {
      const path = normalizePath(k);
      const ts = Number(v);
      if (path && Number.isFinite(ts) && ts > 0) out[path] = Math.floor(ts);
    }
    return out;
  } catch {
    return {};
  }
}

function writeLocalSeen(map: SeenMap) {
  try {
    localStorage.setItem(LS_KEY, JSON.stringify(map));
  } catch {
    /* ignore */
  }
}

function emitSeenChanged() {
  try {
    window.dispatchEvent(new Event(SEEN_EVENT));
  } catch {
    /* ignore */
  }
}

function mergeSeen(a: SeenMap, b: SeenMap): SeenMap {
  const out: SeenMap = { ...a };
  for (const [k, v] of Object.entries(b)) {
    out[k] = Math.max(Number(out[k]) || 0, Number(v) || 0);
  }
  return out;
}

async function pushChromeSeen(token: string, patch: SeenMap) {
  try {
    await fetch(CHROME_PREFS, {
      method: "POST",
      headers: {
        Authorization: `Bearer ${token}`,
        "Content-Type": "application/json",
        Accept: "application/json",
      },
      credentials: "omit",
      cache: "no-store",
      body: JSON.stringify({ prefs: { navFeatSeen: patch } }),
    });
  } catch {
    /* ignore */
  }
}

async function pullChromeSeen(token: string): Promise<SeenMap> {
  try {
    const r = await fetch(CHROME_PREFS, {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      credentials: "omit",
      cache: "no-store",
    });
    if (!r.ok) return {};
    const j = (await r.json()) as { ok?: boolean; anonymous?: boolean; prefs?: { navFeatSeen?: SeenMap } };
    if (!j?.ok || j.anonymous) return {};
    const src = j.prefs?.navFeatSeen;
    if (!src || typeof src !== "object") return {};
    const out: SeenMap = {};
    for (const [k, v] of Object.entries(src)) {
      const path = normalizePath(k);
      const ts = Number(v);
      if (path && Number.isFinite(ts) && ts > 0) out[path] = Math.floor(ts);
    }
    return out;
  } catch {
    return {};
  }
}

/** Marca la pagina come vista (local + sync account se loggato). */
export function markNavSeenWithToken(pathOrHref: string, token: string | null | undefined, at = Date.now()) {
  const path = navActivityPathFromHref(pathOrHref) || normalizePath(pathOrHref);
  if (!path || path === "/") return;
  if (
    path !== NAV_ACTIVITY_PATHS.confessionale &&
    path !== NAV_ACTIVITY_PATHS.feedback &&
    path !== NAV_ACTIVITY_PATHS.reviews &&
    path !== NAV_ACTIVITY_PATHS.bacheca &&
    path !== NAV_ACTIVITY_PATHS.quiz &&
    path !== NAV_ACTIVITY_PATHS.wrapped
  ) {
    return;
  }
  const ts = Math.max(0, Math.floor(Number(at) || Date.now()));
  const next = mergeSeen(readLocalSeen(), { [path]: ts });
  writeLocalSeen(next);
  emitSeenChanged();
  if (token) void pushChromeSeen(token, { [path]: ts });
}

async function loadActivitySummary(token?: string | null): Promise<NavActivitySummary | null> {
  try {
    const headers: Record<string, string> = { Accept: "application/json" };
    if (token) headers.Authorization = `Bearer ${token}`;
    const r = await fetch(ACTIVITY_API, { headers, cache: "no-store", credentials: token ? "include" : "omit" });
    if (!r.ok) return null;
    const j = (await r.json()) as Partial<NavActivitySummary> & { ok?: boolean };
    if (!j?.ok) return null;
    return {
      confessionaleLatestAt: Number(j.confessionaleLatestAt) || 0,
      feedbackLatestAt: Number(j.feedbackLatestAt) || 0,
      reviewsLatestAt: Number(j.reviewsLatestAt) || 0,
      bachecaLatestAt: Number(j.bachecaLatestAt) || 0,
      quizDayStartAt: Number(j.quizDayStartAt) || 0,
      wrappedMonthStartAt: Number(j.wrappedMonthStartAt) || 0,
      voteCanVote: Boolean(j.voteCanVote),
      ticketsUnclaimed: Math.max(0, Number(j.ticketsUnclaimed) || 0),
      isTicketStaff: Boolean(j.isTicketStaff),
    };
  } catch {
    return null;
  }
}

function isNewer(latestAt: number, seenAt: number) {
  return latestAt > 0 && latestAt > Math.max(0, seenAt);
}

export type NavActivityFlags = {
  ready: boolean;
  byPath: Partial<Record<NavActivityPath, boolean>>;
  hasPath: (href?: string | null) => boolean;
  hasAnyIn: (hrefs: Array<string | null | undefined>) => boolean;
  /** Prima visita fatta → nasconde isNew «Novità». */
  hasVisited: (href?: string | null) => boolean;
};

export function useNavActivityBadges(): NavActivityFlags {
  const { ready: authReady, token } = useAuth();
  const [summary, setSummary] = useState<NavActivitySummary | null>(null);
  const [seen, setSeen] = useState<SeenMap>({});
  const [ready, setReady] = useState(false);

  const refreshSeen = useCallback(() => {
    setSeen(readLocalSeen());
  }, []);

  const pull = useCallback(async () => {
    const [remote, chrome] = await Promise.all([
      loadActivitySummary(token),
      token ? pullChromeSeen(token) : Promise.resolve({} as SeenMap),
    ]);
    if (chrome && Object.keys(chrome).length) {
      const merged = mergeSeen(readLocalSeen(), chrome);
      writeLocalSeen(merged);
      setSeen(merged);
    } else {
      setSeen(readLocalSeen());
    }
    if (remote) setSummary(remote);
    setReady(true);
  }, [token]);

  useEffect(() => {
    if (!authReady) return;
    void pull();
  }, [authReady, pull]);

  useEffect(() => {
    refreshSeen();
    const onSeen = () => refreshSeen();
    const onStorage = (e: StorageEvent) => {
      if (e.key === LS_KEY) refreshSeen();
    };
    window.addEventListener(SEEN_EVENT, onSeen);
    window.addEventListener("storage", onStorage);
    return () => {
      window.removeEventListener(SEEN_EVENT, onSeen);
      window.removeEventListener("storage", onStorage);
    };
  }, [refreshSeen]);

  useLiveRefresh(pull, {
    intervalMs: 90_000,
    enabled: authReady,
    boot: false,
    topics: ["confessionale", "suggestions", "reviews", "bacheca", "vote", "tickets"],
  });

  const byPath = useMemo(() => {
    const out: Partial<Record<NavActivityPath, boolean>> = {};
    if (!summary) return out;
    out[NAV_ACTIVITY_PATHS.confessionale] = isNewer(
      summary.confessionaleLatestAt,
      Number(seen[NAV_ACTIVITY_PATHS.confessionale]) || 0,
    );
    out[NAV_ACTIVITY_PATHS.feedback] = isNewer(
      summary.feedbackLatestAt,
      Number(seen[NAV_ACTIVITY_PATHS.feedback]) || 0,
    );
    out[NAV_ACTIVITY_PATHS.reviews] = isNewer(
      summary.reviewsLatestAt,
      Number(seen[NAV_ACTIVITY_PATHS.reviews]) || 0,
    );
    out[NAV_ACTIVITY_PATHS.bacheca] = isNewer(
      summary.bachecaLatestAt,
      Number(seen[NAV_ACTIVITY_PATHS.bacheca]) || 0,
    );
    /* Giochi del giorno: nuovo giorno Rome 00:00 → ! finché non apri /quiz/ */
    out[NAV_ACTIVITY_PATHS.quiz] = isNewer(
      summary.quizDayStartAt,
      Number(seen[NAV_ACTIVITY_PATHS.quiz]) || 0,
    );
    /* Wrapped mensile: 1° del mese Rome 00:00 → ! finché non apri /wrapped/ */
    out[NAV_ACTIVITY_PATHS.wrapped] = isNewer(
      summary.wrappedMonthStartAt,
      Number(seen[NAV_ACTIVITY_PATHS.wrapped]) || 0,
    );
    out[NAV_ACTIVITY_PATHS.vote] = Boolean(token && summary.voteCanVote);
    out[NAV_ACTIVITY_PATHS.tickets] = Boolean(
      token && summary.isTicketStaff && summary.ticketsUnclaimed > 0,
    );
    return out;
  }, [summary, seen, token]);

  const hasPath = useCallback(
    (href?: string | null) => {
      const p = navActivityPathFromHref(href);
      return Boolean(p && byPath[p]);
    },
    [byPath],
  );

  const hasAnyIn = useCallback(
    (hrefs: Array<string | null | undefined>) => hrefs.some((h) => hasPath(h)),
    [hasPath],
  );

  const hasVisited = useCallback(
    (href?: string | null) => {
      const p = navActivityPathFromHref(href);
      return Boolean(p && Number(seen[p]) > 0);
    },
    [seen],
  );

  return { ready, byPath, hasPath, hasAnyIn, hasVisited };
}
