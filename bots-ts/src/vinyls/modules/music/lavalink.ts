import { logger } from "../../../shared";
import { isLavalinkReady } from "./musicSession";

export interface LavalinkStatus {
  enabled: boolean;
  connect: boolean;
  host: string | null;
  port: number;
  connected: boolean;
  voiceReady: boolean;
  note: string;
}

export interface ResolvedTrack {
  title: string;
  uri: string;
  encoded: string;
  identifier?: string;
  author?: string;
  lengthMs?: number;
}

let restOk = false;
let voiceReadyFlag = false;

function host(): string {
  return String(process.env.LAVALINK_HOST || process.env.VC_TS_LAVALINK_HOST || "").trim();
}

function port(): number {
  const n = Number(process.env.LAVALINK_PORT || process.env.VC_TS_LAVALINK_PORT || 2333);
  return Number.isFinite(n) && n > 0 ? n : 2333;
}

function password(): string {
  return String(process.env.LAVALINK_PASSWORD || process.env.VC_TS_LAVALINK_PASSWORD || "").trim();
}

function wantConnect(): boolean {
  return process.env.VC_TS_LAVALINK_CONNECT === "1";
}

function allowShared(): boolean {
  return process.env.VC_TS_LAVALINK_ALLOW_SHARED === "1";
}

/** CONNECT + ALLOW_SHARED — evita conflitto col nodo live JS. */
export function wantShoukakuConnect(): boolean {
  return isLavalinkReady() && wantConnect() && allowShared();
}

export function markVoiceReady(ready: boolean): void {
  voiceReadyFlag = ready;
}

export function getLavalinkStatus(): LavalinkStatus {
  const h = host() || null;
  const enabled = isLavalinkReady();
  const connect = wantConnect() && enabled;
  return {
    enabled,
    connect,
    host: h,
    port: port(),
    connected: restOk,
    voiceReady: voiceReadyFlag,
    note: !enabled
      ? "off — VC_TS_LAVALINK=1 + LAVALINK_HOST"
      : !wantConnect()
        ? "flag on — coda locale; REST/voice off (set VC_TS_LAVALINK_CONNECT=1)"
        : !allowShared()
          ? "CONNECT=1 ma manca VC_TS_LAVALINK_ALLOW_SHARED=1 (nodo isolato)"
          : voiceReadyFlag
            ? "Shoukaku voice ready"
            : restOk
              ? "REST ok — Shoukaku pending clientReady"
              : "CONNECT=1 ma REST non pronto",
  };
}

/** Probe REST /v4/info — solo se CONNECT=1 su host dedicato. */
export async function initLavalinkStub(): Promise<void> {
  const st = getLavalinkStatus();
  if (!st.enabled) {
    logger.info(`[lavalink] ${st.note}`);
    return;
  }
  if (!st.connect) {
    logger.warn(`[lavalink] ${st.note} · host=${st.host}`);
    return;
  }
  if (!allowShared()) {
    logger.warn(
      "[lavalink] CONNECT richiesto — usa un nodo/password dedicati al TS. " +
        "Se è davvero isolato: VC_TS_LAVALINK_ALLOW_SHARED=1",
    );
    return;
  }

  const pwd = password();
  if (!pwd || !st.host) {
    logger.warn("[lavalink] manca LAVALINK_PASSWORD o host");
    return;
  }

  try {
    const url = `http://${st.host}:${st.port}/v4/info`;
    const res = await fetch(url, {
      headers: { Authorization: pwd },
      signal: AbortSignal.timeout(5_000),
    });
    if (!res.ok) throw new Error(`HTTP ${res.status}`);
    restOk = true;
    logger.info(`[lavalink] REST ok ${st.host}:${st.port}`);
  } catch (err) {
    restOk = false;
    logger.warn("[lavalink] REST probe failed", err);
  }
}

export function isLavalinkSocketUp(): boolean {
  return restOk;
}

interface LavalinkTrackPayload {
  encoded?: string;
  info?: {
    title?: string;
    uri?: string;
    identifier?: string;
    author?: string;
    length?: number;
  };
}

function pickTrack(data: unknown, loadType?: string): LavalinkTrackPayload | null {
  const lt = String(loadType || "").toLowerCase();
  if (!data) return null;
  if (lt === "track" && typeof data === "object" && data !== null && "encoded" in data) {
    return data as LavalinkTrackPayload;
  }
  if (lt === "search" && Array.isArray(data)) {
    return (data[0] as LavalinkTrackPayload) || null;
  }
  if (lt === "playlist" && typeof data === "object" && data !== null) {
    const tracks = (data as { tracks?: LavalinkTrackPayload[] }).tracks;
    return tracks?.[0] || null;
  }
  if (Array.isArray(data)) return (data[0] as LavalinkTrackPayload) || null;
  if (typeof data === "object" && data !== null && "encoded" in data) {
    return data as LavalinkTrackPayload;
  }
  return null;
}

/** Resolve query via Lavalink REST loadtracks (ytsearch). */
export async function resolveTrack(query: string): Promise<ResolvedTrack | null> {
  if (!restOk) return null;
  const h = host();
  const pwd = password();
  if (!h || !pwd) return null;
  const identifier = /^(https?:\/\/|ytsearch:)/i.test(query) ? query : `ytsearch:${query}`;
  const url = `http://${h}:${port()}/v4/loadtracks?identifier=${encodeURIComponent(identifier)}`;
  try {
    const res = await fetch(url, {
      headers: { Authorization: pwd },
      signal: AbortSignal.timeout(10_000),
    });
    if (!res.ok) return null;
    const body = (await res.json()) as { data?: unknown; loadType?: string };
    const track = pickTrack(body.data, body.loadType);
    const info = track?.info;
    const encoded = String(track?.encoded || "").trim();
    if (!encoded || !info?.title) return null;
    return {
      title: String(info.title),
      uri: String(info.uri || info.identifier || query),
      encoded,
      identifier: info.identifier,
      author: info.author,
      lengthMs: info.length,
    };
  } catch (err) {
    logger.warn("[lavalink] resolve", err);
    return null;
  }
}
