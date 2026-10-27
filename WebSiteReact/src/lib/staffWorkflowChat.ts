// Chat pratiche staff: GET/POST /webhooks/site-staff-workflow-chat
// Subject invite: POST /webhooks/site-staff-workflow-chat/subject
// Handler: Vinyls/Utils/Web/siteStaffWorkflowChatApi.js

import { staffFetch, type ApiRes } from "./staff";

const BASE = "/webhooks/site-staff-workflow-chat";
const USER_WORKFLOWS = "/webhooks/site-user-workflows";

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

export type SubjectChatMeta = {
  inviteOnly?: boolean;
  invited?: boolean;
  active?: boolean;
  canInvite?: boolean;
  canRemove?: boolean;
  windows?: Array<{ joinedAt?: string | null; leftAt?: string | null }>;
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
  subjectChat?: SubjectChatMeta | null;
  messages: WorkflowChatMessage[];
  viewerId?: string;
  maxImages?: number;
};

export type SubjectInvitedChat = {
  dedupeKey?: string;
  queue?: string;
  status?: string;
  statusLabel?: string;
  title?: string;
  kind?: string;
  type?: string;
  chatInvited?: boolean;
  chatActive?: boolean;
  openPath?: string;
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

/** Staff: aggiunge/rimuove il richiedente nella discussione (candidature/appelli/pause). */
export function postWorkflowChatSubject(
  token: string,
  body: { dedupeKey: string; action: "invite" | "remove" },
): Promise<
  ApiRes<{
    ok: true;
    action: string;
    subjectChat?: SubjectChatMeta;
    inviteDmSent?: boolean;
    inviteDmReason?: string | null;
    message?: string;
  }>
> {
  return staffFetch(`${BASE}/subject`, token, { method: "POST", body });
}

/** Richiedente: chat a cui è stato invitato (FAB / ?chat=). */
export function loadSubjectInvitedChats(
  token: string,
  opts?: { queue?: "candidature" | "appelli" | "all"; includeClosed?: boolean },
): Promise<ApiRes<{ ok: true; kind?: string; queue?: string; items: SubjectInvitedChat[] }>> {
  const q = new URLSearchParams({ subjectChats: "1" });
  if (opts?.queue) q.set("queue", opts.queue);
  if (opts?.includeClosed) q.set("includeClosed", "1");
  return staffFetch(`${USER_WORKFLOWS}?${q}`, token);
}
