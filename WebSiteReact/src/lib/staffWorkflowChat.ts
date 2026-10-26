// Chat pratiche staff: GET/POST /webhooks/site-staff-workflow-chat
// Handler: Vinyls/Utils/Web/siteStaffWorkflowChatApi.js — UI: vc-workflow-chat.js
// WS realtime già punta a www; qui polling leggero sul GET.

import { staffFetch, type ApiRes } from "./staff";

const BASE = "/webhooks/site-staff-workflow-chat";

export const CHAT_CONTENT_MAX = 2000;

export type WorkflowChatMessage = {
  id: string;
  dedupeKey?: string;
  queue?: string;
  authorId?: string;
  authorName?: string;
  authorAvatarUrl?: string;
  authorRoleLabel?: string;
  authorKind?: string;
  content?: string;
  imageUrls?: string[];
  createdAt?: string | null;
  editedAt?: string | null;
  replyTo?: { id: string; authorName?: string; content?: string } | null;
};

export type WorkflowChatPayload = {
  ok: true;
  dedupeKey: string;
  queue?: string;
  status?: string;
  canSend: boolean;
  isSubject?: boolean;
  isStaffReviewer?: boolean;
  subjectUserId?: string;
  messages: WorkflowChatMessage[];
  viewerId?: string;
  maxImages?: number;
};

export function loadWorkflowChat(token: string, dedupeKey: string): Promise<ApiRes<WorkflowChatPayload>> {
  const q = new URLSearchParams({ dedupeKey });
  return staffFetch(`${BASE}?${q}`, token);
}

export function postWorkflowChat(
  token: string,
  body: { dedupeKey: string; content: string; replyToId?: string; images?: string[] },
): Promise<ApiRes<{ ok: true; message?: WorkflowChatMessage; messages?: WorkflowChatMessage[] }>> {
  return staffFetch(BASE, token, { method: "POST", body });
}
