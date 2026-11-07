/** Serata film: accesso high-staff + stream firmato. API /webhooks/site-seratafilm-access|film */

import { cdnUrl } from "@/lib/site";

export type SerataEvent = {
  timezone: string;
  recurring: { weekday: number; hour: number; minute: number };
  overrideIso: string;
  filmTitle: string;
  nextFilmTitle: string;
};

/** Titoli/orario serata (source of truth lato sito). Stream film: bot `VC_SERATAFILM_FILM_URL` / default in siteSeratafilmAccessApi. */
export const SERATA_EVENT: SerataEvent = {
  timezone: "Europe/Rome",
  recurring: { weekday: 6, hour: 21, minute: 0 },
  /** Vuoto = sabato 21:00 Europe/Rome (recurring). Imposta ISO solo per una data fissa. */
  overrideIso: "",
  filmTitle: "Perfetti sconosciuti",
  nextFilmTitle: "",
};

/** Locandina sul player — sempre da CDN (`vc-media`). */
export const FILM_POSTER =
  "https://cdn.viniliecaffe.it/images/seratafilm/perfetti-sconosciuti-poster.jpg?v=20261107ps1";

/** Skip titoli di coda (disattivato). */
export const CREDITS_SKIP = {
  enabled: true,
  startSeconds: 0,
  label: "Salta titoli di coda",
} as const;

/** Ultimi 10s → overlay fullscreen + avvio auto. */
export const FINAL_COUNTDOWN_MS = 10_000;

/**
 * Sync audio come WebSite/js/seratafilm-countdown.js (`sfCountdownSync3`):
 * il primo beep del mp3 è a ~1.14s → parti il file a T−(10s+1.14s) così il beep cade sul “10” visuale.
 */
export const COUNTDOWN_FIRST_BEEP_SEC = 1.141;
export const COUNTDOWN_LEAD_MS = Math.round(FINAL_COUNTDOWN_MS + COUNTDOWN_FIRST_BEEP_SEC * 1000);
/** Istante (sec nel mp3) di ogni beep, dal “10” al “1”. */
export const COUNTDOWN_BEEP_AT_SEC = [1.141, 2.073, 3.212, 4.099, 5.155, 6.312, 7.382, 8.354, 9.407, 10.36] as const;
export const COUNTDOWN_MP3 = cdnUrl("/audio/countdown.mp3");

export type SerataAccess =
  | { ok: true; allowed: true; filmStreamUrl: string; isHighStaff?: boolean; canManage?: boolean }
  | { ok: false; status: number; message: string; error?: string };

export async function loadSerataAccess(token: string): Promise<SerataAccess> {
  try {
    const r = await fetch("/webhooks/site-seratafilm-access", {
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json" },
      cache: "no-store",
    });
    const j = await r.json().catch(() => null);
    if (!j || typeof j !== "object") return { ok: false, status: r.status, message: "Risposta non valida." };
    if (!j.ok) {
      return {
        ok: false,
        status: Number(j.status) || r.status,
        message: String(j.message || "Accesso negato."),
        error: j.error ? String(j.error) : undefined,
      };
    }
    return {
      ok: true,
      allowed: true,
      filmStreamUrl: String(j.filmStreamUrl || ""),
      isHighStaff: !!j.isHighStaff,
      canManage: !!j.canManage,
    };
  } catch {
    return { ok: false, status: 0, message: "Rete non disponibile." };
  }
}

const WD_EN: Record<string, number> = {
  Sunday: 0,
  Monday: 1,
  Tuesday: 2,
  Wednesday: 3,
  Thursday: 4,
  Friday: 5,
  Saturday: 6,
};

function zonedParts(utcMs: number, tz: string) {
  const fmt = new Intl.DateTimeFormat("en-US", {
    timeZone: tz,
    weekday: "long",
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
    hour: "2-digit",
    minute: "2-digit",
    second: "2-digit",
    hourCycle: "h23",
  });
  const o: Record<string, string> = {};
  for (const p of fmt.formatToParts(new Date(utcMs))) {
    if (p.type !== "literal") o[p.type] = p.value;
  }
  return {
    weekday: WD_EN[o.weekday] ?? -1,
    year: +o.year,
    month: +o.month,
    day: +o.day,
    hour: +o.hour,
    minute: +o.minute,
    second: +o.second,
  };
}

function tzOffsetMs(utcMs: number, tz: string) {
  const fmt = new Intl.DateTimeFormat("en-US", { timeZone: tz, timeZoneName: "shortOffset", hour: "2-digit" });
  const zone = fmt.formatToParts(new Date(utcMs)).find((p) => p.type === "timeZoneName");
  const m = String(zone?.value || "GMT+0").match(/^GMT([+-])(\d{1,2})(?::?(\d{2}))?$/i);
  if (!m) return 0;
  const sign = m[1] === "-" ? -1 : 1;
  return sign * (Number(m[2] || 0) * 60 + Number(m[3] || 0)) * 60 * 1000;
}

function localZonedToUtcMs(year: number, month: number, day: number, hour: number, minute: number, tz: string) {
  const base = Date.UTC(year, month - 1, day, hour, minute, 0);
  const off1 = tzOffsetMs(base, tz);
  let utc = base - off1;
  const off2 = tzOffsetMs(utc, tz);
  if (off2 !== off1) utc = base - off2;
  return utc;
}

/** Prossima serata da recurring o overrideIso (logica del countdown vecchio). */
export function nextFilmAtMs(event: SerataEvent = SERATA_EVENT, now = Date.now()): number {
  const iso = String(event.overrideIso || "").trim();
  if (iso) {
    const t = Date.parse(iso);
    if (Number.isFinite(t)) return t;
  }
  const tz = event.timezone || "Europe/Rome";
  const wantWd = Math.max(0, Math.min(6, Math.floor(Number(event.recurring?.weekday) || 6)));
  const wantH = Math.max(0, Math.min(23, Math.floor(Number(event.recurring?.hour) ?? 21)));
  const wantM = Math.max(0, Math.min(59, Math.floor(Number(event.recurring?.minute) || 0)));
  const p = zonedParts(now, tz);
  let daysAhead = (wantWd - p.weekday + 7) % 7;
  let d = new Date(Date.UTC(p.year, p.month - 1, p.day + daysAhead));
  let target = localZonedToUtcMs(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), wantH, wantM, tz);
  if (target <= now) {
    d = new Date(Date.UTC(p.year, p.month - 1, p.day + daysAhead + 7));
    target = localZonedToUtcMs(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), wantH, wantM, tz);
  }
  return target;
}

/** Per quanto la serata resta "in corso" dopo l'inizio: chi entra o ricarica in ritardo può ancora avviare il film. */
export const LIVE_WINDOW_MS = 4 * 60 * 60 * 1000;

/** Inizio della serata in corso (entro LIVE_WINDOW_MS), altrimenti null. */
export function liveFilmStartMs(event: SerataEvent = SERATA_EVENT, now = Date.now()): number | null {
  const iso = String(event.overrideIso || "").trim();
  let start: number;
  if (iso && Number.isFinite(Date.parse(iso))) start = Date.parse(iso);
  else start = nextFilmAtMs(event, now) - 7 * 24 * 60 * 60 * 1000;
  return now >= start && now - start < LIVE_WINDOW_MS ? start : null;
}

export function countdownParts(targetMs: number, now = Date.now()) {
  const ms = Math.max(0, targetMs - now);
  const sec = Math.floor(ms / 1000);
  const days = Math.floor(sec / 86400);
  const hours = Math.floor((sec % 86400) / 3600);
  const minutes = Math.floor((sec % 3600) / 60);
  const seconds = sec % 60;
  return { ms, days, hours, minutes, seconds, live: ms <= 0 };
}

export function filmTitle(event: SerataEvent = SERATA_EVENT) {
  return String(event.nextFilmTitle || event.filmTitle || "il prossimo film").trim() || "il prossimo film";
}
