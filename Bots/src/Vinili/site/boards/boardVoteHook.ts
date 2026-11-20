/**
 * Bacheche: cosa succede nel server quando qualcuno vota la scheda in Vetrina.
 * Impostazioni della scheda (non del modulo Voti della dashboard): ringraziamento in un canale,
 * ruolo a tempo e come arriva il promemoria per rivotare (in privato o solo sul sito).
 */
const mongoose = require("mongoose") as typeof import("mongoose");
const { Routes } = require("discord.js") as typeof import("discord.js");
const { SiteDocument } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const T = require("../../../MultiGuild/core/tenantCommunityTools") as typeof import("../../../MultiGuild/core/tenantCommunityTools");
const { resolveBoardsUser } = require("./boardBanners") as typeof import("./boardBanners");
const { BL, BV, featureGate } = (() => {
  const r = require("./boardReviews") as typeof import("./boardReviews");
  const v = require("./boardVotes") as typeof import("./boardVotes");
  return { BL: r.BL, BV: v.BV, featureGate: r.featureGate };
})();

/** Nome del sito nei messaggi ({service}). */
const SERVICE_NAME = "Vinili & Caffè";
const DEFAULT_THANKS = "{user} grazie per il voto su **{service}**! ⭐ Voti totali: {count}.";
const ROLE_SWEEP_MS = 5 * 60_000;

function emojiOf(key: string) {
  try {
    const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
    return String(E?.[key] || "");
  } catch {
    return "";
  }
}

/** Sample come il DM Top.gg / Discadia, adattato alla Vetrina. */
function defaultReminderDraft(voteUrl = "", hours = 12) {
  const h = Math.max(1, Math.floor(Number(hours) || 12));
  const label = h === 1 ? "1 ora" : `${h} ore`;
  const eye = emojiOf("VC_Eye") || "👀";
  const thanks = emojiOf("VC_ThankYou") || "🙏";
  const link = emojiOf("link") || "🔗";
  const heart = emojiOf("VC_HeartPink");
  return T.normalizeDraft({
    content: "",
    embed: {
      enabled: true,
      title: "",
      description: [
        `${eye} Hey! Sono passate ${label}: puoi votare di nuovo **{server}** su {service}.`,
        `${thanks} **Grazie per il supporto!**`,
        `${link} Per votare, clicca sul pulsante sottostante:`,
      ].join("\n"),
      color: "#6f4e37",
      footerText: "Promemoria voto Vetrina",
    },
    buttons: voteUrl ? [{ label: "Vota cliccando qui", url: voteUrl, emoji: heart, row: 0 }] : [],
  });
}

function isLegacyPlainReminder(draft?) {
  const d = draft && typeof draft === "object" ? draft : {};
  const content = String(d.content || "");
  const embedOn = d.embed?.enabled === true;
  return !embedOn && /Puoi votare di nuovo/.test(content) && /\{(?:link|server)\}/.test(content);
}

type ReminderMode = "dm" | "site";
type VoteHook = {
  enabled: boolean;
  channelId: string | null;
  roleId: string | null;
  hours: number;
  thanksEnabled: boolean;
  draft: any;
  reminderMode: ReminderMode;
  reminderDraft: any;
};

const restOf = (client?) => client?.rest || client?._rest || null;
const textDraft = (content: string) => T.normalizeDraft({ content, embed: { enabled: false }, buttons: [] });
const EMPTY_EXP = { exp: "", fast: "", streak: "", bonus: "", level: "" } as Record<string, string>;

function isMain(guildId?: string) {
  try {
    return T.isMainGuild(String(guildId || ""));
  } catch {
    return false;
  }
}

/** Su server non main toglie le righe legate all'EXP (resta ruolo / ringraziamento). */
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

/** Se la scheda non ha ancora impostazioni, parte da quelle che il server usa già per Top.gg. */
async function seedFromServer(guildId: string, listingDoc?): Promise<Partial<VoteHook>> {
  const voteUrl = voteUrlOf(listingDoc);
  try {
    const { getConfig } = require("../../../MultiGuild/services/bumpVotesRuntime") as typeof import("../../../MultiGuild/services/bumpVotesRuntime");
    const cfg: any = await getConfig(guildId, true);
    const topgg = cfg?.votes?.perService?.topgg;
    const hours = Number(topgg?.hours) || 12;
    let draft = topgg?.draft && !T.draftIsEmpty(topgg.draft) ? topgg.draft : null;
    if (draft && !isMain(guildId)) draft = stripExpFromDraft(draft);
    let reminderDraft =
      topgg?.reminderDraft && !T.draftIsEmpty(topgg.reminderDraft)
        ? adaptFromTopgg(topgg.reminderDraft, voteUrl)
        : defaultReminderDraft(voteUrl, hours);
    return {
      channelId: cfg?.votes?.channelId || null,
      roleId: cfg?.votes?.rewardRoleId || null,
      hours,
      draft,
      reminderDraft,
    };
  } catch {
    return { reminderDraft: defaultReminderDraft(voteUrl, 12) };
  }
}

/** Pagina per votare la scheda. */
function voteUrlOf(doc?) {
  const slug = String(doc?.boardSlug || doc?.slug || "").trim();
  const id = String(doc?._id || doc?.id || "").trim();
  return slug ? `https://www.viniliecaffe.it/vetrina/vota/?slug=${encodeURIComponent(slug)}` : `https://www.viniliecaffe.it/vetrina/vota/?id=${encodeURIComponent(id)}`;
}

/**
 * Il testo copiato da Top.gg parla di Top.gg e punta lì: lo adatta alla vetrina
 * ("Top.gg" → {service}, link di voto → pagina di voto della scheda).
 */
function adaptFromTopgg(draft?, voteUrl = "") {
  const isVoteLink = (u: string) => /top\.gg|discadia|discords\.com|\/vote\b/i.test(u);
  const walk = (v: any, key = ""): any => {
    if (typeof v === "string") {
      if ((key === "url" || key.endsWith("Url")) && voteUrl && isVoteLink(v)) return voteUrl;
      return v.replace(/Top.gg|Discadia/g, "{service}");
    }
    if (Array.isArray(v)) return v.map((x) => walk(x, key === "urls" ? "url" : ""));
    if (v && typeof v === "object") return Object.fromEntries(Object.entries(v).map(([k, x]) => [k, walk(x, k)]));
    return v;
  };
  return draft ? walk(draft) : draft;
}

function normalizeHook(raw?, seed: Partial<VoteHook> = {}, voteUrl = ""): VoteHook {
  const r = raw && typeof raw === "object" ? raw : {};
  const hours = Math.floor(Number(r.hours ?? seed.hours));
  const hoursOk = Number.isFinite(hours) && hours >= 1 && hours <= 720 ? hours : 12;
  let reminderDraft = r.reminderDraft
    ? T.normalizeDraft(r.reminderDraft)
    : seed.reminderDraft
      ? T.normalizeDraft(seed.reminderDraft)
      : defaultReminderDraft(voteUrl, hoursOk);
  if (isLegacyPlainReminder(reminderDraft)) reminderDraft = defaultReminderDraft(voteUrl, hoursOk);
  return {
    enabled: r.enabled === true,
    channelId: T.isId(r.channelId ?? seed.channelId) ? String(r.channelId ?? seed.channelId) : null,
    roleId: T.isId(r.roleId ?? seed.roleId) ? String(r.roleId ?? seed.roleId) : null,
    hours: hoursOk,
    thanksEnabled: r.thanksEnabled !== false,
    draft: r.draft ? T.normalizeDraft(r.draft) : seed.draft ? T.normalizeDraft(seed.draft) : textDraft(DEFAULT_THANKS),
    reminderMode: r.reminderMode === "dm" ? "dm" : "site",
    reminderDraft,
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
  if (String(doc.boardKind || "") === "bot") return { err: { ok: false, status: 400, error: "unsupported_kind", message: "Per ora solo per le schede server." } };
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

async function postDraft(client?, channelId?: string | null, draft?, vars: Record<string, string> = {}, mentionUserId: string | null = null) {
  const rest = restOf(client);
  if (!rest || !channelId || !draft || T.draftIsEmpty(draft)) return false;
  const body: any = T.buildMessageBody(draft, vars, [], { mentionUserId });
  return rest
    .post(Routes.channelMessages(channelId), { body })
    .then(() => true)
    .catch((err?) => {
      global.logger?.warn?.("[site-boards] voto nel server:", channelId, err?.rawError?.message || err?.message || err);
      return false;
    });
}

/** Impostazioni + canali/ruoli/emoji del server per il pannello. */
async function getVoteHook(client?, payload: Record<string, any> = {}) {
  const { err, doc, guildId } = await loadOwned(client, payload.accessToken, payload.listingId);
  if (err) return err;
  const main = isMain(guildId);
  const voteUrl = voteUrlOf(doc);
  const seed = doc.boardVoteHook ? {} : await seedFromServer(guildId, doc);
  if (seed.draft) seed.draft = adaptFromTopgg(seed.draft, voteUrl);
  if (seed.reminderDraft) seed.reminderDraft = adaptFromTopgg(seed.reminderDraft, voteUrl);
  const config = normalizeHook(doc.boardVoteHook, seed, voteUrl);
  /* anche un testo salvato prima di questa correzione */
  let draft = adaptFromTopgg(config.draft, voteUrl);
  if (!main) draft = stripExpFromDraft(draft);
  config.draft = T.normalizeDraft(draft);
  config.reminderDraft = T.normalizeDraft(adaptFromTopgg(config.reminderDraft, voteUrl));
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
    guild: guild ? { id: String(guild.id), name: String(guild.name || "") } : null,
    bot: me ? { id: String(me.id), name: String(me.globalName || me.username || "Vinili & Caffè"), avatarUrl: typeof me.displayAvatarURL === "function" ? me.displayAvatarURL({ size: 128 }) : "" } : null,
    pickers: {
      textChannels: Array.isArray(pickers.textChannels) ? pickers.textChannels : [],
      roles: Array.isArray(pickers.roles) ? pickers.roles : [],
      emojis: Array.isArray(pickers.emojis) ? pickers.emojis : [],
      categories: [],
    },
    serviceName: SERVICE_NAME,
    isMainGuild: main,
  };
}

async function saveVoteHook(client?, payload: Record<string, any> = {}) {
  const { err, doc, guildId } = await loadOwned(client, payload.accessToken, payload.listingId);
  if (err) return err;
  const voteUrl = voteUrlOf(doc);
  const config = normalizeHook(payload.config, {}, voteUrl);
  if (!isMain(guildId)) config.draft = T.normalizeDraft(stripExpFromDraft(config.draft));
  config.reminderDraft = T.normalizeDraft(adaptFromTopgg(config.reminderDraft, voteUrl));
  doc.boardVoteHook = config;
  doc.markModified("boardVoteHook");
  await doc.save();
  return { ok: true, status: 200, config, message: "Impostazioni dei voti salvate." };
}

/** Prova: il ringraziamento come se avesse votato il proprietario (senza ruolo). */
async function testVoteHook(client?, payload: Record<string, any> = {}) {
  const { err, auth, doc, guildId } = await loadOwned(client, payload.accessToken, payload.listingId);
  if (err) return err;
  const voteUrl = voteUrlOf(doc);
  const config = normalizeHook(payload.config || doc.boardVoteHook, doc.boardVoteHook ? {} : await seedFromServer(guildId, doc), voteUrl);
  if (!config.channelId) return { ok: false, status: 400, error: "no_channel", message: "Scegli prima il canale dei ringraziamenti." };
  const guild = await resolveGuild(client, guildId);
  if (!guild) return { ok: false, status: 400, error: "bot_not_in_guild", message: "Il bot di Vinili & Caffè non è nel server." };
  const main = isMain(guildId);
  const expSample = main ? { exp: "150", fast: "0", streak: "1", bonus: "", level: "1" } : EMPTY_EXP;
  let draft = adaptFromTopgg(config.draft, voteUrl);
  if (!main) draft = stripExpFromDraft(draft);
  const vars = await userVarsFor(client, guild, String(auth.userId), { service: SERVICE_NAME, count: "1", ...expSample });
  const ok = await postDraft(client, config.channelId, draft, vars, String(auth.userId));
  return ok
    ? { ok: true, status: 200, message: "Messaggio di prova inviato nel canale." }
    : { ok: false, status: 502, error: "send_failed", message: "Invio non riuscito: controlla che il bot possa scrivere nel canale." };
}

/** Dopo un voto andato a buon fine: ringraziamento e ruolo a tempo nel server della scheda. */
async function onListingVoted(client?, listingId?: string, userId?: string) {
  const doc: any = await SiteDocument.findOne({ _id: listingId, docType: BL }).select({ boardVoteHook: 1, boardDiscordId: 1, boardKind: 1, boardSlug: 1 }).lean();
  if (!doc || String(doc.boardKind || "") === "bot") return { ok: false, reason: "not_server" };
  const config = normalizeHook(doc.boardVoteHook, {}, voteUrlOf(doc));
  if (!config.enabled) return { ok: false, reason: "disabled" };
  const gid = String(doc.boardDiscordId || "");
  const guild = await resolveGuild(client, gid);
  if (!guild) return { ok: false, reason: "bot_not_in_guild" };
  const rest = restOf(client);
  if (config.roleId && rest) {
    const ok = await rest
      .put(Routes.guildMemberRole(gid, String(userId), config.roleId), { reason: "Voto in Vetrina" })
      .then(() => true)
      .catch(() => false);
    if (ok) {
      await SiteDocument.updateOne(
        { _id: listingId, docType: BL },
        { $push: { boardVoteHookRoles: { $each: [{ userId: String(userId), roleId: config.roleId, guildId: gid, until: new Date(Date.now() + config.hours * 3_600_000) }], $slice: -500 } } },
      ).catch(() => null);
      ensureRoleSweep(client);
    }
  }
  /* EXP solo sul server principale (come le recensioni) */
  const votes: any[] = await SiteDocument.find({ docType: BV, boardListingId: String(listingId), userId: String(userId) })
    .select({ createdAt: 1 })
    .sort({ createdAt: -1 })
    .limit(2)
    .lean()
    .catch(() => []);
  const count = await SiteDocument.countDocuments({ docType: BV, boardListingId: String(listingId), userId: String(userId) }).catch(() => 1);
  const main = isMain(gid);
  let expOut: Record<string, string> = { ...EMPTY_EXP };
  if (main) {
    try {
      const BVR = require("../../../MultiGuild/services/bumpVotesRuntime") as typeof import("../../../MultiGuild/services/bumpVotesRuntime");
      const bvCfg: any = await BVR.getConfig(gid, true);
      expOut = await BVR.giveExp(client, guild, String(userId), "topgg", bvCfg, {
        previousLastAt: votes[1]?.createdAt ? new Date(votes[1].createdAt).getTime() : null,
        cooldownMs: config.hours * 3_600_000,
        firstTime: count <= 1,
      });
    } catch (_) {}
  }
  if (config.thanksEnabled && config.channelId) {
    let draft = adaptFromTopgg(config.draft, voteUrlOf(doc));
    if (!main) draft = stripExpFromDraft(draft);
    const vars = await userVarsFor(client, guild, String(userId), { service: SERVICE_NAME, count: String(count || 1), ...expOut });
    await postDraft(client, config.channelId, draft, vars, String(userId));
  }
  return { ok: true };
}

/**
 * Promemoria in DM.
 * Di default solo se reminderMode === "dm"; con force=true anche come fallback della notifica sito.
 */
async function sendReminderDm(client?, listingDoc?, userId?: string, link = "", opts: { force?: boolean } = {}) {
  const voteUrl = link || voteUrlOf(listingDoc);
  const config = normalizeHook(listingDoc?.boardVoteHook, {}, voteUrl);
  if (!opts.force && config.reminderMode !== "dm") return false;
  const rest = restOf(client);
  if (!rest) return false;
  try {
    const dm: any = await rest.post(Routes.userChannels(), { body: { recipient_id: String(userId) } });
    if (!dm?.id) return false;
    const guild = await resolveGuild(client, String(listingDoc?.boardDiscordId || ""));
    const hours = config.hours;
    const hoursLabel = hours === 1 ? "1 ora" : `${hours} ore`;
    let draft = T.normalizeDraft(adaptFromTopgg(config.reminderDraft, voteUrl));
    if (draft.buttons?.length) draft.buttons = draft.buttons.map((b) => ({ ...b, url: b.url || voteUrl }));
    const vars = await userVarsFor(client, guild, String(userId), {
      service: SERVICE_NAME,
      link: voteUrl,
      server: String(listingDoc?.title || guild?.name || ""),
      hours: hoursLabel,
    });
    return await postDraft(client, String(dm.id), draft, vars, null);
  } catch {
    return false;
  }
}

/* ── ruoli a tempo: li toglie allo scadere ── */
let roleTimer: NodeJS.Timeout | null = null;
function ensureRoleSweep(client?) {
  if (roleTimer) return;
  roleTimer = setInterval(() => void sweepRoles(client).catch(() => null), ROLE_SWEEP_MS);
  roleTimer.unref?.();
}

async function sweepRoles(client?) {
  const now = new Date();
  const docs: any[] = await SiteDocument.find({ docType: BL, "boardVoteHookRoles.until": { $lte: now } })
    .select({ boardVoteHookRoles: 1 })
    .limit(50)
    .lean();
  const rest = restOf(client);
  for (const d of docs) {
    const list: any[] = Array.isArray(d.boardVoteHookRoles) ? d.boardVoteHookRoles : [];
    const due = list.filter((x) => x?.until && new Date(x.until) <= now);
    for (const x of due) {
      /* se l'utente ha rivotato nel frattempo, c'è una scadenza più avanti: il ruolo resta */
      const later = list.some((y) => y !== x && y.userId === x.userId && y.roleId === x.roleId && new Date(y.until) > now);
      if (!later && rest) {
        await rest.delete(Routes.guildMemberRole(String(x.guildId), String(x.userId), String(x.roleId)), { reason: "Ruolo del voto in Vetrina scaduto" }).catch(() => null);
      }
    }
    await SiteDocument.updateOne({ _id: d._id }, { $pull: { boardVoteHookRoles: { until: { $lte: now } } } }).catch(() => null);
  }
}

export = { getVoteHook, saveVoteHook, testVoteHook, onListingVoted, sendReminderDm, ensureRoleSweep, normalizeHook };
