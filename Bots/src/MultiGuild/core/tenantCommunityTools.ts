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
  autoResponders: "multiGuildAutoResponders.v1",
  counters: "multiGuildCounters.v1",
  serverLogs: "multiGuildServerLogs.v1",
  polls: "multiGuildPolls.v1",
} as const;
type Kind = keyof typeof KEYS;

const LIMITS = { messages: 50, commands: 50, rolePanels: 15, panelRoles: 25, buttons: 5, autoResponders: 50, counters: 6, polls: 50 };
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
  authorName: string;
  authorIconUrl: string;
};
type MsgDraft = { content: string; embed: MsgEmbed; buttons: MsgButton[] };

const str = (v: unknown, max: number) => String(v ?? "").slice(0, max);
const isId = (v: unknown) => /^\d{16,22}$/.test(String(v || ""));
const idOrNull = (v: unknown) => (isId(v) ? String(v) : null);
const httpUrl = (v: unknown) => {
  const s = String(v || "").trim();
  return /^https?:\/\/\S+$/i.test(s) ? s.slice(0, 2000) : "";
};
/** Link http(s) oppure un solo segnaposto ({avatar}, {servericon}). */
const urlOrToken = (v: unknown) => {
  const s = String(v || "").trim();
  return /^\{[a-zA-Z_.]+\}$/.test(s) ? s : httpUrl(s);
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
      imageUrl: urlOrToken(e.imageUrl),
      thumbnailUrl: urlOrToken(e.thumbnailUrl),
      footerText: str(e.footerText, 2048),
      timestamp: e.timestamp === true,
      authorName: str(e.authorName, 256),
      authorIconUrl: urlOrToken(e.authorIconUrl),
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
    const authorName = fill(e.authorName, vars).trim();
    if (authorName) {
      embed.author = { name: authorName.slice(0, 256) };
      const icon = httpUrl(fill(e.authorIconUrl, vars));
      if (icon) embed.author.icon_url = icon;
    }
    if (embed.title || embed.description || embed.image || embed.thumbnail || embed.author) body.embeds = [embed];
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
  /* menziona davvero solo l'utente indicato e i ruoli scritti a mano nel testo (es. ping Staff) */
  const roleIds = [...new Set([...String(body.content || "").matchAll(/<@&(\d{16,22})>/g)].map((m) => m[1]))].slice(0, 20);
  body.allowed_mentions = { parse: [], ...(opts.mentionUserId ? { users: [opts.mentionUserId] } : {}), ...(roleIds.length ? { roles: roleIds } : {}) };
  if (!body.content && !body.embeds) body.content = "​";
  return body;
}

function avatarUrlOf(user?) {
  try {
    if (typeof user?.displayAvatarURL === "function") return String(user.displayAvatarURL({ size: 256 }) || "");
  } catch {
    /* oggetto REST */
  }
  if (user?.id && user?.avatar) return `https://cdn.discordapp.com/avatars/${user.id}/${user.avatar}.${String(user.avatar).startsWith("a_") ? "gif" : "png"}?size=256`;
  return user?.id ? `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(user.id) >> 22n) % 6}.png` : "";
}

function guildIconOf(guild?) {
  try {
    if (typeof guild?.iconURL === "function") return String(guild.iconURL({ size: 256 }) || "");
  } catch {
    /* oggetto REST */
  }
  return guild?.id && guild?.icon ? `https://cdn.discordapp.com/icons/${guild.id}/${guild.icon}.png?size=256` : "";
}

function guildBannerOf(guild?) {
  try {
    if (typeof guild?.bannerURL === "function") return String(guild.bannerURL({ size: 1024 }) || "");
  } catch {
    /* oggetto REST */
  }
  const b = guild?.banner ? String(guild.banner) : "";
  return guild?.id && b ? `https://cdn.discordapp.com/banners/${guild.id}/${b}.${b.startsWith("a_") ? "gif" : "png"}?size=1024` : "";
}

function memberVars(guild?, user?, extra: FillVars = {}): FillVars {
  const uid = user?.id ? String(user.id) : "";
  return {
    avatar: avatarUrlOf(user),
    servericon: guildIconOf(guild),
    serverbanner: guildBannerOf(guild),
    benvenuto: "benvenuto",
    Benvenuto: "Benvenuto",
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
  /** ripetizione dopo ogni invio programmato */
  repeat: "none" | "daily" | "weekly" | "monthly";
  /** a ogni ripetizione cancella il messaggio precedente */
  repeatDeletePrevious: boolean;
  updatedAt: number;
};

const REPEATS = ["none", "daily", "weekly", "monthly"] as const;

/** Prossima data dopo `at` secondo la ripetizione (sempre nel futuro). */
function nextRepeatAt(at: number, repeat: string) {
  const d = new Date(at);
  const step = () => {
    if (repeat === "daily") d.setDate(d.getDate() + 1);
    else if (repeat === "weekly") d.setDate(d.getDate() + 7);
    else if (repeat === "monthly") d.setMonth(d.getMonth() + 1);
  };
  if (!["daily", "weekly", "monthly"].includes(repeat)) return null;
  step();
  while (d.getTime() <= Date.now()) step();
  return d.getTime();
}

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
    repeat: REPEATS.includes(r.repeat) ? r.repeat : prev?.repeat || "none",
    repeatDeletePrevious: Object.prototype.hasOwnProperty.call(r, "repeatDeletePrevious") ? r.repeatDeletePrevious === true : prev?.repeatDeletePrevious === true,
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
  if (row && typeof row === "object") return normalizeWelcome(row, DEFAULT_WELCOME);
  return isMainGuild(guildId) ? mainGuildWelcomeSeed() : DEFAULT_WELCOME;
}

/** true se il server ha salvato benvenuto/addio dalla dashboard (nel principale: la dashboard sostituisce quello nel codice). */
async function hasSavedWelcome(guildId: string, fresh = false) {
  const map = await loadMap("welcome", fresh);
  return Boolean(map[guildId] && typeof map[guildId] === "object");
}

function isMainGuild(guildId?) {
  try {
    const IDs = require("../../Vinili/Config/ids") as any;
    return String(IDs?.guilds?.main || "") === String(guildId || "");
  } catch {
    return false;
  }
}

/** Il benvenuto che il bot usava nel codice per il server principale, come punto di partenza. */
function mainGuildWelcomeSeed(): WelcomeSettings {
  let IDs: any = {};
  let E: any = {};
  let divider = "";
  try {
    IDs = require("../../Vinili/Config/ids");
    E = (require("../../shared/emojis/emojiCatalog") as any).E || {};
    divider = String((require("../../shared/discord/constants") as any).DIVIDER_URL || "");
  } catch {
    /* valori vuoti */
  }
  const e = (k: string) => String(E?.[k] || "");
  const staff = IDs?.roles?.Staff ? ` <@&${IDs.roles.Staff}>` : "";
  const mainId = String(IDs?.guilds?.main || "");
  return normalizeWelcome(
    {
      welcome: {
        enabled: true,
        channelId: IDs?.channels?.chat || null,
        draft: {
          content: `Ciao {user}, {benvenuto}!${staff} ${e("VC_heartfinger")}`.trim(),
          embed: {
            enabled: true,
            authorName: "{username}",
            authorIconUrl: "{avatar}",
            title: `${e("VC_HeartsPink")} {Benvenuto} su Vinili & Caffè ${e("VC_HeartsPink")}`.trim(),
            description: `__{username}__ {benvenuto} nella nostra community ${e("VC_Sparkles")}\n${e("VC_addperson")} [Vai sul sito](https://www.viniliecaffe.it/personalizza/) per **personalizzare il tuo profilo**`,
            color: "#6f4e37",
            thumbnailUrl: "{avatar}",
            imageUrl: divider,
            footerText: "Ora siamo in {membercount} membri",
          },
        },
      },
      dm: {
        enabled: true,
        draft: {
          embed: {
            enabled: true,
            title: `${e("VC_RightWing")} Benvenuto in Vinili & Caffè!`.trim(),
            description: [
              "Ciao **{username}**, grazie per esserti unito a noi!",
              "",
              "Entrando nel server accetti automaticamente le nostre regole.",
              `${e("VC_Arrow")} <https://discord.com/channels/${mainId}/1442569111119990887/1470102236527853661>`,
              "------------------------------",
              `${e("VC_Dot")} Metti la nostra GUILD TAG **V&C** sul tuo profilo`,
              `${e("VC_Arrow")} <https://discord.com/channels/${mainId}/1442569111119990887/1470102239094767699>`,
            ].join("\n"),
            color: "#6f4e37",
            thumbnailUrl: "{servericon}",
            footerText: "{server} • Ora siamo in {membercount} membri",
            timestamp: true,
          },
        },
      },
    },
    DEFAULT_WELCOME,
  );
}

async function writeWelcome(guildId: string, value: WelcomeSettings) {
  return saveGuild("welcome", guildId, value);
}

/* ───────────── liste/oggetti generici per le altre funzioni ───────────── */

async function listRows(kind: "autoResponders" | "counters" | "polls", guildId: string, fresh = false): Promise<any[]> {
  const map = await loadMap(kind, fresh);
  return Array.isArray(map[guildId]) ? map[guildId] : [];
}

async function writeRows(kind: "autoResponders" | "counters" | "polls", guildId: string, rows: any[]) {
  return saveGuild(kind, guildId, rows);
}

/** Tutti i server con dati per una funzione (scheduler). */
async function allGuildRows(kind: "counters" | "polls", fresh = true): Promise<Record<string, any[]>> {
  const map = await loadMap(kind, fresh);
  const out: Record<string, any[]> = {};
  for (const [gid, v] of Object.entries(map)) if (Array.isArray(v) && v.length) out[gid] = v;
  return out;
}

/* risposte automatiche */
const AR_MATCH = ["contains", "exact", "startsWith", "word"] as const;
function normalizeAutoResponder(raw?, prev?) {
  const r = raw && typeof raw === "object" ? raw : {};
  const triggers = [...new Set<string>((Array.isArray(r.triggers) ? r.triggers : []).map((t) => str(t, 100).trim().toLowerCase()).filter(Boolean))].slice(0, 10);
  const reactions = [...new Set<string>((Array.isArray(r.reactions) ? r.reactions : []).map((t) => str(t, 80).trim()).filter(Boolean))].slice(0, 5);
  const ids = (v: unknown, max = 50) => [...new Set<string>((Array.isArray(v) ? v : []).filter(isId).map(String))].slice(0, max);
  return {
    id: prev?.id || newId(),
    name: str(r.name, 80).trim() || triggers[0] || "Risposta",
    enabled: r.enabled !== false,
    triggers,
    match: AR_MATCH.includes(r.match) ? r.match : "contains",
    replyEnabled: r.replyEnabled !== false,
    reply: r.reply !== false,
    draft: normalizeDraft(r.draft),
    reactions,
    channelIds: ids(r.channelIds),
    requiredRoleIds: ids(r.requiredRoleIds, 20),
    ignoredRoleIds: ids(r.ignoredRoleIds, 20),
    cooldownSeconds: Math.max(0, Math.min(3600, Math.floor(Number(r.cooldownSeconds) || 10))),
    deleteTrigger: r.deleteTrigger === true,
    updatedAt: Date.now(),
  };
}

function matchesAutoResponder(ar?, content?: string) {
  const text = String(content || "").toLowerCase().trim();
  if (!text) return false;
  return (ar?.triggers || []).some((t: string) => {
    if (ar.match === "exact") return text === t;
    if (ar.match === "startsWith") return text.startsWith(t);
    if (ar.match === "word") {
      const esc = t.replace(/[.*+?^${}()|[\]\\]/g, (ch) => `\\${ch}`);
      return new RegExp(`(^|[^\\p{L}\\p{N}])${esc}($|[^\\p{L}\\p{N}])`, "u").test(text);
    }
    return text.includes(t);
  });
}

/* contatori */
const COUNTER_TYPES = ["members", "online", "boosts", "boostTier", "channels", "roles", "emojis"] as const;
function normalizeCounter(raw?, prev?) {
  const r = raw && typeof raw === "object" ? raw : {};
  return {
    id: prev?.id || newId(),
    type: COUNTER_TYPES.includes(r.type) ? r.type : prev?.type || "members",
    template: str(r.template, 90).trim() || prev?.template || "Membri: {count}",
    channelId: prev?.channelId || idOrNull(r.channelId),
    lastName: prev?.lastName || null,
    updatedAt: Date.now(),
  };
}

/* log del server */
const LOG_EVENTS = [
  "messageDelete",
  "messageUpdate",
  "memberJoin",
  "memberLeave",
  "memberRoles",
  "memberNick",
  "ban",
  "unban",
  "channelCreate",
  "channelDelete",
  "roleCreate",
  "roleDelete",
  "voiceJoin",
  "voiceLeave",
  "voiceMove",
  "threadCreate",
  "threadDelete",
  "inviteCreate",
  "inviteDelete",
  "messageBulkDelete",
  "memberTimeout",
  "memberBoost",
  "channelUpdate",
  "roleUpdate",
  "emojiCreate",
  "emojiDelete",
  "emojiUpdate",
  "stickerCreate",
  "stickerDelete",
  "serverUpdate",
  "eventCreate",
  "eventDelete",
  "automodAction",
] as const;
const DEFAULT_SERVER_LOGS = {
  enabled: false,
  channelId: null as string | null,
  /** canale per singolo evento (se manca: quello generale) */
  channels: {} as Record<string, string>,
  events: Object.fromEntries(LOG_EVENTS.map((e) => [e, true])) as Record<string, boolean>,
  ignoredChannelIds: [] as string[],
  ignoreBots: true,
  updatedAt: 0,
};
function normalizeServerLogs(raw?, prev = DEFAULT_SERVER_LOGS) {
  const r = raw && typeof raw === "object" ? raw : {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(r, k);
  const ev = r.events && typeof r.events === "object" ? r.events : {};
  return {
    enabled: has("enabled") ? r.enabled === true : prev.enabled,
    channelId: has("channelId") ? idOrNull(r.channelId) : prev.channelId,
    channels: has("channels")
      ? Object.fromEntries(
          LOG_EVENTS.filter((e) => r.channels && typeof r.channels === "object" && isId(r.channels[e])).map((e) => [e, String(r.channels[e])]),
        )
      : prev.channels || {},
    events: Object.fromEntries(LOG_EVENTS.map((e) => [e, Object.prototype.hasOwnProperty.call(ev, e) ? ev[e] === true : prev.events?.[e] !== false])),
    ignoredChannelIds: has("ignoredChannelIds") ? [...new Set<string>((Array.isArray(r.ignoredChannelIds) ? r.ignoredChannelIds : []).filter(isId).map(String))].slice(0, 50) : prev.ignoredChannelIds,
    ignoreBots: has("ignoreBots") ? r.ignoreBots !== false : prev.ignoreBots,
    updatedAt: Date.now(),
  };
}
async function getServerLogs(guildId: string, fresh = false) {
  const map = await loadMap("serverLogs", fresh);
  const row = map[guildId];
  return row && typeof row === "object" ? normalizeServerLogs(row, DEFAULT_SERVER_LOGS) : DEFAULT_SERVER_LOGS;
}
async function writeServerLogs(guildId: string, value) {
  return saveGuild("serverLogs", guildId, value);
}

export = {
  LIMITS,
  nextRepeatAt,
  listRows,
  writeRows,
  allGuildRows,
  normalizeAutoResponder,
  matchesAutoResponder,
  normalizeCounter,
  COUNTER_TYPES,
  LOG_EVENTS,
  normalizeServerLogs,
  getServerLogs,
  writeServerLogs,
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
  hasSavedWelcome,
  isMainGuild,
  writeWelcome,
  normalizeWelcome,
  DEFAULT_WELCOME,
};
