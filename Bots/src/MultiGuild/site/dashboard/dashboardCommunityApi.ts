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

/** Nome e avatar del bot come li vedono i membri di quel server (nickname e avatar per server se impostati). */
let botUserCache: { at: number; user: any } | null = null;
async function botIdentity(client?, gid?) {
  const rest = restOf(client);
  if (!rest) return null;
  if (!botUserCache || Date.now() - botUserCache.at > 600_000) {
    const u = client?.user?.id ? client.user : await rest.get(Routes.user()).catch(() => null);
    if (u) botUserCache = { at: Date.now(), user: { id: String(u.id), username: u.username, global_name: u.globalName ?? u.global_name ?? null, avatar: u.avatar ?? null } };
  }
  const u = botUserCache?.user;
  if (!u) return null;
  const m: any = await rest.get(Routes.guildMember(gid, u.id)).catch(() => null);
  const userAvatar = u.avatar
    ? `https://cdn.discordapp.com/avatars/${u.id}/${u.avatar}.${String(u.avatar).startsWith("a_") ? "gif" : "png"}?size=128`
    : `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(u.id) >> 22n) % 6}.png`;
  const guildAvatar = m?.avatar
    ? `https://cdn.discordapp.com/guilds/${gid}/users/${u.id}/avatars/${m.avatar}.${String(m.avatar).startsWith("a_") ? "gif" : "png"}?size=128`
    : null;
  return { id: u.id, name: String(m?.nick || u.global_name || u.username || "Bot"), avatarUrl: guildAvatar || userAvatar };
}

async function guildInfo(client?, gid?) {
  const rest = restOf(client);
  const g: any = await rest?.get(Routes.guild(gid), { query: new URLSearchParams({ with_counts: "true" }) }).catch(() => null);
  return { id: gid, name: g?.name || "", icon: g?.icon || null, banner: g?.banner || null, memberCount: g?.approximate_member_count ?? null };
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
      if (code !== 10008 && code !== 50035) return { ok: false, message: discordError(err) };
      if (code === 50035) {
        try {
          const m: any = await rest.post(Routes.channelMessages(channelId), { body });
          await rest.delete(Routes.channelMessage(channelId, prev.messageId)).catch(() => null);
          return { ok: true, messageId: String(m?.id || ""), edited: false };
        } catch (err2) {
          return { ok: false, message: discordError(err2) };
        }
      }
    }
  }
  try {
    const m: any = await rest.post(Routes.channelMessages(channelId), { body });
    return { ok: true, messageId: String(m?.id || ""), edited: false };
  } catch (err) {
    return { ok: false, message: discordError(err) };
  }
}

/* ───────────── pannelli del server principale ───────────── */

/** Una volta sola: porta il pannello info del bot tra i messaggi della dashboard (stesso messaggio su Discord). */
async function importMainPanels(client?, gid?: string) {
  if (await T.wasPanelImported(gid, "info")) return;
  const info = require("../../../Vinili/Community/discord/panels/info") as any;
  const rows = await T.listMessages(gid, true);
  if (rows.length >= T.LIMITS.messages) return;
  const messageId = await info.currentInfoMessageId(gid).catch(() => null);
  const channelId = String(info.INFO_CHANNEL_ID || "") || null;
  const base = T.normalizeMessage({ name: "Pannello info", channelId, draft: info.buildInfoDraft() }, null);
  const row = {
    ...base,
    panelKey: "info",
    managed: false,
    messageId: messageId || null,
    sentChannelId: messageId ? channelId : null,
    sentAt: messageId ? Date.now() : null,
    status: (messageId ? "sent" : "draft") as any,
  };
  await T.writeMessages(gid, [row, ...rows]);
  await T.markPanelImported(gid, "info");
}

/**
 * Una volta sola: il canale "Members" del principale diventa un contatore della dashboard
 * (stesso canale e stesso testo). Da lì il contatore classico usa il testo della dashboard,
 * e se lo elimini dalla dashboard smette di aggiornarlo.
 */
async function importMainCounter(client?, gid?: string) {
  if (await T.wasPanelImported(gid, "memberCounter")) return;
  const IDs = require("../../../Vinili/Config/ids") as any;
  const channelId = String(IDs?.channels?.countUtenti || "");
  if (T.isId(channelId)) {
    const rows = await T.listRows("counters", gid, true);
    if (!rows.some((r: any) => r.channelId === channelId) && rows.length < T.LIMITS.counters) {
      const ch: any = await restOf(client)?.get(Routes.channel(channelId)).catch(() => null);
      if (ch && String(ch.guild_id || "") === String(gid)) {
        const row = { ...T.normalizeCounter({ type: "members", template: "༄☕︲Members: {count}", channelId }), lastName: String(ch.name || "") || null };
        await T.writeRows("counters", gid, [row, ...rows]);
      }
    }
  }
  await T.markPanelImported(gid, "memberCounter");
}

/** Una volta sola: le reazioni alle parole del bot diventano risposte automatiche della dashboard. */
async function importMainWordReactions(gid: string) {
  if (await T.wasPanelImported(gid, "wordReactions")) return;
  const { wordReactionRulesForImport } = require("../../../Vinili/Community/services/officialMessageCommunityHandlers") as any;
  const rules = typeof wordReactionRulesForImport === "function" ? wordReactionRulesForImport() : [];
  const rows = await T.listRows("autoResponders", gid, true);
  const room = Math.max(0, T.LIMITS.autoResponders - rows.length);
  const imported = rules.slice(0, room).map((r: any) => T.normalizeAutoResponder(r, null));
  await T.writeRows("autoResponders", gid, [...rows, ...imported]);
  await T.markPanelImported(gid, "wordReactions");
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

/** Ruoli che il bot dà da solo sul server principale: pre-verifica all'ingresso, Member dopo la verifica, poi l'anzianità. */
async function mainJoinRoles(_client?, _gid?: string) {
  const out: { id: string; note: string }[] = [];
  try {
    const IDs = require("../../../Vinili/Config/ids") as any;
    const pre = String(IDs?.roles?.preMember || "");
    const member = String(IDs?.roles?.Member || "");
    if (pre) out.push({ id: pre, note: "all'ingresso, finché non completa la verifica" });
    if (member) out.push({ id: member, note: "dopo la verifica (il pre-verifica viene tolto)" });
    /* anzianità dalla verifica (uno alla volta, il bot cambia da solo) */
    const r = IDs?.roles || {};
    if (r.NuovoUtente) out.push({ id: String(r.NuovoUtente), note: "dopo la verifica, per i primi 30 giorni" });
    if (r.Veterano) out.push({ id: String(r.Veterano), note: "da 30 giorni a 1 anno dalla verifica" });
    if (r.OG) out.push({ id: String(r.OG), note: "dopo 1 anno dalla verifica" });
  } catch (_) {}
  return out;
}

async function getDashboardCommunity(client?, token?, guildId?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  const gid = a.guildId;
  if (T.isMainGuild(gid)) await importMainCounter(client, gid).catch(() => null);
  const [autoResponders, counters, serverLogs] = await Promise.all([
    T.listRows("autoResponders", gid, true),
    T.listRows("counters", gid, true),
    T.getServerLogs(gid, true),
  ]);
  if (T.isMainGuild(gid)) {
    await importMainPanels(client, gid).catch(() => null);
    await importMainWordReactions(gid).catch(() => null);
  }
  const [messages, commands, rolePanels, welcome, pickers, guild, bot] = await Promise.all([
    T.listMessages(gid, true),
    T.listCommands(gid, true),
    T.listRolePanels(gid, true),
    T.getWelcome(gid, true),
    listGuildPickerData(client, gid, { force: shouldRefreshPickers(gid) }).catch(() => ({ textChannels: [], roles: [], categories: [], emojis: [] })),
    guildInfo(client, gid),
    botIdentity(client, gid).catch(() => null),
  ]);
  /* emoji degli altri server del bot: si possono usare ovunque */
  try {
    const { getOtherGuildEmojis } = require("../../services/allGuildEmojis") as typeof import("../../services/allGuildEmojis");
    const others = await getOtherGuildEmojis(gid);
    const own = Array.isArray((pickers as any).emojis) ? (pickers as any).emojis : [];
    const seen = new Set(own.map((e: any) => String(e.id)));
    (pickers as any).emojis = [...own, ...others.filter((e) => !seen.has(e.id))];
  } catch (_) {}
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
    bot,
    autoResponders,
    counters,
    serverLogs,
    prefix,
    limits: T.LIMITS,
    messages,
    commands,
    rolePanels,
    welcome,
    welcomeSaved: await T.hasSavedWelcome(gid, true),
    isMainGuild: T.isMainGuild(gid),
    /* ruoli già dati all'ingresso fuori dalla dashboard (solo principale), da mostrare nei Ruoli automatici */
    systemAutoRoles: T.isMainGuild(gid) ? await mainJoinRoles(client, gid).catch(() => []) : [],
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
  rows[idx] = {
    ...rows[idx],
    status: "sent",
    error: null,
    messageId: out.messageId,
    sentChannelId: msg.channelId,
    sentAt: Date.now(),
    scheduledAt: null,
    /* pannello importato pubblicato dalla dashboard: da ora non lo ripubblica più il codice */
    ...(rows[idx].panelKey ? { managed: true } : {}),
  };
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
  const REP = ["none", "daily", "weekly", "monthly"];
  if (REP.includes(body?.repeat)) rows[idx] = { ...rows[idx], repeat: body.repeat };
  if (body && Object.prototype.hasOwnProperty.call(body, "repeatDeletePrevious")) rows[idx] = { ...rows[idx], repeatDeletePrevious: body.repeatDeletePrevious === true };
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
    /* modulo Messaggi spento: i programmati restano in attesa */
    if (!(require("../../core/moduleSwitches") as typeof import("../../core/moduleSwitches")).isModuleOn(gid, "messaggi")) continue;
    const guild = await guildInfo(client, gid);
    for (const msg of due) {
      const repeat = msg.repeat && msg.repeat !== "none" ? String(msg.repeat) : "";
      /* ripetizione: ogni volta un messaggio nuovo (se richiesto, il precedente si cancella) */
      if (repeat && msg.repeatDeletePrevious && msg.messageId && msg.sentChannelId) {
        await restOf(client)?.delete(Routes.channelMessage(msg.sentChannelId, msg.messageId)).catch(() => null);
      }
      const toSend = repeat ? { ...msg, messageId: null } : msg;
      const out: any = await deliverSavedMessage(client, gid, toSend, guild).catch((err?) => ({ ok: false, message: discordError(err) }));
      /* rilegge subito prima di scrivere: la dashboard potrebbe aver cambiato altro nel frattempo */
      const rows = await T.listMessages(gid, true);
      const i = rows.findIndex((r) => r.id === msg.id);
      if (i < 0 || rows[i].status !== "scheduled") continue;
      const next = repeat ? T.nextRepeatAt(Number(rows[i].scheduledAt) || Date.now(), repeat) : null;
      if (out.ok) {
        rows[i] = next
          ? { ...rows[i], status: "scheduled", error: null, messageId: out.messageId, sentChannelId: rows[i].channelId, sentAt: Date.now(), scheduledAt: next }
          : { ...rows[i], status: "sent", error: null, messageId: out.messageId, sentChannelId: rows[i].channelId, sentAt: Date.now(), scheduledAt: null };
      } else {
        /* se ricorrente riprova alla prossima scadenza, segnando l'errore */
        rows[i] = next ? { ...rows[i], status: "scheduled", error: out.message, scheduledAt: next } : { ...rows[i], status: "failed", error: out.message, scheduledAt: null };
      }
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
  const problem = T.validateRolePanel(next, next.draft.buttons.length ? 1 : 0);
  if (problem) return fail(400, "invalid_panel", problem);
  const nameClash = rows.find((r, i) => i !== idx && r.name.trim().toLowerCase() === next.name.trim().toLowerCase());
  if (nameClash) return fail(400, "duplicate_name", "Esiste già un pannello con questo nome.");
  /* stesso ruolo in un altro pannello: permesso, ma lo segnaliamo */
  const warnings: string[] = [];
  for (const o of next.roles) {
    const other = rows.find((r, i) => i !== idx && r.roles.some((x) => x.roleId === o.roleId));
    if (other) warnings.push(`<@&${o.roleId}> è anche nel pannello «${other.name}».`);
  }
  if (idx >= 0) rows[idx] = next;
  else rows.push(next);
  await T.writeRolePanels(gid, rows);
  return { ok: true, status: 200, panel: next, warnings: warnings.slice(0, 5) };
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
  const problem = T.validateRolePanel(panel, panel.draft.buttons.length ? 1 : 0);
  if (problem) return fail(400, "invalid_panel", problem);
  if (panel.mode === "reactions") {
    const noEmoji = panel.roles.find((o) => !T.emojiKey(o.emoji));
    if (noEmoji) return fail(400, "no_emoji", `Con le reazioni ogni ruolo ha bisogno di un'emoji: manca a @${roleById.get(noEmoji.roleId)?.name || "ruolo"}.`);
    const keys = panel.roles.map((o) => T.emojiKey(o.emoji));
    if (new Set(keys).size !== keys.length) return fail(400, "dup_emoji", "Ogni ruolo deve avere un'emoji diversa.");
    if (panel.roles.length > 20) return fail(400, "too_many", "Con le reazioni puoi mettere al massimo 20 ruoli (limite di Discord).");
  }
  const names = Object.fromEntries([...roleById.values()].map((r?) => [String(r.id), String(r.name)]));
  const body = T.buildMessageBody(panel.draft, T.memberVars(guild, null), T.rolePanelComponents(panel, names));
  const out: any = await sendOrEdit(client, panel.channelId, { messageId: panel.messageId, channelId: panel.sentChannelId }, body);
  if (!out.ok) return fail(400, "publish_failed", out.message);
  rows[idx] = { ...panel, messageId: out.messageId, sentChannelId: panel.channelId };
  let reactionWarning: string | null = null;
  if (panel.mode === "reactions") {
    /* il bot mette le reazioni (una per ruolo) e toglie le sue che non servono più */
    const wanted = new Set(panel.roles.map((o) => T.emojiKey(o.emoji)));
    const msg: any = await rest.get(Routes.channelMessage(panel.channelId, out.messageId)).catch(() => null);
    for (const r of Array.isArray(msg?.reactions) ? msg.reactions : []) {
      const key = r?.emoji?.id ? String(r.emoji.id) : String(r?.emoji?.name || "").replace(/️/g, "");
      if (r?.me && !wanted.has(key)) {
        const api = r.emoji.id ? `${r.emoji.name || "e"}:${r.emoji.id}` : encodeURIComponent(String(r.emoji.name || ""));
        await rest.delete(Routes.channelMessageOwnReaction(panel.channelId, out.messageId, api)).catch(() => null);
      }
    }
    for (const o of panel.roles) {
      try {
        await rest.put(Routes.channelMessageOwnReaction(panel.channelId, out.messageId, T.emojiForReactionApi(o.emoji)));
      } catch (err) {
        reactionWarning = `Non sono riuscito a mettere una reazione (${discordError(err)}). Le emoji di altri server non si possono usare.`;
      }
    }
  }
  await T.writeRolePanels(gid, rows);
  return { ok: true, status: 200, panel: rows[idx], edited: out.edited, reactionWarning };
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

/* prove inviate: una ogni 4 secondi per persona */
const testMessageAt = new Map<string, number>();

/**
 * Prova di qualsiasi messaggio della dashboard: lo manda in privato a chi la chiede.
 * I segnaposto si riempiono con i valori d'esempio dell'anteprima (più nome e foto veri di chi prova).
 */
async function testMessage(client?, token?, guildId?, body?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  const last = testMessageAt.get(String(a.userId)) || 0;
  if (Date.now() - last < 4000) return fail(429, "slow_down", "Aspetta un attimo prima di un'altra prova.");
  testMessageAt.set(String(a.userId), Date.now());
  const draft = T.normalizeDraft(body?.draft || {});
  if (T.draftIsEmpty(draft)) return fail(400, "empty", "Il messaggio è vuoto: scrivi qualcosa prima di provarlo.");
  const rest = restOf(client);
  const [user, guild]: any[] = await Promise.all([rest?.get(Routes.user(a.userId)).catch(() => null), guildInfo(client, a.guildId)]);
  const sample: Record<string, string> = {};
  const raw = body?.vars && typeof body.vars === "object" ? body.vars : {};
  for (const [k, v] of Object.entries(raw).slice(0, 80)) {
    if (/^[\w.:-]{1,40}$/.test(k) && (typeof v === "string" || typeof v === "number")) sample[k] = String(v).slice(0, 500);
  }
  const vars = { ...sample, ...T.memberVars(guild, user || { id: a.userId }) };
  /* nel canale impostato: deve essere un canale di questo server */
  const channelId = T.isId(body?.channelId) ? String(body.channelId) : "";
  if (channelId) {
    const ch: any = await rest.get(Routes.channel(channelId)).catch(() => null);
    if (!ch || String(ch.guild_id || "") !== String(a.guildId)) return fail(400, "bad_channel", "Il canale non è di questo server.");
    const out: any = await sendOrEdit(client, channelId, undefined, T.buildMessageBody(draft, vars, [], { mentionUserId: null }));
    return out.ok ? { ok: true, status: 200, where: "channel" } : fail(400, "send_failed", out.message);
  }
  try {
    const dm: any = await rest.post(Routes.userChannels(), { body: { recipient_id: a.userId } });
    await rest.post(Routes.channelMessages(dm.id), { body: T.buildMessageBody(draft, vars) });
    return { ok: true, status: 200 };
  } catch (err) {
    const code = Number((err as any)?.code || (err as any)?.rawError?.code);
    if (code === 50007) return fail(400, "dm_closed", "Non riesco a scriverti in privato: apri i messaggi privati dai membri del server.");
    return fail(400, "send_failed", discordError(err));
  }
}

/**
 * Anteprima della descrizione partnership presa da un canale: stessi messaggi e stessa scelta
 * del bot (ultimi 20, il più vecchio con testo, preferendo quelli non scritti da bot).
 */
async function partnerDescriptionPreview(client?, token?, guildId?, channelIdRaw?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  const channelId = T.isId(channelIdRaw) ? String(channelIdRaw) : "";
  if (!channelId) return fail(400, "bad_channel", "Scegli prima il canale della descrizione.");
  const rest = restOf(client);
  const ch: any = await rest?.get(Routes.channel(channelId)).catch(() => null);
  if (!ch || String(ch.guild_id || "") !== String(a.guildId)) return fail(400, "bad_channel", "Il canale non è di questo server.");
  let list: any[] = [];
  try {
    list = ((await rest.get(Routes.channelMessages(channelId), { query: new URLSearchParams({ limit: "20" }) })) as any[]) || [];
  } catch (err) {
    return fail(400, "no_access", `Non riesco a leggere il canale: ${discordError(err)}`);
  }
  const { extractPartnershipMessageText } = require("../../../Vinili/Partner/runtime/partnershipMessageBody") as typeof import("../../../Vinili/Partner/runtime/partnershipMessageBody");
  const withText = list
    .map((m: any) => ({ m, text: extractPartnershipMessageText({ ...m, messageSnapshots: m.message_snapshots }) }))
    .filter((e) => e.text)
    .sort((x, y) => Date.parse(x.m.timestamp) - Date.parse(y.m.timestamp));
  if (!withText.length) return { ok: true, status: 200, found: false, channelName: ch.name || "" };
  const human = withText.filter((e) => !e.m.author?.bot);
  const pick = (withText.length > 1 && human.length ? human : withText)[0];
  const au = pick.m.author || {};
  return {
    ok: true,
    status: 200,
    found: true,
    channelName: ch.name || "",
    text: pick.text,
    author: {
      name: au.global_name || au.username || "",
      avatarUrl: au.avatar ? `https://cdn.discordapp.com/avatars/${au.id}/${au.avatar}.png?size=64` : "",
    },
    at: pick.m.timestamp || null,
  };
}

/** Manda un'anteprima reale nel canale scelto, usando chi è in dashboard come "nuovo membro". */
async function testWelcome(client?, token?, guildId?, body?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  const kind = body?.kind === "goodbye" ? "goodbye" : body?.kind === "dm" ? "dm" : body?.kind === "goodbyeDm" ? "goodbyeDm" : "welcome";
  const cfg = T.normalizeWelcome(body?.settings || {}, await T.getWelcome(a.guildId, true));
  const rest = restOf(client);
  const [user, guild]: any[] = await Promise.all([rest?.get(Routes.user(a.userId)).catch(() => null), guildInfo(client, a.guildId)]);
  const vars = T.memberVars(guild, user || { id: a.userId });
  if (kind === "dm" || kind === "goodbyeDm") {
    try {
      const dm: any = await rest.post(Routes.userChannels(), { body: { recipient_id: a.userId } });
      await rest.post(Routes.channelMessages(dm.id), { body: T.buildMessageBody(kind === "dm" ? cfg.dm.draft : cfg.goodbyeDm.draft, vars) });
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
  testMessage,
  partnerDescriptionPreview,
};
