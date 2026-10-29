// Inbox workflow: GET/POST /webhooks/site-staff-workflows (+ chat dedicata)
// Handler: Vinyls/Utils/Web/siteStaffWorkflowApi.js — UI: staff-inbox-page.js

import { staffFetch, type ApiRes } from "./staff";

const BASE = "/webhooks/site-staff-workflows";

export type WorkflowQueue = "summary" | "candidature" | "appelli" | "revisione" | "resoconti" | "pause";

export type WorkflowSummary = {
  candidature?: number;
  appelli?: number;
  revisione?: number;
  resoconti?: number;
  pause?: number;
};

export type WorkflowPermissions = {
  highStaff?: boolean;
  candidatureReview?: boolean;
  appelliReview?: boolean;
  boardsReview?: boolean;
  director?: boolean;
  canViewResoconti?: boolean;
};

export type WorkflowField = { name: string; value: string };

export type WorkflowItem = {
  recordId?: string;
  id?: string;
  dedupeKey?: string;
  messageId?: string;
  listingId?: string;
  pauseId?: string;
  userId?: string;
  displayName?: string;
  avatarUrl?: string;
  title?: string;
  preview?: string;
  /** Testo pieno pratica (preferito a preview corta). */
  content?: string;
  body?: string;
  fields?: WorkflowField[];
  createdAt?: string | null;
  status?: string;
  statusLabel?: string;
  canAct?: boolean;
  type?: string;
  kind?: string;
  roleId?: string;
  channelId?: string;
  actionKey?: string;
  decidedBy?: string;
  decidedByName?: string;
  decidedAt?: string | null;
};

export type WorkflowListPayload = {
  ok: true;
  queue: string;
  items: WorkflowItem[];
  summary?: WorkflowSummary;
  permissions?: WorkflowPermissions;
  pagination?: { page?: number; pageSize?: number; total?: number; totalPages?: number };
  week?: string | null;
  weeks?: string[];
};

export type WorkflowSummaryPayload = {
  ok: true;
  summary: WorkflowSummary;
  permissions: WorkflowPermissions;
};

export type InboxTabId = Exclude<WorkflowQueue, "summary">;

/** Inbox notifiche: solo candidature + appelli (pause/resoconti/schede stanno altrove, come sito vecchio). */
export const INBOX_TABS: {
  id: InboxTabId;
  label: string;
  perm: keyof WorkflowPermissions | "always";
}[] = [
  { id: "candidature", label: "Candidature", perm: "candidatureReview" },
  { id: "appelli", label: "Appelli", perm: "appelliReview" },
];

export const SCOPE_FILTERS = [
  { id: "pending", label: "In attesa" },
  { id: "done", label: "Gestite" },
  { id: "all", label: "Tutte" },
] as const;

export const QUEUE_FILTERS: Record<string, { id: string; label: string }[]> = {
  candidature: [
    { id: "", label: "Tutte" },
    { id: "helper", label: "Helper" },
    { id: "partnermanager", label: "Partner Manager" },
    { id: "blogger", label: "Blogger" },
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
  resoconti: [{ id: "", label: "Tutti" }],
  pause: [{ id: "", label: "Tutte" }],
};

export function loadWorkflowSummary(token: string): Promise<ApiRes<WorkflowSummaryPayload>> {
  return staffFetch(`${BASE}?queue=summary`, token);
}

export function loadWorkflowQueue(
  token: string,
  queue: string,
  opts: { scope?: string; filter?: string; page?: number; pageSize?: number; userId?: string } = {},
): Promise<ApiRes<WorkflowListPayload>> {
  const q = new URLSearchParams({
    queue,
    scope: opts.scope || "pending",
    page: String(opts.page || 1),
    pageSize: String(opts.pageSize || 10),
    includeSummary: "1",
  });
  if (opts.filter) q.set("filter", opts.filter);
  if (opts.userId) q.set("userId", opts.userId);
  return staffFetch(`${BASE}?${q}`, token);
}

export function loadWorkflowDetail(
  token: string,
  queue: string,
  itemId: string,
  userId?: string,
): Promise<ApiRes<WorkflowListPayload & { item?: WorkflowItem }>> {
  const q = new URLSearchParams({ queue, itemId });
  if (userId) q.set("userId", userId);
  return staffFetch(`${BASE}?${q}`, token);
}

export type WorkflowDecideBody = {
  queue: string;
  action: "accept" | "reject" | "cancel" | string;
  messageId?: string;
  userId?: string;
  type?: string;
  kind?: string;
  pauseId?: string;
  id?: string;
  roleId?: string;
  channelId?: string;
  actionKey?: string;
  overrideActionKey?: string;
  reason?: string;
  motivo?: string;
};

export function decideWorkflow(
  token: string,
  body: WorkflowDecideBody,
): Promise<
  ApiRes<{
    ok: true;
    message?: string;
    item?: WorkflowItem;
    needsReason?: boolean;
    actionKey?: string | null;
    alternatives?: { key: string; label: string }[];
  }>
> {
  return staffFetch(BASE, token, { method: "POST", body });
}

/** Chiave chat come nel JS vecchio (preferisci dedupeKey / messageId). */
export function workflowDedupeKey(item: WorkflowItem, queue: string): string {
  const dk = String(item.dedupeKey || "").trim();
  if (dk) return dk;
  if (queue === "revisione") {
    const lid = String(item.listingId || item.messageId || item.id || "").trim();
    if (/^[a-f0-9]{24}$/i.test(lid)) return `boards:revisione:${lid}`;
  }
  const mid = String(item.messageId || "").trim();
  if (mid) return mid;
  return String(item.recordId || item.id || "").trim();
}

export function itemKey(item: WorkflowItem): string {
  return String(item.messageId || item.recordId || item.id || item.dedupeKey || "");
}
