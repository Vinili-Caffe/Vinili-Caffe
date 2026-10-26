// Profilo staff (la scheda "Staff" del profilo utente, come sul sito vecchio).
// Dati:    GET  /webhooks/site-staff-profile?userId=…         (siteStaffProfileApi.js)
//          GET  /webhooks/site-staff-manage?userId=…          (organico + permessi pex/depex, siteStaffManageApi.js)
// Azioni:  POST /webhooks/site-staff-manage   {action, userId, reason?, removeId?, pauseId?, positiveTradeCount?, confirmCancel?}
//          POST /webhooks/site-staff-valtrade {action: neg_trade|pos_pause_trade, userId, …}
//          POST /webhooks/site-staff-pm-actions {action: points_add|points_remove, userId, amount, reason}
//          GET/POST /webhooks/site-staff-pm-shop, GET/POST /webhooks/site-staff-pm-points-removed
//          GET/POST /webhooks/site-staff-workflows (queue=resoconti | pause)
//          POST /webhooks/site-staff-seratafilm {willAttend}
// I permessi li decide il bot: qui si mostrano solo le azioni che `manage.actions` / `access` consentono.

export type Identity = { userId: string; displayName: string; username?: string; avatarUrl?: string };
export type RoleBadge = { kind: string; label: string; color?: string; roleId?: string };
export type ReasonEntry = { id: number; text: string };
export type PauseRow = {
  id?: string;
  pauseId?: string;
  start: string;
  end: string;
  startIso?: string;
  endIso?: string;
  status: string;
  statusLabel: string;
  phase: string;
  motivazione?: string | null;
  ruoloLabel?: string;
  canAct?: boolean;
};

export type StaffCard = {
  identity: Identity;
  role: { label: string; badges: RoleBadge[]; kind: string; isPm: boolean; isFounder?: boolean; color?: string };
  pause: {
    phase: string;
    statusLine: string;
    start: string | null;
    end: string | null;
    motivazione: string | null;
    quota: { used: number; max: number; remaining: number; bonus: number; base: number; tradedBonus?: number; weekBonus?: number };
    history: PauseRow[];
    pendingCount: number;
  };
  valutazioni: { positive: number; negative: number; positiveEntries: ReasonEntry[]; negativeEntries: ReasonEntry[] };
  warn: { count: number; entries: ReasonEntry[] };
  partner?: {
    points: number;
    pointsEarned: number;
    partnerCount: number;
    redeemSpend: number;
    pendingPuntiTolti?: number;
    shop?: { discountBanner?: string; discountActive?: boolean; tiers: ShopTier[] };
  } | null;
  modstats?: Record<"d7" | "d30" | "all", { mute: number; ban: number; kick: number; warn: number; total: number }> | null;
  serataFilm?: { willAttend: boolean; label: string; editable: boolean } | null;
  career?: { tenure?: { label: string } | null; rolesHistory: { oldRole?: string; newRole?: string; reason?: string | null; dateLabel?: string }[]; currentRole?: string } | null;
  isSelf: boolean;
  resoconto?: { pendingCount: number; weekKey: string } | null;
};

export type ShopTier = { tier: number; cost: number; baseCost?: number; reward: string; mode?: string; blocked?: boolean; blockedReason?: string; canAfford?: boolean; discountActive?: boolean };

export type RosterMember = Identity & {
  displayRoleLabel?: string;
  isPm?: boolean;
  isPmOnly?: boolean;
  onPause?: boolean;
  isNew?: boolean;
  isStaffDelMese?: boolean;
  isStaffDelSettimana?: boolean;
  positive?: number;
  negative?: number;
  warn?: number;
};
export type RosterSection = { roleId: string; roleLabel: string; color?: string; members: RosterMember[] };

export type ManageMember = {
  ladderRoleLabel?: string;
  pexTargetLabel?: string;
  depexTargetLabel?: string;
  memberRoleLabel?: string;
  canPex?: boolean;
  canPexPm?: boolean;
  canDepexLadder?: boolean;
  canDepexPm?: boolean;
  canDepexFull?: boolean;
  canPexProspect?: boolean;
  prospectPexChoices?: { id: string; label: string }[];
  careerRankBlocked?: boolean;
  careerRankBlockMessage?: string | null;
  isPm?: boolean;
  isPmOnly?: boolean;
  isProspect?: boolean;
};
export type ManageData = {
  canManage: boolean;
  readOnly: boolean;
  pmManageOnly: boolean;
  sections: RosterSection[];
  member: ManageMember | null;
  actions: string[];
};

export type ResoItem = {
  recordId: string;
  messageId: string;
  userId: string;
  displayName: string;
  avatarUrl?: string;
  kind: "s" | "p" | string;
  status: string;
  statusLabel: string;
  canAct: boolean;
  actionKey: string;
  proposedLabel: string;
  roleId: string | null;
  roleLabel: string;
  weekKey: string;
  weekLabel: string;
  isNewStaff: boolean;
  inPause: boolean;
  pauseNote?: string;
  weeklyMessages: number | null;
  weeklyVoiceSeconds: number | null;
  weeklyPartners: number | null;
  weeklySanctions: number | null;
  activityGrade: string;
  behaviorGrade: string;
  azioneDisplay: string;
  activityLimits: { messages: number | null; hours: number | null } | null;
  sanctionLimit: number | null;
  costanzaChart: { dayKey: string; text: number; voiceSeconds: number }[];
  decidedByName?: string | null;
  decidedAt?: string | null;
};
export type ResoWeek = { weekKey: string; label: string; count: number };

export type PauseItem = PauseRow & { recordId?: string; dedupeKey?: string; createdAt?: string; decidedByName?: string | null };

export type ShopRedeem = { id: string; createdAt: string; tier: number; pointCost: number; rewardLabel: string; reason?: string; pointsBefore?: number; pointsAfter?: number; source?: string };
export type PtItem = {
  messageId: string;
  createdAt: string;
  rule: string;
  messageLink?: string;
  invite?: string;
  status: "pending" | "confirmed" | "denied" | "logged" | string;
  canReview: boolean;
  reporter?: Identity | null;
};

type Res<T> = { ok: true; data: T } | { ok: false; message: string; status?: number };

async function call<T>(path: string, token: string, body?: unknown): Promise<Res<T>> {
  try {
    const r = await fetch(path, {
      method: body === undefined ? "GET" : "POST",
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}`, Accept: "application/json", ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const j = await r.json().catch(() => null);
    if (!j || j.ok === false || !r.ok) return { ok: false, status: r.status, message: j?.message || (r.status === 403 ? "Non autorizzato." : "Operazione non riuscita.") };
    return { ok: true, data: j as T };
  } catch {
    return { ok: false, message: "Errore di rete." };
  }
}

const q = (o: Record<string, string | number | undefined>) =>
  new URLSearchParams(Object.entries(o).filter(([, v]) => v !== undefined && v !== "").map(([k, v]) => [k, String(v)])).toString();

/** Payload completo della scheda staff (prospect / cache rotta non hanno role/pause). */
export function isFullStaffCard(raw: unknown): raw is StaffCard {
  if (!raw || typeof raw !== "object") return false;
  const c = raw as Partial<StaffCard> & { prospect?: boolean };
  if (c.prospect) return false;
  return Boolean(c.role && typeof c.role === "object" && c.pause && typeof c.pause === "object" && c.valutazioni && c.identity);
}

export async function loadCard(token: string, userId: string): Promise<Res<StaffCard>> {
  const r = await call<StaffCard & { prospect?: boolean; message?: string }>(`/webhooks/site-staff-profile?${q({ userId })}`, token);
  if (!r.ok) return r;
  if (r.data.prospect) {
    return { ok: false, message: "Questo utente non ha ancora un profilo staff completo." };
  }
  if (!isFullStaffCard(r.data)) {
    return { ok: false, message: "Profilo staff incompleto. Ricarica tra qualche secondo." };
  }
  return { ok: true, data: r.data };
}
export const loadManage = (token: string, userId: string) => call<ManageData>(`/webhooks/site-staff-manage?${q({ userId })}`, token);

export const manage = (token: string, body: { action: string; userId: string; reason?: string; removeId?: number; pauseId?: string; positiveTradeCount?: number; confirmCancel?: boolean }) =>
  call<{ message: string }>("/webhooks/site-staff-manage", token, body);
export const valTrade = (token: string, body: { action: "neg_trade"; userId: string; negativeId: number } | { action: "pos_pause_trade"; userId: string; positiveCount: number; pauseDays: number }) =>
  call<{ message?: string }>("/webhooks/site-staff-valtrade", token, body);
export const pmPoints = (token: string, userId: string, add: boolean, amount: number, reason: string) =>
  call<{ message?: string }>("/webhooks/site-staff-pm-actions", token, { action: add ? "points_add" : "points_remove", userId, amount, reason });

export const loadShop = (token: string, userId: string) =>
  call<{ items: ShopRedeem[]; partner?: StaffCard["partner"] }>(`/webhooks/site-staff-pm-shop?${q({ userId, limit: 30 })}`, token);
export const redeemShop = (token: string, userId: string, tier: number) =>
  call<{ message?: string }>("/webhooks/site-staff-pm-shop", token, { userId, tier, reason: "Riscatto manuale High Staff (sito)" });

export const loadPuntiTolti = (token: string, pmUserId: string) =>
  call<{ items: PtItem[]; canReview: boolean }>(`/webhooks/site-staff-pm-points-removed?${q({ pmUserId })}`, token);
export const reviewPuntiTolti = (token: string, messageId: string, confirm: boolean) =>
  call<{ message?: string }>("/webhooks/site-staff-pm-points-removed", token, { action: confirm ? "confirm" : "deny", messageId });

/* pageSize 20: staff+PM nella stessa settimana = 2 item (dual track) */
export const loadResoconti = (token: string, userId: string, week?: string) =>
  call<{ items: ResoItem[]; weeks: ResoWeek[]; week: string }>(`/webhooks/site-staff-workflows?${q({ queue: "resoconti", scope: "all", page: 1, pageSize: 20, userId, week })}`, token);
export const decideResoconto = (
  token: string,
  it: ResoItem,
  accept: boolean,
  override?: { key: string; reason?: string },
) =>
  call<{ message?: string }>("/webhooks/site-staff-workflows", token, {
    queue: "resoconti",
    action: accept ? "accept" : "reject",
    messageId: it.messageId,
    userId: it.userId,
    kind: it.kind,
    roleId: it.roleId || "",
    actionKey: it.actionKey,
    ...(override ? { overrideActionKey: override.key, ...(override.reason ? { reason: override.reason } : {}) } : {}),
  });

export const loadPauseReview = (token: string, userId: string) =>
  call<{ items: PauseItem[] }>(`/webhooks/site-staff-workflows?${q({ queue: "pause", scope: "all", page: 1, pageSize: 40, userId })}`, token);
export const decidePause = (token: string, userId: string, pauseId: string, action: "accept" | "reject" | "cancel") =>
  call<{ message?: string }>("/webhooks/site-staff-workflows", token, { queue: "pause", action, id: pauseId, pauseId, userId });

export const setSerataFilm = (token: string, willAttend: boolean) => call<{ willAttend?: boolean }>("/webhooks/site-staff-seratafilm", token, { willAttend });

/* ── etichette ── */

/** Alternative al resoconto (stesse del sito vecchio). */
export const RESO_ALTS = {
  p: [
    { key: "rc", label: "Richiamo", reason: "" },
    { key: "dp", label: "Depex", reason: "" },
  ],
  s: [
    { key: "vp", label: "Valutazione positiva · limiti raggiunti", reason: "Limiti settimanali completati." },
    { key: "vp", label: "Valutazione positiva · limiti doppi", reason: "Limiti settimanali superati almeno del doppio." },
    { key: "vn", label: "Valutazione negativa · limiti non raggiunti", reason: "Limiti settimanali non raggiunti." },
    { key: "vp", label: "Valutazione positiva · compito sanzioni", reason: "Compito sanzioni completato." },
    { key: "vp", label: "Valutazione positiva · griglia", reason: "Valutazione positiva da griglia attività/condotta." },
    { key: "vn", label: "Valutazione negativa · griglia", reason: "Valutazione negativa da griglia attività/condotta." },
    { key: "nl", label: "Nulla", reason: "" },
  ],
};

export const PT_STATUS: Record<string, string> = { pending: "In attesa", confirmed: "Confermata", denied: "Negata", logged: "Registrata" };

export const cleanRole = (s?: string) => String(s || "").replace(/༄\s*/g, "").trim();
export const hoursOf = (sec?: number | null) => Math.round(((sec || 0) / 3600) * 10) / 10;
export const fmtNum = (n?: number | null) => new Intl.NumberFormat("it-IT").format(Math.round(n || 0));
