/**
 * Registro delle modifiche fatte dalla dashboard: chi ha cambiato cosa e quando, per server.
 * Un middleware guarda ogni scrittura (POST/PATCH/PUT/DELETE) su /webhooks/site-dashboard/…
 * e, se è andata a buon fine (2xx), salva una riga leggibile. Niente valori sensibili: solo
 * i nomi dei campi cambiati (più i valori brevi di sì/no e numeri).
 * Storage: BotState "dashboardAudit.v1.<guildId>" (documento a parte, ultime 500 righe).
 */
const BotState = require("../../../shared/schemas/botState/botStateSchema");
const { isMongoReady } = require("../../../shared/db/mongoConnect") as typeof import("../../../shared/db/mongoConnect");
const { fetchDiscordUser, verifyDashboardGuildAccess } = require("./siteDashboardApi") as typeof import("./siteDashboardApi");

const MAX_ROWS = 500;
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
  dashboardRoleIds: "ruoli dashboard",
  boards: "bacheca",
  botNickname: "nickname del bot",
  botAvatar: "avatar del bot",
  botBanner: "banner del bot",
  enabled: "attivazione",
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
};

function auditKey(guildId?) {
  return `dashboardAudit.v1.${String(guildId || "").trim()}`;
}

function describe(method?, path?) {
  const p = String(path || "").replace(PREFIX, "");
  const m = String(method || "").toUpperCase();
  const rules: [RegExp, string, string?][] = [
    [/^\/guilds\/[^/]+\/settings$/, "Impostazioni modificate", "settings"],
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
    [/^\/guilds\/[^/]+\/config\/import$/, "Configurazione ripristinata da un backup", "settings"],
    [/^\/credits\/spend$/, "Premium attivato o allungato", "premium"],
    [/^\/dev\/revoke-premium$/, "Premium tolto da uno sviluppatore", "premium"],
    [/^\/dev\/reset-guild$/, "Server azzerato da uno sviluppatore", "settings"],
    [/^\/dev\/leave$/, "Bot fatto uscire da uno sviluppatore", "settings"],
    [/^\/dev\/guild-botban$/, "Server bloccato da uno sviluppatore", "settings"],
  ];
  for (const [re, label, area] of rules) if (re.test(p)) return { label, area: area || "altro" };
  return { label: `Modifica (${m} ${p})`, area: "altro" };
}

function summarizeBody(body?) {
  if (!body || typeof body !== "object" || Array.isArray(body)) return [];
  const out = [];
  for (const [k, v] of Object.entries(body)) {
    if (k === "guildId" || k === "token") continue;
    const label = FIELD_LABELS[k] || k;
    if (typeof v === "boolean") out.push(`${label}: ${v ? "sì" : "no"}`);
    else if (typeof v === "number") out.push(`${label}: ${v}`);
    else if (v === null) out.push(`${label}: tolto`);
    else out.push(label);
    if (out.length >= 8) break;
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
    const fields = summarizeBody(body);
    res.on("finish", () => {
      if (res.statusCode < 200 || res.statusCode >= 300 || !guildId || !token) return;
      void (async () => {
        const user: any = await fetchDiscordUser(token).catch(() => null);
        const { label, area } = describe(method, fullPath);
        await appendAudit(guildId, {
          at: Date.now(),
          userId: user?.ok ? String(user.userId) : null,
          username: user?.ok ? String(user.username || "") : null,
          avatar: user?.ok && user.avatar ? `https://cdn.discordapp.com/avatars/${user.userId}/${user.avatar}.png?size=64` : null,
          action: label,
          area,
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
