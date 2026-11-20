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
const DEFAULT_REMINDER = "⏰ Puoi votare di nuovo **{server}** su {service}!\n{link}";
const ROLE_SWEEP_MS = 5 * 60_000;

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

/** Se la scheda non ha ancora impostazioni, parte da quelle che il server usa già per Top.gg. */
async function seedFromServer(guildId: string): Promise<Partial<VoteHook>> {
  try {
    const { getConfig } = require("../../../MultiGuild/services/bumpVotesRuntime") as typeof import("../../../MultiGuild/services/bumpVotesRuntime");
    const cfg: any = await getConfig(guildId, true);
    const topgg = cfg?.votes?.perService?.topgg;
    return {
      channelId: cfg?.votes?.channelId || null,
      roleId: cfg?.votes?.rewardRoleId || null,
      hours: Number(topgg?.hours) || 12,
      draft: topgg?.draft && !T.draftIsEmpty(topgg.draft) ? topgg.draft : null,
    };
  } catch {
    return {};
  }
}

function normalizeHook(raw?, seed: Partial<VoteHook> = {}): VoteHook {
  const r = raw && typeof raw === "object" ? raw : {};
  const hours = Math.floor(Number(r.hours ?? seed.hours));
  return {
    enabled: r.enabled === true,
    channelId: T.isId(r.channelId ?? seed.channelId) ? String(r.channelId ?? seed.channelId) : null,
    roleId: T.isId(r.roleId ?? seed.roleId) ? String(r.roleId ?? seed.roleId) : null,
    hours: Number.isFinite(hours) && hours >= 1 && hours <= 720 ? hours : 12,
    thanksEnabled: r.thanksEnabled !== false,
    draft: r.draft ? T.normalizeDraft(r.draft) : seed.draft ? T.normalizeDraft(seed.draft) : textDraft(DEFAULT_THANKS),
    reminderMode: r.reminderMode === "dm" ? "dm" : "site",
    reminderDraft: r.reminderDraft ? T.normalizeDraft(r.reminderDraft) : textDraft(DEFAULT_REMINDER),
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
  const seed = doc.boardVoteHook ? {} : await seedFromServer(guildId);
  const config = normalizeHook(doc.boardVoteHook, seed);
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
  };
}

async function saveVoteHook(client?, payload: Record<string, any> = {}) {
  const { err, doc } = await loadOwned(client, payload.accessToken, payload.listingId);
  if (err) return err;
  const config = normalizeHook(payload.config);
  doc.boardVoteHook = config;
  doc.markModified("boardVoteHook");
  await doc.save();
  return { ok: true, status: 200, config, message: "Impostazioni dei voti salvate." };
}

/** Prova: il ringraziamento come se avesse votato il proprietario (senza ruolo). */
async function testVoteHook(client?, payload: Record<string, any> = {}) {
  const { err, auth, doc, guildId } = await loadOwned(client, payload.accessToken, payload.listingId);
  if (err) return err;
  const config = normalizeHook(payload.config || doc.boardVoteHook, doc.boardVoteHook ? {} : await seedFromServer(guildId));
  if (!config.channelId) return { ok: false, status: 400, error: "no_channel", message: "Scegli prima il canale dei ringraziamenti." };
  const guild = await resolveGuild(client, guildId);
  if (!guild) return { ok: false, status: 400, error: "bot_not_in_guild", message: "Il bot di Vinili & Caffè non è nel server." };
  const vars = await userVarsFor(client, guild, String(auth.userId), { service: SERVICE_NAME, count: "1" });
  const ok = await postDraft(client, config.channelId, config.draft, vars, String(auth.userId));
  return ok
    ? { ok: true, status: 200, message: "Messaggio di prova inviato nel canale." }
    : { ok: false, status: 502, error: "send_failed", message: "Invio non riuscito: controlla che il bot possa scrivere nel canale." };
}

/** Dopo un voto andato a buon fine: ringraziamento e ruolo a tempo nel server della scheda. */
async function onListingVoted(client?, listingId?: string, userId?: string) {
  const doc: any = await SiteDocument.findOne({ _id: listingId, docType: BL }).select({ boardVoteHook: 1, boardDiscordId: 1, boardKind: 1 }).lean();
  if (!doc || String(doc.boardKind || "") === "bot") return { ok: false, reason: "not_server" };
  const config = normalizeHook(doc.boardVoteHook);
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
  if (config.thanksEnabled && config.channelId) {
    const count = await SiteDocument.countDocuments({ docType: BV, boardListingId: String(listingId), userId: String(userId) }).catch(() => 1);
    const vars = await userVarsFor(client, guild, String(userId), { service: SERVICE_NAME, count: String(count || 1) });
    await postDraft(client, config.channelId, config.draft, vars, String(userId));
  }
  return { ok: true };
}

/** Promemoria per rivotare in privato (se la scheda lo vuole): true se inviato. */
async function sendReminderDm(client?, listingDoc?, userId?: string, link = "") {
  const config = normalizeHook(listingDoc?.boardVoteHook);
  if (config.reminderMode !== "dm") return false;
  const rest = restOf(client);
  if (!rest) return false;
  try {
    const dm: any = await rest.post(Routes.userChannels(), { body: { recipient_id: String(userId) } });
    if (!dm?.id) return false;
    const guild = await resolveGuild(client, String(listingDoc?.boardDiscordId || ""));
    const vars = await userVarsFor(client, guild, String(userId), { service: SERVICE_NAME, link, server: String(listingDoc?.title || guild?.name || "") });
    return await postDraft(client, String(dm.id), config.reminderDraft, vars, null);
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
