/** Serata film: accesso high-staff + stream firmato. API /webhooks/site-seratafilm-access|film */

import { cdnUrl } from "@/lib/site";
import { isEventoPublicWindowOpen } from "@/lib/evento-starwars";

export type SerataEvent = {
  timezone: string;
  recurring: { weekday: number; hour: number; minute: number };
  overrideIso: string;
  filmTitle: string;
  nextFilmTitle: string;
  /** Trama mostrata sulla pagina (sabato ricorrente). */
  filmSynopsis?: string;
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
  filmTitle: "Mia",
  nextFilmTitle: "",
  filmSynopsis:
    "In una famiglia semplice e felice entra un ragazzo manipolatore che stravolge la vita di Mia, quindicenne. Quando lei, con l’aiuto del padre, riesce ad allontanarsi, lui decide di distruggerla: al padre resta la vendetta.",
};

/** Locandina default (sabato ricorrente) — CDN (`vc-media`). */
export const FILM_POSTER =
  "https://cdn.viniliecaffe.it/images/seratafilm/mia-poster.jpg?v=20261128mia1";

const POSTER_V = "20261128mia1";

/** Locandine ufficiali dei film (CDN R2). */
function filmPosterUrl(file: string) {
  return `${cdnUrl(`/images/seratafilm/${file}`)}?v=${POSTER_V}`;
}

/**
 * Serate extra Natale 2026 (21–27 dic, 21:00 Rome).
 * 25 dic assente di proposito.
 * Visibili / attive solo in quella settimana (vedi isSerataXmasScheduleLive).
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

/** Finestra calendario Rome in cui programmazione Natale è pubblica. */
export const SERATA_XMAS_VISIBLE = { startDate: "2026-12-21", endDate: "2026-12-27" } as const;

const SW_POSTER_V = "20261128sw1";
function swFilmPosterUrl(slug: string) {
  return `${cdnUrl(`/images/starwars/posters/${slug}.jpg`)}?v=${SW_POSTER_V}`;
}

/**
 * Serate film Star Wars (sabati, 21:00 Rome). Allineato al calendario bot.
 * Visibili / attive solo con evento SW pubblico (vedi isSerataSwScheduleLive).
 * 26 dic e 6 feb assenti (skip).
 */
export const SERATA_SW_NIGHTS: SerataNight[] = [
  {
    id: "2026-12-05",
    date: "2026-12-05",
    title: "La minaccia fantasma",
    synopsis:
      "Due Jedi indagano su una crisi commerciale e incontrano Anakin Skywalker, un bambino con un destino legato alla Forza. Inizia l’ascesa di Darth Sidious e delle Guerre dei Cloni.",
    poster: swFilmPosterUrl("la-minaccia-fantasma"),
  },
  {
    id: "2026-12-12",
    date: "2026-12-12",
    title: "L'attacco dei cloni",
    synopsis:
      "Dieci anni dopo, la Repubblica è sull’orlo della guerra civile. Anakin e Padmé si avvicinano mentre Obi-Wan scopre un esercito di cloni e un complotto che cambia la galassia.",
    poster: swFilmPosterUrl("lattacco-dei-cloni"),
  },
  {
    id: "2026-12-19",
    date: "2026-12-19",
    title: "La vendetta dei Sith",
    synopsis:
      "La Guerra dei Cloni volge al termine. Anakin cade nel Lato Oscuro, l’Ordine Jedi viene tradito e nasce Darth Vader: la Repubblica diventa Impero.",
    poster: swFilmPosterUrl("la-vendetta-dei-sith"),
  },
  {
    id: "2027-01-02",
    date: "2027-01-02",
    title: "Rogue One",
    synopsis:
      "Un gruppo di ribelli rischia tutto per rubare i piani della Morte Nera. Una missione disperata che rende possibile Una nuova speranza.",
    poster: swFilmPosterUrl("rogue-one"),
  },
  {
    id: "2027-01-09",
    date: "2027-01-09",
    title: "Una nuova speranza",
    synopsis:
      "Luke Skywalker lascia Tatooine, si unisce alla Ribellione e, con Han Solo e la Principessa Leia, affronta l’Impero per distruggere la Morte Nera.",
    poster: swFilmPosterUrl("una-nuova-speranza"),
  },
  {
    id: "2027-01-16",
    date: "2027-01-16",
    title: "L'impero colpisce ancora",
    synopsis:
      "L’Impero insegue i Ribelli. Luke si allena con Yoda su Dagobah, mentre Han e Leia fuggono da Vader: un confronto che rivela una verità devastante.",
    poster: swFilmPosterUrl("limpero-colpisce-ancora"),
  },
  {
    id: "2027-01-23",
    date: "2027-01-23",
    title: "Il ritorno dello Jedi",
    synopsis:
      "Luke affronta Vader e l’Imperatore mentre i Ribelli attaccano la nuova Morte Nera. Redenzione, sacrificio e la fine della Guerra Civile Galattica.",
    poster: swFilmPosterUrl("il-ritorno-dello-jedi"),
  },
  {
    id: "2027-01-30",
    date: "2027-01-30",
    title: "Il risveglio della forza",
    synopsis:
      "Trent’anni dopo, Rey, Finn e Poe si ritrovano nella lotta contro il Primo Ordine. Una mappa porta a Luke Skywalker e a un nuovo capitolo della saga.",
    poster: swFilmPosterUrl("il-risveglio-della-forza"),
  },
  {
    id: "2027-02-13",
    date: "2027-02-13",
    title: "Gli ultimi Jedi",
    synopsis:
      "Rey cerca di convincere Luke a tornare. Mentre la Resistenza fugge dal Primo Ordine, Kylo Ren e Snoke mettono alla prova lealià e speranza.",
    poster: swFilmPosterUrl("gli-ultimi-jedi"),
  },
  {
    id: "2027-02-20",
    date: "2027-02-20",
    title: "L'ascesa di Skywalker",
    synopsis:
      "La Resistenza affronta l’ultima minaccia dei Sith. Rey e Kylo Ren chiudono il cerchio della dinastia Skywalker in uno scontro decisivo.",
    poster: swFilmPosterUrl("lascesa-di-skywalker"),
  },
];

/** True mentre l’evento Star Wars è aperto al pubblico (1 dic 12:00 → 28 feb 21:00 Rome). */
export function isSerataSwScheduleLive(now = Date.now()): boolean {
  return isEventoPublicWindowOpen(new Date(now));
}

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

/**
 * True solo nella settimana Natale (21–27 dic Rome), più la live window
 * dell'ultima serata se sconfina oltre la mezzanotte del 27.
 */
export function isSerataXmasScheduleLive(now = Date.now(), event: SerataEvent = SERATA_EVENT): boolean {
  const tz = event.timezone || "Europe/Rome";
  const p = zonedParts(now, tz);
  const key = `${p.year}-${String(p.month).padStart(2, "0")}-${String(p.day).padStart(2, "0")}`;
  if (key >= SERATA_XMAS_VISIBLE.startDate && key <= SERATA_XMAS_VISIBLE.endDate) return true;
  const last = SERATA_XMAS_NIGHTS[SERATA_XMAS_NIGHTS.length - 1];
  if (!last) return false;
  const start = nightStartMs(last, event);
  return Number.isFinite(start) && now >= start && now - start < LIVE_WINDOW_MS;
}

function nextRecurringSaturdayMs(event: SerataEvent, now: number): number {
  const tz = event.timezone || "Europe/Rome";
  const wantWd = Math.max(0, Math.min(6, Math.floor(Number(event.recurring?.weekday) || 6)));
  const wantH = Math.max(0, Math.min(23, Math.floor(Number(event.recurring?.hour) ?? 21)));
  const wantM = Math.max(0, Math.min(59, Math.floor(Number(event.recurring?.minute) || 0)));
  const p = zonedParts(now, tz);
  const daysAhead = (wantWd - p.weekday + 7) % 7;
  let d = new Date(Date.UTC(p.year, p.month - 1, p.day + daysAhead));
  let target = localZonedToUtcMs(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), wantH, wantM, tz);
  if (target <= now) {
    d = new Date(Date.UTC(p.year, p.month - 1, p.day + daysAhead + 7));
    target = localZonedToUtcMs(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), wantH, wantM, tz);
  }
  return target;
}

/** Sabato ricorrente in corso (entro LIVE_WINDOW_MS), altrimenti null. */
function liveRecurringSaturdayMs(event: SerataEvent, now: number): number | null {
  const tz = event.timezone || "Europe/Rome";
  const wantWd = Math.max(0, Math.min(6, Math.floor(Number(event.recurring?.weekday) || 6)));
  const wantH = Math.max(0, Math.min(23, Math.floor(Number(event.recurring?.hour) ?? 21)));
  const wantM = Math.max(0, Math.min(59, Math.floor(Number(event.recurring?.minute) || 0)));
  const p = zonedParts(now, tz);
  const daysSince = (p.weekday - wantWd + 7) % 7;
  const d = new Date(Date.UTC(p.year, p.month - 1, p.day - daysSince));
  const start = localZonedToUtcMs(d.getUTCFullYear(), d.getUTCMonth() + 1, d.getUTCDate(), wantH, wantM, tz);
  if (!Number.isFinite(start)) return null;
  if (now >= start && now - start < LIVE_WINDOW_MS) return start;
  return null;
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
    synopsis: String(event.filmSynopsis || "").trim(),
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

/** Serata attiva (live window) o prossima: Natale > Star Wars > sabato ricorrente. */
export function resolveSerata(event: SerataEvent = SERATA_EVENT, now = Date.now()): ResolvedSerata {
  const iso = String(event.overrideIso || "").trim();
  if (iso) {
    const t = Date.parse(iso);
    if (Number.isFinite(t) && (t > now || (now >= t && now - t < LIVE_WINDOW_MS))) {
      return asDefaultResolved(t, event);
    }
  }

  const scheduleNights = isSerataXmasScheduleLive(now, event)
    ? SERATA_XMAS_NIGHTS
    : isSerataSwScheduleLive(now)
      ? SERATA_SW_NIGHTS
      : [];
  const scheduled = scheduleNights
    .map((night) => ({ night, startMs: nightStartMs(night, event) }))
    .filter((x) => Number.isFinite(x.startMs));

  const liveNight = scheduled.find((x) => now >= x.startMs && now - x.startMs < LIVE_WINDOW_MS);
  if (liveNight) return asNightResolved(liveNight.night, liveNight.startMs);

  /* Sabato ricorrente: dopo le 21:00 nextRecurring salta alla settimana dopo —
     senza questo blocco la UI non passa mai in “Serata in corso” e non si può avviare. */
  const satLive = liveRecurringSaturdayMs(event, now);
  if (satLive != null) {
    const liveParts = zonedParts(satLive, event.timezone || "Europe/Rome");
    const liveKey = `${liveParts.year}-${String(liveParts.month).padStart(2, "0")}-${String(liveParts.day).padStart(2, "0")}`;
    if (!scheduled.some((x) => x.night.date === liveKey)) {
      return asDefaultResolved(satLive, event);
    }
  }

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
