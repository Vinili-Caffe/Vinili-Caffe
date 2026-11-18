/** Serata film: accesso high-staff + stream firmato. API /webhooks/site-seratafilm-access|film */

import { cdnUrl } from "@/lib/site";

export type SerataEvent = {
  timezone: string;
  recurring: { weekday: number; hour: number; minute: number };
  overrideIso: string;
  filmTitle: string;
  nextFilmTitle: string;
};

export type SerataNight = {
  id: string;
  /** YYYY-MM-DD (calendario Europe/Rome). */
  date: string;
  hour?: number;
  minute?: number;
  title: string;
  synopsis: string;
  /** Path `/images/...` o URL CDN. */
  poster: string;
};

/** Titoli/orario serata (source of truth lato sito). Stream film: bot `VC_SERATAFILM_FILM_URL` / default in siteSeratafilmAccessApi. */
export const SERATA_EVENT: SerataEvent = {
  timezone: "Europe/Rome",
  recurring: { weekday: 6, hour: 21, minute: 0 },
  /** Vuoto = sabato 21:00 Europe/Rome (recurring). Imposta ISO solo per una data fissa. */
  overrideIso: "",
  filmTitle: "Chiamami col tuo nome",
  nextFilmTitle: "",
};

/** Locandina default (sabato ricorrente) — CDN (`vc-media`). */
export const FILM_POSTER =
  "https://cdn.viniliecaffe.it/images/seratafilm/chiamami-col-tuo-nome-poster.jpg?v=20261114cm1";

const POSTER_V = "20261118xmas1";

/** Locandine ufficiali dei film (CDN R2). */
function filmPosterUrl(file: string) {
  return `${cdnUrl(`/images/seratafilm/${file}`)}?v=${POSTER_V}`;
}

/**
 * Serate extra Natale 2026 (21–27 dic, 21:00 Rome).
 * 25 dic assente di proposito.
 */
export const SERATA_XMAS_NIGHTS: SerataNight[] = [
  {
    id: "2026-12-21",
    date: "2026-12-21",
    title: "Il figlio di Babbo Natale",
    synopsis:
      "Arthur, il figlio minore di Babbo Natale, scopre che un regalo non è stato consegnato. Con Nonno Natale e un’elfa partono sulla vecchia slitta per rimediare prima dell’alba.",
    poster: filmPosterUrl("il-figlio-di-babbo-natale-poster.jpg"),
  },
  {
    id: "2026-12-22",
    date: "2026-12-22",
    title: "A Christmas Carol",
    synopsis:
      "L’avaro Ebenezer Scrooge riceve la visita di tre spiriti nella notte di Natale: un viaggio tra passato, presente e futuro che può ancora cambiare il suo cuore.",
    poster: filmPosterUrl("a-christmas-carol-poster.jpg"),
  },
  {
    id: "2026-12-23",
    date: "2026-12-23",
    title: "Grinch",
    synopsis:
      "Il Grinch odia il Natale e trama di rubare ogni festeggiamento a Chi-ville. Tra mischievie e un cuore che cresce, scopre cosa resta quando i regali spariscono.",
    poster: filmPosterUrl("grinch-poster.jpg"),
  },
  {
    id: "2026-12-24",
    date: "2026-12-24",
    title: "Polar Express",
    synopsis:
      "Nella notte della Vigilia un ragazzo scettico sale sul Polar Express diretto al Polo Nord. Un viaggio magico tra biglietti d’oro, cioccolata calda e la fede nel Natale.",
    poster: filmPosterUrl("polar-express-poster.jpg"),
  },
  {
    id: "2026-12-26",
    date: "2026-12-26",
    title: "Mamma ho perso l'aereo",
    synopsis:
      "Kevin McCallister resta solo a casa per Natale e difende la villetta dai ladri Harry e Marv con trappole all’ultimo piano. Classico delle feste, umorismo e cuore.",
    poster: filmPosterUrl("mamma-ho-perso-laereo-poster.jpg"),
  },
  {
    id: "2026-12-27",
    date: "2026-12-27",
    title: "Poltrona per due",
    synopsis:
      "Un impiegato ambizioso presta l’appartamento ai superiori per gli appuntamenti clandestini, finché conosce una ragazza legata a uno di loro. Commedia bittersweet ambientata a Natale.",
    poster: filmPosterUrl("poltrona-per-due-poster.jpg"),
  },
];

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

/** Per quanto la serata resta "in corso" dopo l'inizio: chi entra o ricarica in ritardo può ancora avviare il film. */
export const LIVE_WINDOW_MS = 4 * 60 * 60 * 1000;

function nightStartMs(night: SerataNight, event: SerataEvent = SERATA_EVENT): number {
  const tz = event.timezone || "Europe/Rome";
  const [ys, ms, ds] = String(night.date || "").split("-");
  const y = Number(ys);
  const m = Number(ms);
  const d = Number(ds);
  const hour = Number.isFinite(night.hour) ? Number(night.hour) : Number(event.recurring?.hour ?? 21);
  const minute = Number.isFinite(night.minute) ? Number(night.minute) : Number(event.recurring?.minute || 0);
  if (!y || !m || !d) return Number.NaN;
  return localZonedToUtcMs(y, m, d, hour, minute, tz);
}

function nextRecurringSaturdayMs(event: SerataEvent, now: number): number {
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

export type ResolvedSerata = {
  startMs: number;
  night: SerataNight | null;
  title: string;
  synopsis: string;
  poster: string;
};

function asDefaultResolved(startMs: number, event: SerataEvent): ResolvedSerata {
  return {
    startMs,
    night: null,
    title: String(event.nextFilmTitle || event.filmTitle || "il prossimo film").trim() || "il prossimo film",
    synopsis: "",
    poster: FILM_POSTER,
  };
}

function asNightResolved(night: SerataNight, startMs: number): ResolvedSerata {
  return {
    startMs,
    night,
    title: night.title,
    synopsis: night.synopsis,
    poster: night.poster,
  };
}

/** Serata attiva (live window) o prossima: schedule Natale ha priorità sul sabato ricorrente. */
export function resolveSerata(event: SerataEvent = SERATA_EVENT, now = Date.now()): ResolvedSerata {
  const iso = String(event.overrideIso || "").trim();
  if (iso) {
    const t = Date.parse(iso);
    if (Number.isFinite(t) && (t > now || (now >= t && now - t < LIVE_WINDOW_MS))) {
      return asDefaultResolved(t, event);
    }
  }

  const scheduled = SERATA_XMAS_NIGHTS.map((night) => ({ night, startMs: nightStartMs(night, event) })).filter((x) =>
    Number.isFinite(x.startMs),
  );

  const liveNight = scheduled.find((x) => now >= x.startMs && now - x.startMs < LIVE_WINDOW_MS);
  if (liveNight) return asNightResolved(liveNight.night, liveNight.startMs);

  const candidates: ResolvedSerata[] = scheduled
    .filter((x) => x.startMs > now)
    .map((x) => asNightResolved(x.night, x.startMs));

  const sat = nextRecurringSaturdayMs(event, now);
  const satDate = zonedParts(sat, event.timezone || "Europe/Rome");
  const satKey = `${satDate.year}-${String(satDate.month).padStart(2, "0")}-${String(satDate.day).padStart(2, "0")}`;
  if (!scheduled.some((x) => x.night.date === satKey)) {
    candidates.push(asDefaultResolved(sat, event));
  }

  candidates.sort((a, b) => a.startMs - b.startMs);
  return candidates[0] || asDefaultResolved(sat, event);
}

/** Prossima serata da schedule Natale, recurring o overrideIso. */
export function nextFilmAtMs(event: SerataEvent = SERATA_EVENT, now = Date.now()): number {
  return resolveSerata(event, now).startMs;
}

/** Inizio della serata in corso (entro LIVE_WINDOW_MS), altrimenti null. */
export function liveFilmStartMs(event: SerataEvent = SERATA_EVENT, now = Date.now()): number | null {
  const resolved = resolveSerata(event, now);
  return now >= resolved.startMs && now - resolved.startMs < LIVE_WINDOW_MS ? resolved.startMs : null;
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

export function filmTitle(event: SerataEvent = SERATA_EVENT, now = Date.now()) {
  return resolveSerata(event, now).title;
}

export function filmPoster(event: SerataEvent = SERATA_EVENT, now = Date.now()) {
  return resolveSerata(event, now).poster || FILM_POSTER;
}

export function filmSynopsis(event: SerataEvent = SERATA_EVENT, now = Date.now()) {
  return resolveSerata(event, now).synopsis;
}
