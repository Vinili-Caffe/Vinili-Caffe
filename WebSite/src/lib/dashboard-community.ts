// Dashboard: messaggi/embed, comandi personalizzati, pannelli ruoli, benvenuto e addio.
// API: /webhooks/site-dashboard/guilds/:id/community/…
// Handler: MultiGuild/site/dashboard/dashboardCommunityApi.ts

export type MsgButton = { label: string; url: string; emoji: string };
export type MsgEmbed = {
  enabled: boolean;
  title: string;
  description: string;
  color: string;
  imageUrl: string;
  thumbnailUrl: string;
  footerText: string;
  timestamp: boolean;
  authorName: string;
  authorIconUrl: string;
};
export type MsgDraft = { content: string; embed: MsgEmbed; buttons: MsgButton[] };

export type SavedMessage = {
  id: string;
  name: string;
  channelId: string | null;
  draft: MsgDraft;
  messageId: string | null;
  sentChannelId: string | null;
  sentAt: number | null;
  scheduledAt: number | null;
  status: "draft" | "scheduled" | "sent" | "failed";
  error: string | null;
  updatedAt: number;
};

export type CustomCommand = {
  id: string;
  name: string;
  aliases: string[];
  description: string;
  enabled: boolean;
  deleteTrigger: boolean;
  reply: boolean;
  allowedRoleIds: string[];
  draft: MsgDraft;
};

export type RoleOption = { roleId: string; label: string; emoji: string; description: string; style: 1 | 2 | 3 | 4 };
export type RolePanel = {
  id: string;
  name: string;
  channelId: string | null;
  mode: "buttons" | "menu";
  unique: boolean;
  placeholder: string;
  roles: RoleOption[];
  draft: MsgDraft;
  messageId: string | null;
  sentChannelId: string | null;
};

export type WelcomeSettings = {
  welcome: { enabled: boolean; channelId: string | null; draft: MsgDraft };
  goodbye: { enabled: boolean; channelId: string | null; draft: MsgDraft };
  dm: { enabled: boolean; draft: MsgDraft };
  autoRoleIds: string[];
};

export type PickerChannel = { id: string; name: string };
export type PickerRole = { id: string; name: string; color: string | null; position: number; managed?: boolean };
export type PickerEmoji = { id: string; name: string; animated?: boolean; url?: string };

export type CommunityData = {
  guild: { id: string; name: string; icon?: string | null; memberCount: number | null };
  welcomeSaved?: boolean;
  bot?: { id: string; name: string; avatarUrl: string } | null;
  isMainGuild?: boolean;
  prefix: string;
  limits: { messages: number; commands: number; rolePanels: number; panelRoles: number; buttons: number };
  messages: SavedMessage[];
  commands: CustomCommand[];
  rolePanels: RolePanel[];
  welcome: WelcomeSettings;
  pickers: { textChannels: PickerChannel[]; roles: PickerRole[]; emojis: PickerEmoji[] };
};

export function emptyDraft(over: Partial<MsgDraft> = {}): MsgDraft {
  return {
    content: "",
    embed: { enabled: true, title: "", description: "", color: "#d49150", imageUrl: "", thumbnailUrl: "", footerText: "", timestamp: false, authorName: "", authorIconUrl: "" },
    buttons: [],
    ...over,
  };
}

type Ok<T> = { ok: true; data: T };
type Fail = { ok: false; message: string };

async function call<T = Record<string, unknown>>(token: string, guildId: string, path: string, method = "GET", body?: unknown): Promise<Ok<T> | Fail> {
  try {
    const r = await fetch(`/webhooks/site-dashboard/guilds/${encodeURIComponent(guildId)}/community${path}`, {
      method,
      cache: "no-store",
      credentials: "omit",
      headers: { Accept: "application/json", Authorization: `Bearer ${token}`, ...(body !== undefined ? { "Content-Type": "application/json" } : {}) },
      body: body !== undefined ? JSON.stringify(body) : undefined,
    });
    const d = (await r.json().catch(() => ({}))) as Record<string, unknown>;
    if (r.status === 404 && method === "GET") return { ok: false, message: "Arriva col prossimo aggiornamento del bot." };
    if (!r.ok || d.ok === false) return { ok: false, message: typeof d.message === "string" ? d.message : "Operazione non riuscita." };
    return { ok: true, data: d as T };
  } catch {
    return { ok: false, message: "Errore di rete." };
  }
}

export async function loadCommunity(token: string, guildId: string): Promise<{ ok: true; data: CommunityData } | Fail> {
  const r = await call<CommunityData & { pickers?: Partial<CommunityData["pickers"]> }>(token, guildId, `?_=${Date.now()}`);
  if (!r.ok) return r;
  const d = r.data;
  return {
    ok: true,
    data: {
      ...d,
      messages: Array.isArray(d.messages) ? d.messages : [],
      commands: Array.isArray(d.commands) ? d.commands : [],
      rolePanels: Array.isArray(d.rolePanels) ? d.rolePanels : [],
      pickers: {
        textChannels: Array.isArray(d.pickers?.textChannels) ? d.pickers.textChannels : [],
        roles: Array.isArray(d.pickers?.roles) ? d.pickers.roles : [],
        emojis: Array.isArray(d.pickers?.emojis) ? d.pickers.emojis : [],
      },
    },
  };
}

export const communityApi = {
  saveMessage: (t: string, g: string, m: Partial<SavedMessage>) => call<{ message: SavedMessage }>(t, g, "/messages", "PUT", m),
  deleteMessage: (t: string, g: string, id: string, alsoDiscord = false) =>
    call<{ discordDeleted?: boolean }>(t, g, `/messages/${encodeURIComponent(id)}${alsoDiscord ? "?discord=1" : ""}`, "DELETE"),
  sendMessage: (t: string, g: string, id: string, asNew = false) =>
    call<{ message: SavedMessage; edited?: boolean }>(t, g, `/messages/${encodeURIComponent(id)}/send`, "POST", { asNew }),
  scheduleMessage: (t: string, g: string, id: string, scheduledAt: number | null) =>
    call<{ message: SavedMessage }>(t, g, `/messages/${encodeURIComponent(id)}/schedule`, "POST", { scheduledAt }),
  saveCommand: (t: string, g: string, c: Partial<CustomCommand>) => call<{ command: CustomCommand }>(t, g, "/commands", "PUT", c),
  deleteCommand: (t: string, g: string, id: string) => call(t, g, `/commands/${encodeURIComponent(id)}`, "DELETE"),
  saveRolePanel: (t: string, g: string, p: Partial<RolePanel>) => call<{ panel: RolePanel }>(t, g, "/role-panels", "PUT", p),
  deleteRolePanel: (t: string, g: string, id: string) => call(t, g, `/role-panels/${encodeURIComponent(id)}`, "DELETE"),
  publishRolePanel: (t: string, g: string, id: string) => call<{ panel: RolePanel; edited?: boolean }>(t, g, `/role-panels/${encodeURIComponent(id)}/publish`, "POST", {}),
  saveWelcome: (t: string, g: string, w: WelcomeSettings) => call<{ welcome: WelcomeSettings }>(t, g, "/welcome", "PATCH", w),
  testWelcome: (t: string, g: string, kind: "welcome" | "goodbye" | "dm", settings: WelcomeSettings) => call(t, g, "/welcome/test", "POST", { kind, settings }),
};
