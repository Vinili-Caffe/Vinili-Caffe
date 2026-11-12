// Dashboard: messaggi/embed, comandi personalizzati, pannelli ruoli, benvenuto e addio.
// API: /webhooks/site-dashboard/guilds/:id/community/…
// Handler: MultiGuild/site/dashboard/dashboardCommunityApi.ts

/** row = fila 0-4 (se manca: 5 per fila in ordine) */
export type MsgButton = { label: string; url: string; emoji: string; row?: number };
export type MsgField = { name: string; value: string; inline: boolean };
export type V2LinkButton = { label: string; url: string; emoji: string };
/** Components V2: blocchi al posto di testo + embed */
export type V2Block =
  | { type: "text"; content: string }
  | { type: "separator"; divider: boolean; spacing: "small" | "large" }
  | { type: "media"; urls: string[] }
  | { type: "section"; content: string; accessory: "thumbnail" | "button"; thumbnailUrl: string; button: V2LinkButton }
  | { type: "buttons"; buttons: V2LinkButton[] };
export type MsgV2 = { enabled: boolean; container: boolean; accentColor: string; blocks: V2Block[] };
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
  fields?: MsgField[];
  /** link sul titolo */
  url?: string;
};
export type MsgDraft = {
  content: string;
  embed: MsgEmbed;
  buttons: MsgButton[];
  v2?: MsgV2;
  /** se true, le menzioni utente nel testo (e {user} / mentionUserId) pingano */
  mentionUsers?: boolean;
  /** se true, le menzioni ruolo <@&…> nel testo pingano */
  mentionRoles?: boolean;
};
/** Promemoria a rotazione in chat (solo server principale) */
export type ChatReminder = { id: string; name: string; enabled: boolean; draft: MsgDraft };

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
  repeat?: "none" | "daily" | "weekly" | "monthly";
  repeatDeletePrevious?: boolean;
  /** pannello del bot importato (es. "info") */
  panelKey?: string | null;
  /** già pubblicato dalla dashboard: il bot non lo ripubblica più */
  managed?: boolean;
  updatedAt: number;
};

/** Annunci automatici: boost, eventi nominati e ruoli custom */
/** messaggio privato opzionale accanto all'annuncio */
export type AnnounceDm = { enabled: boolean; draft: MsgDraft };
export type RoleAnnounceRule = { id: string; name: string; enabled: boolean; roleIds: string[]; channelId: string | null; cooldownHours: number; draft: MsgDraft; dm?: AnnounceDm };
export type NamedAnnounceSlot = {
  id: string;
  name: string;
  enabled: boolean;
  roleId: string | null;
  channelId: string | null;
  cooldownHours: number;
  draft: MsgDraft;
  dm?: AnnounceDm;
};
export type NamedAnnounceKey = "clantag" | "fan" | "supporter" | "promoter" | "propulsor" | "catalyst";
export type AnnouncementsConfig = {
  boost: { enabled: boolean; channelId: string | null; firstDraft: MsgDraft; repeatDraft: MsgDraft; dm?: AnnounceDm };
  named: Record<NamedAnnounceKey, NamedAnnounceSlot>;
  roles: { enabled: boolean; rules: RoleAnnounceRule[] };
};

/** Bump e voti (server tenant) */
export type BumpReward = { roleId: string | null; hours: number };
export type BumpService = "disboard" | "discadia";
export type VoteService = "topgg" | "discadia";
/** EXP di bump e voti (solo server principale) */
export type BumpExpKey = "disboard" | "discadia" | "topgg" | "discadiaVote";
export type BumpExp = {
  enabled: boolean;
  minExp: number;
  maxExp: number;
  firstTimeExp: number;
  fastWindowMinutes: number;
  fastMultiplier: number;
  streakPercent: number;
  streakMaxPercent: number;
};
export type BumpVotesConfig = {
  enabled: boolean;
  exp?: Record<BumpExpKey, BumpExp>;
  /** per servizio: attesa, ringraziamento e promemoria */
  services: Record<BumpService, { enabled: boolean; cooldownMinutes: number; thanksDraft: MsgDraft; reminderDraft: MsgDraft }>;
  thanks: { enabled: boolean };
  reminder: { enabled: boolean; channelId: string | null; roleId: string | null };
  reward: BumpReward;
  votes: {
    enabled: boolean;
    token: string;
    topgg: boolean;
    discadia: boolean;
    channelId: string | null;
    thanks: { enabled: boolean };
    rewardRoleId: string | null;
    /** per servizio: ringraziamento, ore del ruolo e (solo main) promemoria DM */
    perService: Record<VoteService, { draft: MsgDraft; hours: number; reminderDraft: MsgDraft; reminderEnabled: boolean }>;
  };
};
export type BumpVotesLeaderboard = { bumps: { id: string; name: string; count: number }[]; votes: { id: string; name: string; count: number }[] };

/** Automazione fissa del server principale (bump, voti…) */
export type MainAutomation = { key: string; name: string; description: string; enabled: boolean };

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
  uses?: number;
};

export type RoleOption = { roleId: string; label: string; emoji: string; description: string; style: 1 | 2 | 3 | 4 };
export type RolePanel = {
  id: string;
  name: string;
  channelId: string | null;
  mode: "buttons" | "menu" | "reactions";
  behavior: "toggle" | "give" | "remove";
  maxRoles: number;
  requiredRoleIds: string[];
  blockedRoleIds: string[];
  replyEphemeral: boolean;
  buttonsPerRow: number;
  menuMin: number;
  menuMax: number;
  clearReaction: boolean;
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
  /** privato a chi esce */
  goodbyeDm?: { enabled: boolean; draft: MsgDraft };
  autoRoleIds: string[];
};

export type PickerChannel = { id: string; name: string };
export type PickerRole = { id: string; name: string; color: string | null; position: number; managed?: boolean };
/** guildName presente = emoji di un altro server del bot */
export type PickerEmoji = { id: string; name: string; animated?: boolean; url?: string; guildId?: string; guildName?: string };

export type CommunityData = {
  guild: { id: string; name: string; icon?: string | null; banner?: string | null; memberCount: number | null };
  welcomeSaved?: boolean;
  bot?: { id: string; name: string; avatarUrl: string } | null;
  autoResponders?: AutoResponder[];
  counters?: Counter[];
  serverLogs?: ServerLogs;
  isMainGuild?: boolean;
  prefix: string;
  limits: { messages: number; commands: number; rolePanels: number; panelRoles: number; buttons: number; autoResponders: number; counters: number; polls: number };
  messages: SavedMessage[];
  commands: CustomCommand[];
  rolePanels: RolePanel[];
  welcome: WelcomeSettings;
  pickers: { textChannels: PickerChannel[]; roles: PickerRole[]; emojis: PickerEmoji[]; categories: PickerChannel[] };
};

export function emptyDraft(over: Partial<MsgDraft> = {}): MsgDraft {
  return {
    content: "",
    embed: { enabled: true, title: "", description: "", color: "#d49150", imageUrl: "", thumbnailUrl: "", footerText: "", timestamp: false, authorName: "", authorIconUrl: "", fields: [] },
    buttons: [],
    v2: { enabled: false, container: true, accentColor: "", blocks: [] },
    mentionUsers: false,
    mentionRoles: true,
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
        categories: Array.isArray(d.pickers?.categories) ? d.pickers.categories : [],
      },
    },
  };
}

export type AutoResponder = {
  id: string;
  name: string;
  enabled: boolean;
  triggers: string[];
  match: "contains" | "exact" | "startsWith" | "word";
  replyEnabled: boolean;
  reply: boolean;
  draft: MsgDraft;
  reactions: string[];
  channelIds: string[];
  requiredRoleIds: string[];
  ignoredRoleIds: string[];
  cooldownSeconds: number;
  deleteTrigger: boolean;
  /** solo in queste ore (fuso del server); null = sempre */
  timeWindow?: { startHour: number; endHour: number } | null;
};

export type CounterType = "members" | "humans" | "bots" | "online" | "statusOnline" | "idle" | "dnd" | "offline" | "boosts" | "boostTier" | "channels" | "roles" | "emojis";
export type Counter = { id: string; type: CounterType; template: string; channelId: string | null; lastName: string | null };

export type LogEventGroup = { id: string; label: string; events: { id: string; label: string; hint: string }[] };

/** Eventi del log del server, raggruppati come nella dashboard. */
export const LOG_EVENT_GROUPS: LogEventGroup[] = [
  {
    id: "messages",
    label: "Messaggi",
    events: [
      { id: "messageDelete", label: "Messaggi eliminati", hint: "testo, autore e canale" },
      { id: "messageUpdate", label: "Messaggi modificati", hint: "prima e dopo" },
      { id: "messageBulkDelete", label: "Cancellazioni in blocco", hint: "es. /purge: quanti e di chi" },
    ],
  },
  {
    id: "members",
    label: "Membri",
    events: [
      { id: "memberJoin", label: "Membri entrati", hint: "con l'età dell'account" },
      { id: "memberLeave", label: "Membri usciti", hint: "con i ruoli che avevano" },
      { id: "memberRoles", label: "Ruoli dei membri", hint: "aggiunti e tolti" },
      { id: "memberNick", label: "Nickname", hint: "prima e dopo" },
      { id: "memberTimeout", label: "Timeout", hint: "dati e tolti, con la scadenza" },
      { id: "memberBoost", label: "Boost", hint: "nuovi boost e boost finiti" },
    ],
  },
  {
    id: "moderation",
    label: "Moderazione",
    events: [
      { id: "ban", label: "Ban", hint: "con il motivo" },
      { id: "unban", label: "Ban revocati", hint: "" },
      { id: "automodAction", label: "AutoMod di Discord", hint: "messaggi bloccati e timeout automatici" },
    ],
  },
  {
    id: "voice",
    label: "Vocali",
    events: [
      { id: "voiceJoin", label: "Ingressi in vocale", hint: "chi è entrato e dove" },
      { id: "voiceLeave", label: "Uscite dalla vocale", hint: "chi è uscito e da dove" },
      { id: "voiceMove", label: "Spostamenti in vocale", hint: "da un canale all'altro" },
    ],
  },
  {
    id: "server",
    label: "Server",
    events: [
      { id: "channelCreate", label: "Canali creati", hint: "" },
      { id: "channelUpdate", label: "Canali modificati", hint: "nome, argomento, lentezza, categoria" },
      { id: "channelDelete", label: "Canali eliminati", hint: "" },
      { id: "roleCreate", label: "Ruoli creati", hint: "" },
      { id: "roleUpdate", label: "Ruoli modificati", hint: "nome, colore e permessi" },
      { id: "roleDelete", label: "Ruoli eliminati", hint: "" },
      { id: "threadCreate", label: "Thread creati", hint: "" },
      { id: "threadDelete", label: "Thread eliminati", hint: "" },
      { id: "serverUpdate", label: "Impostazioni del server", hint: "nome, icona, banner, verifica, link" },
    ],
  },
  {
    id: "extra",
    label: "Emoji, inviti ed eventi",
    events: [
      { id: "emojiCreate", label: "Emoji aggiunte", hint: "" },
      { id: "emojiUpdate", label: "Emoji rinominate", hint: "" },
      { id: "emojiDelete", label: "Emoji eliminate", hint: "" },
      { id: "stickerCreate", label: "Sticker aggiunti", hint: "" },
      { id: "stickerDelete", label: "Sticker eliminati", hint: "" },
      { id: "inviteCreate", label: "Inviti creati", hint: "codice, canale e autore" },
      { id: "inviteDelete", label: "Inviti eliminati", hint: "codice e canale" },
      { id: "eventCreate", label: "Eventi creati", hint: "nome, data e canale" },
      { id: "eventDelete", label: "Eventi eliminati", hint: "" },
    ],
  },
];

export const LOG_EVENT_LABELS = LOG_EVENT_GROUPS.flatMap((g) => g.events);

export type ServerLogs = {
  enabled: boolean;
  channelId: string | null;
  /** canale per singolo evento (se manca, quello generale) */
  channels?: Record<string, string>;
  events: Record<string, boolean>;
  ignoredChannelIds: string[];
  ignoreBots: boolean;
};

export type Giveaway = {
  id: string;
  messageId: string | null;
  channelId: string;
  prize: string;
  endAt: number;
  winnerCount: number;
  participants: number;
  ended: boolean;
  cancelled: boolean;
  winnerIds: string[];
  hostId: string | null;
};

export type Poll = {
  id: string;
  question: string;
  channelId: string;
  messageId: string;
  answers: { answerId: number; text: string; emoji: string; votes: number }[];
  multiselect: boolean;
  durationHours: number;
  createdAt: number;
  endsAt: number;
  ended: boolean;
  deleted?: boolean;
};

export const communityApi = {
  saveAutoResponder: (t: string, g: string, a: Partial<AutoResponder>) => call<{ autoResponder: AutoResponder }>(t, g, "/auto-responders", "PUT", a),
  deleteAutoResponder: (t: string, g: string, id: string) => call(t, g, `/auto-responders/${encodeURIComponent(id)}`, "DELETE"),
  getAnnouncements: (t: string, g: string) =>
    call<{ isMainGuild?: boolean; imported?: boolean; config: AnnouncementsConfig; maxRules?: number }>(t, g, `/announcements?_=${Date.now()}`),
  saveAnnouncements: (t: string, g: string, config: AnnouncementsConfig) => call<{ config: AnnouncementsConfig }>(t, g, "/announcements", "PATCH", { config }),
  getBumpVotes: (t: string, g: string) =>
    call<{ isMainGuild?: boolean; imported?: boolean; config?: BumpVotesConfig; urls?: { topgg: string; discadia: string } }>(t, g, `/bump-votes?_=${Date.now()}`),
  saveBumpVotes: (t: string, g: string, config: Partial<BumpVotesConfig>) =>
    call<{ config: BumpVotesConfig; urls: { topgg: string; discadia: string } }>(t, g, "/bump-votes", "PATCH", { config }),
  regenBumpVotesToken: (t: string, g: string) => call<{ config: BumpVotesConfig; urls: { topgg: string; discadia: string } }>(t, g, "/bump-votes/token", "POST", {}),
  bumpVotesLeaderboard: (t: string, g: string) => call<BumpVotesLeaderboard>(t, g, `/bump-votes/leaderboard?_=${Date.now()}`),
  resetBumpVotesLeaderboard: (t: string, g: string, which: "bumps" | "votes") => call(t, g, "/bump-votes/leaderboard/reset", "POST", { which }),
  listMainAutomations: (t: string, g: string) => call<{ automations: MainAutomation[] }>(t, g, `/main-automations?_=${Date.now()}`),
  setMainAutomation: (t: string, g: string, key: string, enabled: boolean) => call<{ automations: MainAutomation[] }>(t, g, "/main-automations", "PUT", { key, enabled }),
  listChatReminders: (t: string, g: string) =>
    call<{ items: ChatReminder[]; imported?: boolean; max?: number }>(t, g, `/chat-reminders?_=${Date.now()}`),
  saveChatReminders: (t: string, g: string, items: ChatReminder[]) => call<{ items: ChatReminder[] }>(t, g, "/chat-reminders", "PUT", { items }),
  counterValues: (t: string, g: string) => call<{ values: Partial<Record<CounterType, number>> }>(t, g, `/counters/values?_=${Date.now()}`),
  createCounter: (t: string, g: string, c: { type: CounterType; template: string; categoryId?: string | null }) => call<{ counter: Counter }>(t, g, "/counters", "POST", c),
  updateCounter: (t: string, g: string, id: string, c: Partial<Counter>) => call<{ counter: Counter }>(t, g, `/counters/${encodeURIComponent(id)}`, "PATCH", c),
  deleteCounter: (t: string, g: string, id: string) => call(t, g, `/counters/${encodeURIComponent(id)}`, "DELETE"),
  saveServerLogs: (t: string, g: string, l: ServerLogs) => call<{ serverLogs: ServerLogs }>(t, g, "/server-logs", "PATCH", l),
  listGiveaways: (t: string, g: string) => call<{ giveaways: Giveaway[] }>(t, g, `/giveaways?_=${Date.now()}`),
  createGiveaway: (t: string, g: string, body: { channelId: string; prize: string; durationMs: number; winnerCount: number; hostId?: string }) =>
    call<{ giveaway: Giveaway }>(t, g, "/giveaways", "POST", body),
  editGiveaway: (
    t: string,
    g: string,
    messageId: string,
    body: { prize?: string; durationMs?: number; winnerCount?: number; hostId?: string },
  ) => call<{ giveaway: Giveaway }>(t, g, `/giveaways/${encodeURIComponent(messageId)}`, "PATCH", body),
  giveawayAction: (t: string, g: string, messageId: string, action: "end" | "reroll" | "delete") =>
    action === "delete"
      ? call(t, g, `/giveaways/${encodeURIComponent(messageId)}`, "DELETE")
      : call(t, g, `/giveaways/${encodeURIComponent(messageId)}/${action}`, "POST", {}),
  listPolls: (t: string, g: string) => call<{ polls: Poll[] }>(t, g, `/polls?_=${Date.now()}`),
  createPoll: (t: string, g: string, body: { channelId: string; question: string; answers: { text: string; emoji: string }[]; durationHours: number; multiselect: boolean }) =>
    call<{ poll: Poll }>(t, g, "/polls", "POST", body),
  endPoll: (t: string, g: string, id: string) => call<{ poll: Poll }>(t, g, `/polls/${encodeURIComponent(id)}/end`, "POST", {}),
  deletePoll: (t: string, g: string, id: string, alsoDiscord: boolean) => call(t, g, `/polls/${encodeURIComponent(id)}${alsoDiscord ? "?discord=1" : ""}`, "DELETE"),
  saveMessage: (t: string, g: string, m: Partial<SavedMessage>) => call<{ message: SavedMessage }>(t, g, "/messages", "PUT", m),
  deleteMessage: (t: string, g: string, id: string, alsoDiscord = false) =>
    call<{ discordDeleted?: boolean }>(t, g, `/messages/${encodeURIComponent(id)}${alsoDiscord ? "?discord=1" : ""}`, "DELETE"),
  sendMessage: (t: string, g: string, id: string, asNew = false) =>
    call<{ message: SavedMessage; edited?: boolean }>(t, g, `/messages/${encodeURIComponent(id)}/send`, "POST", { asNew }),
  scheduleMessage: (t: string, g: string, id: string, scheduledAt: number | null, repeat?: SavedMessage["repeat"], repeatDeletePrevious?: boolean) =>
    call<{ message: SavedMessage }>(t, g, `/messages/${encodeURIComponent(id)}/schedule`, "POST", { scheduledAt, repeat, repeatDeletePrevious }),
  saveCommand: (t: string, g: string, c: Partial<CustomCommand>) => call<{ command: CustomCommand }>(t, g, "/commands", "PUT", c),
  deleteCommand: (t: string, g: string, id: string) => call(t, g, `/commands/${encodeURIComponent(id)}`, "DELETE"),
  saveRolePanel: (t: string, g: string, p: Partial<RolePanel>) => call<{ panel: RolePanel; warnings?: string[] }>(t, g, "/role-panels", "PUT", p),
  deleteRolePanel: (t: string, g: string, id: string) => call(t, g, `/role-panels/${encodeURIComponent(id)}`, "DELETE"),
  publishRolePanel: (t: string, g: string, id: string) => call<{ panel: RolePanel; edited?: boolean; reactionWarning?: string | null }>(t, g, `/role-panels/${encodeURIComponent(id)}/publish`, "POST", {}),
  saveWelcome: (t: string, g: string, w: WelcomeSettings) => call<{ welcome: WelcomeSettings }>(t, g, "/welcome", "PATCH", w),
  testWelcome: (t: string, g: string, kind: "welcome" | "goodbye" | "dm" | "goodbyeDm", settings: WelcomeSettings) => call(t, g, "/welcome/test", "POST", { kind, settings }),
};
