/**
 * Bacheche: cosa succede nel server quando qualcuno fa il bump della scheda (dal sito o con /bump).
 * Impostazioni della scheda, come la tab Bump della dashboard: ringraziamento, ruolo a tempo
 * e promemoria quando si può rifare il bump (ogni 2 ore).
 */
const mongoose = require("mongoose") as typeof import("mongoose");
const { Routes } = require("discord.js") as typeof import("discord.js");
const { SiteDocument } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const T = require("../../../MultiGuild/core/tenantCommunityTools") as typeof import("../../../MultiGuild/core/tenantCommunityTools");
const { resolveBoardsUser } = require("./boardBanners") as typeof import("./boardBanners");
const { BL, featureGate } = require("./boardReviews") as typeof import("./boardReviews");

const SERVICE_NAME = "Vinili & Caffè";
const BUMP_COOLDOWN_MS = 2 * 60 * 60 * 1000;
const REMIND_SWEEP_MS = 60_000;
const DEFAULT_THANKS = "{user} grazie per il bump su **{service}**! 💙 Hai fatto {count} bump.";
const DEFAULT_REMINDER = "{role} si può di nuovo fare il bump su **{service}**! Usa il comando `/bump`.";
const EMPTY_EXP = { exp: "", fast: "", streak: "", bonus: "", level: "" } as Record<string, string>;

type BumpHook = {
  enabled: boolean;
  thanksEnabled: boolean;
  /** vuoto = dove è stato fatto il bump (con /bump); dal sito serve un canale */
  channelId: string | null;
  draft: any;
  rewardRoleId: string | null;
  hours: number;
  reminderEnabled: boolean;
  reminderChannelId: string | null;
  reminderRoleId: string | null;
  reminderDraft: any;
};

const restOf = (client?) => client?.rest || client?._rest || null;
const textDraft = (content: string) => T.normalizeDraft({ content, embed: { enabled: false }, buttons: [] });
const isId = (v?) => T.isId(v);

function isMain(guildId?: string) {
  try {
    return T.isMainGuild(String(guildId || ""));
  } catch {
    return false;
  }
}

/** Fuori dal server principale niente EXP: via le righe che lo nominano. */
function stripExpFromDraft(draft?) {
  if (!draft) return draft;
  const drop = (s: string) =>
    String(s || "")
      .split("\n")
      .filter((line) => !/\{exp\}|\{bonus\}|\{streak\}|\{level\}|\{fast\}/i.test(line))
      .filter((line) => !/\baltri\s+exp\b|\bexp\s+guadagnat/i.test(line))
      .join("\n")
      .replace(/\n{3,}/g, "\n\n")
      .trim();
  const walk = (v: any): any => {
    if (typeof v === "string") return drop(v);
    if (Array.isArray(v)) return v.map(walk);
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x)]));
    return v;
  };
  return walk(draft);
}

/** Il testo copiato da Disboard/Discadia: il nome del servizio diventa {service}. */
function adaptFromDisboard(draft?) {
  const walk = (v: any, key = ""): any => {
    if (typeof v === "string") return key === "url" || key.endsWith("Url") ? v : v.replace(/Disboard|Discadia/g, "{service}");
    if (Array.isArray(v)) return v.map((x) => walk(x));
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k)]));
    return v;
  };
  return draft ? walk(draft) : draft;
}

/** Prima apertura: parte da quello che il server usa già per Disboard (dashboard → Bump). */
async function seedFromServer(guildId: string): Promise<Partial<BumpHook>> {
  try {
    const { getConfig } = require("../../../MultiGuild/services/bumpVotesRuntime") as typeof import("../../../MultiGuild/services/bumpVotesRuntime");
    const cfg: any = await getConfig(guildId, true);
    const svc = cfg?.services?.disboard || {};
    let draft = svc.thanksDraft && !T.draftIsEmpty(svc.thanksDraft) ? adaptFromDisboard(svc.thanksDraft) : null;
    if (draft && !isMain(guildId)) draft = stripExpFromDraft(draft);
    const reminderDraft = svc.reminderDraft && !T.draftIsEmpty(svc.reminderDraft) ? adaptFromDisboard(svc.reminderDraft) : null;
    return {
      draft,
      reminderDraft,
      reminderChannelId: cfg?.reminder?.channelId || null,
      reminderRoleId: cfg?.reminder?.roleId || null,
      rewardRoleId: cfg?.reward?.roleId || null,
      hours: Number(cfg?.reward?.hours) || 12,
    };
  } catch {
    return {};
  }
}

function normalizeHook(raw?, seed: Partial<BumpHook> = {}): BumpHook {
  const r = raw && typeof raw === "object" ? raw : {};
  const hours = Math.floor(Number(r.hours ?? seed.hours));
  const pick = (k: keyof BumpHook) => (r[k] !== undefined ? r[k] : seed[k]);
  return {
    enabled: r.enabled === true,
    thanksEnabled: r.thanksEnabled !== false,
    channelId: isId(pick("channelId")) ? String(pick("channelId")) : null,
    draft: r.draft ? T.normalizeDraft(r.draft) : seed.draft ? T.normalizeDraft(seed.draft) : textDraft(DEFAULT_THANKS),
    rewardRoleId: isId(pick("rewardRoleId")) ? String(pick("rewardRoleId")) : null,
    hours: Number.isFinite(hours) && hours >= 1 && hours <= 720 ? hours : 12,
    reminderEnabled: r.reminderEnabled !== false,
    reminderChannelId: isId(pick("reminderChannelId")) ? String(pick("reminderChannelId")) : null,
    reminderRoleId: isId(pick("reminderRoleId")) ? String(pick("reminderRoleId")) : null,
    reminderDraft: r.reminderDraft ? T.normalizeDraft(r.reminderDraft) : seed.reminderDraft ? T.normalizeDraft(seed.reminderDraft) : textDraft(DEFAULT_REMINDER),
  };
}

async function loadOwned(client?, accessToken?, listingId?) {
  const gate = featureGate(client);
  if (!gate.ok) return { err: gate };
  const auth: any = await resolveBoardsUser(accessToken);
  if (!auth.ok) return { err: auth };
  const id = String(listingId || "").trim();
  if (!mongoose.isValidObjectId(id)) return { err: { ok: false, status: 400, error: "invalid_id", message: "ID scheda non valido." } };
  const doc: any = await SiteDocument.findOne({ _id: id, docType: BL });
  if (!doc) return { err: { ok: false, status: 404, error: "not_found", message: "Scheda non trovata." } };
  if (String(doc.userId) !== String(auth.userId)) return { err: { ok: false, status: 403, error: "forbidden", message: "Non sei il proprietario di questa scheda." } };
  if (String(doc.boardKind || "") === "bot") return { err: { ok: false, status: 400, error: "unsupported_kind", message: "Il bump è solo per i server." } };
  return { auth, doc, guildId: String(doc.boardDiscordId || "") };
}

async function resolveGuild(client?, gid?: string) {
  const cached = client?.guilds?.cache?.get?.(String(gid));
  if (cached) return cached;
  try {
    return (await client?.guilds?.fetch?.(String(gid))) || null;
  } catch {
    return null;
  }
}

async function userVarsFor(client?, guild?, userId?: string, extra: Record<string, string> = {}) {
  let user = null;
  if (guild?.members?.fetch) user = (await guild.members.fetch(userId).catch(() => null))?.user || null;
  if (!user && client?.users?.fetch) user = await client.users.fetch(userId).catch(() => null);
  return T.memberVars(guild || null, user || { id: userId }, extra);
}

function buildBody(draft?, vars: Record<string, string> = {}, mentionUserId: string | null = null, roleId: string | null = null) {
  if (!draft || T.draftIsEmpty(draft)) return null;
  const body: any = T.buildMessageBody(draft, vars, [], { mentionUserId });
  if (roleId) body.allowed_mentions = { ...(body.allowed_mentions || { parse: [] }), roles: [...new Set([...(body.allowed_mentions?.roles || []), roleId])] };
  return body;
}

async function postBody(client?, channelId?: string | null, body?) {
  const rest = restOf(client);
  if (!rest || !channelId || !body) return false;
  return rest
    .post(Routes.channelMessages(channelId), { body })
    .then(() => true)
    .catch((err?) => {
      global.logger?.warn?.("[site-boards] bump nel server:", channelId, err?.rawError?.message || err?.message || err);
      return false;
    });
}

/* ── pagina Gestisci ── */

async function getBumpHook(client?, payload: Record<string, any> = {}) {
  const { err, doc, guildId } = await loadOwned(client, payload.accessToken, payload.listingId);
  if (err) return err;
  const seed = doc.boardBumpHook ? {} : await seedFromServer(guildId);
  const config = normalizeHook(doc.boardBumpHook, seed);
  let pickers: any = { textChannels: [], roles: [], emojis: [], categories: [] };
  try {
    const { listGuildPickerData } = require("../../Partner/dashboard/siteDashboardPartnershipApi") as typeof import("../../Partner/dashboard/siteDashboardPartnershipApi");
    pickers = (await listGuildPickerData(client, guildId).catch(() => null)) || pickers;
  } catch (_) {}
  const guild = await resolveGuild(client, guildId);
  const me = client?.user;
  return {
    ok: true,
    status: 200,
    config,
    botInGuild: Boolean(guild),
    isMain: isMain(guildId),
    guild: guild ? { id: String(guild.id), name: String(guild.name || "") } : null,
    bot: me ? { id: String(me.id), name: String(me.globalName || me.username || "Vinili & Caffè"), avatarUrl: typeof me.displayAvatarURL === "function" ? me.displayAvatarURL({ size: 128 }) : "" } : null,
    pickers: {
      textChannels: Array.isArray(pickers.textChannels) ? pickers.textChannels : [],
      roles: Array.isArray(pickers.roles) ? pickers.roles : [],
      emojis: Array.isArray(pickers.emojis) ? pickers.emojis : [],
      categories: [],
    },
    serviceName: SERVICE_NAME,
    bumpedAt: doc.boardBumpedAt ? new Date(doc.boardBumpedAt).toISOString() : null,
  };
}

async function saveBumpHook(client?, payload: Record<string, any> = {}) {
  const { err, doc } = await loadOwned(client, payload.accessToken, payload.listingId);
  if (err) return err;
  const config = normalizeHook(payload.config);
  doc.boardBumpHook = config;
  doc.markModified("boardBumpHook");
  await doc.save();
  if (config.enabled && config.reminderEnabled) ensureBumpReminderSweep(client);
  return { ok: true, status: 200, config, message: "Impostazioni dei bump salvate." };
}

/** Prova: ringraziamento o promemoria, come se avessi fatto tu il bump (senza ruolo né EXP). */
async function testBumpHook(client?, payload: Record<string, any> = {}) {
  const { err, auth, doc, guildId } = await loadOwned(client, payload.accessToken, payload.listingId);
  if (err) return err;
  const config = normalizeHook(payload.config || doc.boardBumpHook, doc.boardBumpHook ? {} : await seedFromServer(guildId));
  const which = payload.which === "reminder" ? "reminder" : "thanks";
  const channelId = which === "reminder" ? config.reminderChannelId || config.channelId : config.channelId;
  if (!channelId) return { ok: false, status: 400, error: "no_channel", message: "Scegli prima un canale." };
  const guild = await resolveGuild(client, guildId);
  if (!guild) return { ok: false, status: 400, error: "bot_not_in_guild", message: "Il bot di Vinili & Caffè non è nel server." };
  const vars = await userVarsFor(client, guild, String(auth.userId), {
    service: SERVICE_NAME,
    count: "1",
    role: config.reminderRoleId ? `<@&${config.reminderRoleId}>` : "",
    exp: "150",
    fast: "0",
    streak: "1",
    bonus: "",
    level: "1",
  });
  const draft = which === "reminder" ? config.reminderDraft : isMain(guildId) ? config.draft : stripExpFromDraft(config.draft);
  const body = buildBody(draft, vars, which === "thanks" ? String(auth.userId) : null, which === "reminder" ? config.reminderRoleId : null);
  const ok = await postBody(client, channelId, body);
  return ok
    ? { ok: true, status: 200, message: "Messaggio di prova inviato nel canale." }
    : { ok: false, status: 502, error: "send_failed", message: "Invio non riuscito: controlla che il bot possa scrivere nel canale." };
}

/**
 * Dopo un bump: ruolo a tempo, EXP (solo server principale) e ringraziamento.
 * Con /bump e senza canale impostato il ringraziamento torna come risposta al comando (replyBody).
 */
async function onListingBumped(client?, listingId?: string, userId?: string, opts: { channelId?: string | null; fromDiscord?: boolean } = {}) {
  const doc: any = await SiteDocument.findOne({ _id: listingId, docType: BL }).select({ boardBumpHook: 1, boardDiscordId: 1, boardKind: 1, boardBumpedAt: 1 }).lean();
  if (!doc || String(doc.boardKind || "") === "bot") return { ok: false, reason: "not_server" };
  const config = normalizeHook(doc.boardBumpHook);
  const gid = String(doc.boardDiscordId || "");
  /* ultimo canale del bump: serve al promemoria se non ha un canale suo */
  await SiteDocument.updateOne(
    { _id: listingId, docType: BL },
    { $set: { boardBumpHookState: { remindedFor: "", lastChannelId: opts.channelId ? String(opts.channelId) : "", lastUserId: String(userId || "") } } },
  ).catch(() => null);
  if (!config.enabled) return { ok: false, reason: "disabled" };
  const guild = await resolveGuild(client, gid);
  if (!guild) return { ok: false, reason: "bot_not_in_guild" };
  const rest = restOf(client);

  if (config.rewardRoleId && rest) {
    const ok = await rest
      .put(Routes.guildMemberRole(gid, String(userId), config.rewardRoleId), { reason: "Bump in Vetrina" })
      .then(() => true)
      .catch(() => false);
    if (ok) {
      await SiteDocument.updateOne(
        { _id: listingId, docType: BL },
        { $push: { boardVoteHookRoles: { $each: [{ userId: String(userId), roleId: config.rewardRoleId, guildId: gid, until: new Date(Date.now() + config.hours * 3_600_000) }], $slice: -500 } } },
      ).catch(() => null);
      try {
        const { ensureRoleSweep } = require("./boardVoteHook") as typeof import("./boardVoteHook");
        ensureRoleSweep(client);
      } catch (_) {}
    }
  }

  const { BB } = require("./boardVotes") as typeof import("./boardVotes");
  const bumps: any[] = await SiteDocument.find({ docType: BB, boardListingId: String(listingId), userId: String(userId) })
    .select({ createdAt: 1 })
    .sort({ createdAt: -1 })
    .limit(2)
    .lean()
    .catch(() => []);
  const count = await SiteDocument.countDocuments({ docType: BB, boardListingId: String(listingId), userId: String(userId) }).catch(() => 1);
  const main = isMain(gid);
  let expOut: Record<string, string> = { ...EMPTY_EXP };
  if (main) {
    try {
      const BVR = require("../../../MultiGuild/services/bumpVotesRuntime") as typeof import("../../../MultiGuild/services/bumpVotesRuntime");
      const bvCfg: any = await BVR.getConfig(gid, true);
      expOut = await BVR.giveExp(client, guild, String(userId), "disboard", bvCfg, {
        previousLastAt: bumps[1]?.createdAt ? new Date(bumps[1].createdAt).getTime() : null,
        cooldownMs: BUMP_COOLDOWN_MS,
        firstTime: count <= 1,
      });
    } catch (_) {}
  }
  if (config.enabled && config.reminderEnabled) ensureBumpReminderSweep(client);

  if (!config.thanksEnabled) return { ok: true };
  const draft = main ? config.draft : stripExpFromDraft(config.draft);
  const vars = await userVarsFor(client, guild, String(userId), { service: SERVICE_NAME, count: String(count || 1), ...expOut });
  const body = buildBody(draft, vars, String(userId));
  if (!body) return { ok: true };
  if (config.channelId && config.channelId !== String(opts.channelId || "")) {
    await postBody(client, config.channelId, body);
    return { ok: true };
  }
  /* stesso canale del /bump (o nessun canale impostato): il ringraziamento è la risposta al comando */
  if (opts.fromDiscord) return { ok: true, replyBody: body };
  if (config.channelId) await postBody(client, config.channelId, body);
  return { ok: true };
}

/* ── promemoria: quando passano le 2 ore dall'ultimo bump ── */

let remindTimer: NodeJS.Timeout | null = null;
function ensureBumpReminderSweep(client?) {
  if (remindTimer) return;
  remindTimer = setInterval(() => void sweepBumpReminders(client).catch(() => null), REMIND_SWEEP_MS);
  remindTimer.unref?.();
}

async function sweepBumpReminders(client?) {
  const now = Date.now();
  const due: any[] = await SiteDocument.find({
    docType: BL,
    boardKind: "server",
    status: "approved",
    "boardBumpHook.enabled": true,
    "boardBumpHook.reminderEnabled": { $ne: false },
    boardBumpedAt: { $lte: new Date(now - BUMP_COOLDOWN_MS), $gte: new Date(now - BUMP_COOLDOWN_MS - 6 * 3_600_000) },
  })
    .select({ boardBumpHook: 1, boardBumpHookState: 1, boardBumpedAt: 1, boardDiscordId: 1 })
    .limit(50)
    .lean();
  for (const d of due) {
    const bumpedIso = new Date(d.boardBumpedAt).toISOString();
    const st = d.boardBumpHookState && typeof d.boardBumpHookState === "object" ? d.boardBumpHookState : {};
    if (st.remindedFor === bumpedIso) continue;
    /* segna subito: niente doppioni se due processi passano insieme */
    const claim = await SiteDocument.updateOne(
      { _id: d._id, docType: BL, "boardBumpHookState.remindedFor": { $ne: bumpedIso } },
      { $set: { "boardBumpHookState.remindedFor": bumpedIso } },
    ).catch(() => null);
    if (!claim?.modifiedCount) continue;
    const config = normalizeHook(d.boardBumpHook);
    const channelId = config.reminderChannelId || st.lastChannelId || config.channelId;
    if (!channelId) continue;
    const guild = await resolveGuild(client, String(d.boardDiscordId || ""));
    if (!guild) continue;
    const vars = T.memberVars(guild, null, { service: SERVICE_NAME, role: config.reminderRoleId ? `<@&${config.reminderRoleId}>` : "" });
    await postBody(client, channelId, buildBody(config.reminderDraft, vars, null, config.reminderRoleId));
  }
}

export = { getBumpHook, saveBumpHook, testBumpHook, onListingBumped, ensureBumpReminderSweep, normalizeHook };
