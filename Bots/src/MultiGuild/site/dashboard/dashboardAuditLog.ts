/**
 * Registro delle modifiche fatte dalla dashboard: chi ha cambiato cosa e quando, per server.
 * Un middleware guarda ogni scrittura (POST/PATCH/PUT/DELETE) su /webhooks/site-dashboard/…
 * e, se è andata a buon fine (2xx), salva una riga leggibile con i dettagli del body
 * (comandi on/off, permessi, canali, ruoli, ecc.). Niente blob base64 / backup interi.
 * Storage: BotState "dashboardAudit.v1.<guildId>" (documento a parte, ultime 500 righe).
 */
const BotState = require("../../../shared/schemas/botState/botStateSchema");
const { isMongoReady } = require("../../../shared/db/mongoConnect") as typeof import("../../../shared/db/mongoConnect");
const { fetchDiscordUser, verifyDashboardGuildAccess } = require("./siteDashboardApi") as typeof import("./siteDashboardApi");

const MAX_ROWS = 500;
const MAX_FIELDS = 48;
const PREFIX = "/webhooks/site-dashboard";

/* scritture che in realtà sono letture o rumore: non vanno nel registro */
const SKIP = [
  /\/tickets\/transcripts$/,
  /\/boards\/quote-preview$/,
  /\/notifications\/read$/,
  /\/account\/gdpr\//,
  /\/tickets\/panels\/sync$/,
];

const FIELD_LABELS: Record<string, string> = {
  prefix: "prefisso",
  updatesChannelId: "canale aggiornamenti",
  language: "lingua del server",
  timezone: "fuso orario",
  dashboardRoleIds: "ruoli dashboard",
  dashboardUserIds: "utenti dashboard",
  modLogsChannelId: "canale mod logs",
  dmOnAction: "DM azioni",
  exemptRoleIds: "ruoli esclusi",
  exemptChannelIds: "canali esclusi",
  requireReason: "motivo obbligatorio",
  banDeleteDays: "giorni messaggi ban",
  logCommandUsage: "log uso comandi",
  replyWithReason: "rispondi con motivazione",
  useDiscordTimeout: "timeout Discord per mute",
  keepMessagesOnBan: "conserva messaggi al ban",
  deleteModCommands: "elimina comandi moderazione",
  moderatorRoleIds: "ruoli moderatore",
  protectedRoleIds: "ruoli protetti",
  messages: "messaggi personalizzati",
  autoPunishRules: "punizione automatica",
  appeals: "ricorsi",
  allowBanned: "ricorsi ban",
  allowMuted: "ricorsi mute",
  waitDaysBan: "attesa ban (giorni)",
  waitDaysMute: "attesa mute (giorni)",
  dmOnApproveBan: "DM approvazione ban",
  dmOnApproveMute: "DM approvazione mute",
  dmOnReject: "DM rifiuto ricorso",
  inviteUrl: "URL invito post-unban",
  boards: "bacheca",
  botNickname: "nickname del bot",
  botAvatar: "avatar del bot",
  botBanner: "banner del bot",
  botAvatarUrl: "avatar del bot",
  botBannerUrl: "banner del bot",
  enabled: "attivo",
  title: "titolo",
  description: "descrizione",
  members: "membri",
  perms: "permessi",
  name: "nome",
  thankYouEmbed: "ringraziamento",
  pings: "ping",
  filters: "filtri",
  quickReplies: "risposte rapide",
  staleAlert: "avvisi ticket fermi",
  roleMode: "filtro ruoli",
  roleIds: "ruoli",
  channelMode: "filtro canali",
  channelIds: "canali",
  categoryId: "categoria",
  channelId: "canale",
  logChannelId: "canale log",
  supportRoleId: "ruolo supporto",
  staffRoleId: "ruolo staff",
  highStaffRoleId: "ruolo high staff",
  memberRoleId: "ruolo membro",
  blacklistRoleId: "ruolo blacklist",
  partnershipsChannelId: "canale partnership",
  partnerManagerRoleId: "ruolo manager",
  logsChannelId: "canale log",
  inviteChannelId: "canale invite",
  mode: "modalità",
  sharedChannelId: "canale condiviso",
  quoteChannelId: "canale quote",
  repostChannelId: "canale repost",
  clipChannelId: "canale clip",
  skullChannelId: "canale skull",
  features: "funzioni bacheca",
  quoteStyle: "stile quote",
  forceNew: "nuovo messaggio",
  reason: "motivo",
  type: "tipo",
  targetId: "destinazione",
  panelId: "pannello",
  panelIds: "pannelli",
  formId: "form",
  fields: "campi form",
  mentionOnOpen: "menzioni all’apertura",
  buttonLabel: "etichetta pulsante",
  emoji: "emoji",
  color: "colore",
  points: "punti",
  delta: "variazione punti",
  amount: "crediti",
  days: "giorni",
  plan: "piano",
  config: "backup",
  commands: "comandi",
};

const SKIP_KEYS = new Set([
  "guildId",
  "token",
  "accessToken",
  "authorization",
  "password",
  "secret",
]);

const BINARYISH = new Set([
  "botAvatar",
  "botBanner",
  "avatar",
  "banner",
  "image",
  "file",
  "dataUrl",
  "config",
]);

const MODE_LABEL: Record<string, string> = {
  include: "solo questi",
  exclude: "tutti tranne",
  shared: "condivisa",
  split: "separata",
  configured: "configurata",
  custom: "personalizzata",
};

function auditKey(guildId?) {
  return `dashboardAudit.v1.${String(guildId || "").trim()}`;
}

function labelOf(key?) {
  const k = String(key || "");
  return FIELD_LABELS[k] || k;
}

function shortId(id?) {
  const s = String(id || "").trim();
  if (!s) return "—";
  if (/^\d{16,22}$/.test(s)) return s;
  return s.length > 24 ? `${s.slice(0, 12)}…` : s;
}

function formatScalar(value?) {
  if (value === null || value === undefined) return "tolto";
  if (typeof value === "boolean") return value ? "sì" : "no";
  if (typeof value === "number") return Number.isFinite(value) ? String(value) : "—";
  const s = String(value).trim();
  if (!s) return "vuoto";
  if (MODE_LABEL[s]) return MODE_LABEL[s];
  if (/^data:[a-z]+\/[a-z0-9.+-]+;base64,/i.test(s) || s.length > 180) return "aggiornato";
  return s.length > 80 ? `${s.slice(0, 77)}…` : s;
}

function formatIdList(value?, kind = "id") {
  if (!Array.isArray(value) || !value.length) return `nessun ${kind}`;
  const ids = value.map((x?) => shortId(x)).filter(Boolean);
  if (ids.length <= 4) return ids.join(", ");
  return `${ids.slice(0, 3).join(", ")} +${ids.length - 3}`;
}

function summarizeCommandAcl(name?, acl?) {
  const cmd = String(name || "").trim() || "comando";
  if (acl == null) return `comando ${cmd}: ripristinato (acceso, senza filtri)`;
  if (typeof acl !== "object" || Array.isArray(acl)) return `comando ${cmd}: aggiornato`;

  const enabled = acl.enabled !== false;
  const parts = [`comando ${cmd}: ${enabled ? "acceso" : "spento"}`];
  if (!enabled) return parts[0];

  const roleMode = acl.roleMode === "include" || acl.roleMode === "exclude" ? acl.roleMode : null;
  const channelMode = acl.channelMode === "include" || acl.channelMode === "exclude" ? acl.channelMode : null;
  const roleIds = Array.isArray(acl.roleIds) ? acl.roleIds : [];
  const channelIds = Array.isArray(acl.channelIds) ? acl.channelIds : [];

  if (roleMode && roleIds.length) {
    parts.push(`ruoli (${MODE_LABEL[roleMode]}): ${formatIdList(roleIds, "ruolo")}`);
  } else {
    parts.push("ruoli: tutti");
  }
  if (channelMode && channelIds.length) {
    parts.push(`canali (${MODE_LABEL[channelMode]}): ${formatIdList(channelIds, "canale")}`);
  } else {
    parts.push("canali: tutti");
  }
  if (acl.boardFeatureLocked === true) parts.push("bloccato dalla bacheca");
  return parts.join(" · ");
}

function summarizeCommandsMap(commands?) {
  if (!commands || typeof commands !== "object" || Array.isArray(commands)) return ["comandi: aggiornati"];
  const names = Object.keys(commands);
  if (!names.length) return ["comandi: nessun cambiamento"];
  return names.slice(0, 20).map((name?) => summarizeCommandAcl(name, (commands as any)[name]));
}

function summarizeMembers(members?) {
  if (!Array.isArray(members)) return "membri: aggiornati";
  if (!members.length) return "membri: nessuno";
  const roles = members.filter((m?) => m?.type === "role").map((m?) => shortId(m.id));
  const users = members.filter((m?) => m?.type === "user").map((m?) => shortId(m.id));
  const bits = [];
  if (roles.length) bits.push(`ruoli ${formatIdList(roles, "ruolo")}`);
  if (users.length) bits.push(`persone ${formatIdList(users, "utente")}`);
  return `membri (${members.length}): ${bits.join(" · ") || "elenco aggiornato"}`;
}

function summarizePerms(perms?) {
  if (!perms || typeof perms !== "object" || Array.isArray(perms)) return "permessi: aggiornati";
  const on = [];
  const off = [];
  for (const [k, v] of Object.entries(perms)) {
    if (v === true) on.push(k);
    else if (v === false) off.push(k);
  }
  const bits = [];
  if (on.length) bits.push(`sì: ${on.slice(0, 8).join(", ")}${on.length > 8 ? ` +${on.length - 8}` : ""}`);
  if (off.length) bits.push(`no: ${off.slice(0, 8).join(", ")}${off.length > 8 ? ` +${off.length - 8}` : ""}`);
  return `permessi: ${bits.join(" · ") || "invariati"}`;
}

function summarizeBoards(boards?) {
  if (!boards || typeof boards !== "object" || Array.isArray(boards)) return ["bacheca: aggiornata"];
  const out = [];
  if (Object.prototype.hasOwnProperty.call(boards, "enabled")) {
    out.push(`bacheca: ${(boards as any).enabled ? "attiva" : "spenta"}`);
  }
  if ((boards as any).mode) out.push(`modalità: ${MODE_LABEL[String((boards as any).mode)] || String((boards as any).mode)}`);
  for (const key of ["sharedChannelId", "quoteChannelId", "repostChannelId", "clipChannelId", "skullChannelId"]) {
    if (!Object.prototype.hasOwnProperty.call(boards, key)) continue;
    const v = (boards as any)[key];
    out.push(`${labelOf(key)}: ${v ? shortId(v) : "tolto"}`);
  }
  const features = (boards as any).features;
  if (features && typeof features === "object") {
    const bits = Object.entries(features).map(([k, v]) => `${k} ${v ? "on" : "off"}`);
    if (bits.length) out.push(`funzioni: ${bits.join(", ")}`);
  }
  if ((boards as any).quoteStyle && typeof (boards as any).quoteStyle === "object") {
    const qs = (boards as any).quoteStyle;
    const bits = ["bg", "font", "orientation"]
      .filter((k?) => qs[k] != null)
      .map((k?) => `${k}=${qs[k]}`);
    if (qs.bold === true) bits.push("grassetto");
    if (qs.flip === true) bits.push("specchiato");
    if (bits.length) out.push(`stile quote: ${bits.join(", ")}`);
  }
  return out.length ? out : ["bacheca: aggiornata"];
}

function pushLine(out?, line?) {
  const s = String(line || "").trim();
  if (!s || out.length >= MAX_FIELDS) return;
  if (out.includes(s)) return;
  out.push(s);
}

function walkValue(key?, value?, out?, depth = 0) {
  if (out.length >= MAX_FIELDS) return;
  const k = String(key || "");
  if (!k || SKIP_KEYS.has(k)) return;

  if (BINARYISH.has(k)) {
    pushLine(out, `${labelOf(k)}: ${value == null || value === "" ? "tolto" : "aggiornato"}`);
    return;
  }

  if (k === "commands" && value && typeof value === "object" && !Array.isArray(value)) {
    for (const line of summarizeCommandsMap(value)) pushLine(out, line);
    return;
  }
  if (k === "boards" && value && typeof value === "object" && !Array.isArray(value)) {
    for (const line of summarizeBoards(value)) pushLine(out, line);
    return;
  }
  if (k === "members") {
    pushLine(out, summarizeMembers(value));
    return;
  }
  if (k === "perms") {
    pushLine(out, summarizePerms(value));
    return;
  }
  if (k === "dashboardRoleIds" || k === "dashboardUserIds" || k === "roleIds" || k === "channelIds" || k === "panelIds" || k === "mentionOnOpen") {
    pushLine(out, `${labelOf(k)}: ${formatIdList(value, "elemento")}`);
    return;
  }

  if (value === null || value === undefined) {
    pushLine(out, `${labelOf(k)}: tolto`);
    return;
  }
  if (typeof value === "boolean" || typeof value === "number" || typeof value === "string") {
    pushLine(out, `${labelOf(k)}: ${formatScalar(value)}`);
    return;
  }
  if (Array.isArray(value)) {
    if (!value.length) {
      pushLine(out, `${labelOf(k)}: vuoto`);
      return;
    }
    if (value.every((x?) => x == null || typeof x === "string" || typeof x === "number" || typeof x === "boolean")) {
      pushLine(out, `${labelOf(k)}: ${formatIdList(value, "elemento")}`);
      return;
    }
    pushLine(out, `${labelOf(k)}: ${value.length} elementi`);
    return;
  }
  if (typeof value === "object" && depth < 2) {
    const entries = Object.entries(value);
    if (!entries.length) {
      pushLine(out, `${labelOf(k)}: vuoto`);
      return;
    }
    for (const [ck, cv] of entries) {
      if (out.length >= MAX_FIELDS) break;
      walkValue(ck, cv, out, depth + 1);
    }
    return;
  }
  pushLine(out, `${labelOf(k)}: aggiornato`);
}

function extractPathHints(path?) {
  const p = String(path || "");
  const out = [];
  const panel = p.match(/\/tickets\/panels\/([^/]+)/);
  if (panel && panel[1] && panel[1] !== "sync") pushLine(out, `pannello: ${shortId(decodeURIComponent(panel[1]))}`);
  const multi = p.match(/\/tickets\/multipanels\/([^/]+)/);
  if (multi && multi[1]) pushLine(out, `multi-pannello: ${shortId(decodeURIComponent(multi[1]))}`);
  const form = p.match(/\/tickets\/forms\/([^/]+)/);
  if (form && form[1]) pushLine(out, `form: ${shortId(decodeURIComponent(form[1]))}`);
  const team = p.match(/\/tickets\/teams\/([^/]+)/);
  if (team && team[1] && team[1] !== "members") pushLine(out, `team: ${shortId(decodeURIComponent(team[1]))}`);
  const ticket = p.match(/\/tickets\/(\d{1,12})\/force-close/);
  if (ticket) pushLine(out, `ticket #${ticket[1]}`);
  const manager = p.match(/\/partnership\/managers\/([^/]+)\/points/);
  if (manager) pushLine(out, `manager: ${shortId(decodeURIComponent(manager[1]))}`);
  const bl = p.match(/\/(?:tickets|partnership)\/blacklist\/([^/]+)/);
  if (bl) pushLine(out, `voce: ${shortId(decodeURIComponent(bl[1]))}`);
  return out;
}

function describe(method?, path?) {
  const p = String(path || "").replace(PREFIX, "");
  const m = String(method || "").toUpperCase();
  const rules: [RegExp, string, string?][] = [
    [/^\/guilds\/[^/]+\/settings$/, "Impostazioni modificate", "settings"],
    [/^\/guilds\/[^/]+\/moderation$/, "Moderazione modificata", "moderation"],
    [/^\/guilds\/[^/]+\/commands$/, "Comandi modificati", "commands"],
    [/^\/guilds\/[^/]+\/tickets$/, "Impostazioni ticket modificate", "tickets"],
    [/^\/guilds\/[^/]+\/tickets\/[^/]+\/force-close$/, "Ticket chiuso a forza", "tickets"],
    [/^\/guilds\/[^/]+\/tickets\/panels\/[^/]+\/publish$/, "Pannello ticket pubblicato", "tickets"],
    [/^\/guilds\/[^/]+\/tickets\/multipanels\/[^/]+\/publish$/, "Multi-pannello pubblicato", "tickets"],
    [/^\/guilds\/[^/]+\/tickets\/panels(\/[^/]+)?$/, m === "POST" ? "Pannello ticket creato" : m === "DELETE" ? "Pannello ticket eliminato" : "Pannello ticket modificato", "tickets"],
    [/^\/guilds\/[^/]+\/tickets\/multipanels(\/[^/]+)?$/, m === "POST" ? "Multi-pannello creato" : m === "DELETE" ? "Multi-pannello eliminato" : "Multi-pannello modificato", "tickets"],
    [/^\/guilds\/[^/]+\/tickets\/forms(\/[^/]+)?$/, m === "POST" ? "Form creato" : m === "DELETE" ? "Form eliminato" : "Form modificato", "tickets"],
    [/^\/guilds\/[^/]+\/tickets\/teams(\/[^/]+)?$/, m === "POST" ? "Team creato" : m === "DELETE" ? "Team eliminato" : "Team modificato", "tickets"],
    [/^\/guilds\/[^/]+\/tickets\/blacklist(\/[^/]+)?$/, m === "DELETE" ? "Tolto dalla blacklist ticket" : "Aggiunto alla blacklist ticket", "tickets"],
    [/^\/guilds\/[^/]+\/partnership\/blacklist(\/[^/]+)?$/, m === "DELETE" ? "Server tolto dalla blacklist partnership" : "Server aggiunto alla blacklist partnership", "partnership"],
    [/^\/guilds\/[^/]+\/partnership\/managers\/[^/]+\/points$/, "Punti di un manager modificati", "partnership"],
    [/^\/guilds\/[^/]+\/partnership\/migration\/undo$/, "Importazione partnership annullata", "partnership"],
    [/^\/guilds\/[^/]+\/partnership\/migration$/, "Importazione partnership avviata", "partnership"],
    [/^\/guilds\/[^/]+\/partnership$/, m === "DELETE" ? "Partnership azzerate" : "Partnership modificate", "partnership"],
    [/^\/guilds\/[^/]+\/community\/messages\/[^/]+\/send$/, "Messaggio pubblicato", "community"],
    [/^\/guilds\/[^/]+\/community\/messages\/[^/]+\/schedule$/, "Messaggio programmato", "community"],
    [/^\/guilds\/[^/]+\/community\/messages(\/[^/]+)?$/, m === "DELETE" ? "Messaggio eliminato" : "Messaggio salvato", "community"],
    [/^\/guilds\/[^/]+\/community\/commands(\/[^/]+)?$/, m === "DELETE" ? "Comando personalizzato eliminato" : "Comando personalizzato salvato", "community"],
    [/^\/guilds\/[^/]+\/community\/role-panels\/[^/]+\/publish$/, "Pannello ruoli pubblicato", "community"],
    [/^\/guilds\/[^/]+\/community\/role-panels(\/[^/]+)?$/, m === "DELETE" ? "Pannello ruoli eliminato" : "Pannello ruoli salvato", "community"],
    [/^\/guilds\/[^/]+\/community\/welcome\/test$/, "Prova benvenuto/addio inviata", "community"],
    [/^\/guilds\/[^/]+\/community\/welcome$/, "Benvenuto e addio modificati", "community"],
    [/^\/guilds\/[^/]+\/community\/auto-responders(\/[^/]+)?$/, m === "DELETE" ? "Risposta automatica eliminata" : "Risposta automatica salvata", "community"],
    [/^\/guilds\/[^/]+\/community\/counters(\/[^/]+)?$/, m === "DELETE" ? "Contatore eliminato" : m === "POST" ? "Contatore creato" : "Contatore modificato", "community"],
    [/^\/guilds\/[^/]+\/community\/server-logs$/, "Log del server modificati", "community"],
    [/^\/guilds\/[^/]+\/community\/giveaways\/[^/]+\/end$/, "Giveaway terminato in anticipo", "community"],
    [/^\/guilds\/[^/]+\/community\/giveaways\/[^/]+\/reroll$/, "Giveaway: nuovo vincitore estratto", "community"],
    [/^\/guilds\/[^/]+\/community\/giveaways(\/[^/]+)?$/, m === "DELETE" ? "Giveaway annullato" : "Giveaway creato", "community"],
    [/^\/guilds\/[^/]+\/community\/polls\/[^/]+\/end$/, "Sondaggio chiuso in anticipo", "community"],
    [/^\/guilds\/[^/]+\/community\/polls(\/[^/]+)?$/, m === "DELETE" ? "Sondaggio eliminato" : "Sondaggio creato", "community"],
    [/^\/guilds\/[^/]+\/config\/import$/, "Configurazione ripristinata da un backup", "settings"],
    [/^\/guilds\/[^/]+\/config\/export$/, "Configurazione esportata", "settings"],
    [/^\/credits\/spend$/, "Premium attivato o allungato", "premium"],
    [/^\/dev\/revoke-premium$/, "Premium tolto da uno sviluppatore", "premium"],
    [/^\/dev\/reset-guild$/, "Server azzerato da uno sviluppatore", "settings"],
    [/^\/dev\/leave$/, "Bot fatto uscire da uno sviluppatore", "settings"],
    [/^\/dev\/guild-botban$/, "Server bloccato da uno sviluppatore", "settings"],
  ];
  for (const [re, label, area] of rules) if (re.test(p)) return { label, area: area || "altro" };
  return { label: `Modifica (${m} ${p})`, area: "altro" };
}

function refineActionLabel(label?, area?, body?) {
  if (area === "commands" && body && typeof body === "object" && body.commands && typeof body.commands === "object") {
    const names = Object.keys(body.commands);
    if (names.length === 1) return `Comando «${names[0]}» modificato`;
    if (names.length > 1) return `${names.length} comandi modificati`;
  }
  return label;
}

function summarizeBody(body?, path?) {
  const out = extractPathHints(path);
  if (!body || typeof body !== "object" || Array.isArray(body)) return out;
  for (const [k, v] of Object.entries(body)) {
    if (out.length >= MAX_FIELDS) break;
    walkValue(k, v, out, 0);
  }
  return out;
}

async function appendAudit(guildId?, entry?) {
  if (!isMongoReady()) return;
  const gid = String(guildId || "").trim();
  if (!/^\d{16,22}$/.test(gid)) return;
  await BotState.updateOne(
    { key: auditKey(gid) },
    { $push: { value: { $each: [entry], $slice: -MAX_ROWS } } },
    { upsert: true },
  ).catch((err?) => global.logger?.warn?.("[DASH AUDIT] append:", err?.message || err));
}

/** Va montato PRIMA delle rotte della dashboard. */
function mountDashboardAuditMiddleware(app?, ctx: Record<string, any> = {}) {
  const normalize = typeof ctx.normalizeHeaderSecret === "function" ? ctx.normalizeHeaderSecret : (v?) => String(v || "").replace(/^Bearer\s+/i, "").trim();
  app.use(PREFIX, (req?, res?, next?) => {
    const method = String(req.method || "").toUpperCase();
    if (method === "GET" || method === "HEAD" || method === "OPTIONS") return next();
    const fullPath = `${PREFIX}${String(req.path || "")}`.replace(/\/+$/, "");
    if (SKIP.some((re) => re.test(fullPath))) return next();
    const body = req.body && typeof req.body === "object" ? req.body : {};
    const fromPath = fullPath.match(/\/guilds\/(\d{16,22})(\/|$)/);
    const guildId = fromPath ? fromPath[1] : String(body.guildId || body.id || "").trim();
    const token = normalize(req.headers?.authorization);
    const fields = summarizeBody(body, fullPath);
    res.on("finish", () => {
      if (res.statusCode < 200 || res.statusCode >= 300 || !guildId || !token) return;
      void (async () => {
        const user: any = await fetchDiscordUser(token).catch(() => null);
        const described = describe(method, fullPath);
        const action = refineActionLabel(described.label, described.area, body);
        await appendAudit(guildId, {
          at: Date.now(),
          userId: user?.ok ? String(user.userId) : null,
          username: user?.ok ? String(user.username || "") : null,
          avatar: user?.ok && user.avatar ? `https://cdn.discordapp.com/avatars/${user.userId}/${user.avatar}.png?size=64` : null,
          action,
          area: described.area,
          fields,
        });
      })();
    });
    return next();
  });
}

/** GET /webhooks/site-dashboard/guilds/:guildId/audit?page=&area= */
async function getDashboardAudit(client?, accessToken?, guildId?, query: Record<string, any> = {}) {
  const access: any = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) return access;
  const raw = await BotState.findOne({ key: auditKey(access.guildId) }).lean().catch(() => null);
  let rows = Array.isArray((raw as any)?.value) ? (raw as any).value.slice().reverse() : [];
  const area = String(query.area || "").trim();
  if (area && area !== "all") rows = rows.filter((r?) => r?.area === area);
  const perPage = 25;
  const total = rows.length;
  const pages = Math.max(1, Math.ceil(total / perPage));
  const page = Math.min(pages, Math.max(1, Math.floor(Number(query.page) || 1)));
  return { ok: true, status: 200, total, page, pages, rows: rows.slice((page - 1) * perPage, page * perPage) };
}

export = { mountDashboardAuditMiddleware, getDashboardAudit, appendAudit };
