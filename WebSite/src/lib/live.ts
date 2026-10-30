/**
 * Dirette home (E6). API:
 * GET /webhooks/site-twitch-live
 *
 * Twitch: live oppure ultimo VOD (badge «In diretta» / «Ultimo VOD»).
 * Il player (iframe) parte solo al click.
 *
 * Su localhost / `next dev` i path relativi `/webhooks/` non esistono: si punta a www
 * (come il vecchio `apiUrlLocal` / WS ticket).
 */

import { apiUrl } from "./api";

export const TWITCH_LIVE_URL = "/webhooks/site-twitch-live";

/** @deprecated usa `apiUrl` — tenuta per import esistenti. */
export function liveApiUrl(path: string): string {
  return apiUrl(path);
}

export const LIVE_POLL_MS = 150_000;
export const LIVE_HIDE_AFTER_MISSES = 3;

export type LivePlatform = "twitch";
export type LiveKind = "live" | "vod";

export type LiveStream = {
  id: string;
  slug: string;
  kind: LiveKind;
  displayName: string;
  title: string;
  category: string;
  viewerCount: number;
  thumbnailUrl: string | null;
  url: string;
  embedUrl: string | null;
};

export type LivePayload = {
  ok: true;
  active: boolean;
  primary: LiveStream | null;
};

function str(v: unknown) {
  return String(v ?? "").trim();
}

function safeThumb(url: string): string | null {
  if (url.startsWith("/webhooks/site-twitch-live/thumb")) {
    return liveApiUrl(url);
  }
  return null;
}

function safeTwitchEmbed(url: string): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:" || u.hostname !== "player.twitch.tv") return null;
    return u.toString();
  } catch {
    return null;
  }
}

export function parseStream(raw: unknown): LiveStream | null {
  if (!raw || typeof raw !== "object") return null;
  const s = raw as Record<string, unknown>;
  const id = str(s.id);
  const kindRaw = str(s.kind).toLowerCase();
  if (!id || (kindRaw !== "live" && kindRaw !== "vod")) return null;
  const slug = str(s.slug || s.login);
  return {
    id,
    slug,
    kind: kindRaw,
    displayName: str(s.displayName) || slug || id,
    title: str(s.title),
    category: str(s.category),
    viewerCount: Math.max(0, Math.floor(Number(s.viewerCount) || 0)),
    thumbnailUrl: safeThumb(str(s.thumbnailUrl)),
    url: str(s.url),
    embedUrl: safeTwitchEmbed(str(s.embedUrl)),
  };
}

/**
 * Twitch richiede `parent` = hostname reale della pagina.
 * L'API manda già www + localhost; qui assicuriamo l'host corrente (beta / porta locale).
 */
export function withEmbedParent(embedUrl: string): string {
  try {
    const u = new URL(embedUrl);
    const host = String(location.hostname || "").toLowerCase();
    if (!host) return embedUrl;
    const parents = u.searchParams.getAll("parent").map((p) => p.toLowerCase());
    if (!parents.includes(host)) u.searchParams.append("parent", host);
    // next dev: hostname è localhost ma a volte serve anche la porta? Twitch vuole solo hostname.
    return u.toString();
  } catch {
    return embedUrl;
  }
}

export function externalUrl(url: string, platform: LivePlatform = "twitch"): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    const host = u.hostname.toLowerCase();
    if (platform === "twitch" && (host === "twitch.tv" || host.endsWith(".twitch.tv"))) {
      return u.toString();
    }
  } catch {
    /* url sporco */
  }
  return null;
}

export async function fetchLive(path: string): Promise<LivePayload | null> {
  try {
    const r = await fetch(liveApiUrl(path), {
      credentials: "omit",
      cache: "no-store",
      headers: { Accept: "application/json" },
    });
    if (!r.ok) return null;
    const j = (await r.json()) as {
      ok?: boolean;
      active?: boolean;
      primary?: unknown;
      streams?: unknown[];
    };
    if (!j || j.ok !== true) return null;
    const primary =
      parseStream(j.primary) ||
      (Array.isArray(j.streams) ? parseStream(j.streams[0]) : null);
    return { ok: true, active: j.active === true && !!primary, primary };
  } catch {
    return null;
  }
}

/**
 * Cosa fare dopo un poll.
 * - `fail`: rete o HTTP, tieni l'ultimo stream per qualche tentativo.
 * - `hide`: risposta valida ma niente da mostrare subito (Twitch spento o solo VOD).
 * - `offline`: `active: false`, nascondi dopo qualche miss per non lampeggiare.
 */
export function resolveShown(
  payload: LivePayload | null,
  liveOnly: boolean,
): { action: "fail" } | { action: "hide" } | { action: "offline" } | { action: "show"; stream: LiveStream } {
  if (!payload) return { action: "fail" };
  const primary = payload.active ? payload.primary : null;
  if (liveOnly && primary && primary.kind !== "live") return { action: "hide" };
  if (primary && (!liveOnly || primary.kind === "live")) return { action: "show", stream: primary };
  return { action: "offline" };
}
