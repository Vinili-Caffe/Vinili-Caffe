import { subscribeSiteRealtime, type SiteRealtimePing } from "./site-realtime";

// Tickets: /webhooks/site-web-tickets — handler Vinyls/Utils/Web/siteWebTicketsApi.js
// Ogni azione risponde con il ticket aggiornato (e i suoi `permissions`): l'interfaccia mostra solo
// quello che i permessi del bot consentono, non decide nulla da sola.
// Tempo reale: WebSocket condiviso (site-realtime) → solo ping, poi reload API.

export type Category = { id: string; label: string; description: string };
export type TicketStatus = "open" | "claimed" | "closed";

export type Permissions = {
  canClaim: boolean;
  canUnclaim: boolean;
  canClose: boolean;
  canReply: boolean;
  canUseCommands: boolean;
  canAddUsers: boolean;
  canRemoveUsers: boolean;
  canSwitchCategory: boolean;
  canRename: boolean;
  canCloseRequest: boolean;
  canTransfer: boolean;
  canRespondCloseRequest: boolean;
  canRate: boolean;
  isStaffViewer: boolean;
  isAddedViewer: boolean;
  isHighStaff: boolean;
  staffCategories: string[];
};

export type Ticket = {
  id: string;
  ticketNumber: number | null;
  userId: string;
  authorName: string;
  authorAvatarUrl?: string;
  category: string;
  categoryLabel: string;
  displayName: string;
  renameTail?: string;
  status: TicketStatus;
  claimedBy: string | null;
  claimedByName: string | null;
  closedAt: string | null;
  closedByName: string | null;
  closeReason: string | null;
  lastMessageAt: string | null;
  lastMessagePreview: string;
  lastAuthorKind: string;
  messageCount: number;
  addedUsers: { id: string; name?: string; avatarUrl?: string }[];
  closeRequestedByName: string | null;
  closeRequestedAt: string | null;
  closeRequestReason: string | null;
  ratingTicketScore: number | null;
  ratingStafferScore: number | null;
  rateableStafferName: string | null;
  createdAt: string | null;
  permissions?: Permissions;
};

export type Reaction = { key: string; emoji: string; emojiId: string | null; name: string | null; animated: boolean; count: number; userIds: string[]; url: string | null };
export type Message = {
  id: string;
  ticketId: string;
  authorId: string;
  authorName: string;
  authorAvatarUrl?: string;
  authorKind: "user" | "staff" | "system" | "bot" | string;
  authorRoleName?: string;
  authorAvgRating?: number;
  content: string;
  imageUrls: string[];
  reactions: Reaction[];
  editedAt: string | null;
  createdAt: string | null;
  replyTo?: { id: string; deleted?: boolean; authorName?: string; content?: string };
  receiptStatus?: "sent" | "delivered" | "read";
  pending?: boolean;
};

export type ListData = { isStaff: boolean; staffAccess: boolean; staffCategories: string[]; viewerId: string; tickets: Ticket[]; categories: Category[]; total: number; page: number; totalPages: number };
export type Detail = { ticket: Ticket; messages: Message[]; viewerId: string; isStaff: boolean };

export const MAX_CONTENT = 2000;
export const MAX_IMAGES = 3;
export const MAX_IMAGE_BYTES = 8 * 1024 * 1024;
export const QUICK_REACTIONS = ["👍", "❤️", "😂", "😮", "🙏", "✅"];

type Res<T> =
  | { ok: true; data: T }
  | { ok: false; message: string; error?: string; status?: number; needPartnershipForm?: boolean };

async function call<T>(path: string, token: string, init: { method?: string; body?: unknown } = {}): Promise<Res<T>> {
  try {
    const r = await fetch(path, {
      method: init.method ?? "GET",
      cache: "no-store",
      headers: { Authorization: `Bearer ${token}`, ...(init.body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: init.body !== undefined ? JSON.stringify(init.body) : undefined,
    });
    const j = await r.json().catch(() => null);
    if (!j || !j.ok)
      return {
        ok: false,
        status: r.status,
        error: j?.error,
        message: j?.message || (r.status === 429 ? "Troppe richieste: attendi un momento." : "Operazione non riuscita."),
        needPartnershipForm: j?.needPartnershipForm === true || j?.error === "partnership_need_form",
      };
    return { ok: true, data: j as T };
  } catch {
    return { ok: false, message: "Connessione instabile: riprova." };
  }
}

/** Compone `/partnership` per i ticket web (stesso parse del bot). */
export function buildWebPartnershipCommand(managerId: string | null, description: string) {
  const desc = String(description || "").trim();
  const mid = String(managerId || "").trim();
  if (mid) return `/partnership <@${mid}> ${desc}`.trim();
  return `/partnership ${desc}`.trim();
}

const base = "/webhooks/site-web-tickets";
type WithTicket = { ticket: Ticket };

export const loadList = (token: string, o: { scope?: "staff"; status?: string; category?: string; page?: number } = {}) => {
  const q = new URLSearchParams({ limit: "30", page: String(o.page ?? 1) });
  if (o.scope) q.set("scope", o.scope);
  if (o.status) q.set("status", o.status);
  if (o.category) q.set("category", o.category);
  return call<ListData>(`${base}?${q}`, token);
};
export const loadMeta = (token: string) => call<{ categories: Category[] }>(`${base}/meta`, token);
export const loadDetail = (token: string, id: string) => call<Detail>(`${base}/${id}`, token);

export const createTicket = (token: string, category: string, content: string, images: string[]) =>
  call<{ ticket: Ticket; messages: Message[] }>(base, token, { method: "POST", body: { category, content, images } });

export const sendMessage = (token: string, id: string, content: string, images: string[], replyToId?: string) =>
  call<{ ticket?: Ticket; message: Message }>(`${base}/${id}/messages`, token, { method: "POST", body: { content, images, replyToId: replyToId || undefined } });
export const editMessage = (token: string, id: string, mid: string, content: string) =>
  call<{ ticket: Ticket; message: Message }>(`${base}/${id}/messages/${mid}`, token, { method: "PATCH", body: { content } });
export const deleteMessage = (token: string, id: string, mid: string) => call<{ ticket: Ticket; messageId: string }>(`${base}/${id}/messages/${mid}`, token, { method: "DELETE" });
export const react = (token: string, id: string, mid: string, emoji: string) => call<{ message?: Message }>(`${base}/${id}/messages/${mid}/reactions`, token, { method: "POST", body: { emoji } });

export const markRead = (token: string, id: string, messageIds: string[]) => call(`${base}/${id}/read`, token, { method: "POST", body: { ticketId: id, messageIds } });
let lastOwnTyping = 0;
/** Quando ho segnalato l'ultima volta che sto scrivendo (per non mostrare il mio stesso "sta scrivendo"). */
export const ownTypingAt = () => lastOwnTyping;
export const sendTyping = (token: string, id: string, stop = false) => {
  if (!stop) lastOwnTyping = Date.now();
  return call(`${base}/${id}/typing`, token, { method: "POST", body: { ticketId: id, stop } });
};

/* azioni (i permessi decidono chi le vede) */
const act = (path: string) => (token: string, id: string, body: Record<string, unknown> = {}) => call<WithTicket>(`${base}/${id}/${path}`, token, { method: "POST", body });
export const claim = act("claim");
export const unclaim = act("unclaim");
export const closeTicket = (token: string, id: string, reason: string) => act("close")(token, id, { reason });
export const requestClose = (token: string, id: string, reason: string) => act("close-request")(token, id, { reason });
export const acceptClose = act("close-request/accept");
export const rejectClose = act("close-request/reject");
export const addMember = (token: string, id: string, userId: string) => act("members")(token, id, { userId });
export const removeMember = (token: string, id: string, userId: string) => act("members/remove")(token, id, { userId });
export const transfer = (token: string, id: string, userId: string) => act("transfer")(token, id, { userId });
export const setCategory = (token: string, id: string, category: string) => act("category")(token, id, { category });
export const rename = (token: string, id: string, name: string) => act("rename")(token, id, { name });
export const rate = (token: string, id: string, ticketRating: number, stafferRating: number) => act("rate")(token, id, { ticketRating, stafferRating });

/* notifiche push: il bot le richiede per aprire un ticket (lo staff è esente) */
export { enablePush, pushIsOn, pushSupported } from "./push";

/* ── tempo reale: solo un "ping", poi si ricarica dalle API (WS condiviso) ── */

export type RealtimePing = {
  type: string;
  ticketId?: string;
  stop?: boolean;
  readerId?: string;
  messageIds?: string[];
};

export { isSiteRealtimeConnected } from "./site-realtime";

export function subscribeRealtime(onPing: (p: RealtimePing) => void): () => void {
  return subscribeSiteRealtime((p: SiteRealtimePing) => {
    if (!p.type.startsWith("web_ticket")) return;
    onPing({ type: p.type, ticketId: p.ticketId, stop: p.stop, readerId: p.readerId, messageIds: p.messageIds });
  });
}

const COMPOSER_DRAFT_PREFIX = "vc_ticket_composer_draft:";

function composerSession(): Storage | null {
  try {
    return window.sessionStorage;
  } catch {
    return null;
  }
}

export function loadTicketComposerDraft(ticketId: string): string {
  if (typeof window === "undefined" || !ticketId) return "";
  const s = composerSession();
  if (!s) return "";
  try {
    return String(s.getItem(COMPOSER_DRAFT_PREFIX + ticketId) || "");
  } catch {
    return "";
  }
}

export function saveTicketComposerDraft(ticketId: string, text: string): void {
  if (typeof window === "undefined" || !ticketId) return;
  const s = composerSession();
  if (!s) return;
  const key = COMPOSER_DRAFT_PREFIX + ticketId;
  try {
    if (!String(text || "").trim()) s.removeItem(key);
    else s.setItem(key, text.slice(0, MAX_CONTENT));
  } catch {
    /* quota / private mode */
  }
}

export function clearTicketComposerDraft(ticketId: string): void {
  if (typeof window === "undefined" || !ticketId) return;
  const s = composerSession();
  if (!s) return;
  try {
    s.removeItem(COMPOSER_DRAFT_PREFIX + ticketId);
  } catch {
    /* ignore */
  }
}

/** URL assoluto per condividere / aprire un ticket (notifiche, staff). */
export function ticketShareUrl(ticketId: string, staffScope: boolean): string {
  if (typeof window === "undefined") return "";
  const u = new URL(window.location.href);
  u.searchParams.delete("id");
  u.searchParams.delete("ticket");
  u.searchParams.set("ticketId", ticketId);
  if (staffScope) u.searchParams.set("view", "staff");
  else u.searchParams.delete("view");
  u.hash = "";
  return u.toString();
}

export const ticketTime = (iso: string | null) => {
  if (!iso) return "";
  const d = new Date(iso);
  const today = new Date().toDateString() === d.toDateString();
  return today ? d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" }) : d.toLocaleDateString("it-IT", { day: "numeric", month: "short" }) + " " + d.toLocaleTimeString("it-IT", { hour: "2-digit", minute: "2-digit" });
};

export type UserHit = { id: string; name: string; username?: string | null; avatarUrl?: string; roleName?: string | null; markup?: string };
export type MentionHit = {
  type: "user" | "role" | "channel";
  id: string;
  name: string;
  username?: string | null;
  avatarUrl?: string;
  markup: string;
  roleName?: string | null;
  channelKind?: string;
  parentName?: string;
};
export type CommandHit = {
  name: string;
  invoke: string;
  description?: string;
  usage?: string;
  aliases?: string[];
  prefix?: string;
  kind?: "prefix" | "slash";
};

/** Ricerca utenti come sul sito attuale: `claimEligible` per trasferire, `guildSearch` per aggiungere. */
export async function searchUsers(token: string, ticketId: string, q: string, o: { claimEligible?: boolean; guildSearch?: boolean } = {}) {
  const p = new URLSearchParams({ kind: "users", q, ticketId });
  if (o.claimEligible) p.set("claimEligible", "1");
  if (o.guildSearch) p.set("guildSearch", "1");
  const r = await call<{ users: UserHit[] }>(`${base}/mentions?${p}`, token);
  return r.ok ? r.data.users : [];
}

/** Autocomplete composer: @ utenti/ruoli, # canali. */
export async function searchMentions(
  token: string,
  ticketId: string,
  q: string,
  mode: "user" | "channel" = "user",
): Promise<MentionHit[]> {
  const p = new URLSearchParams({ q, ticketId });
  if (mode === "channel") p.set("kind", "channels");
  const r = await call<{ users?: MentionHit[]; roles?: MentionHit[]; channels?: MentionHit[] }>(`${base}/mentions?${p}`, token);
  if (!r.ok) return [];
  if (mode === "channel") {
    return (r.data.channels || []).map((c) => ({
      ...c,
      type: "channel" as const,
      markup: c.markup || `<#${c.id}>`,
    }));
  }
  const users = (r.data.users || []).map((u) => ({
    ...u,
    type: "user" as const,
    markup: u.markup || `<@${u.id}>`,
  }));
  const roles = (r.data.roles || []).map((role) => ({
    ...role,
    type: "role" as const,
    markup: role.markup || `<@&${role.id}>`,
  }));
  return [...users, ...roles].slice(0, 24);
}

/** Risolve nomi per <@id> / <#id> / <@&id> già presenti nei messaggi. */
export async function resolveMentions(
  token: string,
  ids: { userIds?: string[]; channelIds?: string[]; roleIds?: string[] },
) {
  const r = await call<{
    users?: Record<string, { id: string; name: string }>;
    channels?: Record<string, { id: string; name: string }>;
    roles?: Record<string, { id: string; name: string }>;
  }>(`${base}/resolve`, token, {
    method: "POST",
    body: {
      userIds: ids.userIds || [],
      channelIds: ids.channelIds || [],
      roleIds: ids.roleIds || [],
    },
  });
  if (!r.ok) return { users: {}, channels: {}, roles: {} };
  const users: Record<string, string> = {};
  const channels: Record<string, string> = {};
  const roles: Record<string, string> = {};
  for (const [id, row] of Object.entries(r.data.users || {})) if (row?.name) users[id] = row.name;
  for (const [id, row] of Object.entries(r.data.channels || {})) if (row?.name) channels[id] = row.name;
  for (const [id, row] of Object.entries(r.data.roles || {})) if (row?.name) roles[id] = row.name;
  return { users, channels, roles };
}

/** Catalogo comandi prefix + slash (solo se canUseCommands). */
export async function loadTicketCommands(token: string, ticketId: string) {
  const r = await call<{ prefix: string; commands: CommandHit[]; slashCommands?: CommandHit[]; canUseCommands?: boolean }>(
    `${base}/commands?ticketId=${encodeURIComponent(ticketId)}`,
    token,
  );
  if (!r.ok) return { prefix: "+", commands: [] as CommandHit[], slashCommands: [] as CommandHit[], canUseCommands: false };
  return {
    prefix: r.data.prefix || "+",
    commands: r.data.commands || [],
    slashCommands: r.data.slashCommands || [],
    canUseCommands: r.data.canUseCommands !== false,
  };
}
