/** Client dashboard per snapshot Discord del server (modulo Backup). */

type Ok<T> = { ok: true; data: T };
type Fail = { ok: false; message: string };

export type BackupListItem = {
  backupId: string;
  guildId: string;
  guildName: string;
  createdAt: string | null;
  source: string;
  label: string;
  sizeBytes?: number | null;
};

export type BackupCounts = {
  roles: number;
  channels: number;
  threads: number;
  members: number;
  bans: number;
  emojis: number;
  stickers: number;
  webhooks: number;
  invites: number;
  events: number;
  automodRules: number;
  messages: number;
};

export type BackupSummary = {
  backupId: string;
  guildId: string;
  guildName: string;
  createdAt: string | null;
  source: string;
  schemaVersion: number | null;
  sizeBytes?: number | null;
  counts: BackupCounts;
  countsAvailable?: boolean;
};

export type LoadAction = { key: string; label: string; description: string };

export type LoadSession = {
  id: string;
  guildId: string;
  userId: string;
  backupId: string;
  sourceGuildId: string | null;
  actions: string[];
  messagesLimit: number | null;
  messagesLimitLabel: string;
  expiresAt: number;
};

export type LoadStatus = {
  guildId: string;
  userId: string;
  backupId: string;
  actions: string[];
  startedAtMs: number;
  cancelRequested: boolean;
  phase: string;
  processed: number;
  messagesLimit: number | null;
  checkpointId: string | null;
} | null;

export type CreateStatus = {
  guildId: string;
  userId: string;
  startedAtMs: number;
  phase: string;
  label?: string;
  percent?: number;
  current?: number | null;
  total?: number | null;
  backupId: string | null;
  error: string | null;
  sizeBytes: number | null;
} | null;

export type BackupCaptureSettings = {
  maxMessagesPerChannel: number;
  maxAuditLogs: number;
  includeAssetData: boolean;
  includeStructureAssetBytes: boolean;
};

export type BackupSettings = {
  manual: BackupCaptureSettings;
  automatic: BackupCaptureSettings & {
    enabled: boolean;
    hour: number;
    minute: number;
    keepCount: number;
  };
  retention: {
    maxManual: number;
    maxManualAgeDays: number;
    minManualToKeep: number;
  };
};

export type BackupPreviewChannel = {
  id: string;
  name: string;
  type: number;
  parentId: string | null;
  position: number;
  nsfw?: boolean;
  topic?: string | null;
  children?: BackupPreviewChannel[];
};

export type BackupPreview = {
  version: number;
  backupId: string;
  guildId: string;
  createdAt: string | null;
  source: string;
  sizeBytes: number | null;
  guild: {
    name: string;
    iconURL: string | null;
    bannerURL: string | null;
    description: string | null;
    memberCount: number;
    verificationLevel: number;
    premiumTier: number;
    features: string[];
    preferredLocale: string | null;
    ownerId: string | null;
  };
  roles: { id: string; name: string; color: number; position: number; hoist: boolean; managed: boolean; mentionable: boolean; iconURL: string | null }[];
  channelTree: BackupPreviewChannel[];
  threads: { count: number; sample: { id: string; name: string; parentId: string | null; parentName: string | null }[] };
  emojis: { id: string; name: string; animated: boolean; url: string | null }[];
  stickers: { id: string; name: string; url: string | null; format?: number }[];
  bans: { count: number; sample: { tag: string; reason: string | null }[] };
  invites: { count: number };
  webhooks: { count: number };
  events: { name: string; scheduledStartAt: string | null; status: number }[];
  automodRules: { count: number };
  members: { count: number };
  messages: { total: number; byChannelTop: { channelId: string; channelName: string; count: number }[] };
  stats: Record<string, number> | null;
};

async function call<T = Record<string, unknown>>(
  token: string,
  guildId: string,
  path: string,
  method = "GET",
  body?: unknown,
): Promise<Ok<T> | Fail> {
  try {
    const r = await fetch(`/webhooks/site-dashboard/guilds/${encodeURIComponent(guildId)}/backups${path}`, {
      method,
      cache: "no-store",
      credentials: "omit",
      headers: {
        Accept: "application/json",
        Authorization: `Bearer ${token}`,
        ...(body !== undefined ? { "Content-Type": "application/json" } : {}),
      },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const d = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (r.status === 401) {
      const { handleUnauthorizedSession } = await import("./auth");
      handleUnauthorizedSession();
      return {
        ok: false,
        message: typeof d.message === "string" && d.message.trim() ? d.message : "Sessione scaduta: accedi di nuovo.",
      };
    }
    if (r.status === 404 && method === "GET") {
      return { ok: false, message: typeof d.message === "string" ? d.message : "Arriva col prossimo aggiornamento del bot." };
    }
    if (r.status === 502 || r.status === 504) {
      return { ok: false, message: "Timeout del server: lo snapshot è troppo grande per questa richiesta. Riprova o aspetta che finisca in background." };
    }
    if (!r.ok || d.ok === false) {
      return {
        ok: false,
        message:
          typeof d.message === "string" && d.message.trim()
            ? d.message
            : `Operazione non riuscita${r.status ? ` (${r.status})` : ""}.`,
      };
    }
    return { ok: true, data: d as T };
  } catch {
    return { ok: false, message: "Errore di rete." };
  }
}

export const backupApi = {
  list: (t: string, g: string, q?: { page?: number; pageSize?: number; search?: string }) => {
    const params = new URLSearchParams();
    if (q?.page) params.set("page", String(q.page));
    if (q?.pageSize) params.set("pageSize", String(q.pageSize));
    if (q?.search) params.set("search", q.search);
    const qs = params.toString();
    return call<{
      items: BackupListItem[];
      total: number;
      page: number;
      pageSize: number;
      totalPages: number;
      loadStatus: LoadStatus;
      createStatus: CreateStatus;
    }>(t, g, qs ? `?${qs}` : "", "GET");
  },
  create: (t: string, g: string) =>
    call<{ started: true; createStatus: CreateStatus }>(t, g, "", "POST"),
  createStatus: (t: string, g: string) => call<{ createStatus: CreateStatus }>(t, g, "/create-status", "GET"),
  getSettings: (t: string, g: string) =>
    call<{ settings: BackupSettings; hints: { messages: string; automatic: string } }>(t, g, "/settings", "GET"),
  patchSettings: (t: string, g: string, body: Partial<BackupSettings>) =>
    call<{ settings: BackupSettings }>(t, g, "/settings", "PATCH", body),
  get: (t: string, g: string, backupId: string) =>
    call<{
      backup: BackupSummary;
      preview: BackupPreview | null;
      previewCached?: boolean;
      meta: Record<string, unknown> | null;
    }>(t, g, `/${encodeURIComponent(backupId)}`, "GET"),
  remove: (t: string, g: string, backupId: string) =>
    call<{ deleted: { backupId: string; guildId: string } }>(t, g, `/${encodeURIComponent(backupId)}`, "DELETE"),
  loadActions: (t: string, g: string) =>
    call<{
      actions: LoadAction[];
      defaultMessagesLimit: number | string | null;
      messagesLimitOptions: { value: string; label: string }[];
    }>(t, g, "/load-actions", "GET"),
  createSession: (t: string, g: string, body: { backupId: string; actions?: string[]; messagesLimit?: number | string | null }) =>
    call<{ session: LoadSession }>(t, g, "/load/sessions", "POST", body),
  patchSession: (t: string, g: string, sessionId: string, body: { actions?: string[]; messagesLimit?: number | string | null }) =>
    call<{ session: LoadSession }>(t, g, `/load/sessions/${encodeURIComponent(sessionId)}`, "PATCH", body),
  preflight: (t: string, g: string, sessionId: string) =>
    call<{
      session: LoadSession;
      backup: BackupSummary;
      live: { rolesEditable: number; channels: number; roles: number };
      warnings: string[];
      messagesLimitLabel: string;
    }>(t, g, `/load/sessions/${encodeURIComponent(sessionId)}/preflight`, "POST"),
  confirm: (t: string, g: string, sessionId: string) =>
    call<{ started: true; loadStatus: LoadStatus }>(t, g, `/load/sessions/${encodeURIComponent(sessionId)}/confirm`, "POST"),
  status: (t: string, g: string) =>
    call<{ loadStatus: LoadStatus; createStatus: CreateStatus }>(t, g, "/load/status", "GET"),
  cancel: (t: string, g: string) => call<{ cancelled: true; loadStatus: LoadStatus }>(t, g, "/load/cancel", "POST"),
};
