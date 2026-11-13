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
  chatReminders: "multiGuildChatReminders.v1",
  mainAutomations: "multiGuildMainAutomations.v1",
  importedPanels: "multiGuildImportedPanels.v1",
  bumpVotes: "multiGuildBumpVotes.v1",
  bumpVotesState: "multiGuildBumpVotesState.v1",
  announcements: "multiGuildAnnouncements.v1",
  announcementsState: "multiGuildAnnouncementsState.v1",
} as const;
type Kind = keyof typeof KEYS;

const LIMITS = { messages: 50, commands: 50, rolePanels: 15, panelRoles: 25, buttons: 10, autoResponders: 50, counters: 6, polls: 50 };
const CACHE_TTL_MS = 15_000;

/* ───────────── messaggio (testo + embed + pulsanti link) ───────────── */

/** row = fila (0-4) in cui sta il pulsante */
type MsgButton = { label: string; url: string; emoji: string; row: number };
type MsgField = { name: string; value: string; inline: boolean };
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
  fields: MsgField[];
  /** link sul titolo */
  url: string;
};
/* Components V2: blocchi al posto di testo+embed */
type V2Block =
  | { type: "text"; content: string }
  | { type: "separator"; divider: boolean; spacing: "small" | "large" }
  | { type: "media"; urls: string[] }
  | { type: "section"; content: string; accessory: "thumbnail" | "button"; thumbnailUrl: string; button: { label: string; url: string; emoji: string } }
  | { type: "buttons"; buttons: { label: string; url: string; emoji: string }[] };
type MsgV2 = { enabled: boolean; container: boolean; accentColor: string; blocks: V2Block[] };
type MsgDraft = {
  content: string;
  embed: MsgEmbed;
  buttons: MsgButton[];
  v2: MsgV2;
  /** se true, le menzioni utente nel testo (e mentionUserId) pingano */
  mentionUsers: boolean;
  /** se true, le menzioni ruolo <@&…> nel testo pingano */
  mentionRoles: boolean;
};

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
  /* fila scelta dall'utente; senza fila: 5 per riga in ordine */
  const buttons = (Array.isArray(r.buttons) ? r.buttons : [])
    .map((b?, i?: number) => {
      const row = Number(b?.row);
      return { label: str(b?.label, 80).trim(), url: httpUrl(b?.url), emoji: str(b?.emoji, 80).trim(), row: Number.isInteger(row) && row >= 0 && row <= 4 ? row : Math.min(4, Math.floor((i || 0) / 5)) };
    })
    .filter((b) => (b.label || b.emoji) && b.url)
    .slice(0, LIMITS.buttons);
  const fields = (Array.isArray(e.fields) ? e.fields : [])
    .map((f?) => ({ name: str(f?.name, 256), value: str(f?.value, 1024), inline: f?.inline === true }))
    .filter((f) => f.name.trim() || f.value.trim())
    .slice(0, 25);
  const v = r.v2 && typeof r.v2 === "object" ? r.v2 : {};
  const linkBtn = (b?) => ({ label: str(b?.label, 80).trim(), url: httpUrl(b?.url), emoji: str(b?.emoji, 80).trim() });
  const blocks: V2Block[] = (Array.isArray(v.blocks) ? v.blocks : [])
    .map((x?): V2Block | null => {
      const t = String(x?.type || "");
      if (t === "text") return { type: "text", content: str(x.content, 4000) };
      if (t === "separator") return { type: "separator", divider: x.divider !== false, spacing: x.spacing === "large" ? "large" : "small" };
      if (t === "media") return { type: "media", urls: (Array.isArray(x.urls) ? x.urls : []).map((u?) => urlOrToken(u)).filter(Boolean).slice(0, 10) };
      if (t === "section")
        return {
          type: "section",
          content: str(x.content, 4000),
          accessory: x.accessory === "button" ? "button" : "thumbnail",
          thumbnailUrl: urlOrToken(x.thumbnailUrl),
          button: linkBtn(x.button),
        };
      if (t === "buttons") return { type: "buttons", buttons: (Array.isArray(x.buttons) ? x.buttons : []).map(linkBtn).filter((b) => (b.label || b.emoji) && b.url).slice(0, 5) };
      return null;
    })
    .filter((x): x is V2Block => x !== null)
    .slice(0, 30);
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
      fields,
      url: httpUrl(e.url),
    },
    buttons,
    v2: { enabled: v.enabled === true, container: v.container !== false, accentColor: hex(v.accentColor, ""), blocks },
    /* default: ruoli sì; utenti sì solo se già salvato o bozza legacy con {user} (benvenuto/annunci) */
    mentionUsers:
      typeof r.mentionUsers === "boolean" ? r.mentionUsers === true : /\{user\}/.test(String(r.content || "")),
    mentionRoles: r.mentionRoles !== false,
  };
}

function draftIsEmpty(d: MsgDraft) {
  if (d.v2?.enabled) {
    return !d.v2.blocks.some((b) =>
      b.type === "text" || b.type === "section" ? b.content.trim() : b.type === "media" ? b.urls.length : b.type === "buttons" ? b.buttons.length : false,
    );
  }
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
  let s = String(text || "");
  /* {bonus} spesso è su riga sua nei draft dashboard: se vuoto non lasciare la riga bianca. */
  if (Object.prototype.hasOwnProperty.call(vars, "bonus")) {
    const bonusRaw = String(vars.bonus ?? "");
    if (!bonusRaw.trim()) {
      s = s
        .replace(/\n[ \t]*\{bonus\}[ \t]*(?=\n|$)/g, "")
        .replace(/\{bonus\}[ \t]*\n/g, "")
        .replace(/\{bonus\}/g, "");
    } else {
      const bonusBody = bonusRaw.replace(/^\n+/, "").replace(/\n+$/, "");
      s = s.replace(/\n[ \t]*\{bonus\}/g, `\n${bonusBody}`);
      s = s.replace(/\{bonus\}/g, bonusRaw);
    }
  }
  return s.replace(/\{([a-zA-Z_.]+)\}/g, (m, k: string) => {
    if (k === "bonus") return m;
    return Object.prototype.hasOwnProperty.call(vars, k) ? vars[k] : m;
  });
}

/** Corpo REST di un messaggio Discord. `extraRows` = componenti aggiuntivi (es. pulsanti ruolo). */
/** Pulsante link per i componenti Discord. */
function linkButtonComponent(b: { label: string; url: string; emoji: string }, vars: FillVars) {
  const c: Record<string, any> = { type: 2, style: 5, url: b.url };
  if (b.label) c.label = fill(b.label, vars).slice(0, 80);
  const em = parseEmoji(b.emoji);
  if (em) c.emoji = em;
  return c;
}

/** allowed_mentions da draft: parse vuoto; utenti/ruoli solo se i toggle sono accesi. */
function buildAllowedMentions(draft: MsgDraft, text: string, opts: { mentionUserId?: string | null } = {}) {
  const users: string[] = [];
  const roles: string[] = [];
  if (draft.mentionUsers) {
    if (opts.mentionUserId && isId(opts.mentionUserId)) users.push(String(opts.mentionUserId));
    for (const m of String(text || "").matchAll(/<@!?(\d{16,22})>/g)) users.push(m[1]);
  }
  if (draft.mentionRoles) {
    for (const m of String(text || "").matchAll(/<@&(\d{16,22})>/g)) roles.push(m[1]);
  }
  return {
    parse: [] as string[],
    ...(users.length ? { users: [...new Set(users)].slice(0, 20) } : {}),
    ...(roles.length ? { roles: [...new Set(roles)].slice(0, 20) } : {}),
  };
}

/** Components V2: blocchi (testo, sezioni, immagini, separatori, pulsanti), dentro un contenitore se richiesto. */
function buildV2Body(draft: MsgDraft, vars: FillVars, extraRows: any[], opts: { mentionUserId?: string | null }) {
  const out: any[] = [];
  for (const b of draft.v2.blocks) {
    if (b.type === "text") {
      const content = fill(b.content, vars).trim();
      if (content) out.push({ type: 10, content: content.slice(0, 4000) });
    } else if (b.type === "separator") {
      out.push({ type: 14, divider: b.divider, spacing: b.spacing === "large" ? 2 : 1 });
    } else if (b.type === "media") {
      const items = b.urls.map((u) => httpUrl(fill(u, vars))).filter(Boolean).map((url) => ({ media: { url } }));
      if (items.length) out.push({ type: 12, items });
    } else if (b.type === "section") {
      const content = fill(b.content, vars).trim();
      if (!content) continue;
      let accessory: Record<string, any> | null = null;
      if (b.accessory === "button" && b.button.url && (b.button.label || b.button.emoji)) accessory = linkButtonComponent(b.button, vars);
      if (b.accessory === "thumbnail") {
        const url = httpUrl(fill(b.thumbnailUrl, vars));
        if (url) accessory = { type: 11, media: { url } };
      }
      /* una sezione senza accessorio non è valida: diventa testo semplice */
      out.push(accessory ? { type: 9, components: [{ type: 10, content: content.slice(0, 4000) }], accessory } : { type: 10, content: content.slice(0, 4000) });
    } else if (b.type === "buttons" && b.buttons.length) {
      out.push({ type: 1, components: b.buttons.map((x) => linkButtonComponent(x, vars)) });
    }
  }
  if (!out.length) out.push({ type: 10, content: "​" });
  const accent = draft.v2.accentColor ? parseInt(draft.v2.accentColor.slice(1), 16) : null;
  const components = draft.v2.container ? [{ type: 17, ...(accent != null ? { accent_color: accent } : {}), components: out }, ...extraRows] : [...out, ...extraRows];
  const text = fill(
    draft.v2.blocks.map((b) => (b.type === "text" || b.type === "section" ? b.content : "")).join("\n"),
    vars,
  );
  return {
    flags: 1 << 15,
    components,
    allowed_mentions: buildAllowedMentions(draft, text, opts),
  };
}

function buildMessageBody(draft: MsgDraft, vars: FillVars = {}, extraRows: any[] = [], opts: { mentionUserId?: string | null } = {}) {
  if (draft.v2?.enabled) return buildV2Body(draft, vars, extraRows, opts);
  const body: Record<string, any> = {};
  const content = fill(draft.content, vars).trim();
  if (content) body.content = content.slice(0, 2000);
  if (draft.embed.enabled) {
    const e = draft.embed;
    const embed: Record<string, any> = { color: parseInt(e.color.slice(1), 16) };
    const title = fill(e.title, vars).trim();
    const desc = fill(e.description, vars).trim();
    if (title) embed.title = title.slice(0, 256);
    if (title && e.url) embed.url = e.url;
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
    const fields = (e.fields || [])
      .map((f) => ({ name: fill(f.name, vars).trim().slice(0, 256) || "​", value: fill(f.value, vars).trim().slice(0, 1024) || "​", inline: f.inline }))
      .slice(0, 25);
    if (fields.length) embed.fields = fields;
    if (embed.title || embed.description || embed.image || embed.thumbnail || embed.author || embed.fields) body.embeds = [embed];
  }
  const rows: any[] = [];
  /* pulsanti link raggruppati per fila (max 5 per fila, file vuote saltate) */
  const byRow = new Map<number, MsgButton[]>();
  for (const b of draft.buttons) byRow.set(b.row ?? 0, [...(byRow.get(b.row ?? 0) || []), b]);
  for (const r of [...byRow.keys()].sort((a, b) => a - b)) {
    const group = byRow.get(r) || [];
    rows.push({
      type: 1,
      components: group.slice(0, 5).map((b) => {
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
  body.allowed_mentions = buildAllowedMentions(draft, String(body.content || ""), opts);
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
  /** pannello del bot importato (es. "info"): finché non lo pubblichi dalla dashboard lo gestisce il codice */
  panelKey?: string | null;
  /** true dopo la prima pubblicazione dalla dashboard: il codice non lo ripubblica più */
  managed?: boolean;
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
    panelKey: prev?.panelKey ?? null,
    managed: prev?.managed === true,
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
  mode: "buttons" | "menu" | "reactions";
  unique: boolean;
  placeholder: string;
  roles: RoleOption[];
  draft: MsgDraft;
  messageId: string | null;
  sentChannelId: string | null;
  /** toggle = dà e toglie · give = dà soltanto (es. verifica) · remove = toglie soltanto */
  behavior: "toggle" | "give" | "remove";
  /** quanti ruoli di questo pannello si possono avere insieme (0 = nessun limite) */
  maxRoles: number;
  /** solo chi ha uno di questi ruoli può usare il pannello */
  requiredRoleIds: string[];
  /** chi ha uno di questi ruoli non può usarlo */
  blockedRoleIds: string[];
  /** pulsanti/menu: risposta privata con cosa è cambiato */
  replyEphemeral: boolean;
  /** pulsanti: quanti per riga (1-5) */
  buttonsPerRow: number;
  /** menu: scelte minime e massime (max 0 = tutte) */
  menuMin: number;
  menuMax: number;
  /** reazioni: toglie la reazione dell'utente dopo averla gestita */
  clearReaction: boolean;
  updatedAt: number;
};

const PANEL_BEHAVIORS = ["toggle", "give", "remove"] as const;

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
    mode: r.mode === "menu" ? "menu" : r.mode === "reactions" ? "reactions" : "buttons",
    unique: r.unique === true,
    placeholder: str(r.placeholder, 150).trim(),
    roles,
    draft: normalizeDraft(r.draft),
    messageId: prev?.messageId ?? null,
    sentChannelId: prev?.sentChannelId ?? null,
    ...normalizeRolePanelExtras(r, roles.length),
    updatedAt: Date.now(),
  };
}

function normalizeRolePanelExtras(r: Record<string, any>, roleCount: number) {
  const ids = (v: unknown) => [...new Set<string>((Array.isArray(v) ? v : []).filter(isId).map(String))].slice(0, 20);
  const int = (v: unknown, min: number, max: number, fb: number) => {
    const n = Math.floor(Number(v));
    return Number.isFinite(n) ? Math.max(min, Math.min(max, n)) : fb;
  };
  const menuMin = int(r.menuMin, 0, Math.max(0, roleCount), 0);
  const menuMaxRaw = int(r.menuMax, 0, Math.max(0, roleCount), 0);
  return {
    behavior: (PANEL_BEHAVIORS as readonly string[]).includes(r.behavior) ? (r.behavior as RolePanel["behavior"]) : "toggle",
    maxRoles: int(r.maxRoles, 0, 25, 0),
    requiredRoleIds: ids(r.requiredRoleIds),
    blockedRoleIds: ids(r.blockedRoleIds),
    replyEphemeral: r.replyEphemeral !== false,
    buttonsPerRow: int(r.buttonsPerRow, 1, 5, 5),
    menuMin,
    menuMax: menuMaxRaw && menuMaxRaw < menuMin ? menuMin : menuMaxRaw,
    clearReaction: r.clearReaction === true,
  };
}

/** Controlli anti-duplicati e di coerenza: ritorna il primo problema (o null). */
function validateRolePanel(p: RolePanel, linkRows = 0): string | null {
  if (!p.roles.length) return null;
  const roleIds = p.roles.map((o) => o.roleId);
  if (new Set(roleIds).size !== roleIds.length) return "Lo stesso ruolo è stato aggiunto due volte.";
  const overlap = p.requiredRoleIds.find((id) => p.blockedRoleIds.includes(id));
  if (overlap) return "Un ruolo non può essere sia richiesto sia bloccato.";
  const inPanelBlocked = p.blockedRoleIds.find((id) => roleIds.includes(id));
  if (inPanelBlocked) return "Un ruolo del pannello è anche tra quelli bloccati.";
  if (p.mode === "reactions") {
    if (p.roles.length > 20) return "Con le reazioni puoi mettere al massimo 20 ruoli (limite di Discord).";
    const keys = p.roles.map((o) => emojiKey(o.emoji)).filter(Boolean);
    if (new Set(keys).size !== keys.length) return "Due ruoli hanno la stessa reazione: ogni ruolo deve avere un'emoji diversa.";
  }
  if (p.mode === "buttons") {
    const labels = p.roles.map((o) => `${(o.label || "").toLowerCase()}|${emojiKey(o.emoji)}`).filter((l) => l !== "|");
    if (new Set(labels).size !== labels.length) return "Due pulsanti hanno lo stesso testo ed emoji: i membri non li distinguerebbero.";
    const rows = Math.ceil(p.roles.length / p.buttonsPerRow) + linkRows;
    if (rows > 5) {
      return `Troppe righe di pulsanti: Discord ne permette 5 (con ${p.buttonsPerRow} per riga e ${linkRows ? "i pulsanti link" : "nessun link"} ci stanno al massimo ${p.buttonsPerRow * (5 - linkRows)} ruoli).`;
    }
  }
  if (p.mode === "menu") {
    const labels = p.roles.map((o) => (o.label || o.roleId).toLowerCase());
    if (new Set(labels).size !== labels.length) return "Due voci del menu hanno lo stesso testo.";
    if (linkRows + 1 > 5) return "Troppi componenti nel messaggio.";
  }
  return null;
}

type RolePanelAction = { type: "click"; roleId: string } | { type: "unclick"; roleId: string } | { type: "select"; values: string[] };

/** Chi può usare il pannello (ruoli richiesti / bloccati). */
function rolePanelAccessError(panel: RolePanel, held: Set<string>): string | null {
  const req = panel.requiredRoleIds || [];
  const blk = panel.blockedRoleIds || [];
  if (req.length && !req.some((id) => held.has(id))) return `Questo pannello è riservato a chi ha ${req.map((id) => `<@&${id}>`).join(" o ")}.`;
  if (blk.length && blk.some((id) => held.has(id))) return "Non puoi usare questo pannello.";
  return null;
}

/** Quali ruoli del pannello deve avere il membro dopo un clic / scelta / reazione. */
function decideRolePanel(panel: RolePanel, held: Set<string>, action: RolePanelAction): { want: Set<string>; error: string | null } {
  const ids = panel.roles.map((o) => o.roleId);
  const cur = new Set(ids.filter((id) => held.has(id)));
  const limit = panel.unique ? 1 : panel.maxRoles || 0;
  const behavior = panel.behavior || "toggle";
  const tooMany = `Puoi avere al massimo ${limit} ${limit === 1 ? "ruolo" : "ruoli"} di questo pannello: togline uno prima.`;
  if (action.type === "click") {
    const id = action.roleId;
    const want = new Set(cur);
    if (behavior === "remove") {
      want.delete(id);
      return { want, error: cur.has(id) ? null : "Non hai questo ruolo: questo pannello serve solo a toglierlo." };
    }
    if (cur.has(id)) {
      if (behavior === "give") return { want, error: "Hai già questo ruolo." };
      want.delete(id);
      return { want, error: null };
    }
    if (panel.unique) want.clear();
    want.add(id);
    if (limit && want.size > limit) return { want: cur, error: tooMany };
    return { want, error: null };
  }
  if (action.type === "unclick") {
    const want = new Set(cur);
    if (behavior === "toggle") want.delete(action.roleId);
    return { want, error: null };
  }
  const sel = new Set(action.values.filter((v) => ids.includes(v)));
  const next =
    behavior === "give" ? new Set([...cur, ...sel]) : behavior === "remove" ? new Set([...cur].filter((id) => !sel.has(id))) : sel;
  if (limit && next.size > limit) return { want: cur, error: tooMany };
  return { want: next, error: null };
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
  if (!panel.roles.length || panel.mode === "reactions") return [];
  if (panel.mode === "menu") {
    return [
      {
        type: 1,
        components: [
          {
            type: 3,
            custom_id: `${ROLE_CID}:${panel.id}`,
            placeholder: (panel.placeholder || "Scegli i tuoi ruoli").slice(0, 150),
            min_values: Math.min(panel.menuMin || 0, panel.roles.length),
            max_values: panel.unique
              ? 1
              : Math.max(1, Math.min(panel.roles.length, panel.menuMax || panel.maxRoles || panel.roles.length)),
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
  const perRow = Math.max(1, Math.min(5, panel.buttonsPerRow || 5));
  panel.roles.forEach((o, i) => {
    if (i % perRow === 0) rows.push({ type: 1, components: [] });
    const c: Record<string, any> = { type: 2, style: o.style, custom_id: `${ROLE_CID}:${panel.id}:${o.roleId}`, label: label(o) };
    const em = parseEmoji(o.emoji);
    if (em) c.emoji = em;
    rows[rows.length - 1].components.push(c);
  });
  return rows;
}

/** Chiave confrontabile di un'emoji: id per quelle del server, il carattere per quelle normali. */
function emojiKey(raw?) {
  const em = parseEmoji(raw);
  if (!em) return "";
  if (em.id) return String(em.id);
  return String(em.name || "").replace(/\uFE0F/g, "");
}

/** Emoji nel formato che vuole l'API delle reazioni. */
function emojiForReactionApi(raw?) {
  const em = parseEmoji(raw);
  if (!em) return "";
  if (em.id) return `${em.name || "e"}:${em.id}`;
  return encodeURIComponent(String(em.name || ""));
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
  /* messaggio privato a chi esce (arriva solo se ha ancora un server in comune col bot) */
  goodbyeDm: { enabled: boolean; draft: MsgDraft };
  autoRoleIds: string[];
  updatedAt: number;
};

const DEFAULT_WELCOME: WelcomeSettings = {
  welcome: {
    enabled: false,
    channelId: null,
    draft: normalizeDraft({
      content: "{user}",
      mentionUsers: true,
      embed: { enabled: true, title: "Benvenuto in {server}!", description: "Ciao {user}, sei il membro numero **{membercount}**. Buona permanenza!", color: "#d49150" },
    }),
  },
  goodbye: {
    enabled: false,
    channelId: null,
    draft: normalizeDraft({ content: "**{username}** ha lasciato il server. Ora siamo {membercount}." }),
  },
  dm: { enabled: false, draft: normalizeDraft({ content: "Ciao {username}, benvenuto in **{server}**!" }) },
  goodbyeDm: { enabled: false, draft: normalizeDraft({ content: "Ciao {username}, ci mancherai in **{server}**!" }) },
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
  const gdm = r.goodbyeDm && typeof r.goodbyeDm === "object" ? r.goodbyeDm : null;
  const prevGdm = prev.goodbyeDm || DEFAULT_WELCOME.goodbyeDm;
  return {
    welcome: part("welcome"),
    goodbye: part("goodbye"),
    dm: dm
      ? { enabled: Object.prototype.hasOwnProperty.call(dm, "enabled") ? dm.enabled === true : prev.dm.enabled, draft: dm.draft ? normalizeDraft(dm.draft) : prev.dm.draft }
      : prev.dm,
    goodbyeDm: gdm
      ? { enabled: Object.prototype.hasOwnProperty.call(gdm, "enabled") ? gdm.enabled === true : prevGdm.enabled, draft: gdm.draft ? normalizeDraft(gdm.draft) : prevGdm.draft }
      : prevGdm,
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

/**
 * Manda un messaggio della dashboard in privato. Non lancia mai:
 * { sent, dmClosed } (dmClosed = privati chiusi o nessun server in comune).
 */
async function sendDraftDm(client?, userId?: string | null, draft?: MsgDraft | null, vars: Record<string, string> = {}) {
  const rest = client?.rest;
  const uid = String(userId || "");
  if (!rest || !isId(uid) || !draft || draftIsEmpty(draft)) return { sent: false, dmClosed: false };
  try {
    const { Routes } = require("discord.js") as typeof import("discord.js");
    const ch: any = await rest.post(Routes.userChannels(), { body: { recipient_id: uid } });
    await rest.post(Routes.channelMessages(ch.id), { body: buildMessageBody(draft, vars) });
    return { sent: true, dmClosed: false };
  } catch (err) {
    const code = Number((err as any)?.code || (err as any)?.rawError?.code);
    return { sent: false, dmClosed: code === 50007 || code === 50278 };
  }
}

async function writeWelcome(guildId: string, value: WelcomeSettings) {
  return saveGuild("welcome", guildId, value);
}

/* ───────────── promemoria in chat (a rotazione) ───────────── */

const CHAT_REMINDERS_MAX = 40;
type ChatReminder = { id: string; name: string; enabled: boolean; draft: MsgDraft };

function normalizeChatReminder(raw?, prev?): ChatReminder {
  const r = raw && typeof raw === "object" ? raw : {};
  const draft = normalizeDraft(r.draft);
  return {
    id: prev?.id || (typeof r.id === "string" && /^[a-z0-9]{4,40}$/i.test(r.id) ? r.id : newId()),
    name: str(r.name, 80).trim() || draft.embed.title.replace(/<a?:\w+:\d+>/g, "").trim().slice(0, 80) || "Promemoria",
    enabled: r.enabled !== false,
    draft,
  };
}

/** null = mai salvati (si usano i testi del codice). */
async function getChatReminders(guildId: string, fresh = false): Promise<ChatReminder[] | null> {
  const map = await loadMap("chatReminders", fresh);
  const v = map[String(guildId)];
  if (!v || typeof v !== "object" || !Array.isArray(v.items)) return null;
  return v.items.map((x: any) => normalizeChatReminder(x, x));
}

async function writeChatReminders(guildId: string, items: ChatReminder[]) {
  const clean = (Array.isArray(items) ? items : []).slice(0, CHAT_REMINDERS_MAX).map((x) => normalizeChatReminder(x, x));
  return saveGuild("chatReminders", String(guildId), { items: clean, updatedAt: Date.now() });
}

/* ───────────── oggetti generici per server (bump e voti, annunci) ───────────── */

type BlobKind = "bumpVotes" | "bumpVotesState" | "announcements" | "announcementsState";

async function getGuildBlob(kind: BlobKind, guildId: string, fresh = false): Promise<any | null> {
  const map = await loadMap(kind, fresh);
  const v = map[String(guildId)];
  return v && typeof v === "object" ? v : null;
}

async function setGuildBlob(kind: BlobKind, guildId: string, value: any) {
  return saveGuild(kind, String(guildId), value);
}

async function allGuildBlobs(kind: BlobKind, fresh = true): Promise<Record<string, any>> {
  return { ...(await loadMap(kind, fresh)) };
}

/* ───────────── automazioni del server principale (interruttori) ───────────── */

async function getDisabledAutomations(guildId: string, fresh = false): Promise<string[]> {
  const map = await loadMap("mainAutomations", fresh);
  const v = map[String(guildId)];
  return Array.isArray(v?.disabled) ? v.disabled.map(String) : [];
}

async function writeDisabledAutomations(guildId: string, disabled: string[]) {
  const clean = [...new Set((disabled || []).map((x) => String(x).trim()).filter((x) => /^[a-zA-Z]{2,40}$/.test(x)))];
  return saveGuild("mainAutomations", String(guildId), clean.length ? { disabled: clean } : null);
}

/** Per i gestori dei messaggi: spenta dalla dashboard? (cache breve) */
async function isAutomationEnabled(guildId: string, key: string): Promise<boolean> {
  if (!guildId) return true;
  const off = await getDisabledAutomations(guildId).catch(() => [] as string[]);
  return !off.includes(key);
}

/* pannelli importati una volta sola (anche se poi li elimini dalla dashboard) */
async function wasPanelImported(guildId: string, key: string, fresh = true): Promise<boolean> {
  const map = await loadMap("importedPanels", fresh);
  return Array.isArray(map[String(guildId)]) && map[String(guildId)].includes(key);
}

async function markPanelImported(guildId: string, key: string) {
  const map = await loadMap("importedPanels", true);
  const list = Array.isArray(map[String(guildId)]) ? map[String(guildId)] : [];
  if (!list.includes(key)) await saveGuild("importedPanels", String(guildId), [...list, key]);
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
    cooldownSeconds: Math.max(0, Math.min(3600, Math.floor(Number.isFinite(Number(r.cooldownSeconds)) ? Number(r.cooldownSeconds) : 10))),
    deleteTrigger: r.deleteTrigger === true,
    timeWindow: normalizeTimeWindow(r.timeWindow),
    updatedAt: Date.now(),
  };
}

/** Fascia oraria {startHour, endHour} (ore 0-23, fine esclusa; può passare la mezzanotte). null = sempre. */
function normalizeTimeWindow(raw?) {
  if (!raw || typeof raw !== "object") return null;
  const s = Number(raw.startHour);
  const e = Number(raw.endHour);
  if (!Number.isInteger(s) || !Number.isInteger(e) || s < 0 || s > 23 || e < 0 || e > 24 || s === e) return null;
  return { startHour: s, endHour: e };
}

/** Ora attuale dentro la fascia, nel fuso del server. */
function inTimeWindow(win?, guildId?: string) {
  if (!win) return true;
  let tz = "Europe/Rome";
  try {
    const { getTenantTimezoneSync } = require("./tenantGuildSettings") as typeof import("./tenantGuildSettings");
    tz = getTenantTimezoneSync(guildId) || tz;
  } catch (_) {}
  const h = Number(new Intl.DateTimeFormat("en-GB", { timeZone: tz, hour: "2-digit", hourCycle: "h23" }).format(new Date()));
  return win.startHour < win.endHour ? h >= win.startHour && h < win.endHour : h >= win.startHour || h < win.endHour;
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
const COUNTER_TYPES = ["members", "humans", "bots", "online", "statusOnline", "idle", "dnd", "offline", "boosts", "boostTier", "channels", "roles", "emojis"] as const;
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

/** Nome del canale di un contatore (stesso formato per lo scheduler e per il contatore classico del principale). */
function counterDisplayName(counter?, counts?: Record<string, number> | null) {
  const n = counts ? counts[counter?.type] : NaN;
  const value = Number.isFinite(n) ? n.toLocaleString("it-IT") : "?";
  return String(counter?.template || "{count}").replace(/\{count\}/g, value).slice(0, 100) || value;
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
  getGuildBlob,
  setGuildBlob,
  allGuildBlobs,
  inTimeWindow,
  getDisabledAutomations,
  writeDisabledAutomations,
  isAutomationEnabled,
  wasPanelImported,
  markPanelImported,
  CHAT_REMINDERS_MAX,
  normalizeChatReminder,
  getChatReminders,
  writeChatReminders,
  LIMITS,
  nextRepeatAt,
  listRows,
  writeRows,
  allGuildRows,
  normalizeAutoResponder,
  matchesAutoResponder,
  normalizeCounter,
  counterDisplayName,
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
  validateRolePanel,
  decideRolePanel,
  rolePanelAccessError,
  emojiKey,
  emojiForReactionApi,
  getWelcome,
  sendDraftDm,
  hasSavedWelcome,
  isMainGuild,
  writeWelcome,
  normalizeWelcome,
  DEFAULT_WELCOME,
};
