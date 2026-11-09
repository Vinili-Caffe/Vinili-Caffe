/**
 * Dashboard: messaggi/embed, comandi personalizzati, pannelli ruoli, benvenuto/addio.
 *   GET    /webhooks/site-dashboard/guilds/:guildId/community
 *   PUT    …/community/messages            (crea/modifica)     DELETE …/community/messages/:id
 *   POST   …/community/messages/:id/send   (pubblica o aggiorna subito)
 *   POST   …/community/messages/:id/schedule  { scheduledAt | null }
 *   PUT    …/community/commands            DELETE …/community/commands/:id
 *   PUT    …/community/role-panels         DELETE …/community/role-panels/:id
 *   POST   …/community/role-panels/:id/publish
 *   PATCH  …/community/welcome             POST …/community/welcome/test { kind }
 */
const { Routes } = require("discord.js") as typeof import("discord.js");
const { verifyDashboardGuildAccess } = require("./siteDashboardApi") as typeof import("./siteDashboardApi");
const { listGuildPickerData } = require("../../../Vinili/Partner/dashboard/siteDashboardPartnershipApi") as typeof import("../../../Vinili/Partner/dashboard/siteDashboardPartnershipApi");
const T = require("../../core/tenantCommunityTools") as typeof import("../../core/tenantCommunityTools");

function fail(status: number, error: string, message: string) {
  return { ok: false, status, error, message };
}

async function access(client?, token?, guildId?) {
  const a: any = await verifyDashboardGuildAccess(client, token, guildId);
  if (!a.ok) return a;
  if (!a.botPresent) return fail(400, "bot_missing", "Il bot non è presente in questo server.");
  return a;
}

const restOf = (client?) => client?._rest || client?.rest || null;

/** Errori Discord → messaggio chiaro. */
function discordError(err?) {
  const code = Number(err?.code || err?.rawError?.code);
  if (code === 50013) return "Al bot mancano i permessi in quel canale (Inviare messaggi / Incorporare link / Gestire i ruoli).";
  if (code === 50001) return "Il bot non vede quel canale.";
  if (code === 10003) return "Il canale non esiste più.";
  if (code === 50035) return "Discord ha rifiutato il messaggio: controlla link, emoji e lunghezze.";
  if (code === 50007) return "Non posso scrivere in privato a questo utente.";
  return String(err?.rawError?.message || err?.message || "Discord non ha accettato il messaggio.").slice(0, 200);
}

async function guildInfo(client?, gid?) {
  const rest = restOf(client);
  const g: any = await rest?.get(Routes.guild(gid), { query: new URLSearchParams({ with_counts: "true" }) }).catch(() => null);
  return { id: gid, name: g?.name || "", icon: g?.icon || null, memberCount: g?.approximate_member_count ?? null };
}

/** Pubblica o aggiorna un messaggio. Se il vecchio non esiste più (o il canale è cambiato) ne manda uno nuovo. */
async function sendOrEdit(client?, channelId?: string, prev?: { messageId: string | null; channelId: string | null }, body?) {
  const rest = restOf(client);
  if (!rest) return { ok: false, message: "Bot non raggiungibile." };
  if (prev?.messageId && prev.channelId === channelId) {
    try {
      const m: any = await rest.patch(Routes.channelMessage(channelId, prev.messageId), { body });
      return { ok: true, messageId: String(m?.id || prev.messageId), edited: true };
    } catch (err) {
      const code = Number(err?.code || err?.rawError?.code);
      if (code !== 10008) return { ok: false, message: discordError(err) };
    }
  }
  try {
    const m: any = await rest.post(Routes.channelMessages(channelId), { body });
    return { ok: true, messageId: String(m?.id || ""), edited: false };
  } catch (err) {
    return { ok: false, message: discordError(err) };
  }
}

/* ───────────── lettura ───────────── */

function reservedCommandNames(gid: string): Set<string> {
  const out = new Set<string>();
  try {
    const { buildTenantCommandCatalog } = require("../../core/tenantCommandAcl") as any;
    for (const cat of buildTenantCommandCatalog(gid) || []) {
      for (const c of cat?.commands || []) {
        if (c?.name) out.add(String(c.name).toLowerCase());
        for (const a of c?.aliases || []) out.add(String(a).toLowerCase());
      }
    }
  } catch {
    /* elenco non disponibile: il comando vero vince comunque a runtime */
  }
  return out;
}

/* emoji, canali e ruoli ripresi da Discord al massimo ogni 60s per server (la cache del processo API resta indietro) */
const pickerRefreshAt = new Map<string, number>();
function shouldRefreshPickers(gid: string) {
  const last = pickerRefreshAt.get(gid) || 0;
  if (Date.now() - last < 60_000) return false;
  pickerRefreshAt.set(gid, Date.now());
  return true;
}

async function getDashboardCommunity(client?, token?, guildId?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  const gid = a.guildId;
  const [messages, commands, rolePanels, welcome, pickers, guild] = await Promise.all([
    T.listMessages(gid, true),
    T.listCommands(gid, true),
    T.listRolePanels(gid, true),
    T.getWelcome(gid, true),
    listGuildPickerData(client, gid, { force: shouldRefreshPickers(gid) }).catch(() => ({ textChannels: [], roles: [], categories: [], emojis: [] })),
    guildInfo(client, gid),
  ]);
  let prefix = "+";
  try {
    const { resolveCommandPrefixForGuild } = require("../../core/tenantGuildSettings") as typeof import("../../core/tenantGuildSettings");
    prefix = resolveCommandPrefixForGuild(gid, client) || "+";
  } catch {
    /* default */
  }
  return {
    ok: true,
    status: 200,
    guildId: gid,
    guild,
    prefix,
    limits: T.LIMITS,
    messages,
    commands,
    rolePanels,
    welcome,
    welcomeSaved: await T.hasSavedWelcome(gid, true),
    isMainGuild: T.isMainGuild(gid),
    pickers,
  };
}

/* ───────────── messaggi ───────────── */

async function putMessage(client?, token?, guildId?, body?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  const gid = a.guildId;
  const rows = await T.listMessages(gid, true);
  const id = String(body?.id || "");
  const idx = id ? rows.findIndex((r) => r.id === id) : -1;
  if (idx < 0 && rows.length >= T.LIMITS.messages) return fail(400, "limit", `Puoi salvare al massimo ${T.LIMITS.messages} messaggi.`);
  const prev = idx >= 0 ? rows[idx] : null;
  const next = T.normalizeMessage(body, prev);
  if (T.draftIsEmpty(next.draft)) return fail(400, "empty", "Il messaggio è vuoto: scrivi un testo o un embed.");
  /* se era programmato resta programmato con la nuova ora (o torna bozza se tolta) */
  if (prev?.status === "scheduled" || body?.schedule === true) {
    next.status = next.scheduledAt && next.scheduledAt > Date.now() ? "scheduled" : next.messageId ? "sent" : "draft";
  }
  if (idx >= 0) rows[idx] = next;
  else rows.unshift(next);
  await T.writeMessages(gid, rows);
  return { ok: true, status: 200, message: next };
}

/** `alsoDiscord`: cancella anche il messaggio pubblicato (se non esiste più va bene lo stesso). */
async function deleteMessage(client?, token?, guildId?, id?, alsoDiscord = false) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  const rows = await T.listMessages(a.guildId, true);
  const msg = rows.find((r) => r.id === String(id));
  if (!msg) return fail(404, "not_found", "Messaggio non trovato.");
  let discordDeleted = false;
  if (alsoDiscord && msg.messageId && msg.sentChannelId) {
    try {
      await restOf(client).delete(Routes.channelMessage(msg.sentChannelId, msg.messageId));
      discordDeleted = true;
    } catch (err) {
      const code = Number(err?.code || err?.rawError?.code);
      if (code === 10008 || code === 10003) discordDeleted = true;
      else return fail(400, "discord_delete_failed", `Non sono riuscito a cancellarlo da Discord: ${discordError(err)}`);
    }
  }
  await T.writeMessages(a.guildId, rows.filter((r) => r.id !== msg.id));
  return { ok: true, status: 200, discordDeleted };
}

async function deliverSavedMessage(client?, gid?: string, msg?, guild?) {
  if (!msg.channelId) return { ok: false, message: "Scegli il canale dove pubblicarlo." };
  const vars = T.memberVars(guild || { name: "" }, null);
  const body = T.buildMessageBody(msg.draft, vars);
  return sendOrEdit(client, msg.channelId, { messageId: msg.messageId, channelId: msg.sentChannelId }, body);
}

async function sendMessageNow(client?, token?, guildId?, id?, opts?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  const gid = a.guildId;
  const rows = await T.listMessages(gid, true);
  const idx = rows.findIndex((r) => r.id === String(id));
  if (idx < 0) return fail(404, "not_found", "Messaggio non trovato.");
  const msg = { ...rows[idx] };
  if (opts?.asNew === true) msg.messageId = null;
  const guild = await guildInfo(client, gid);
  const out: any = await deliverSavedMessage(client, gid, msg, guild);
  if (!out.ok) {
    rows[idx] = { ...rows[idx], status: "failed", error: out.message };
    await T.writeMessages(gid, rows);
    return fail(400, "send_failed", out.message);
  }
  rows[idx] = { ...rows[idx], status: "sent", error: null, messageId: out.messageId, sentChannelId: msg.channelId, sentAt: Date.now(), scheduledAt: null };
  await T.writeMessages(gid, rows);
  return { ok: true, status: 200, message: rows[idx], edited: out.edited };
}

async function scheduleMessage(client?, token?, guildId?, id?, body?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  const gid = a.guildId;
  const rows = await T.listMessages(gid, true);
  const idx = rows.findIndex((r) => r.id === String(id));
  if (idx < 0) return fail(404, "not_found", "Messaggio non trovato.");
  const at = Number(body?.scheduledAt);
  if (body?.scheduledAt == null) {
    rows[idx] = { ...rows[idx], scheduledAt: null, status: rows[idx].messageId ? "sent" : "draft" };
  } else {
    if (!Number.isFinite(at) || at < Date.now() + 30_000) return fail(400, "bad_time", "Scegli un'ora nel futuro.");
    if (at > Date.now() + 90 * 86_400_000) return fail(400, "bad_time", "Puoi programmare al massimo 90 giorni avanti.");
    if (!rows[idx].channelId) return fail(400, "no_channel", "Scegli il canale dove pubblicarlo.");
    rows[idx] = { ...rows[idx], scheduledAt: at, status: "scheduled", error: null };
  }
  await T.writeMessages(gid, rows);
  return { ok: true, status: 200, message: rows[idx] };
}

/** Scheduler: pubblica i messaggi programmati scaduti (tutti i server). */
async function runScheduledMessages(client?) {
  const { getBotState } = require("../../../shared/botState/botStateStore") as typeof import("../../../shared/botState/botStateStore");
  const map: any = (await getBotState("multiGuildMessages.v1", {})) || {};
  const now = Date.now();
  for (const gid of Object.keys(map)) {
    const due = (Array.isArray(map[gid]) ? map[gid] : []).filter((r?) => r?.status === "scheduled" && Number(r.scheduledAt) <= now);
    if (!due.length) continue;
    const guild = await guildInfo(client, gid);
    for (const msg of due) {
      const out: any = await deliverSavedMessage(client, gid, msg, guild).catch((err?) => ({ ok: false, message: discordError(err) }));
      /* rilegge subito prima di scrivere: la dashboard potrebbe aver cambiato altro nel frattempo */
      const rows = await T.listMessages(gid, true);
      const i = rows.findIndex((r) => r.id === msg.id);
      if (i < 0 || rows[i].status !== "scheduled") continue;
      rows[i] = out.ok
        ? { ...rows[i], status: "sent", error: null, messageId: out.messageId, sentChannelId: rows[i].channelId, sentAt: Date.now(), scheduledAt: null }
        : { ...rows[i], status: "failed", error: out.message, scheduledAt: null };
      await T.writeMessages(gid, rows);
      if (!out.ok) global.logger?.warn?.(`[COMMUNITY MSG] ${gid}/${msg.id}: ${out.message}`);
    }
  }
}

let loopTimer: ReturnType<typeof setInterval> | null = null;
function startScheduledMessagesLoop(client?) {
  if (loopTimer) return;
  let busy = false;
  loopTimer = setInterval(() => {
    if (busy) return;
    busy = true;
    void runScheduledMessages(client)
      .catch((err?) => global.logger?.warn?.("[COMMUNITY MSG] loop:", err?.message || err))
      .finally(() => {
        busy = false;
      });
  }, 30_000);
  loopTimer.unref?.();
}

/* ───────────── comandi personalizzati ───────────── */

async function putCommand(client?, token?, guildId?, body?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  const gid = a.guildId;
  const rows = await T.listCommands(gid, true);
  const id = String(body?.id || "");
  const idx = id ? rows.findIndex((r) => r.id === id) : -1;
  if (idx < 0 && rows.length >= T.LIMITS.commands) return fail(400, "limit", `Puoi creare al massimo ${T.LIMITS.commands} comandi.`);
  const next = T.normalizeCommand(body, idx >= 0 ? rows[idx] : null);
  if (!T.CMD_NAME_RE.test(next.name)) return fail(400, "bad_name", "Nome non valido: usa lettere, numeri, - o _ (max 32), senza spazi.");
  if (T.draftIsEmpty(next.draft)) return fail(400, "empty", "La risposta è vuota: scrivi un testo o un embed.");
  const reserved = reservedCommandNames(gid);
  const names = [next.name, ...next.aliases];
  const clash = names.find((n) => reserved.has(n));
  if (clash) return fail(400, "reserved", `«${clash}» è già un comando del bot: scegli un altro nome.`);
  const taken = rows.find((r, i) => i !== idx && [r.name, ...r.aliases].some((n) => names.includes(n)));
  if (taken) return fail(400, "duplicate", `Il nome è già usato dal comando «${taken.name}».`);
  if (idx >= 0) rows[idx] = next;
  else rows.push(next);
  rows.sort((x, y) => x.name.localeCompare(y.name, "it"));
  await T.writeCommands(gid, rows);
  return { ok: true, status: 200, command: next };
}

async function deleteCommand(client?, token?, guildId?, id?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  const rows = await T.listCommands(a.guildId, true);
  const next = rows.filter((r) => r.id !== String(id));
  if (next.length === rows.length) return fail(404, "not_found", "Comando non trovato.");
  await T.writeCommands(a.guildId, next);
  return { ok: true, status: 200 };
}

/* ───────────── pannelli ruoli ───────────── */

async function putRolePanel(client?, token?, guildId?, body?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  const gid = a.guildId;
  const rows = await T.listRolePanels(gid, true);
  const id = String(body?.id || "");
  const idx = id ? rows.findIndex((r) => r.id === id) : -1;
  if (idx < 0 && rows.length >= T.LIMITS.rolePanels) return fail(400, "limit", `Puoi creare al massimo ${T.LIMITS.rolePanels} pannelli.`);
  const next = T.normalizeRolePanel(body, idx >= 0 ? rows[idx] : null);
  if (idx >= 0) rows[idx] = next;
  else rows.push(next);
  await T.writeRolePanels(gid, rows);
  return { ok: true, status: 200, panel: next };
}

async function deleteRolePanel(client?, token?, guildId?, id?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  const rows = await T.listRolePanels(a.guildId, true);
  const panel = rows.find((r) => r.id === String(id));
  if (!panel) return fail(404, "not_found", "Pannello non trovato.");
  await T.writeRolePanels(a.guildId, rows.filter((r) => r.id !== panel.id));
  if (panel.messageId && panel.sentChannelId) {
    await restOf(client)?.delete(Routes.channelMessage(panel.sentChannelId, panel.messageId)).catch(() => null);
  }
  return { ok: true, status: 200 };
}

async function publishRolePanel(client?, token?, guildId?, id?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  const gid = a.guildId;
  const rows = await T.listRolePanels(gid, true);
  const idx = rows.findIndex((r) => r.id === String(id));
  if (idx < 0) return fail(404, "not_found", "Pannello non trovato.");
  const panel = rows[idx];
  if (!panel.channelId) return fail(400, "no_channel", "Scegli il canale del pannello.");
  if (!panel.roles.length) return fail(400, "no_roles", "Aggiungi almeno un ruolo.");
  const rest = restOf(client);
  const [roles, guild]: any[] = await Promise.all([rest?.get(Routes.guildRoles(gid)).catch(() => []), guildInfo(client, gid)]);
  const roleById = new Map<string, any>((Array.isArray(roles) ? roles : []).map((r?) => [String(r.id), r]));
  const missing = panel.roles.filter((o) => !roleById.has(o.roleId));
  if (missing.length) return fail(400, "role_missing", "Uno o più ruoli del pannello non esistono più: toglili e riprova.");
  const unsafe = panel.roles.find((o) => {
    const r = roleById.get(o.roleId);
    return r?.managed || String(r?.id) === gid;
  });
  if (unsafe) return fail(400, "role_unsafe", `@${roleById.get(unsafe.roleId)?.name || "ruolo"} non si può assegnare (ruolo di un bot o @everyone).`);
  const names = Object.fromEntries([...roleById.values()].map((r?) => [String(r.id), String(r.name)]));
  const body = T.buildMessageBody(panel.draft, T.memberVars(guild, null), T.rolePanelComponents(panel, names));
  const out: any = await sendOrEdit(client, panel.channelId, { messageId: panel.messageId, channelId: panel.sentChannelId }, body);
  if (!out.ok) return fail(400, "publish_failed", out.message);
  rows[idx] = { ...panel, messageId: out.messageId, sentChannelId: panel.channelId };
  await T.writeRolePanels(gid, rows);
  return { ok: true, status: 200, panel: rows[idx], edited: out.edited };
}

/* ───────────── benvenuto / addio ───────────── */

async function patchWelcome(client?, token?, guildId?, body?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  const prev = await T.getWelcome(a.guildId, true);
  const next = T.normalizeWelcome(body, prev);
  if (next.welcome.enabled && !next.welcome.channelId) return fail(400, "no_channel", "Scegli il canale del messaggio di benvenuto.");
  if (next.goodbye.enabled && !next.goodbye.channelId) return fail(400, "no_channel", "Scegli il canale del messaggio di addio.");
  await T.writeWelcome(a.guildId, next);
  return { ok: true, status: 200, welcome: next };
}

/** Manda un'anteprima reale nel canale scelto, usando chi è in dashboard come "nuovo membro". */
async function testWelcome(client?, token?, guildId?, body?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  const kind = body?.kind === "goodbye" ? "goodbye" : body?.kind === "dm" ? "dm" : "welcome";
  const cfg = T.normalizeWelcome(body?.settings || {}, await T.getWelcome(a.guildId, true));
  const rest = restOf(client);
  const [user, guild]: any[] = await Promise.all([rest?.get(Routes.user(a.userId)).catch(() => null), guildInfo(client, a.guildId)]);
  const vars = T.memberVars(guild, user || { id: a.userId });
  if (kind === "dm") {
    try {
      const dm: any = await rest.post(Routes.userChannels(), { body: { recipient_id: a.userId } });
      await rest.post(Routes.channelMessages(dm.id), { body: T.buildMessageBody(cfg.dm.draft, vars) });
      return { ok: true, status: 200 };
    } catch (err) {
      return fail(400, "send_failed", discordError(err));
    }
  }
  const part = cfg[kind];
  if (!part.channelId) return fail(400, "no_channel", "Scegli prima il canale.");
  const out: any = await sendOrEdit(client, part.channelId, undefined, T.buildMessageBody(part.draft, vars, [], { mentionUserId: null }));
  return out.ok ? { ok: true, status: 200 } : fail(400, "send_failed", out.message);
}

export = {
  getDashboardCommunity,
  putMessage,
  deleteMessage,
  sendMessageNow,
  scheduleMessage,
  runScheduledMessages,
  startScheduledMessagesLoop,
  putCommand,
  deleteCommand,
  putRolePanel,
  deleteRolePanel,
  publishRolePanel,
  patchWelcome,
  testWelcome,
};
