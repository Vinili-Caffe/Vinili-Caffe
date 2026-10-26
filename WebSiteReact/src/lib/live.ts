/**
 * Dirette home (E6). Stesse API del sito vecchio:
 * GET /webhooks/site-twitch-live, /webhooks/site-kick-live
 * GET /webhooks/site-kick-sub/status, /webhooks/site-kick-sub/oauth-start
 *
 * Twitch e Kick: live oppure ultimo VOD (badge «In diretta» / «Ultimo VOD»).
 * Il player (iframe / mp4) parte solo al click.
 * Anteprima Kick: 10 minuti, stessa chiave del vecchio `vc_kick_pip_watch_v2`.
 *
 * Su localhost / `next dev` i path relativi `/webhooks/` non esistono: si punta a www
 * (come il vecchio `apiUrlLocal` / WS ticket).
 */

import { apiUrl } from "./api";

export const TWITCH_LIVE_URL = "/webhooks/site-twitch-live";
export const KICK_LIVE_URL = "/webhooks/site-kick-live";
export const KICK_SUB_URL = "/webhooks/site-kick-sub";

/** @deprecated usa `apiUrl` — tenuta per import esistenti. */
export function liveApiUrl(path: string): string {
  return apiUrl(path);
}

export const LIVE_POLL_MS = 150_000;
export const LIVE_HIDE_AFTER_MISSES = 3;
export const KICK_PREVIEW_LIMIT_MS = 10 * 60_000;

const WATCH_KEY = "vc_kick_pip_watch_v2";

export type LivePlatform = "twitch" | "kick";
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
  playbackUrl: string | null;
  previewMp4Url: string | null;
};

export type LivePayload = {
  ok: true;
  active: boolean;
  primary: LiveStream | null;
};

export type KickSubStatus = {
  enabled: true;
  linked: boolean;
  subActive: boolean;
  subscribeUrl: string | null;
};

type WatchState = {
  streamId: string;
  watchedMs: number;
  sessionStart: number;
  locked: boolean;
};

function str(v: unknown) {
  return String(v ?? "").trim();
}

function safeThumb(url: string): string | null {
  if (
    url.startsWith("/webhooks/site-twitch-live/thumb") ||
    url.startsWith("/webhooks/site-kick-live/thumb")
  ) {
    return liveApiUrl(url);
  }
  return null;
}

function safeKickMedia(url: string): string | null {
  if (url.startsWith("/webhooks/site-kick-live/")) return liveApiUrl(url);
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
    playbackUrl: safeKickMedia(str(s.playbackUrl)),
    previewMp4Url: safeKickMedia(str(s.previewMp4Url)),
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

export function externalUrl(url: string, platform: LivePlatform): string | null {
  try {
    const u = new URL(url);
    if (u.protocol !== "https:") return null;
    const host = u.hostname.toLowerCase();
    if (platform === "twitch" && (host === "twitch.tv" || host.endsWith(".twitch.tv"))) {
      return u.toString();
    }
    if (platform === "kick" && (host === "kick.com" || host.endsWith(".kick.com"))) {
      return u.toString();
    }
  } catch {
    /* url sporco */
  }
  return null;
}

export function kickPlayableUrl(stream: LiveStream): string | null {
  if (stream.previewMp4Url) return stream.previewMp4Url;
  if (!stream.playbackUrl || typeof document === "undefined") return null;
  const probe = document.createElement("video");
  if (probe.canPlayType("application/vnd.apple.mpegurl")) return stream.playbackUrl;
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

export async function fetchKickSubStatus(
  token: string,
): Promise<KickSubStatus | "disabled" | null> {
  try {
    const r = await fetch(liveApiUrl(`${KICK_SUB_URL}/status`), {
      credentials: "omit",
      cache: "no-store",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    });
    const j = (await r.json().catch(() => null)) as {
      ok?: boolean;
      enabled?: boolean;
      error?: string;
      linked?: boolean;
      subActive?: boolean;
      subscribeUrl?: string;
    } | null;
    if (!j) return null;
    if (j.enabled === false || j.error === "disabled") return "disabled";
    if (!r.ok || j.ok !== true) return null;
    return {
      enabled: true,
      linked: j.linked === true,
      subActive: j.subActive === true,
      subscribeUrl: externalUrl(str(j.subscribeUrl), "kick"),
    };
  } catch {
    return null;
  }
}

export async function startKickSubLink(
  token: string,
): Promise<{ status: number; url: string | null; disabled: boolean }> {
  try {
    const r = await fetch(liveApiUrl(`${KICK_SUB_URL}/oauth-start`), {
      credentials: "omit",
      cache: "no-store",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}` },
    });
    const j = (await r.json().catch(() => null)) as {
      url?: string;
      enabled?: boolean;
      error?: string;
    } | null;
    const disabled = j?.enabled === false || j?.error === "disabled";
    const url = typeof j?.url === "string" && j.url.startsWith("https://") ? j.url : null;
    return { status: r.status, url, disabled };
  } catch {
    return { status: 0, url: null, disabled: false };
  }
}

function writeWatch(state: WatchState | null) {
  try {
    if (!state) localStorage.removeItem(WATCH_KEY);
    else localStorage.setItem(WATCH_KEY, JSON.stringify(state));
  } catch {
    /* storage pieno o bloccato */
  }
}

/** Chiude l'eventuale sessione aperta e restituisce il totale per questo stream. */
export function loadWatch(streamId: string): WatchState {
  let raw: WatchState | null = null;
  try {
    const j = JSON.parse(localStorage.getItem(WATCH_KEY) || "null") as WatchState | null;
    if (j && typeof j === "object" && str(j.streamId) === streamId) raw = j;
  } catch {
    raw = null;
  }
  if (!raw) return { streamId, watchedMs: 0, sessionStart: 0, locked: false };
  let watchedMs = Math.max(0, Number(raw.watchedMs) || 0);
  const sessionStart = Number(raw.sessionStart) || 0;
  if (sessionStart > 0) watchedMs += Math.max(0, Date.now() - sessionStart);
  const locked = raw.locked === true || watchedMs >= KICK_PREVIEW_LIMIT_MS;
  const next: WatchState = { streamId, watchedMs, sessionStart: 0, locked };
  writeWatch(next);
  return next;
}

export function beginWatch(streamId: string): WatchState {
  const cur = loadWatch(streamId);
  if (cur.locked) return cur;
  const next = { ...cur, sessionStart: Date.now() };
  writeWatch(next);
  return next;
}

export function flushWatch(streamId: string): WatchState {
  const cur = loadWatch(streamId);
  return cur;
}
