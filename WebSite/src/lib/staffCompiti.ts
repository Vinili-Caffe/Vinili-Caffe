// Compiti settimanali: GET/POST /webhooks/site-staff-compiti (+ files signed).
// Handler: Vinili/Utils/Web/siteStaffCompitiApi.js — UI vecchia: staff-compiti-page.js

import { staffFetch, type ApiRes } from "./staff";

export const COMPITI_NOTE_MAX = 1200;
export const COMPITI_PROOFS_MAX = 4;

export type CompitiIdentity = {
  userId: string;
  displayName: string;
  username: string;
  avatarUrl: string;
};

export type CompitiPill = { kind: string; label: string };

export type CompitiProof = { id: string; name: string; mime: string; url: string };

export type CompitiDifficulty = "facile" | "medio" | "difficile";

export type CompitiTaskMeta = { id: string; label: string; auto: boolean; difficulty?: CompitiDifficulty };

export type CompitiProgress = {
  weekKey: string;
  taskId: string;
  note: string;
  proofs: CompitiProof[];
  status: string;
  submittedAt: number;
  reviewedAt: number;
  autoSubmitted: boolean;
  isAuto: boolean;
  canRetry: boolean;
  pill: CompitiPill;
  lockedTaskIds: string[];
  monthDistinct: number;
  monthRequired: number;
  poolTaskIds: string[];
};

export type CompitiPlan = {
  monthKey: string;
  tasks: CompitiTaskMeta[];
  taskIds: string[];
  weekKey: string;
  weeksInMonth: number;
  swapUsedCount: number;
  swapBonus: number;
  swapsLeft: number;
  swapBase: number;
  monthBridgeNote?: string;
};

export type CompitiMonthEntry = {
  weekKey: string;
  isCurrent: boolean;
  isFuture: boolean;
  taskId: string;
  label: string;
  auto: boolean;
  status: string;
  pill: CompitiPill;
  note: string;
  proofs: CompitiProof[];
  autoSubmitted: boolean;
  canRetry: boolean;
  isAuto: boolean;
};

export type CompitiDeadlines = {
  submitOpen: boolean;
  submitDeadlineMs?: number;
  reviewDeadlineMs?: number;
};

export type CompitiPayload = {
  ok: true;
  weekKey: string;
  monthKey: string;
  mode: "highstaff" | "staff" | string;
  canSubmit: boolean;
  canReview: boolean;
  viewerId: string;
  targetUserId: string;
  deadlines: CompitiDeadlines;
  tasks: CompitiTaskMeta[];
  plan: CompitiPlan;
  monthEntries: CompitiMonthEntry[];
  progress: CompitiProgress;
  identity: CompitiIdentity;
  staffList?: CompitiIdentity[];
  newStaffGrace?: { active: boolean; message: string };
};

const BASE = "/webhooks/site-staff-compiti";

export function loadCompiti(
  token: string,
  opts: { userId?: string; skipStaffList?: boolean } = {},
): Promise<ApiRes<CompitiPayload>> {
  const q = new URLSearchParams();
  if (opts.userId) q.set("userId", opts.userId);
  if (opts.skipStaffList) q.set("skipStaffList", "1");
  const qs = q.toString();
  return staffFetch<CompitiPayload>(`${BASE}${qs ? `?${qs}` : ""}`, token);
}

export function saveCompiti(
  token: string,
  body: { taskId: string; note: string; submit?: boolean; proofs?: string[] },
): Promise<ApiRes<Partial<CompitiPayload> & { ok: true; message?: string }>> {
  return staffFetch(BASE, token, {
    method: "POST",
    body: {
      action: "save",
      taskId: body.taskId,
      note: body.note,
      done: Boolean(body.submit),
      submit: Boolean(body.submit),
      proofs: body.proofs || [],
    },
  });
}

export function swapCompitiTask(
  token: string,
  taskId: string,
): Promise<ApiRes<Partial<CompitiPayload> & { ok: true; message?: string }>> {
  return staffFetch(BASE, token, { method: "POST", body: { action: "swap_one", taskId } });
}

export function reviewCompiti(
  token: string,
  body: { userId: string; decision: "approve" | "reject"; weekKey?: string },
): Promise<ApiRes<{ ok: true; message?: string; progress?: CompitiProgress; monthEntries?: CompitiMonthEntry[] }>> {
  return staffFetch(BASE, token, {
    method: "POST",
    body: { action: "review", userId: body.userId, decision: body.decision, weekKey: body.weekKey },
  });
}

export function statusLabel(status: string, autoSubmitted?: boolean): string {
  switch (String(status || "")) {
    case "approved":
      return autoSubmitted ? "Confermato (automatico)" : "Confermato";
    case "submitted":
      return autoSubmitted ? "In revisione (automatico)" : "In revisione";
    case "rejected":
      return "Rifiutato";
    case "missed":
      return "Non completato";
    case "skipped":
      return "Esonero";
    case "draft":
    case "":
    case "todo":
      return "Da fare";
    default:
      return status || "Da fare";
  }
}

export async function filesToDataUrls(files: FileList | File[], max = COMPITI_PROOFS_MAX): Promise<string[]> {
  const list = Array.from(files).slice(0, max);
  const out: string[] = [];
  for (const file of list) {
    const dataUrl = await new Promise<string | null>((resolve) => {
      const reader = new FileReader();
      reader.onload = () => resolve(String(reader.result || ""));
      reader.onerror = () => resolve(null);
      reader.readAsDataURL(file);
    });
    if (dataUrl) out.push(dataUrl);
  }
  return out;
}
