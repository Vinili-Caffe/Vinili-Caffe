/**
 * Dashboard: risposte automatiche, contatori nei canali, log del server, giveaway, sondaggi.
 *   PUT    …/community/auto-responders            DELETE …/community/auto-responders/:id
 *   POST   …/community/counters                   PATCH/DELETE …/community/counters/:id
 *   PATCH  …/community/server-logs
 *   GET    …/community/giveaways                  POST …/community/giveaways
 *   POST   …/community/giveaways/:messageId/end   POST …/reroll    DELETE …/giveaways/:messageId
 *   GET    …/community/polls                      POST …/community/polls
 *   POST   …/community/polls/:id/end              DELETE …/community/polls/:id
 */
const { Routes } = require("discord.js") as typeof import("discord.js");
const { verifyDashboardGuildAccess } = require("./siteDashboardApi") as typeof import("./siteDashboardApi");
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

function discordError(err?) {
  const code = Number(err?.code || err?.rawError?.code);
  if (code === 50013) return "Al bot mancano i permessi (Gestire i canali / Inviare messaggi).";
  if (code === 50001) return "Il bot non vede quel canale.";
  if (code === 10003) return "Il canale non esiste più.";
  if (code === 10008) return "Il messaggio non esiste più.";
  if (code === 50035) return "Discord ha rifiutato i dati: controlla testi ed emoji.";
  if (code === 30013) return "Il server ha raggiunto il limite di canali.";
  return String(err?.rawError?.message || err?.message || "Discord non ha accettato la richiesta.").slice(0, 200);
}

/* ───────────── risposte automatiche ───────────── */

async function putAutoResponder(client?, token?, guildId?, body?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  const rows = await T.listRows("autoResponders", a.guildId, true);
  const idx = body?.id ? rows.findIndex((r) => r.id === String(body.id)) : -1;
  if (idx < 0 && rows.length >= T.LIMITS.autoResponders) return fail(400, "limit", `Puoi creare al massimo ${T.LIMITS.autoResponders} risposte automatiche.`);
  const next = T.normalizeAutoResponder(body, idx >= 0 ? rows[idx] : null);
  if (!next.triggers.length) return fail(400, "no_trigger", "Scrivi almeno una parola o frase che fa scattare la risposta.");
  if (next.triggers.some((t) => t.length < 2)) return fail(400, "short_trigger", "Le parole devono avere almeno 2 caratteri.");
  if (!next.reactions.length && (!next.replyEnabled || T.draftIsEmpty(next.draft))) return fail(400, "empty", "Scegli una risposta o almeno una reazione.");
  if (idx >= 0) rows[idx] = next;
  else rows.push(next);
  await T.writeRows("autoResponders", a.guildId, rows);
  return { ok: true, status: 200, autoResponder: next };
}

async function deleteAutoResponder(client?, token?, guildId?, id?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  const rows = await T.listRows("autoResponders", a.guildId, true);
  const next = rows.filter((r) => r.id !== String(id));
  if (next.length === rows.length) return fail(404, "not_found", "Risposta non trovata.");
  await T.writeRows("autoResponders", a.guildId, next);
  return { ok: true, status: 200 };
}

/* ───────────── annunci automatici (boost, named, ruoli custom) ───────────── */

const ANN = () => require("../../services/announcementsRuntime") as typeof import("../../services/announcementsRuntime");

async function getAnnouncements(client?, token?, guildId?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  const imported = await ANN().ensureMainSeed(a.guildId).catch(() => false);
  const config = await ANN().getConfig(a.guildId, true);
  return { ok: true, status: 200, isMainGuild: T.isMainGuild(a.guildId), imported, config, maxRules: ANN().ROLE_RULES_MAX };
}

async function patchAnnouncements(client?, token?, guildId?, body?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  const raw = body?.config || body;
  /* serve un ruolo e almeno un modo per avvisare: il canale o il privato */
  const empty = (raw?.roles?.rules || []).find((r?) => r?.enabled !== false && (!Array.isArray(r?.roleIds) || !r.roleIds.length || (!r?.channelId && r?.dm?.enabled !== true)));
  if (empty) return fail(400, "incomplete", `"${String(empty.name || "Regola")}": scegli almeno un ruolo e il canale (o accendi il privato), oppure spegnila.`);
  const named = raw?.named && typeof raw.named === "object" ? raw.named : {};
  for (const key of ANN().NAMED_KEYS || []) {
    const slot = named[key];
    if (!slot || slot.enabled !== true) continue;
    if (!slot.channelId) return fail(400, "incomplete", `"${String(slot.name || key)}": scegli il canale, oppure spegnilo.`);
  }
  const config = await ANN().saveConfig(a.guildId, raw);
  return { ok: true, status: 200, config };
}

/* ───────────── bump e voti ───────────── */

const BV = () => require("../../services/bumpVotesRuntime") as typeof import("../../services/bumpVotesRuntime");
const voteUrls = (gid: string, token: string) => ({
  topgg: `https://api.viniliecaffe.it/webhooks/guild-votes/${gid}/topgg/${token}`,
  discadia: `https://api.viniliecaffe.it/webhooks/guild-votes/${gid}/discadia/${token}`,
});

async function getBumpVotes(client?, token?, guildId?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  const imported = await BV().ensureMainSeed(client, a.guildId).catch(() => false);
  const config = await BV().getConfig(a.guildId, true);
  return { ok: true, status: 200, isMainGuild: T.isMainGuild(a.guildId), imported, config, urls: voteUrls(a.guildId, config.votes.token) };
}

async function patchBumpVotes(client?, token?, guildId?, body?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  const config = await BV().saveConfig(a.guildId, body?.config || body);
  return { ok: true, status: 200, config, urls: voteUrls(a.guildId, config.votes.token) };
}

async function regenBumpVotesToken(client?, token?, guildId?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  const config = await BV().regenerateToken(a.guildId);
  return { ok: true, status: 200, config, urls: voteUrls(a.guildId, config.votes.token) };
}

async function bumpVotesLeaderboard(client?, token?, guildId?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  return { ok: true, status: 200, ...(await BV().leaderboard(client, a.guildId)) };
}

async function resetBumpVotesLeaderboard(client?, token?, guildId?, body?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  const which = body?.which === "votes" ? "votes" : "bumps";
  await BV().resetLeaderboard(a.guildId, which);
  return { ok: true, status: 200 };
}

/* ───────────── automazioni del server principale ───────────── */

const MAIN_AUTOMATIONS = [
  { key: "movieNight", name: "Proposte serata film", description: "Nel thread delle proposte toglie i film già proposti e quelli scritti male." },
  { key: "headingBlock", name: "Blocco titoli markdown", description: "Toglie i messaggi scritti con i titoli grandi (# Titolo) di Discord." },
];

async function listMainAutomations(client?, token?, guildId?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  if (!T.isMainGuild(a.guildId)) return fail(404, "unsupported", "Le automazioni ci sono solo sul server principale.");
  const off = await T.getDisabledAutomations(a.guildId, true);
  return { ok: true, status: 200, automations: MAIN_AUTOMATIONS.map((x) => ({ ...x, enabled: !off.includes(x.key) })) };
}

async function setMainAutomation(client?, token?, guildId?, body?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  if (!T.isMainGuild(a.guildId)) return fail(404, "unsupported", "Le automazioni ci sono solo sul server principale.");
  const key = String(body?.key || "");
  if (!MAIN_AUTOMATIONS.some((x) => x.key === key)) return fail(400, "invalid", "Automazione sconosciuta.");
  const off = new Set(await T.getDisabledAutomations(a.guildId, true));
  if (body?.enabled === false) off.add(key);
  else off.delete(key);
  await T.writeDisabledAutomations(a.guildId, [...off]);
  return listMainAutomations(client, token, guildId);
}

/* ───────────── promemoria in chat ───────────── */

function chatRemindersSupported(guildId?) {
  return T.isMainGuild(guildId);
}

async function listChatReminders(client?, token?, guildId?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  if (!chatRemindersSupported(a.guildId)) return fail(404, "unsupported", "I promemoria in chat ci sono solo sul server principale.");
  let items = await T.getChatReminders(a.guildId, true);
  let imported = false;
  if (!items) {
    /* prima apertura: importa i promemoria che il bot usa adesso */
    const { defaultReminderDrafts } = require("../../../Vinili/Community/services/chatReminderService") as typeof import("../../../Vinili/Community/services/chatReminderService");
    items = defaultReminderDrafts().map((x) => T.normalizeChatReminder(x, x));
    await T.writeChatReminders(a.guildId, items);
    imported = true;
  }
  return { ok: true, status: 200, items, imported, max: T.CHAT_REMINDERS_MAX };
}

async function putChatReminders(client?, token?, guildId?, body?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  if (!chatRemindersSupported(a.guildId)) return fail(404, "unsupported", "I promemoria in chat ci sono solo sul server principale.");
  const raw = Array.isArray(body?.items) ? body.items : null;
  if (!raw) return fail(400, "invalid", "Elenco non valido.");
  if (raw.length > T.CHAT_REMINDERS_MAX) return fail(400, "limit", `Al massimo ${T.CHAT_REMINDERS_MAX} promemoria.`);
  const items = raw.map((x?) => T.normalizeChatReminder(x, x && typeof x.id === "string" ? { id: x.id } : null));
  const empty = items.find((x) => x.enabled && T.draftIsEmpty(x.draft));
  if (empty) return fail(400, "empty", `"${empty.name}" è vuoto: scrivi un testo o disattivalo.`);
  await T.writeChatReminders(a.guildId, items);
  return { ok: true, status: 200, items };
}

/* ───────────── contatori ───────────── */

const COUNTER_LABEL: Record<string, string> = {
  members: "Membri",
  humans: "Membri senza bot",
  bots: "Bot",
  online: "Online",
  statusOnline: "Online (verde)",
  idle: "Inattivi",
  dnd: "Non disturbare",
  offline: "Offline",
  boosts: "Boost",
  boostTier: "Livello boost",
  channels: "Canali",
  roles: "Ruoli",
  emojis: "Emoji",
};

/* bot e persone: servono tutti i membri, quindi si contano al massimo ogni 9 minuti per server */
const MEMBER_SPLIT_TTL = 9 * 60_000;
const memberSplitCache = new Map<string, { at: number; bots: number; humans: number }>();
async function memberSplit(client?, gid?) {
  const hit = memberSplitCache.get(String(gid));
  if (hit && Date.now() - hit.at < MEMBER_SPLIT_TTL) return hit;
  const rest = restOf(client);
  let after = "0";
  let bots = 0;
  let humans = 0;
  for (let page = 0; page < 100; page++) {
    const list: any = await rest.get(Routes.guildMembers(gid), { query: new URLSearchParams({ limit: "1000", after }) }).catch(() => null);
    if (!Array.isArray(list)) {
      if (page === 0) return null;
      break;
    }
    for (const m of list) {
      if (m?.user?.bot) bots++;
      else humans++;
    }
    if (list.length < 1000) break;
    after = String(list[list.length - 1]?.user?.id || after);
  }
  const out = { at: Date.now(), bots, humans };
  memberSplitCache.set(String(gid), out);
  return out;
}

async function guildCounts(client?, gid?, withSplit = false) {
  const rest = restOf(client);
  const [g, channels, roles, emojis]: any[] = await Promise.all([
    rest.get(Routes.guild(gid), { query: new URLSearchParams({ with_counts: "true" }) }).catch(() => null),
    rest.get(Routes.guildChannels(gid)).catch(() => null),
    rest.get(Routes.guildRoles(gid)).catch(() => null),
    rest.get(Routes.guildEmojis(gid)).catch(() => null),
  ]);
  if (!g) return null;
  const split = withSplit ? await memberSplit(client, gid).catch(() => null) : null;
  const members = Number(g.approximate_member_count) || 0;
  const pres = await (require("../../services/presenceCounts") as typeof import("../../services/presenceCounts")).getPresenceTotals(String(gid)).catch(() => null);
  const active = Number(g.approximate_presence_count) || 0;
  return {
    members,
    ...(pres
      ? {
          statusOnline: pres.online,
          idle: pres.idle,
          dnd: pres.dnd,
          offline: Math.max(0, members - (pres.online + pres.idle + pres.dnd)),
        }
      : { offline: Math.max(0, members - active) }),
    ...(split ? { bots: split.bots, humans: Math.max(0, members - split.bots) } : {}),
    online: Number(g.approximate_presence_count) || 0,
    boosts: Number(g.premium_subscription_count) || 0,
    boostTier: Number(g.premium_tier) || 0,
    channels: Array.isArray(channels) ? channels.filter((c?) => c.type !== 4).length : 0,
    roles: Array.isArray(roles) ? roles.length - 1 : 0,
    emojis: Array.isArray(emojis) ? emojis.length : 0,
  } as Record<string, number>;
}

const counterName = (counter?, counts?: Record<string, number> | null) => T.counterDisplayName(counter, counts);

const needsSplit = (rows: any[]) => rows.some((r) => r?.type === "humans" || r?.type === "bots");

/** Valori attuali per l'anteprima nella dashboard. */
async function counterValues(client?, token?, guildId?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  const counts = await guildCounts(client, a.guildId, true);
  if (!counts) return fail(400, "no_guild", "Impossibile leggere i numeri del server.");
  return { ok: true, status: 200, values: counts };
}

async function createCounter(client?, token?, guildId?, body?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  const gid = a.guildId;
  const rows = await T.listRows("counters", gid, true);
  if (rows.length >= T.LIMITS.counters) return fail(400, "limit", `Puoi creare al massimo ${T.LIMITS.counters} contatori.`);
  const counter = T.normalizeCounter({ type: body?.type, template: body?.template });
  const counts = await guildCounts(client, gid, needsSplit([counter]));
  const name = counterName(counter, counts);
  const parent = T.isId(body?.categoryId) ? String(body.categoryId) : undefined;
  try {
    const ch: any = await restOf(client).post(Routes.guildChannels(gid), {
      body: {
        name,
        type: 2,
        ...(parent ? { parent_id: parent } : {}),
        /* @everyone vede il canale ma non può entrare */
        permission_overwrites: [{ id: gid, type: 0, deny: String(1n << 20n), allow: String(1n << 10n) }],
      },
      reason: "Contatore creato dalla dashboard",
    });
    const saved = { ...counter, channelId: String(ch.id), lastName: name };
    rows.push(saved);
    await T.writeRows("counters", gid, rows);
    return { ok: true, status: 200, counter: saved };
  } catch (err) {
    return fail(400, "create_failed", discordError(err));
  }
}

async function patchCounter(client?, token?, guildId?, id?, body?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  const gid = a.guildId;
  const rows = await T.listRows("counters", gid, true);
  const idx = rows.findIndex((r) => r.id === String(id));
  if (idx < 0) return fail(404, "not_found", "Contatore non trovato.");
  const next = T.normalizeCounter({ ...rows[idx], ...body, channelId: rows[idx].channelId }, rows[idx]);
  const name = counterName(next, await guildCounts(client, gid, needsSplit([next])));
  if (next.channelId && name !== rows[idx].lastName) {
    try {
      await restOf(client).patch(Routes.channel(next.channelId), { body: { name }, reason: "Contatore aggiornato dalla dashboard" });
      next.lastName = name;
    } catch (err) {
      return fail(400, "rename_failed", discordError(err));
    }
  }
  rows[idx] = next;
  await T.writeRows("counters", gid, rows);
  return { ok: true, status: 200, counter: next };
}

async function deleteCounter(client?, token?, guildId?, id?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  const rows = await T.listRows("counters", a.guildId, true);
  const c = rows.find((r) => r.id === String(id));
  if (!c) return fail(404, "not_found", "Contatore non trovato.");
  if (c.channelId) await restOf(client).delete(Routes.channel(c.channelId)).catch(() => null);
  await T.writeRows("counters", a.guildId, rows.filter((r) => r.id !== c.id));
  return { ok: true, status: 200 };
}

/** Scheduler: rinomina i canali contatore (Discord permette 2 rinomine ogni 10 minuti per canale). */
async function runCounters(client?) {
  const all = await T.allGuildRows("counters");
  for (const [gid, rows] of Object.entries(all)) {
    if (!(require("../../core/moduleSwitches") as typeof import("../../core/moduleSwitches")).isModuleOn(gid, "contatori")) continue;
    const counts = await guildCounts(client, gid, needsSplit(rows)).catch(() => null);
    if (!counts) continue;
    let changed = false;
    for (const c of rows) {
      if (!c.channelId) continue;
      const name = counterName(c, counts);
      if (name === c.lastName) continue;
      try {
        await restOf(client).patch(Routes.channel(c.channelId), { body: { name }, reason: "Contatore" });
        c.lastName = name;
        changed = true;
      } catch (err) {
        const code = Number(err?.code || err?.rawError?.code);
        if (code === 10003) {
          c.channelId = null;
          changed = true;
        }
      }
    }
    if (changed) {
      /* rilegge per non perdere modifiche fatte nel frattempo dalla dashboard */
      const fresh = await T.listRows("counters", gid, true);
      const byId = new Map<string, any>(rows.map((r) => [r.id, r]));
      await T.writeRows(
        "counters",
        gid,
        fresh.filter((r) => !(byId.get(r.id) && byId.get(r.id).channelId === null)).map((r) => (byId.has(r.id) ? { ...r, lastName: byId.get(r.id).lastName } : r)),
      );
    }
  }
}

let countersTimer: ReturnType<typeof setInterval> | null = null;
function startCountersLoop(client?) {
  if (countersTimer) return;
  let busy = false;
  const tick = () => {
    if (busy) return;
    busy = true;
    void runCounters(client)
      .catch((err?) => global.logger?.warn?.("[COUNTERS] loop:", err?.message || err))
      .finally(() => {
        busy = false;
      });
  };
  setTimeout(tick, 60_000).unref?.();
  countersTimer = setInterval(tick, 10 * 60_000);
  countersTimer.unref?.();
}

/* ───────────── log del server ───────────── */

async function patchServerLogs(client?, token?, guildId?, body?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  const next = T.normalizeServerLogs(body, await T.getServerLogs(a.guildId, true));
  if (next.enabled && !next.channelId && !Object.keys(next.channels || {}).length) {
    return fail(400, "no_channel", "Scegli il canale generale dei log o almeno un canale per un evento.");
  }
  await T.writeServerLogs(a.guildId, next);
  return { ok: true, status: 200, serverLogs: next };
}

/* ───────────── Live & Video ───────────── */

const LIVE = () => require("../../services/liveAlertsRuntime") as typeof import("../../services/liveAlertsRuntime");

async function getLive(client?, token?, guildId?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  const imported = await LIVE().ensureMainSeed(client, a.guildId).catch(() => false);
  const config = await LIVE().getConfig(a.guildId, true);
  return {
    ok: true,
    status: 200,
    isMainGuild: T.isMainGuild(a.guildId),
    imported,
    config,
    maxAccounts: LIVE().ACCOUNTS_MAX,
    placeholders: ["{mention}", "{name}", "{title}", "{game}", "{viewers}", "{url}", "{ping}", "{platform}", "{thumb}", "{type}", "{kind}"],
  };
}

async function patchLive(client?, token?, guildId?, body?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  const raw = body?.config || body;
  const prev = await LIVE().getConfig(a.guildId, true);
  const draft = LIVE().normalizeConfig(raw, prev);
  for (const p of LIVE().PLATFORMS) {
    const plat = draft.platforms[p];
    if (!plat?.enabled) continue;
    if (!plat.channelId) return fail(400, "incomplete", `${p}: scegli il canale Discord, oppure spegni la piattaforma.`);
    if (!plat.accounts.length) return fail(400, "incomplete", `${p}: aggiungi almeno un account, oppure spegni la piattaforma.`);
  }
  const config = await LIVE().saveConfig(a.guildId, draft);
  if (T.isMainGuild(a.guildId)) {
    try {
      const Twitch = require("../../../Vinili/Community/services/twitchLiveAlertService") as typeof import("../../../Vinili/Community/services/twitchLiveAlertService");
      Twitch.setMultiGuildTwitchOverride?.(LIVE().twitchCompatFromConfig(config, client));
      await Twitch.refreshMultiGuildTwitchOverride?.(client);
    } catch (_) {}
  }
  return { ok: true, status: 200, config };
}

/* ───────────── giveaway ───────────── */

const G = () => require("../../../Vinili/Giveaway/services/giveawayService") as typeof import("../../../Vinili/Giveaway/services/giveawayService");
const GiveawayModel = () => require("../../../Vinili/Giveaway/services/guildFeatureBucketGiveawayModel") as any;

function serializeGiveaway(g?) {
  return {
    id: String(g._id),
    messageId: g.messageId ? String(g.messageId) : null,
    channelId: String(g.channelId || ""),
    prize: String(g.prize || ""),
    endAt: new Date(g.endAt).getTime(),
    winnerCount: Number(g.winnerCount) || 1,
    participants: Array.isArray(g.participants) ? g.participants.length : 0,
    ended: Boolean(g.ended),
    cancelled: Boolean(g.cancelled),
    winnerIds: Array.isArray(g.winnerIds) ? g.winnerIds.map(String) : [],
    hostId: g.hostId ? String(g.hostId) : null,
  };
}

async function listGiveaways(client?, token?, guildId?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  const rows: any[] = await GiveawayModel().find({ guildId: a.guildId }).lean();
  const out = (Array.isArray(rows) ? rows : []).map(serializeGiveaway).sort((x, y) => Number(x.ended) - Number(y.ended) || y.endAt - x.endAt).slice(0, 60);
  return { ok: true, status: 200, giveaways: out };
}

async function createGiveaway(client?, token?, guildId?, body?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  const prize = String(body?.prize || "").trim().slice(0, 200);
  const channelId = T.isId(body?.channelId) ? String(body.channelId) : "";
  const durationMs = Number(body?.durationMs);
  const winnerCount = Math.max(1, Math.min(20, Math.floor(Number(body?.winnerCount) || 1)));
  if (!prize) return fail(400, "no_prize", "Scrivi il premio.");
  if (!channelId) return fail(400, "no_channel", "Scegli il canale.");
  if (!Number.isFinite(durationMs) || durationMs < 60_000 || durationMs > 60 * 86_400_000) return fail(400, "bad_duration", "Durata tra 1 minuto e 60 giorni.");
  const rest = restOf(client);
  let hostId = String(a.userId);
  if (body?.hostId != null && String(body.hostId).trim()) {
    const wanted = String(body.hostId).trim();
    if (!T.isId(wanted)) return fail(400, "bad_host", "Host non valido.");
    const member: any = await rest.get(Routes.guildMember(a.guildId, wanted)).catch(() => null);
    if (!member?.user?.id) return fail(400, "bad_host", "L'host scelto non è nel server.");
    hostId = wanted;
  }
  const user: any = await rest.get(Routes.user(hostId)).catch(() => null);
  const svc = G();
  const g: any = await svc.createGiveaway({ guildId: a.guildId, channelId, hostId, hostTag: user?.username || "", prize, durationMs, winnerCount });
  try {
    const embed: any = svc.buildGiveawayEmbed(g);
    const row: any = svc.buildEnterButton(String(g._id));
    const m: any = await rest.post(Routes.channelMessages(channelId), {
      body: { embeds: [embed?.toJSON ? embed.toJSON() : embed], components: [row?.toJSON ? row.toJSON() : row], allowed_mentions: { parse: [] } },
    });
    await svc.setGiveawayMessageId(g._id, m.id);
    return { ok: true, status: 200, giveaway: serializeGiveaway({ ...g, messageId: m.id }) };
  } catch (err) {
    /* messaggio non inviato: annulla il giveaway appena creato */
    await GiveawayModel().updateOne({ _id: g._id }, { $set: { ended: true, cancelled: true } }).catch(() => null);
    return fail(400, "send_failed", discordError(err));
  }
}

async function giveawayAction(client?, token?, guildId?, messageId?, action?: "end" | "reroll" | "delete") {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  const g: any = await GiveawayModel().findOne({ messageId: String(messageId || "") }).lean();
  if (!g || String(g.guildId) !== a.guildId) return fail(404, "not_found", "Giveaway non trovato.");
  const svc = G();
  const out: any =
    action === "end"
      ? await svc.endGiveawayByMessageId(messageId, client)
      : action === "reroll"
        ? await svc.rerollGiveawayByMessageId(messageId, client)
        : await svc.deleteGiveawayByMessageId(messageId, client, { deleteMessage: true });
  if (!out?.ok) return fail(400, "action_failed", String(out?.error || "Operazione non riuscita.").replace(/<a?:\w+:\d+>\s*/g, ""));
  return { ok: true, status: 200, ...out };
}

async function editGiveaway(client?, token?, guildId?, messageId?, body?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  const g: any = await GiveawayModel().findOne({ messageId: String(messageId || "") }).lean();
  if (!g || String(g.guildId) !== a.guildId) return fail(404, "not_found", "Giveaway non trovato.");
  if (g.ended || g.cancelled) return fail(400, "ended", "Non puoi modificare un giveaway già terminato o annullato.");

  const patch: Record<string, any> = {};
  if (body?.prize != null) {
    const prize = String(body.prize || "").trim().slice(0, 200);
    if (!prize) return fail(400, "no_prize", "Scrivi il premio.");
    patch.prize = prize;
  }
  if (body?.winnerCount != null) {
    patch.winnerCount = Math.max(1, Math.min(20, Math.floor(Number(body.winnerCount) || 1)));
  }
  if (body?.durationMs != null) {
    const durationMs = Number(body.durationMs);
    if (!Number.isFinite(durationMs) || durationMs < 60_000 || durationMs > 60 * 86_400_000) {
      return fail(400, "bad_duration", "Durata tra 1 minuto e 60 giorni.");
    }
    patch.durationMs = durationMs;
  }
  if (body?.hostId != null && String(body.hostId).trim()) {
    const hostId = String(body.hostId).trim();
    if (!T.isId(hostId)) return fail(400, "bad_host", "Host non valido.");
    patch.hostId = hostId;
    const user: any = await restOf(client).get(Routes.user(hostId)).catch(() => null);
    patch.hostTag = user?.username || "";
  }
  if (!Object.keys(patch).length) return fail(400, "empty", "Specifica premio, durata, vincitori o host.");

  const out: any = await G().editGiveawayByMessageId(messageId, client, patch);
  if (!out?.ok) return fail(400, "edit_failed", String(out?.error || "Modifica non riuscita.").replace(/<a?:\w+:\d+>\s*/g, ""));
  return { ok: true, status: 200, giveaway: serializeGiveaway(out.giveaway || { ...g, ...patch }) };
}

/* ───────────── sondaggi (sondaggi nativi di Discord) ───────────── */

async function refreshPollResults(client?, poll?) {
  if (!poll.messageId || !poll.channelId) return poll;
  const m: any = await restOf(client).get(Routes.channelMessage(poll.channelId, poll.messageId)).catch((err?) => {
    if (Number(err?.code || err?.rawError?.code) === 10008) return { __deleted: true };
    return null;
  });
  if (!m) return poll;
  if (m.__deleted) return { ...poll, deleted: true, ended: true };
  const counts = new Map<number, number>((m.poll?.results?.answer_counts || []).map((c?) => [Number(c.id), Number(c.count) || 0]));
  const answers = (poll.answers || []).map((x?, i?: number) => ({ ...x, votes: counts.get(Number(x.answerId ?? i + 1)) || 0 }));
  const finalized = Boolean(m.poll?.results?.is_finalized) || (m.poll?.expiry && new Date(m.poll.expiry).getTime() <= Date.now());
  return { ...poll, answers, ended: Boolean(finalized), checkedAt: Date.now() };
}

async function listPolls(client?, token?, guildId?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  const rows = await T.listRows("polls", a.guildId, true);
  let changed = false;
  const out = [];
  for (const p of rows) {
    const stale = !p.deleted && (!p.ended || !p.checkedAt) && (!p.checkedAt || Date.now() - p.checkedAt > 20_000);
    if (stale && out.filter((x) => x.__refreshed).length < 12) {
      const r = await refreshPollResults(client, p);
      out.push({ ...r, __refreshed: true });
      changed = true;
    } else out.push(p);
  }
  const clean = out.map(({ __refreshed, ...p }) => p);
  if (changed) await T.writeRows("polls", a.guildId, clean);
  return { ok: true, status: 200, polls: clean };
}

async function createPoll(client?, token?, guildId?, body?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  const rows = await T.listRows("polls", a.guildId, true);
  if (rows.length >= T.LIMITS.polls) return fail(400, "limit", `Hai già ${T.LIMITS.polls} sondaggi: eliminane qualcuno vecchio.`);
  const question = String(body?.question || "").trim().slice(0, 300);
  const channelId = T.isId(body?.channelId) ? String(body.channelId) : "";
  const answers = (Array.isArray(body?.answers) ? body.answers : [])
    .map((x?) => ({ text: String(x?.text || "").trim().slice(0, 55), emoji: String(x?.emoji || "").trim().slice(0, 80) }))
    .filter((x) => x.text)
    .slice(0, 10);
  const hours = Math.max(1, Math.min(768, Math.floor(Number(body?.durationHours) || 24)));
  if (!question) return fail(400, "no_question", "Scrivi la domanda.");
  if (answers.length < 2) return fail(400, "few_answers", "Servono almeno 2 risposte.");
  if (!channelId) return fail(400, "no_channel", "Scegli il canale.");
  const pollBody = {
    question: { text: question },
    answers: answers.map((x) => {
      const em = T.parseEmoji(x.emoji);
      return { poll_media: { text: x.text, ...(em ? { emoji: em.id ? { id: em.id } : { name: em.name } } : {}) } };
    }),
    duration: hours,
    allow_multiselect: body?.multiselect === true,
    layout_type: 1,
  };
  try {
    const m: any = await restOf(client).post(Routes.channelMessages(channelId), { body: { poll: pollBody, allowed_mentions: { parse: [] } } });
    const saved = {
      id: T.newId(),
      question,
      channelId,
      messageId: String(m.id),
      answers: (m.poll?.answers || pollBody.answers).map((x?, i?: number) => ({ answerId: Number(x.answer_id ?? i + 1), text: answers[i]?.text || "", emoji: answers[i]?.emoji || "", votes: 0 })),
      multiselect: body?.multiselect === true,
      durationHours: hours,
      createdAt: Date.now(),
      endsAt: Date.now() + hours * 3_600_000,
      ended: false,
      createdBy: a.userId,
      checkedAt: Date.now(),
    };
    rows.unshift(saved);
    await T.writeRows("polls", a.guildId, rows);
    return { ok: true, status: 200, poll: saved };
  } catch (err) {
    return fail(400, "send_failed", discordError(err));
  }
}

async function endPoll(client?, token?, guildId?, id?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  const rows = await T.listRows("polls", a.guildId, true);
  const idx = rows.findIndex((r) => r.id === String(id));
  if (idx < 0) return fail(404, "not_found", "Sondaggio non trovato.");
  const p = rows[idx];
  try {
    await restOf(client).post(`/channels/${p.channelId}/polls/${p.messageId}/expire` as any);
  } catch (err) {
    const code = Number(err?.code || err?.rawError?.code);
    if (code !== 520001 && code !== 10008) return fail(400, "end_failed", discordError(err));
  }
  rows[idx] = { ...(await refreshPollResults(client, p)), ended: true, endsAt: Date.now() };
  await T.writeRows("polls", a.guildId, rows);
  return { ok: true, status: 200, poll: rows[idx] };
}

async function deletePoll(client?, token?, guildId?, id?, alsoDiscord = false) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  const rows = await T.listRows("polls", a.guildId, true);
  const p = rows.find((r) => r.id === String(id));
  if (!p) return fail(404, "not_found", "Sondaggio non trovato.");
  if (alsoDiscord && p.messageId) await restOf(client).delete(Routes.channelMessage(p.channelId, p.messageId)).catch(() => null);
  await T.writeRows("polls", a.guildId, rows.filter((r) => r.id !== p.id));
  return { ok: true, status: 200 };
}

/** Quali moduli sono spenti su questo server (per il menu della dashboard), principale compreso. */
const MS = () => require("../../core/moduleSwitches") as typeof import("../../core/moduleSwitches");

/** Pagina Moduli: stato di ogni modulo (acceso / bloccato). */
async function listModuleSwitches(client?, token?, guildId?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  return { ok: true, status: 200, modules: MS().listModules(a.guildId) };
}

/** Pagina Moduli: accende o spegne un modulo. */
async function setModuleSwitch(client?, token?, guildId?, body?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  const id = String(body?.id || "");
  if (!MS().MODULES.some((m) => m.id === id)) return fail(400, "unknown_module", "Modulo sconosciuto.");
  const ok = await MS().setModuleOn(a.guildId, id, body?.on === true);
  if (!ok) return fail(400, "save_failed", T.isMainGuild(a.guildId) && id === "tickets" ? "Sul server principale i ticket si gestiscono dal sito." : "Non sono riuscito a salvare. Riprova tra poco.");
  return { ok: true, status: 200, modules: MS().listModules(a.guildId) };
}

/* moduli del menu laterale: "Disattivati" = solo quelli spenti dalla pagina Moduli */
const SIDEBAR_MODULES = ["bacheca", "tickets", "moderation", "partnership", "messaggi", "comandipers", "ruoli", "benvenuto", "risposte", "contatori", "bump", "voti", "giveaway", "sondaggi", "live"];

async function modulesStatus(client?, token?, guildId?) {
  const a = await access(client, token, guildId);
  if (!a.ok) return a;
  return { ok: true, status: 200, off: SIDEBAR_MODULES.filter((id) => MS().moduleExists(a.guildId, id) && !MS().isModuleOn(a.guildId, id)) };
}

export = {
  modulesStatus,
  listModuleSwitches,
  setModuleSwitch,
  putAutoResponder,
  deleteAutoResponder,
  listChatReminders,
  putChatReminders,
  listMainAutomations,
  setMainAutomation,
  getAnnouncements,
  patchAnnouncements,
  getBumpVotes,
  patchBumpVotes,
  regenBumpVotesToken,
  bumpVotesLeaderboard,
  resetBumpVotesLeaderboard,
  counterValues,
  createCounter,
  patchCounter,
  deleteCounter,
  runCounters,
  startCountersLoop,
  COUNTER_LABEL,
  patchServerLogs,
  getLive,
  patchLive,
  listGiveaways,
  createGiveaway,
  editGiveaway,
  giveawayAction,
  listPolls,
  createPoll,
  endPoll,
  deletePoll,
};
