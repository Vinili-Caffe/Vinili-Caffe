const {
  parseDateStartMs: parseEventDateStartMs,
  parseDateEndMs: parseEventDateEndMs,
} = require("./hogwartsSortingConfig");

const DEFAULT_PAGES = Object.freeze([
  { id: "hub", label: "Calendario", path: "/evento", icon: "fa-calendar" },
  { id: "sorting", label: "Smistamento", path: "/evento/smistamento", icon: "fa-magic" },
  { id: "points", label: "Coppa", path: "/evento/coppa", icon: "fa-trophy" },
  { id: "shop", label: "Shop", path: "/evento/shop", icon: "fa-shopping-bag" },
  { id: "potions", label: "Pozioni", path: "/evento/pozioni", icon: "fa-flask" },
]);

const DEFAULT_WEEKS = Object.freeze([
  {
    key: "2026-06-01_2026-06-07",
    label: "1ª settimana",
    rangeLabel: "1 – 7 giugno 2026 · 1º anno",
    start: "2026-06-01",
    end: "2026-06-07",
    activities: [
      { title: "Inizio 1º anno", summary: "Lunedì 1° Giugno | Attivazione dello smistamento e assegnazione di 250 galeoni.", pageId: "sorting", icon: "fa-magic" },
      
      { title: "Minigames a tema", summary: "Minigame quiz su argomenti Harry Potter attivi nel server.", icon: "fa-question-circle" },
      { title: "Serata Film", summary: "Sabato 6 Giugno | Harry Potter e la Pietra Filosofale.", icon: "fa-film" },
    ],
  },
  {
    key: "2026-06-08_2026-06-14",
    label: "2ª settimana",
    rangeLabel: "8 – 14 giugno 2026 · 1º anno",
    start: "2026-06-08",
    end: "2026-06-14",
    activities: [
      { title: "Serata Film", summary: "Sabato 13 Giugno | Harry Potter e la Camera dei Segreti.", icon: "fa-film" },
      { title: "Risultati anno accademico", summary: "Domenica 14 Giugno | Classifica attività delle due settimane.", pageId: "points", icon: "fa-trophy" },
      { title: "Fine 1º anno", summary: "Termine del primo anno accademico.", icon: "fa-graduation-cap" },
    ],
  },
  {
    key: "2026-06-15_2026-06-21",
    label: "3ª settimana",
    rangeLabel: "15 – 21 giugno 2026 · 2º anno",
    start: "2026-06-15",
    end: "2026-06-21",
    activities: [
      { title: "Inizio 2º anno", summary: "Lunedì 15 Giugno | Caccia alla pergamena: il bot segnala un messaggio in un canale, vince chi lo trova per primo.", icon: "fa-search" },
      { title: "Evento | Sezione proibita", summary: "Sabato 20 Giugno | Evento Avventura nella Sezione Proibita.", icon: "fa-book" },
    ],
  },
  {
    key: "2026-06-22_2026-06-28",
    label: "4ª settimana",
    rangeLabel: "22 – 28 giugno 2026 · 2º anno",
    start: "2026-06-22",
    end: "2026-06-28",
    activities: [
      { title: "Serata Film", summary: "Sabato 27 Giugno | Harry Potter e il Prigioniero di Azkaban.", icon: "fa-film" },
      { title: "Risultati anno accademico", summary: "Domenica 28 Giugno | Classifica attività delle due settimane.", pageId: "points", icon: "fa-trophy" },
      { title: "Fine 2º anno", summary: "Termine del secondo anno accademico.", icon: "fa-graduation-cap" },
    ],
  },
  {
    key: "2026-06-29_2026-07-05",
    label: "5ª settimana",
    rangeLabel: "29 giugno – 5 luglio 2026 · 3º anno",
    start: "2026-06-29",
    end: "2026-07-05",
    activities: [
      { title: "Inizio 3º anno", summary: "Lunedì 29 Giugno | Memoria emoji: il bot invia una sequenza in chat, poi la rimuove — riscrivila per vincere.", icon: "fa-th" },
      { title: "Risultati mensili", summary: "Mercoledì 1° Luglio | Classifica attività del mese.", pageId: "points", icon: "fa-calendar" },
      { title: "Serata Film", summary: "Sabato 4 Luglio | Harry Potter e il Calice di Fuoco.", icon: "fa-film" },
    ],
  },
  {
    key: "2026-07-06_2026-07-12",
    label: "6ª settimana",
    rangeLabel: "6 – 12 luglio 2026 · 3º anno",
    start: "2026-07-06",
    end: "2026-07-12",
    activities: [
      { title: "Evento | Premi la reaction", summary: "Sabato 11 Luglio | Reazioni casuali in #chat: il primo che clicca vince punti casa e Galeoni personali. Durata di un mese.", icon: "fa-heart" },
      { title: "Risultati anno accademico", summary: "Domenica 12 Luglio | Classifica attività delle due settimane.", pageId: "points", icon: "fa-trophy" },
      { title: "Fine 3º anno", summary: "Termine del terzo anno accademico.", icon: "fa-graduation-cap" },
    ],
  },
  {
    key: "2026-07-13_2026-07-19",
    label: "7ª settimana",
    rangeLabel: "13 – 19 luglio 2026 · 4º anno",
    start: "2026-07-13",
    end: "2026-07-19",
    activities: [
      { title: "Inizio 4º anno", summary: "Lunedì 13 Luglio | Minigame Parole cifrate attivo nel server.", icon: "fa-lock" },
      { title: "Serata Film", summary: "Sabato 18 Luglio | Harry Potter e l'Ordine della Fenice.", icon: "fa-film" },
    ],
  },
  {
    key: "2026-07-20_2026-07-26",
    label: "8ª settimana",
    rangeLabel: "20 – 26 luglio 2026 · 4º anno",
    start: "2026-07-20",
    end: "2026-07-26",
    activities: [
      { title: "Serata Film", summary: "Sabato 25 Luglio | Harry Potter e il Principe Mezzosangue.", icon: "fa-film" },
      { title: "Risultati anno accademico", summary: "Domenica 26 Luglio | Classifica attività delle due settimane.", pageId: "points", icon: "fa-trophy" },
      { title: "Fine 4º anno", summary: "Termine del quarto anno accademico.", icon: "fa-graduation-cap" },
    ],
  },
  {
    key: "2026-07-27_2026-08-02",
    label: "9ª settimana",
    rangeLabel: "27 luglio – 2 agosto 2026 · 5º anno",
    start: "2026-07-27",
    end: "2026-08-02",
    activities: [
      { title: "Inizio 5º anno", summary: "Lunedì 27 Luglio | Minigame Ristruttura la Torre di osservazione.", icon: "fa-eye" },
      { title: "Risultati mensili", summary: "Sabato 1° Agosto | Classifica attività del mese.", pageId: "points", icon: "fa-calendar" },
      { title: "Evento | Double EXP", summary: "Sabato 1° Agosto | Doppia exp per tutto il mese di Agosto.", icon: "fa-bolt" },
    ],
  },
  {
    key: "2026-08-03_2026-08-09",
    label: "10ª settimana",
    rangeLabel: "3 – 9 agosto 2026 · 5º anno",
    start: "2026-08-03",
    end: "2026-08-09",
    activities: [
      { title: "Serata Film", summary: "Sabato 8 Agosto | Harry Potter e i Doni della Morte — Parte 1.", icon: "fa-film" },
      { title: "Risultati anno accademico", summary: "Domenica 9 Agosto | Classifica attività delle due settimane.", pageId: "points", icon: "fa-trophy" },
      { title: "Fine 5º anno", summary: "Termine del quinto anno accademico.", icon: "fa-graduation-cap" },
    ],
  },
  {
    key: "2026-08-10_2026-08-16",
    label: "11ª settimana",
    rangeLabel: "10 – 16 agosto 2026 · 6º anno",
    start: "2026-08-10",
    end: "2026-08-16",
    activities: [
      { title: "Inizio 6º anno", summary: "Lunedì 10 Agosto | Economia Galeoni attiva: +daily, +weekly, +monthly, +work, +bal, +rob, +pay, +duel, +roulette, +blackjack, +slots, +rps, +scratch, +coinflip, +tris.", pageId: "shop", icon: "fa-money" },
      { title: "Shop 6º anno", summary: "Boost exp e punti casa disponibili nell'Emporio Gringott.", pageId: "shop", icon: "fa-shopping-bag" },
      { title: "Fine Premi la reaction", summary: "Martedì 11 Agosto | Termine dell'evento: classifica top 3 vincitori pubblicata in #events.", pageId: "points", icon: "fa-trophy" },
      { title: "Giveaway", summary: "Dal 10 al 15 Agosto | Giveaway sostitutivo.", icon: "fa-gift" },
      { title: "Termine giveaway", summary: "Sabato 15 Agosto | Chiusura giveaway.", icon: "fa-gift" },
    ],
  },
  {
    key: "2026-08-17_2026-08-23",
    label: "12ª settimana",
    rangeLabel: "17 – 23 agosto 2026 · 6º anno",
    start: "2026-08-17",
    end: "2026-08-23",
    activities: [
      { title: "Evento | Caccia alle liste", summary: "Sabato 22 Agosto | Ogni ora due liste di incantesimi della Sezione Proibita vengono inviati in canali diversi e i primi due della stessa casa a cliccarli vincono.", icon: "fa-search" },
      { title: "Risultati anno accademico", summary: "Domenica 23 Agosto | Classifica attività delle due settimane.", pageId: "points", icon: "fa-trophy" },
      { title: "Fine 6º anno", summary: "Termine del sesto anno accademico.", icon: "fa-graduation-cap" },
    ],
  },
  {
    key: "2026-08-24_2026-08-30",
    label: "13ª settimana",
    rangeLabel: "24 – 30 agosto 2026 · 7º anno",
    start: "2026-08-24",
    end: "2026-08-30",
    activities: [
      { title: "Inizio 7º anno", summary: "Lunedì 24 Agosto | Aula Pozioni sul sito: ogni 12 ore abbina le voci richieste.", pageId: "potions", icon: "fa-flask" },
      { title: "Serata Film", summary: "Sabato 29 Agosto | Harry Potter e i Doni della Morte — Parte 2.", icon: "fa-film" },
      { title: "Risultati anno accademico", summary: "Domenica 30 Agosto | Classifica attività della settimana.", pageId: "points", icon: "fa-trophy" },
      { title: "Fine 7º anno", summary: "Termine del settimo anno accademico.", icon: "fa-graduation-cap" },
    ],
  },
  {
    key: "2026-08-31_2026-09-01",
    label: "Finale",
    rangeLabel: "1 settembre 2026",
    start: "2026-08-31",
    end: "2026-09-01",
    activities: [
      { title: "Risultati mensili", summary: "Martedì 1° Settembre | Classifica attività del mese.", pageId: "points", icon: "fa-calendar" },
      { title: "Gran finale", summary: "Martedì 1° Settembre | Podio case, classifica membri più attivi ed estrazione premio extra: la casa vincitrice partecipa a una ruota della fortuna per tutti i suoi membri.", pageId: "points", icon: "fa-trophy" },
      ],
  },
]);

function normalizeId(value) {
  return String(value || "").trim();
}

function parseDateStartMs(value, timezone) {
  return parseEventDateStartMs(value, timezone || "Europe/Rome");
}

function parseDateEndMs(value, timezone) {
  return parseEventDateEndMs(value, timezone || "Europe/Rome");
}

function absPageHref(siteBaseNoSlash, path) {
  const p = normalizeId(path);
  if (!p) return siteBaseNoSlash || "/";
  if (/^https?:\/\//i.test(p)) return p;
  const base = normalizeId(siteBaseNoSlash).replace(/\/+$/, "");
  return p.startsWith("/") ? `${base}${p}` : `${base}/${p}`;
}

function resolvePages(rawPages, siteBaseNoSlash) {
  const source = Array.isArray(rawPages) && rawPages.length ? rawPages : DEFAULT_PAGES;
  const pages = [];
  for (const raw of source) {
    if (!raw || typeof raw !== "object") continue;
    const id = normalizeId(raw.id);
    const label = normalizeId(raw.label);
    const path = normalizeId(raw.path || raw.href);
    if (!id || !label || !path) continue;
    pages.push({
      id,
      label,
      icon: normalizeId(raw.icon) || "fa-star",
      href: absPageHref(siteBaseNoSlash, path),
    });
  }
  return pages.length ? pages : DEFAULT_PAGES.map((p) => ({
    ...p,
    href: absPageHref(siteBaseNoSlash, p.path),
  }));
}

function resolveWeeks(rawWeeks, timezone = "Europe/Rome") {
  const parseStart = (v) => parseDateStartMs(v, timezone);
  const parseEnd = (v) => parseDateEndMs(v, timezone);
  const source = Array.isArray(rawWeeks) && rawWeeks.length ? rawWeeks : DEFAULT_WEEKS;
  const weeks = [];
  for (const raw of source) {
    if (!raw || typeof raw !== "object") continue;
    const start = normalizeId(raw.start || raw.startDate);
    const end = normalizeId(raw.end || raw.endDate);
    const startMs = parseStart(start);
    const endMs = parseEnd(end);
    if (!Number.isFinite(startMs) || !Number.isFinite(endMs)) continue;
    const activities = Array.isArray(raw.activities)
      ? raw.activities
          .map((a) => {
            if (!a || typeof a !== "object") return null;
            const title = normalizeId(a.title);
            if (!title) return null;
            return {
              title,
              summary: normalizeId(a.summary),
              pageId: normalizeId(a.pageId) || null,
              icon: normalizeId(a.icon) || "fa-star",
            };
          })
          .filter(Boolean)
      : [];
    weeks.push({
      key: normalizeId(raw.key) || `${start}_${end}`,
      label: normalizeId(raw.label) || "Settimana",
      rangeLabel: normalizeId(raw.rangeLabel || raw.range),
      start,
      end,
      startMs,
      endMs,
      activities,
    });
  }
  return weeks.length
    ? weeks.sort((a, b) => a.startMs - b.startMs)
    : DEFAULT_WEEKS.map((w) => ({
        ...w,
        startMs: parseStart(w.start),
        endMs: parseEnd(w.end),
      }));
}

function resolveHogwartsEventCalendar(eventRaw = {}, siteBaseNoSlash = "") {
  const raw = eventRaw?.calendar && typeof eventRaw.calendar === "object" ? eventRaw.calendar : {};
  const timezone = normalizeId(raw.timezone || eventRaw.timezone) || "Europe/Rome";
  const parseStart = (v) => parseDateStartMs(v, timezone);
  const parseEnd = (v) => parseDateEndMs(v, timezone);
  const pages = resolvePages(raw.pages, siteBaseNoSlash);
  const weeks = resolveWeeks(raw.weeks, timezone);
  const pageById = Object.fromEntries(pages.map((p) => [p.id, p]));
  const weeksForWeb = weeks.map((w) => ({
    key: w.key,
    label: w.label,
    rangeLabel: w.rangeLabel,
    start: w.start,
    end: w.end,
    startMs: w.startMs,
    endMs: w.endMs,
    activities: w.activities.map((a) => ({
      title: a.title,
      summary: a.summary,
      icon: a.icon,
      href: a.pageId && pageById[a.pageId] ? pageById[a.pageId].href : "",
    })),
  }));
  const hubStartDate = normalizeId(eventRaw.sortingStartDate || eventRaw.startDate);
  const hubEndDate = normalizeId(eventRaw.endDate);
  return {
    timezone,
    pages,
    weeks: weeksForWeb,
    enabled: eventRaw.enabled !== false,
    previewMode: eventRaw.previewMode === true,
    eventStart: hubStartDate,
    eventEnd: hubEndDate,
    eventStartMs: parseStart(hubStartDate),
    eventEndMs: parseEnd(hubEndDate),
  };
}

function pickCurrentWeekKey(weeks, nowMs = Date.now(), timezone = "Europe/Rome") {
  const list = Array.isArray(weeks) ? weeks : [];
  if (!list.length) return "";
  let todayKey = "";
  try {
    todayKey = new Intl.DateTimeFormat("en-CA", { timeZone: timezone }).format(new Date(nowMs));
  } catch {
    todayKey = new Date(nowMs).toISOString().slice(0, 10);
  }
  const todayMs = parseDateStartMs(todayKey, timezone);
  if (!Number.isFinite(todayMs)) return list[0].key;
  for (const w of list) {
    if (todayMs >= w.startMs && todayMs <= w.endMs) return w.key;
  }
  if (todayMs < list[0].startMs) return list[0].key;
  return list[list.length - 1].key;
}

function escHtml(value) {
  return String(value || "")
    .replace(/&/g, "&amp;")
    .replace(/</g, "&lt;")
    .replace(/>/g, "&gt;")
    .replace(/"/g, "&quot;");
}

function buildEventNavItemsHtml(pages, activeId, options = {}) {
  const previewMode = Boolean(options?.previewMode);
  const potionsPlayable = Boolean(options?.potionsPlayable);
  return pages
    .map((p) => {
      const active = p.id === activeId ? " vc-snav-item--active" : "";
      const locked = previewMode || (p.id === "potions" && !potionsPlayable);
      const lockAttr = locked ? ` data-vc-event-nav-id="${escHtml(p.id)}" hidden` : "";
      return `<a class="vc-snav-item vc-snav-item--event${active}"${lockAttr} href="${escHtml(p.href)}"><i class="fa ${escHtml(p.icon)}" aria-hidden="true"></i><span>${escHtml(p.label)}</span></a>`;
    })
    .join("\n          ");
}

function buildHogwartsEventNavBootHtml(eventNav) {
  const json = JSON.stringify(eventNav || {}).replace(/</g, "\\u003c");
  return `<script>window.__VC_HOGWARTS_EVENT_NAV=${json};</script>\n<script src="/js/vc-mobile-nav.js"></script>\n<script src="/js/hogwarts-event-nav.js"></script>\n<script src="/js/hogwarts-event-preview-gate.js"></script>\n`;
}

function resolvePublicHeaderPromoMode(eventRaw = {}, nowMs = Date.now()) {
  const enabled = eventRaw?.enabled !== false;
  if (!enabled) return "candidature";
  if (eventRaw?.previewMode === true) return "candidature";
  const tz = normalizeId(eventRaw?.calendar?.timezone || eventRaw?.timezone) || "Europe/Rome";
  const start = parseDateStartMs(eventRaw?.sortingStartDate || eventRaw?.startDate, tz);
  const end = parseDateEndMs(eventRaw?.endDate, tz);
  if (!Number.isFinite(start) || !Number.isFinite(end)) return "candidature";
  const now = Number(nowMs);
  if (now < start || now > end) return "candidature";
  return "event";
}

function resolveEventHeaderPromoMode(eventRaw = {}, nowMs = Date.now()) {
  return resolvePublicHeaderPromoMode(eventRaw, nowMs) === "event" ? "event" : "";
}

function buildHeaderPromoButtonHtml({ mode, eventUrl, candidatureUrl }) {
  if (!mode) return "";
  const isEvent = mode === "event";
  const href = isEvent ? eventUrl : candidatureUrl;
  const label = isEvent ? "Evento" : "Candidature";
  const badge = isEvent ? "ATTIVO" : "APERTE";
  const modClass = isEvent ? "vc-header-promo-btn--event" : "vc-header-promo-btn--candidature";
  const aria = isEvent ? "Evento Hogwarts attivo – vai al calendario" : "Candidature staff aperte";
  return `<a class="vc-header-promo-btn ${modClass}" id="vc-header-promo-btn" href="${escHtml(href)}" aria-label="${escHtml(aria)}"><span class="vc-header-promo-btn__dot" aria-hidden="true"></span><span class="vc-header-promo-btn__label">${escHtml(label)}</span><span class="vc-header-promo-btn__badge">${escHtml(badge)}</span></a>`;
}

function buildHeaderPromoClientConfig({ eventRaw = {}, eventUrl, candidatureUrl }) {
  const tz = normalizeId(eventRaw?.calendar?.timezone || eventRaw?.timezone) || "Europe/Rome";
  const hubStartDate = String(eventRaw?.sortingStartDate || eventRaw?.startDate || "").trim();
  const endDate = String(eventRaw?.endDate || "").trim();
  const startMs = parseDateStartMs(hubStartDate, tz);
  const endMs = parseDateEndMs(endDate, tz);
  return {
    eventUrl: String(eventUrl || "/evento").trim() || "/evento",
    candidatureUrl: String(candidatureUrl || "/candidature").trim() || "/candidature",
    event: {
      enabled: eventRaw?.enabled !== false,
      previewMode: eventRaw?.previewMode === true,
      startDate: hubStartDate,
      sortingStartDate: hubStartDate,
      endDate,
      startMs: Number.isFinite(startMs) ? startMs : null,
      endMs: Number.isFinite(endMs) ? endMs : null,
      timezone: tz,
    },
  };
}

function buildHeaderPromoBootHtml(clientConfig, scriptPrefix = "") {
  const json = JSON.stringify(clientConfig || {}).replace(/</g, "\\u003c");
  const src = `${scriptPrefix}js/vc-header-promo.js`;
  return `<script>window.__VC_HEADER_PROMO=${json};</script>\n<script src="${src}" defer></script>`;
}

function resolveEventHeaderIconSrc(guildIconUrl) {
  const raw = String(guildIconUrl || "").trim();
  if (!raw) return "/images/vc-header-logo.png";
  if (/^https?:\/\//i.test(raw)) return raw;
  if (raw.startsWith("/")) return raw;
  return `/${raw.replace(/^\/+/, "")}`;
}

function buildEventHeaderHtml({
  siteName,
  siteUrl,
  discordInviteUrl,
  guildIconUrl,
  navItemsHtml,
  eventNavBootHtml = "",
  userPageUrl = "/user/",
  notificationsUrl = "",
  promoButtonHtml = "",
}) {
  const headerIconSrc = escHtml(resolveEventHeaderIconSrc(guildIconUrl));
  const notifFoot = notificationsUrl
    ? `<div class="vc-notif-panel-foot" id="vc-notif-panel-foot">
                <a href="${escHtml(notificationsUrl)}" class="vc-notif-see-all" id="vc-notif-see-all">Vedi tutte le notifiche
                  <i class="fa fa-chevron-right" aria-hidden="true"></i></a>
              </div>`
    : "";
  return `<header class="fixed inset-x-0 top-0 z-50 px-4 pt-4">
    <div
      class="vc-nav-shell vc-glass mx-auto flex max-w-6xl flex-col gap-0 overflow-visible rounded-2xl border border-white/[0.08] bg-[#140f0c]/78 shadow-[0_8px_40px_rgba(0,0,0,0.48),0_0_48px_rgba(212,168,136,0.07)]">
      <div
        class="vc-header-bar grid w-full grid-cols-1 items-center gap-y-2.5 gap-x-2 px-4 py-3 sm:grid-cols-[minmax(0,1fr)_auto_minmax(0,1fr)] sm:gap-x-3 sm:px-5">
        <div class="flex min-w-0 items-center gap-2.5 justify-self-start sm:gap-3">
          <a class="vc-header-logo-link shrink-0 rounded-2xl ring-1 ring-[#d4a888]/35 transition hover:ring-[#d4a888]/55 focus-visible:outline focus-visible:outline-2 focus-visible:outline-offset-2 focus-visible:outline-[#d4a888]/60"
            href="${escHtml(discordInviteUrl)}" target="_blank" rel="noopener noreferrer" aria-label="Entra su Discord"><img
              src="${headerIconSrc}" width="40" height="40" class="vc-header-logo-img" alt="" loading="eager"
              decoding="async" /></a>
          <a class="min-w-0 truncate text-[0.7rem] font-bold uppercase tracking-[0.18em] text-white underline-offset-4 transition hover:text-[#e8c9a8] hover:underline sm:text-xs"
            href="${escHtml(siteUrl)}" aria-label="Vai alla homepage"><span class="text-emerald-300">${escHtml(siteName)}</span></a>
        </div>
        <nav
          class="vc-header-snav vc-glass flex max-w-full flex-wrap items-center justify-center justify-self-center gap-0.5 px-1.5 py-1 sm:min-w-0 sm:gap-1 sm:px-2"
          aria-label="Pagine evento Hogwarts">
          <a class="vc-snav-item vc-snav-item--event" href="${escHtml(siteUrl)}"><i class="fa fa-home"
              aria-hidden="true"></i><span>Sito</span></a>
          <span class="vc-snav-sep mx-0.5 hidden h-5 w-px shrink-0 bg-white/15 sm:inline-block"
            aria-hidden="true"></span>
          ${navItemsHtml}
        </nav>
        <div class="flex shrink-0 flex-wrap items-center justify-end gap-2 justify-self-end" id="header-quick-actions">
          ${promoButtonHtml}
          <details class="vc-notif-dropdown" id="vc-notif-dropdown">
            <summary class="vc-icon-btn vc-notif-summary relative inline-flex" aria-label="Notifiche"><i
                class="fa fa-bell-o" aria-hidden="true"></i>
              <span class="vc-notif-badge" id="vc-notif-badge" hidden aria-live="polite">0</span>
            </summary>
            <div class="vc-notif-panel" role="region" aria-label="Elenco notifiche">
              <div class="vc-notif-panel-head">
                <div class="vc-notif-panel-head-start">
                  <span class="vc-notif-panel-head-ico" aria-hidden="true"><i class="fa fa-bell-o"></i></span>
                  <div class="vc-notif-panel-head-text">
                    <span class="vc-notif-panel-title">Notifiche</span>
                    <span class="vc-notif-panel-sub" id="vc-notif-unread-sub">0 non lette</span>
                  </div>
                </div>
                <div class="vc-notif-panel-head-actions">
                  <button type="button" class="vc-notif-action" id="vc-notif-mark-all" title="Segna tutte come lette"
                    aria-label="Segna tutte come lette"><i class="fa fa-check" aria-hidden="true"></i></button>
                  <button type="button" class="vc-notif-action" id="vc-notif-clear-all" title="Elimina tutte"
                    aria-label="Elimina tutte"><i class="fa fa-trash-o" aria-hidden="true"></i></button>
                </div>
              </div>
              <div class="vc-notif-panel-body">
                <div class="vc-notif-empty-wrap" id="vc-notif-empty-wrap">
                  <div class="vc-notif-empty">
                    <div class="vc-notif-empty-ico" aria-hidden="true"><i class="fa fa-bell-o"></i></div>
                    <p class="vc-notif-empty-title">Nessuna notifica</p>
                    <p class="vc-notif-empty-sub">Sei tutto aggiornato!</p>
                  </div>
                </div>
                <div class="vc-notif-list-wrap" id="vc-notif-list-wrap">
                  <ul class="vc-notif-list" id="vc-notif-list" role="list"></ul>
                </div>
              </div>
              ${notifFoot}
            </div>
          </details>
          <button class="vc-header-pill" id="discord-login-btn" type="button">Login</button>
          <div class="header-login-state" id="discord-login-state" hidden></div>
        </div>
      </div>
    </div>
  </header>
${eventNavBootHtml}`;
}

function serializeCalendarForWeb(calendar) {
  const weeks = Array.isArray(calendar?.weeks) ? calendar.weeks : [];
  return {
    timezone: calendar?.timezone || "Europe/Rome",
    enabled: calendar?.enabled !== false,
    previewMode: Boolean(calendar?.previewMode),
    eventStart: calendar?.eventStart || "",
    eventEnd: calendar?.eventEnd || "",
    eventStartMs: calendar?.eventStartMs ?? null,
    eventEndMs: calendar?.eventEndMs ?? null,
    windowLabel: String(calendar?.windowLabel || "").trim(),
    currentWeekKey: pickCurrentWeekKey(weeks, Date.now(), calendar?.timezone),
    weeks,
    pages: Array.isArray(calendar?.pages)
      ? calendar.pages.map((p) => ({ id: p.id, label: p.label, href: p.href, icon: p.icon }))
      : [],
    potions:
      calendar?.potions && typeof calendar.potions === "object"
        ? {
            enabled: calendar.potions.enabled !== false,
            startMs: calendar.potions.startMs ?? null,
            startDate: String(calendar.potions.startDate || ""),
          }
        : null,
  };
}

module.exports = {
  DEFAULT_PAGES,
  DEFAULT_WEEKS,
  buildEventHeaderHtml,
  buildEventNavItemsHtml,
  buildHeaderPromoBootHtml,
  buildHeaderPromoButtonHtml,
  buildHeaderPromoClientConfig,
  buildHogwartsEventNavBootHtml,
  pickCurrentWeekKey,
  parseDateStartMs,
  parseDateEndMs,
  resolveHogwartsEventCalendar,
  resolvePublicHeaderPromoMode,
  resolveEventHeaderPromoMode,
  serializeCalendarForWeb,
};