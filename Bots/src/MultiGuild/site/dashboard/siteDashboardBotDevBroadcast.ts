/**
 * «Messaggio ai proprietari» (dashboard sviluppatori): un avviso a tutti i server dove c'è il bot.
 *
 * - Se il server ha impostato il canale aggiornamenti, il messaggio va lì (stesso webhook degli aggiornamenti).
 * - Altrimenti va in privato al proprietario; se ha i privati chiusi si salta.
 * - Un invio ogni ~45 secondi, per non sembrare spam; i server ufficiali sono esclusi.
 * - Se il server ha scelto un'altra lingua in dashboard, il testo si traduce (Google) prima dell'invio.
 *
 * Lo stato dell'invio resta in memoria: se site-api si riavvia, l'invio si ferma e lo dice.
 */
const { Routes } = require("discord.js") as typeof import("discord.js");
const { assertDashboardBotDevAccess } = require("./siteDashboardApi") as typeof import("./siteDashboardApi");
const { isViniliProtectedGuild } = require("../../core/viniliProtectedGuilds") as typeof import("../../core/viniliProtectedGuilds");
const {
  ensureTenantGuildSettingsCacheFresh,
  getTenantLanguageSync,
} = require("../../core/tenantGuildSettings") as typeof import("../../core/tenantGuildSettings");

const GAP_MS = 45_000;
const TITLE_MAX = 200;
const TEXT_MAX = 3500;
const ACCENT = 0xd4914f;

type Job = {
  id: string;
  by: string;
  startedAt: number;
  finishedAt: number | null;
  stopped: boolean;
  total: number;
  done: number;
  channel: number;
  dm: number;
  skipped: number;
  failed: { guildId: string; name: string; reason: string }[];
  current: string | null;
};
let job: Job | null = null;

function fail(status: number, error: string, message: string) {
  return { ok: false, status, error, message };
}

function rest(client?) {
  return client?._rest || client?.rest || null;
}

/** I server dove c'è il bot, con il proprietario (Discord via REST: site-api non ha la cache dei server). */
async function botGuilds(client?): Promise<{ id: string; name: string }[]> {
  const r = rest(client);
  const out: { id: string; name: string }[] = [];
  if (!r) return out;
  let after = "";
  for (let page = 0; page < 25; page += 1) {
    const q = new URLSearchParams({ limit: "200" });
    if (after) q.set("after", after);
    const batch: any = await r.get(`${Routes.userGuilds()}?${q.toString()}`);
    if (!Array.isArray(batch) || !batch.length) break;
    for (const g of batch) out.push({ id: String(g.id), name: String(g.name || g.id) });
    after = String(batch[batch.length - 1]?.id || "");
    if (batch.length < 200) break;
  }
  return out.filter((g) => !isViniliProtectedGuild(g.id));
}

async function ownerOf(client?, guildId?: string): Promise<string | null> {
  try {
    const g: any = await rest(client).get(Routes.guild(String(guildId)));
    return g?.owner_id ? String(g.owner_id) : null;
  } catch {
    return null;
  }
}

function relay() {
  return require("../../../Vinili/Community/services/botUpdatesRelayService") as typeof import("../../../Vinili/Community/services/botUpdatesRelayService");
}

function clean(body: Record<string, any>) {
  const title = String(body?.title || "").trim().slice(0, TITLE_MAX);
  const text = String(body?.text || "").trim().slice(0, TEXT_MAX);
  return { title, text, translate: body?.translate !== false };
}

/** Il messaggio vero: embed con titolo e testo, e una riga che spiega perché arriva. */
async function buildMessage(title: string, text: string, opts: { lang: string | null; guildName: string; viaDm: boolean }) {
  let t = title;
  let d = text;
  let why = opts.viaDm
    ? `Ricevi questo messaggio perché sei il proprietario di ${opts.guildName}, dove c'è Vinili.`
    : "Messaggio dallo staff di Vinili per i server che lo usano.";
  if (opts.lang && opts.lang !== "it") {
    try {
      const { translateTexts } = require("../../../Vinili/site/http/siteTranslateApi") as typeof import("../../../Vinili/site/http/siteTranslateApi");
      const tr = await translateTexts([t, d, why].map((x) => x || " "), opts.lang);
      if (tr) [t, d, why] = [title ? tr[0] : "", tr[1], tr[2]];
    } catch {
      /* resta in italiano */
    }
  }
  return {
    embeds: [
      {
        ...(t ? { title: t } : {}),
        description: d,
        color: ACCENT,
        footer: { text: why.slice(0, 2000) },
      },
    ],
    allowed_mentions: { parse: [] },
  };
}

async function sendDm(client?, userId?: string, message?: any): Promise<{ ok: boolean; reason?: string }> {
  try {
    const r = rest(client);
    const ch: any = await r.post(Routes.userChannels(), { body: { recipient_id: String(userId) } });
    await r.post(Routes.channelMessages(String(ch.id)), { body: message });
    return { ok: true };
  } catch (err: any) {
    const code = Number(err?.code || err?.rawError?.code);
    return { ok: false, reason: code === 50007 ? "privati chiusi" : String(err?.message || "invio non riuscito").slice(0, 120) };
  }
}

function publicJob() {
  if (!job) return null;
  return { ...job, failed: job.failed.slice(-50), etaMs: job.finishedAt ? 0 : Math.max(0, (job.total - job.done) * GAP_MS) };
}

/** Quanti server lo riceverebbero nel canale aggiornamenti e quanti in privato, più l'invio in corso. */
async function getBroadcastStatus(client?, accessToken?) {
  const gate: any = await assertDashboardBotDevAccess(client, accessToken);
  if (!gate.ok) return gate;
  await ensureTenantGuildSettingsCacheFresh().catch(() => null);
  const guilds = await botGuilds(client).catch(() => []);
  const channel = guilds.filter((g) => relay().tenantUpdatesChannelOf(g.id)).length;
  return { ok: true, status: 200, servers: guilds.length, channel, dm: guilds.length - channel, gapSeconds: GAP_MS / 1000, job: publicJob() };
}

/** Prova: arriva solo in privato a chi la manda, in italiano. */
async function postBroadcastTest(client?, accessToken?, body: Record<string, any> = {}) {
  const gate: any = await assertDashboardBotDevAccess(client, accessToken);
  if (!gate.ok) return gate;
  const { title, text } = clean(body);
  if (!text) return fail(400, "empty", "Scrivi il testo del messaggio.");
  const msg = await buildMessage(title, text, { lang: null, guildName: "il tuo server", viaDm: true });
  const r = await sendDm(client, gate.userId, msg);
  return r.ok ? { ok: true, status: 200 } : fail(400, "dm_failed", `Prova non arrivata: ${r.reason}.`);
}

async function run(client: any, title: string, text: string, translate: boolean, guilds: { id: string; name: string }[]) {
  const current = job as Job;
  for (const g of guilds) {
    if (current.stopped) break;
    current.current = g.name;
    const lang = translate ? getTenantLanguageSync(g.id) : null;
    try {
      const viaChannel = Boolean(relay().tenantUpdatesChannelOf(g.id));
      let sent = false;
      if (viaChannel) {
        const msg = await buildMessage(title, text, { lang, guildName: g.name, viaDm: false });
        const r: any = await relay().sendToTenantUpdatesChannel(client, g.id, msg);
        if (r.ok) {
          current.channel += 1;
          sent = true;
        }
      }
      if (!sent) {
        const owner = await ownerOf(client, g.id);
        if (!owner) {
          current.skipped += 1;
          current.failed.push({ guildId: g.id, name: g.name, reason: "proprietario non trovato" });
        } else {
          const msg = await buildMessage(title, text, { lang, guildName: g.name, viaDm: true });
          const r = await sendDm(client, owner, msg);
          if (r.ok) current.dm += 1;
          else {
            current.skipped += 1;
            current.failed.push({ guildId: g.id, name: g.name, reason: r.reason || "invio non riuscito" });
          }
        }
      }
    } catch (err: any) {
      current.skipped += 1;
      current.failed.push({ guildId: g.id, name: g.name, reason: String(err?.message || err).slice(0, 120) });
    }
    current.done += 1;
    if (current.done < current.total && !current.stopped) await new Promise((r) => setTimeout(r, GAP_MS));
  }
  current.current = null;
  current.finishedAt = Date.now();
  global.logger?.info?.(
    `[DEV BROADCAST] finito: ${current.channel} nel canale, ${current.dm} in privato, ${current.skipped} saltati${current.stopped ? " (fermato)" : ""}`,
  );
}

async function postBroadcastStart(client?, accessToken?, body: Record<string, any> = {}) {
  const gate: any = await assertDashboardBotDevAccess(client, accessToken);
  if (!gate.ok) return gate;
  if (job && !job.finishedAt) return fail(409, "running", "C'è già un invio in corso.");
  const { title, text, translate } = clean(body);
  if (!text) return fail(400, "empty", "Scrivi il testo del messaggio.");
  await ensureTenantGuildSettingsCacheFresh().catch(() => null);
  const guilds = await botGuilds(client).catch(() => []);
  if (!guilds.length) return fail(400, "no_guilds", "Non trovo server a cui mandarlo.");
  job = {
    id: Date.now().toString(36),
    by: gate.userId,
    startedAt: Date.now(),
    finishedAt: null,
    stopped: false,
    total: guilds.length,
    done: 0,
    channel: 0,
    dm: 0,
    skipped: 0,
    failed: [],
    current: null,
  };
  global.logger?.info?.(`[DEV BROADCAST] avviato da ${gate.userId} verso ${guilds.length} server`);
  void run(client, title, text, translate, guilds).catch((err) => {
    if (job) job.finishedAt = Date.now();
    global.logger?.warn?.("[DEV BROADCAST]", err?.message || err);
  });
  return { ok: true, status: 200, job: publicJob() };
}

async function postBroadcastStop(client?, accessToken?) {
  const gate: any = await assertDashboardBotDevAccess(client, accessToken);
  if (!gate.ok) return gate;
  if (job && !job.finishedAt) job.stopped = true;
  return { ok: true, status: 200, job: publicJob() };
}

export = { getBroadcastStatus, postBroadcastTest, postBroadcastStart, postBroadcastStop };
