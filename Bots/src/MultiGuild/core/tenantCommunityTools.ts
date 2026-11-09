/**
 * Strumenti community per server (dashboard → bot):
 *   - messaggi/embed da pubblicare (subito o a un'ora precisa)
 *   - comandi personalizzati (+regole, +ip …) con risposta fissa
 *   - pannelli "scegli i tuoi ruoli" (pulsanti o menu)
 *   - benvenuto, addio e ruoli automatici all'ingresso
 * BotState (una chiave per funzione, mappa guildId → dati). Cache breve per il gateway.
 */
const { getBotState, setBotState } = require("../../shared/botState/botStateStore") as typeof import("../../shared/botState/botStateStore");
const { isMongoReady } = require("../../shared/db/mongoConnect") as typeof import("../../shared/db/mongoConnect");

const KEYS = {
  messages: "multiGuildMessages.v1",
  commands: "multiGuildCustomCommands.v1",
  rolePanels: "multiGuildRolePanels.v1",
  welcome: "multiGuildWelcome.v1",
} as const;
type Kind = keyof typeof KEYS;

const LIMITS = { messages: 50, commands: 50, rolePanels: 15, panelRoles: 25, buttons: 5 };
const CACHE_TTL_MS = 15_000;

/* ───────────── messaggio (testo + embed + pulsanti link) ───────────── */

type MsgButton = { label: string; url: string; emoji: string };
type MsgEmbed = {
  enabled: boolean;
  title: string;
  description: string;
  color: string;
  imageUrl: string;
  thumbnailUrl: string;
  footerText: string;
  timestamp: boolean;
};
type MsgDraft = { content: string; embed: MsgEmbed; buttons: MsgButton[] };

const str = (v: unknown, max: number) => String(v ?? "").slice(0, max);
const isId = (v: unknown) => /^\d{16,22}$/.test(String(v || ""));
const idOrNull = (v: unknown) => (isId(v) ? String(v) : null);
const httpUrl = (v: unknown) => {
  const s = String(v || "").trim();
  return /^https?:\/\/\S+$/i.test(s) ? s.slice(0, 2000) : "";
};
const hex = (v: unknown, fb = "#d49150") => {
  const s = String(v || "").trim();
  return /^#[0-9a-f]{6}$/i.test(s) ? s.toLowerCase() : fb;
};
const newId = () => `${Date.now().toString(36)}${Math.random().toString(36).slice(2, 7)}`;

function normalizeDraft(raw?): MsgDraft {
  const r = raw && typeof raw === "object" ? raw : {};
  const e = r.embed && typeof r.embed === "object" ? r.embed : {};
  const buttons = (Array.isArray(r.buttons) ? r.buttons : [])
    .map((b?) => ({ label: str(b?.label, 80).trim(), url: httpUrl(b?.url), emoji: str(b?.emoji, 80).trim() }))
    .filter((b) => (b.label || b.emoji) && b.url)
    .slice(0, LIMITS.buttons);
  return {
    content: str(r.content, 2000),
    embed: {
      enabled: e.enabled === true,
      title: str(e.title, 256),
      description: str(e.description, 4096),
      color: hex(e.color),
      imageUrl: httpUrl(e.imageUrl),
      thumbnailUrl: httpUrl(e.thumbnailUrl),
      footerText: str(e.footerText, 2048),
      timestamp: e.timestamp === true,
    },
    buttons,
  };
}

function draftIsEmpty(d: MsgDraft) {
  const embedEmpty = !d.embed.enabled || (!d.embed.title.trim() && !d.embed.description.trim() && !d.embed.imageUrl);
  return !d.content.trim() && embedEmpty;
}

/** "<:nome:id>", "<a:nome:id>" o emoji unicode → oggetto emoji per i componenti. */
function parseEmoji(raw?) {
  const s = String(raw || "").trim();
  if (!s) return undefined;
  const m = s.match(/^<(a?):([\w~]{1,32}):(\d{16,22})>$/);
  if (m) return { id: m[3], name: m[2], animated: m[1] === "a" };
  if (/^\d{16,22}$/.test(s)) return { id: s };
  return { name: s.slice(0, 32) };
}

type FillVars = Record<string, string>;
function fill(text?, vars: FillVars = {}) {
  return String(text || "").replace(/\{([a-zA-Z_.]+)\}/g, (m, k: string) => (Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : m));
}

/** Corpo REST di un messaggio Discord. `extraRows` = componenti aggiuntivi (es. pulsanti ruolo). */
function buildMessageBody(draft: MsgDraft, vars: FillVars = {}, extraRows: any[] = [], opts: { mentionUserId?: string | null } = {}) {
  const body: Record<string, any> = {};
  const content = fill(draft.content, vars).trim();
  if (content) body.content = content.slice(0, 2000);
  if (draft.embed.enabled) {
    const e = draft.embed;
    const embed: Record<string, any> = { color: parseInt(e.color.slice(1), 16) };
    const title = fill(e.title, vars).trim();
    const desc = fill(e.description, vars).trim();
    if (title) embed.title = title.slice(0, 256);
    if (desc) embed.description = desc.slice(0, 4096);
    const img = httpUrl(fill(e.imageUrl, vars));
    const thumb = httpUrl(fill(e.thumbnailUrl, vars));
    if (img) embed.image = { url: img };
    if (thumb) embed.thumbnail = { url: thumb };
    const footer = fill(e.footerText, vars).trim();
    if (footer) embed.footer = { text: footer.slice(0, 2048) };
    if (e.timestamp) embed.timestamp = new Date().toISOString();
    if (embed.title || embed.description || embed.image || embed.thumbnail) body.embeds = [embed];
  }
  const rows: any[] = [];
  if (draft.buttons.length) {
    rows.push({
      type: 1,
      components: draft.buttons.map((b) => {
        const c: Record<string, any> = { type: 2, style: 5, url: b.url };
        if (b.label) c.label = fill(b.label, vars).slice(0, 80);
        const em = parseEmoji(b.emoji);
        if (em) c.emoji = em;
        return c;
      }),
    });
  }
  rows.push(...extraRows);
  body.components = rows.slice(0, 5);
  body.allowed_mentions = opts.mentionUserId ? { parse: [], users: [opts.mentionUserId] } : { parse: [] };
  if (!body.content && !body.embeds) body.content = "​";
  return body;
}

function memberVars(guild?, user?, extra: FillVars = {}): FillVars {
  const uid = user?.id ? String(user.id) : "";
  return {
    user: uid ? `<@${uid}>` : "",
    username: String(user?.globalName || user?.global_name || user?.username || ""),
    "user.name": String(user?.username || ""),
    "user.id": uid,
    server: String(guild?.name || ""),
    membercount: String(guild?.memberCount ?? guild?.approximate_member_count ?? ""),
    ...extra,
  };
}

/* ───────────── storage ───────────── */

const caches: Record<string, { at: number; map: Record<string, any> }> = {};
const loading: Record<string, Promise<Record<string, any>> | null> = {};

async function loadMap(kind: Kind, fresh = false): Promise<Record<string, any>> {
  const c = caches[kind];
  if (!fresh && c && Date.now() - c.at < CACHE_TTL_MS) return c.map;
  if (!isMongoReady()) return c?.map || {};
  if (!fresh && loading[kind]) return loading[kind];
  const p = (async () => {
    const raw = await getBotState(KEYS[kind], {});
    const map = raw && typeof raw === "object" ? { ...raw } : {};
    caches[kind] = { at: Date.now(), map };
    return map;
  })().finally(() => {
    loading[kind] = null;
  });
  if (!fresh) loading[kind] = p;
  return p;
}

async function saveGuild(kind: Kind, guildId: string, value: any) {
  if (!isMongoReady()) return false;
  const map = await loadMap(kind, true);
  if (value == null || (Array.isArray(value) && !value.length)) delete map[guildId];
  else map[guildId] = value;
  const ok = await setBotState(KEYS[kind], map);
  caches[kind] = { at: Date.now(), map };
  return ok !== false;
}

/* ───────────── messaggi ───────────── */

type SavedMessage = {
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

function normalizeMessage(raw?, prev?: SavedMessage | null): SavedMessage {
  const r = raw && typeof raw === "object" ? raw : {};
  const at = Number(r.scheduledAt);
  return {
    id: prev?.id || str(r.id, 40) || newId(),
    name: str(r.name, 80).trim() || prev?.name || "Messaggio",
    channelId: idOrNull(r.channelId),
    draft: normalizeDraft(r.draft),
    messageId: prev?.messageId ?? null,
    sentChannelId: prev?.sentChannelId ?? null,
    sentAt: prev?.sentAt ?? null,
    scheduledAt: Number.isFinite(at) && at > 0 ? at : null,
    status: prev?.status === "sent" || prev?.status === "failed" ? prev.status : "draft",
    error: prev?.error ?? null,
    updatedAt: Date.now(),
  };
}

async function listMessages(guildId: string, fresh = false): Promise<SavedMessage[]> {
  const map = await loadMap("messages", fresh);
  return Array.isArray(map[guildId]) ? map[guildId] : [];
}

async function writeMessages(guildId: string, rows: SavedMessage[]) {
  return saveGuild("messages", guildId, rows.slice(0, LIMITS.messages));
}

/* ───────────── comandi personalizzati ───────────── */

type CustomCommand = {
  id: string;
  name: string;
  aliases: string[];
  description: string;
  enabled: boolean;
  deleteTrigger: boolean;
  reply: boolean;
  allowedRoleIds: string[];
  draft: MsgDraft;
  uses: number;
  updatedAt: number;
};

const CMD_NAME_RE = /^[a-z0-9àèéìòù_-]{1,32}$/;
const cmdName = (v: unknown) => String(v || "").trim().toLowerCase().replace(/^[+!.?$-]+/, "");

function normalizeCommand(raw?, prev?: CustomCommand | null): CustomCommand {
  const r = raw && typeof raw === "object" ? raw : {};
  const aliases = [...new Set<string>((Array.isArray(r.aliases) ? r.aliases : []).map(cmdName).filter((a) => CMD_NAME_RE.test(a)))].slice(0, 5);
  return {
    id: prev?.id || newId(),
    name: cmdName(r.name),
    aliases,
    description: str(r.description, 100).trim(),
    enabled: r.enabled !== false,
    deleteTrigger: r.deleteTrigger === true,
    reply: r.reply !== false,
    allowedRoleIds: [...new Set<string>((Array.isArray(r.allowedRoleIds) ? r.allowedRoleIds : []).filter(isId).map(String))].slice(0, 20),
    draft: normalizeDraft(r.draft),
    uses: prev?.uses || 0,
    updatedAt: Date.now(),
  };
}

async function listCommands(guildId: string, fresh = false): Promise<CustomCommand[]> {
  const map = await loadMap("commands", fresh);
  return Array.isArray(map[guildId]) ? map[guildId] : [];
}

async function writeCommands(guildId: string, rows: CustomCommand[]) {
  return saveGuild("commands", guildId, rows.slice(0, LIMITS.commands));
}

/** Gateway: comando personalizzato per nome/alias (cache). */
async function findCustomCommand(guildId: string, token: string): Promise<CustomCommand | null> {
  const t = cmdName(token);
  if (!t) return null;
  const rows = await listCommands(guildId);
  return rows.find((c) => c.enabled && (c.name === t || c.aliases.includes(t))) || null;
}

/* ───────────── pannelli ruoli ───────────── */

type RoleOption = { roleId: string; label: string; emoji: string; description: string; style: 1 | 2 | 3 | 4 };
type RolePanel = {
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
  updatedAt: number;
};

function normalizeRolePanel(raw?, prev?: RolePanel | null): RolePanel {
  const r = raw && typeof raw === "object" ? raw : {};
  const seen = new Set<string>();
  const roles: RoleOption[] = [];
  for (const o of Array.isArray(r.roles) ? r.roles : []) {
    const rid = String(o?.roleId || "");
    if (!isId(rid) || seen.has(rid)) continue;
    seen.add(rid);
    const style = Number(o?.style);
    roles.push({
      roleId: rid,
      label: str(o?.label, 80).trim(),
      emoji: str(o?.emoji, 80).trim(),
      description: str(o?.description, 100).trim(),
      style: (style >= 1 && style <= 4 ? style : 2) as RoleOption["style"],
    });
    if (roles.length >= LIMITS.panelRoles) break;
  }
  return {
    id: prev?.id || newId(),
    name: str(r.name, 80).trim() || prev?.name || "Ruoli",
    channelId: idOrNull(r.channelId),
    mode: r.mode === "menu" ? "menu" : "buttons",
    unique: r.unique === true,
    placeholder: str(r.placeholder, 150).trim(),
    roles,
    draft: normalizeDraft(r.draft),
    messageId: prev?.messageId ?? null,
    sentChannelId: prev?.sentChannelId ?? null,
    updatedAt: Date.now(),
  };
}

async function listRolePanels(guildId: string, fresh = false): Promise<RolePanel[]> {
  const map = await loadMap("rolePanels", fresh);
  return Array.isArray(map[guildId]) ? map[guildId] : [];
}

async function writeRolePanels(guildId: string, rows: RolePanel[]) {
  return saveGuild("rolePanels", guildId, rows.slice(0, LIMITS.rolePanels));
}

const ROLE_CID = "vcrp";
function rolePanelComponents(panel: RolePanel, roleNames: Record<string, string> = {}) {
  const label = (o: RoleOption) => (o.label || roleNames[o.roleId] || "Ruolo").slice(0, 80);
  if (!panel.roles.length) return [];
  if (panel.mode === "menu") {
    return [
      {
        type: 1,
        components: [
          {
            type: 3,
            custom_id: `${ROLE_CID}:${panel.id}`,
            placeholder: (panel.placeholder || "Scegli i tuoi ruoli").slice(0, 150),
            min_values: 0,
            max_values: panel.unique ? 1 : panel.roles.length,
            options: panel.roles.map((o) => {
              const opt: Record<string, any> = { label: label(o).slice(0, 100), value: o.roleId };
              if (o.description) opt.description = o.description;
              const em = parseEmoji(o.emoji);
              if (em) opt.emoji = em;
              return opt;
            }),
          },
        ],
      },
    ];
  }
  const rows: any[] = [];
  panel.roles.forEach((o, i) => {
    if (i % 5 === 0) rows.push({ type: 1, components: [] });
    const c: Record<string, any> = { type: 2, style: o.style, custom_id: `${ROLE_CID}:${panel.id}:${o.roleId}`, label: label(o) };
    const em = parseEmoji(o.emoji);
    if (em) c.emoji = em;
    rows[rows.length - 1].components.push(c);
  });
  return rows;
}

function parseRolePanelCustomId(customId?) {
  const m = String(customId || "").match(/^vcrp:([a-z0-9]{4,40})(?::(\d{16,22}))?$/);
  return m ? { panelId: m[1], roleId: m[2] || null } : null;
}

/* ───────────── benvenuto / addio ───────────── */

type WelcomeSettings = {
  welcome: { enabled: boolean; channelId: string | null; draft: MsgDraft };
  goodbye: { enabled: boolean; channelId: string | null; draft: MsgDraft };
  dm: { enabled: boolean; draft: MsgDraft };
  autoRoleIds: string[];
  updatedAt: number;
};

const DEFAULT_WELCOME: WelcomeSettings = {
  welcome: {
    enabled: false,
    channelId: null,
    draft: normalizeDraft({
      content: "{user}",
      embed: { enabled: true, title: "Benvenuto in {server}!", description: "Ciao {user}, sei il membro numero **{membercount}**. Buona permanenza!", color: "#d49150" },
    }),
  },
  goodbye: {
    enabled: false,
    channelId: null,
    draft: normalizeDraft({ content: "**{username}** ha lasciato il server. Ora siamo {membercount}." }),
  },
  dm: { enabled: false, draft: normalizeDraft({ content: "Ciao {username}, benvenuto in **{server}**!" }) },
  autoRoleIds: [],
  updatedAt: 0,
};

function normalizeWelcome(raw?, prev: WelcomeSettings = DEFAULT_WELCOME): WelcomeSettings {
  const r = raw && typeof raw === "object" ? raw : {};
  const part = (k: "welcome" | "goodbye") => {
    const x = r[k] && typeof r[k] === "object" ? r[k] : null;
    if (!x) return prev[k];
    return {
      enabled: Object.prototype.hasOwnProperty.call(x, "enabled") ? x.enabled === true : prev[k].enabled,
      channelId: Object.prototype.hasOwnProperty.call(x, "channelId") ? idOrNull(x.channelId) : prev[k].channelId,
      draft: x.draft ? normalizeDraft(x.draft) : prev[k].draft,
    };
  };
  const dm = r.dm && typeof r.dm === "object" ? r.dm : null;
  return {
    welcome: part("welcome"),
    goodbye: part("goodbye"),
    dm: dm
      ? { enabled: Object.prototype.hasOwnProperty.call(dm, "enabled") ? dm.enabled === true : prev.dm.enabled, draft: dm.draft ? normalizeDraft(dm.draft) : prev.dm.draft }
      : prev.dm,
    autoRoleIds: Object.prototype.hasOwnProperty.call(r, "autoRoleIds")
      ? [...new Set<string>((Array.isArray(r.autoRoleIds) ? r.autoRoleIds : []).filter(isId).map(String))].slice(0, 10)
      : prev.autoRoleIds,
    updatedAt: Date.now(),
  };
}

async function getWelcome(guildId: string, fresh = false): Promise<WelcomeSettings> {
  const map = await loadMap("welcome", fresh);
  const row = map[guildId];
  return row && typeof row === "object" ? normalizeWelcome(row, DEFAULT_WELCOME) : DEFAULT_WELCOME;
}

async function writeWelcome(guildId: string, value: WelcomeSettings) {
  return saveGuild("welcome", guildId, value);
}

export = {
  LIMITS,
  normalizeDraft,
  draftIsEmpty,
  buildMessageBody,
  memberVars,
  fill,
  parseEmoji,
  newId,
  isId,
  listMessages,
  writeMessages,
  normalizeMessage,
  listCommands,
  writeCommands,
  normalizeCommand,
  findCustomCommand,
  cmdName,
  CMD_NAME_RE,
  listRolePanels,
  writeRolePanels,
  normalizeRolePanel,
  rolePanelComponents,
  parseRolePanelCustomId,
  getWelcome,
  writeWelcome,
  normalizeWelcome,
  DEFAULT_WELCOME,
};
