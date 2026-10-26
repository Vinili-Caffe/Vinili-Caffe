// Notifiche in-app: /webhooks/site-notifications (+ preferenze via site-profile-extras).
// Inbox staff: site-staff-access + site-staff-workflows (code candidature / appelli / revisione).

export type NotifKind =
  | "info"
  | "success"
  | "vote"
  | "vote_reminder"
  | "review"
  | "mod"
  | "staff"
  | "suggestion"
  | "confessionale"
  | "web_ticket"
  | "web_ticket_mention"
  | "web_ticket_sla"
  | "workflow_decision"
  | "workflow_mention";

export type SiteNotification = {
  id: string;
  title: string;
  body: string;
  at: number;
  read: boolean;
  kind: NotifKind | string;
  openUrl: string;
  filtered: boolean;
  channel?: string;
  dedupeKey?: string;
};

export type NotifFilter = "all" | "unread" | "filtered";

export type PrefToggle = { key: string; label: string; hint?: string; enabled: boolean };
export type NotifPrefs = {
  dm: { blockAll: boolean; categories: PrefToggle[] } | null;
  siteNotif: { groups: PrefToggle[]; digests?: PrefToggle[] } | null;
};

export type StaffQueue = "candidature" | "appelli" | "revisione";
export type StaffSummary = {
  candidature: number;
  appelli: number;
  revisione: number;
  pause?: number;
  resoconti?: number;
};
export type StaffPermissions = {
  highStaff?: boolean;
  candidatureReview?: boolean;
  appelliReview?: boolean;
  boardsReview?: boolean;
  director?: boolean;
  canViewResoconti?: boolean;
};
export type WorkflowItem = {
  recordId: string;
  dedupeKey?: string;
  userId?: string;
  displayName: string;
  avatarUrl?: string;
  title: string;
  preview?: string;
  createdAt: string | null;
  status: string;
  statusLabel?: string;
  canAct?: boolean;
};

type Res<T> = { ok: true; data: T } | { ok: false; message: string };

const NOTIF = "/webhooks/site-notifications";
const EXTRAS = "/webhooks/site-profile-extras";
const STAFF_ACCESS = "/webhooks/site-staff-access";
const WORKFLOWS = "/webhooks/site-staff-workflows";

async function sleep(ms: number) {
  await new Promise((r) => setTimeout(r, ms));
}

/** Retry su 502/503/504 (es. restart breve di site-api) — evita errore rosso in console. */
async function call<T>(path: string, token: string, init: { method?: string; body?: unknown } = {}): Promise<Res<T>> {
  // niente fetch offline: il browser loggherebbe ERR_INTERNET_DISCONNECTED
  try {
    if (typeof navigator !== "undefined" && navigator.onLine === false) {
      return { ok: false, message: "Connessione instabile: riprova." };
    }
  } catch {
    /* ignore */
  }
  const method = init.method ?? "GET";
  const maxAttempts = method === "GET" ? 3 : 1;
  let lastNet = false;
  for (let attempt = 1; attempt <= maxAttempts; attempt += 1) {
    try {
      const r = await fetch(path, {
        method,
        cache: "no-store",
        credentials: "omit",
        headers: {
          Accept: "application/json",
          Authorization: `Bearer ${token}`,
          ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}),
        },
        body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
      });
      if (r.status === 401) return { ok: false, message: "Sessione scaduta: accedi di nuovo." };
      if (r.status === 429) return { ok: false, message: "Troppe richieste. Riprova tra poco." };
      if ((r.status === 502 || r.status === 503 || r.status === 504) && attempt < maxAttempts) {
        await sleep(350 * attempt);
        continue;
      }
      const j = await r.json().catch(() => null);
      if (!j || !j.ok) return { ok: false, message: j?.message || "Operazione non riuscita." };
      return { ok: true, data: j as T };
    } catch {
      lastNet = true;
      if (attempt < maxAttempts) {
        await sleep(350 * attempt);
        continue;
      }
    }
  }
  return { ok: false, message: lastNet ? "Connessione instabile: riprova." : "Operazione non riuscita." };
}

function normalizeKind(raw: unknown, title: string, body: string): string {
  const k = String(raw || "info").trim().toLowerCase();
  if (k === "web_ticket" || k === "web_ticket_mention") return "web_ticket";
  if (k === "vote" && /promemoria/i.test(`${title} ${body}`)) return "vote_reminder";
  return k || "info";
}

function mapRow(row: Record<string, unknown>): SiteNotification | null {
  const id = String(row?.id || "").trim();
  const title = String(row?.title || "").trim();
  if (!id || !title) return null;
  const body = String(row?.body || "");
  return {
    id,
    title,
    body,
    at: typeof row.at === "number" ? row.at : Date.now(),
    read: row.read === true || Boolean(row.readAt),
    kind: normalizeKind(row.kind, title, body),
    openUrl: typeof row.openUrl === "string" ? row.openUrl.trim() : "",
    filtered: Boolean(row.filtered),
    channel: String(row.channel || "").toLowerCase() || undefined,
    dedupeKey: String(row.dedupeKey || "").trim() || undefined,
  };
}

/** Come il JS vecchio: le alert di coda inbox non compaiono nella lista personali. */
export function isInboxLinked(n: SiteNotification): boolean {
  const key = String(n.dedupeKey || n.id || "").toLowerCase();
  const ch = String(n.channel || "").toLowerCase();
  const kind = String(n.kind || "").toLowerCase();
  const url = String(n.openUrl || "").toLowerCase();
  const title = String(n.title || "").trim();
  const hay = `${n.title} ${n.body}`.toLowerCase();

  if (kind === "workflow_decision" || /^(cand-|unban-|unmute-|cand-pex-|cand-rej-|wfc:decision:|appeal-auto-close:)/.test(key)) {
    return false;
  }
  if (
    /^web_ticket:(staff_reply|needs_reply|closed|claimed|close-request|close-rejected|event):/.test(key) ||
    (ch === "personal" && (kind === "web_ticket" || kind === "web_ticket_mention"))
  ) {
    return false;
  }

  if (/^staff-(pex|depex):.+:team$/.test(key) || (/\/staff\/organico\/?/.test(url) && /^(pex|depex):\s+\S/i.test(title))) return true;
  if (kind === "confessionale" || /^confessionale:/.test(key) || /\/staff\/confessionale\//.test(url)) return true;
  if (/^compiti:/.test(key) || /\/staff\/compiti\/?/.test(url) || /^compito\b/.test(title.toLowerCase()) || /scadenza compiti/.test(title.toLowerCase())) {
    return true;
  }
  if (/^pt-removed:/.test(key) || /^pt-review:/.test(key) || /punto partnership rimosso|punti tolti\s*[—\-–]?\s*(rimozione confermata|segnalazione negata)/.test(hay)) {
    return true;
  }
  if (kind === "web_ticket_sla" || /^web_ticket:sla:/.test(key)) return true;
  if (/^web_ticket:queue:/.test(key) || /^web_ticket:chat:/.test(key)) return true;
  if ((kind === "web_ticket" || kind === "web_ticket_mention") && /\/tickets\//.test(url) && /(?:\?|&)view=staff\b/.test(url)) return true;
  if (/^rev-new:/.test(key) || (kind === "review" && /^nuova recensione\b/i.test(title))) return true;
  if (/^suggestion:new:/.test(key) || /^bot_feedback_new:/.test(key) || (kind === "suggestion" && /^(nuovo|nuova)\s+(suggerimento|segnalazione|bug)\b/i.test(title))) {
    return true;
  }
  if ((kind === "web_ticket_mention" || kind === "workflow_mention" || /^web_ticket:mention:/.test(key) || /^wfc:mention:/.test(key)) && ch !== "personal") {
    return true;
  }
  if (ch === "inbox") return true;
  if (/^inbox:(pause|candidature|appelli|resoconti|revisione)(?::|$)/.test(key) || /^pt-pending:/.test(key) || /^wfc:(invite|remove|msg):staff:/.test(key)) {
    return true;
  }
  if (/[?&]inbox=(pause|candidature|appelli|resoconti|punti-tolti|revisione)\b/.test(url)) {
    return /nuovo resoconto|nuovo appello|nuova candidatur|nuova richiesta pausa|nuova scheda|scheda bacheca|in revisione|punti tolti\s*[—\-–]?\s*segnalazione in attesa|richiedente in chat/.test(hay);
  }
  return false;
}

/** Conferme voto Top.gg/Discadia: non in lista personali (solo promemoria). */
export function isVoteRegistered(n: SiteNotification): boolean {
  const kind = String(n.kind || "").toLowerCase();
  const hay = `${n.title} ${n.body}`.toLowerCase();
  if (kind === "vote_reminder" || /promemoria|puoi votare di nuovo|reminder/.test(hay)) return false;
  if (kind === "vote") return true;
  if (/voto\s+(su\s+)?(top\.?gg|discadia)\s+registrato/.test(hay)) return true;
  if (/voto registrato/.test(hay) && /(top\.?gg|discadia)/.test(hay)) return true;
  return false;
}

export type PersonalCatId =
  | "votes"
  | "tickets"
  | "candidature"
  | "appelli"
  | "revisione"
  | "reviews"
  | "feedback"
  | "confessionale"
  | "staff"
  | "community"
  | "system";

export const PERSONAL_CATS: { id: PersonalCatId; label: string }[] = [
  { id: "votes", label: "Voti" },
  { id: "tickets", label: "Ticket" },
  { id: "candidature", label: "Candidature" },
  { id: "appelli", label: "Appelli" },
  { id: "revisione", label: "Bacheca" },
  { id: "reviews", label: "Recensioni" },
  { id: "feedback", label: "Feedback" },
  { id: "confessionale", label: "Confessioni" },
  { id: "staff", label: "Eventi staff" },
  { id: "community", label: "Community" },
  { id: "system", label: "Sistema" },
];

export function personalCategory(n: SiteNotification): PersonalCatId {
  const kind = String(n.kind || "info").toLowerCase();
  const key = String(n.dedupeKey || n.id || "").toLowerCase();
  if (kind === "vote" || kind === "vote_reminder") return "votes";
  if (kind === "web_ticket" || kind === "web_ticket_mention") return "tickets";
  if (kind === "web_ticket_mention" || kind === "workflow_mention" || /^web_ticket:mention:/.test(key) || /^wfc:mention:/.test(key)) {
    return "tickets";
  }
  if (kind === "workflow_decision" || /^(cand-|unban-|unmute-|cand-pex-|cand-rej-|wfc:decision:|appeal-auto-close:)/.test(key)) {
    const hay = `${key} ${n.openUrl}`.toLowerCase();
    if (/appelli|unban|unmute|appeal/.test(hay)) return "appelli";
    if (/revisione|bacheca|scheda (server|bot)/.test(hay)) return "revisione";
    return "candidature";
  }
  if (kind === "review") return "reviews";
  if (kind === "suggestion") return "feedback";
  if (kind === "confessionale" || /^confessionale:/.test(key) || /\/staff\/confessionale\//.test(n.openUrl || "")) return "confessionale";
  if (kind === "staff") return "staff";
  if (kind === "mod" || kind === "success") return "community";
  return "system";
}

export const KIND_LABEL: Record<string, string> = {
  vote: "Voto",
  vote_reminder: "Promemoria",
  success: "Successo",
  review: "Recensione",
  mod: "Moderazione",
  staff: "Eventi staff",
  confessionale: "Confessioni",
  suggestion: "Feedback",
  contest: "Contest",
  web_ticket: "Ticket",
  info: "Info",
};

export const VOTE_DM_KEYS = new Set(["bump", "vote_topgg"]);
export const DISCORD_DM_KEYS = new Set(["broadcast", "invites", "perks"]);
export const DM_LABEL_OVERRIDE: Record<string, string> = {
  bump: "Discadia",
  vote_topgg: "Top.gg",
  broadcast: "Avvisi staff",
  invites: "Inviti",
  perks: "Livelli e perk",
};
export const STAFF_ONLY_SITE_KEYS = new Set(["staff", "ticket_sla", "confessionale"]);

export function filterPersonal(items: SiteNotification[], mode: NotifFilter): SiteNotification[] {
  const base = items.filter((n) => n && !isInboxLinked(n) && !isVoteRegistered(n));
  if (mode === "filtered") return base.filter((n) => n.filtered);
  const active = base.filter((n) => !n.filtered);
  if (mode === "unread") return active.filter((n) => !n.read);
  return active;
}

/** Campanella: tutte, comprese le notifiche staff; fuori solo conferme di voto e tipi silenziati. */
export function filterBell(items: SiteNotification[]): SiteNotification[] {
  return items.filter((n) => n && !isVoteRegistered(n) && !n.filtered);
}

export function timeAgoNotif(atMs: number, now = Date.now()): string {
  const s = Math.floor((now - atMs) / 1000);
  if (s < 45) return "Ora";
  const m = Math.floor(s / 60);
  if (m < 60) return m === 1 ? "1 minuto fa" : `${m} minuti fa`;
  const h = Math.floor(m / 60);
  if (h < 24) return h === 1 ? "1 ora fa" : `${h} ore fa`;
  const d = Math.floor(h / 24);
  if (d < 7) return d === 1 ? "1 giorno fa" : `${d} giorni fa`;
  return "Più di una settimana fa";
}

export function resolveDestUrl(dest: string): string {
  const u = String(dest || "").trim();
  if (!u) return "";
  if (/^https?:\/\//i.test(u)) return u;
  try {
    return new URL(u, typeof location !== "undefined" ? location.origin : "https://www.viniliecaffe.it").href;
  } catch {
    return u;
  }
}

export function shouldOpenInNewTab(href: string, kind: string): boolean {
  const k = String(kind || "").toLowerCase();
  if (k !== "vote" && k !== "vote_reminder") return false;
  try {
    const host = new URL(href, typeof location !== "undefined" ? location.origin : "https://www.viniliecaffe.it").hostname.toLowerCase();
    return host.includes("top.gg") || host.includes("discadia.com");
  } catch {
    return false;
  }
}

export async function loadNotifications(token: string, limit = 50): Promise<Res<{ items: SiteNotification[]; unread?: number; total?: number }>> {
  const r = await call<{ items?: unknown[]; unread?: number; unreadCount?: number; total?: number }>(`${NOTIF}?limit=${limit}`, token);
  if (!r.ok) return r;
  const items = (Array.isArray(r.data.items) ? r.data.items : [])
    .map((row) => mapRow((row && typeof row === "object" ? row : {}) as Record<string, unknown>))
    .filter((x): x is SiteNotification => Boolean(x));
  // API già newest-first; riordina comunque per sicurezza (campanella / lista)
  items.sort((a, b) => Number(b.at || 0) - Number(a.at || 0));
  const unread = Number(r.data.unread ?? r.data.unreadCount);
  return {
    ok: true,
    data: {
      items,
      unread: Number.isFinite(unread) ? unread : items.filter((n) => !n.read).length,
      total: r.data.total,
    },
  };
}

export const markNotifRead = (token: string, id: string) => call<{ updated?: boolean }>(`${NOTIF}/read`, token, { method: "POST", body: { id } });
export const markAllNotifsRead = (token: string) => call<{ modified?: number }>(`${NOTIF}/read`, token, { method: "POST", body: { all: true } });
/** Visita pagina/discussione/ticket → il server marca le notif che puntano lì (come sito vecchio). */
export const markNotifsForPage = (
  token: string,
  pageUrl: string,
  extra?: { ids?: string[]; ticketIds?: string[]; openUrls?: string[] },
) =>
  call<{ modified?: number; updated?: boolean }>(`${NOTIF}/read`, token, {
    method: "POST",
    body: {
      pageUrl,
      ids: extra?.ids ?? [],
      ticketIds: extra?.ticketIds ?? [],
      openUrls: extra?.openUrls ?? [],
    },
  });
export const deleteNotif = (token: string, id: string) => call<{ deleted?: boolean }>(`${NOTIF}/delete`, token, { method: "POST", body: { id } });
export const clearAllNotifs = (token: string) => call<{ deleted?: number }>(`${NOTIF}/clear`, token, { method: "POST", body: {} });

export async function loadNotifPrefs(token: string): Promise<Res<NotifPrefs>> {
  const r = await call<{ dm?: NotifPrefs["dm"]; siteNotif?: NotifPrefs["siteNotif"] }>(EXTRAS, token);
  if (!r.ok) return r;
  return {
    ok: true,
    data: {
      dm: r.data.dm ?? null,
      siteNotif: r.data.siteNotif ?? null,
    },
  };
}

export async function mutateNotifPrefs(
  token: string,
  body: { section: "dm" | "site_notif"; action: string; key?: string },
): Promise<Res<NotifPrefs & { message?: string }>> {
  const r = await call<{ dm?: NotifPrefs["dm"]; siteNotif?: NotifPrefs["siteNotif"]; message?: string }>(EXTRAS, token, {
    method: "POST",
    body,
  });
  if (!r.ok) return r;
  return {
    ok: true,
    data: {
      dm: r.data.dm ?? null,
      siteNotif: r.data.siteNotif ?? null,
      message: r.data.message,
    },
  };
}

export async function checkStaffAccess(token: string): Promise<boolean> {
  const r = await call<{ ok?: boolean }>(STAFF_ACCESS, token);
  return r.ok;
}

export async function loadStaffSummary(token: string): Promise<Res<{ summary: StaffSummary; permissions: StaffPermissions }>> {
  const r = await call<{ summary?: StaffSummary; permissions?: StaffPermissions }>(`${WORKFLOWS}?queue=summary`, token);
  if (!r.ok) return r;
  return {
    ok: true,
    data: {
      summary: r.data.summary ?? { candidature: 0, appelli: 0, revisione: 0 },
      permissions: r.data.permissions ?? {},
    },
  };
}

export async function loadStaffQueue(
  token: string,
  queue: StaffQueue,
  opts: { scope?: string; filter?: string; page?: number; pageSize?: number } = {},
): Promise<Res<{ items: WorkflowItem[]; summary?: StaffSummary; permissions?: StaffPermissions }>> {
  const q = new URLSearchParams({
    queue,
    scope: opts.scope || "pending",
    page: String(opts.page || 1),
    pageSize: String(opts.pageSize || 10),
  });
  if (opts.filter) q.set("filter", opts.filter);
  const r = await call<{ items?: WorkflowItem[]; summary?: StaffSummary; permissions?: StaffPermissions }>(`${WORKFLOWS}?${q}`, token);
  if (!r.ok) return r;
  return {
    ok: true,
    data: {
      items: Array.isArray(r.data.items) ? r.data.items : [],
      summary: r.data.summary,
      permissions: r.data.permissions,
    },
  };
}

export const STAFF_TABS: { id: StaffQueue; label: string; perm: keyof StaffPermissions }[] = [
  { id: "candidature", label: "Candidature", perm: "candidatureReview" },
  { id: "appelli", label: "Appelli", perm: "appelliReview" },
  { id: "revisione", label: "Revisione", perm: "boardsReview" },
];

export const QUEUE_FILTERS: Record<StaffQueue, { id: string; label: string }[]> = {
  candidature: [
    { id: "", label: "Tutte" },
    { id: "helper", label: "Helper" },
    { id: "partnermanager", label: "Partner Manager" },
  ],
  appelli: [
    { id: "", label: "Tutti" },
    { id: "unban", label: "Unban" },
    { id: "unmute", label: "Unmute" },
  ],
  revisione: [
    { id: "", label: "Tutte" },
    { id: "server", label: "Server" },
    { id: "bot", label: "Bot" },
  ],
};
