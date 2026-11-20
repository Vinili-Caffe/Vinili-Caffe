/**
 * Bacheche: cosa succede nel server quando qualcuno lascia una recensione in Vetrina.
 * Impostazioni della scheda: ringraziamento in canale, ruolo a tempo, EXP.
 */
const mongoose = require("mongoose") as typeof import("mongoose");
const { Routes } = require("discord.js") as typeof import("discord.js");
const { SiteDocument } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const T = require("../../../MultiGuild/core/tenantCommunityTools") as typeof import("../../../MultiGuild/core/tenantCommunityTools");
const { resolveBoardsUser } = require("./boardBanners") as typeof import("./boardBanners");
const { BL, featureGate } = (() => {
  const r = require("./boardReviews") as typeof import("./boardReviews");
  return { BL: r.BL, featureGate: r.featureGate };
})();

const SERVICE_NAME = "Vinili & Caffè";
const DEFAULT_THANKS = [
  "**Nuova recensione!**",
  "{user} ha lasciato **{rating}★** su **{service}**.",
  "",
  "`Hai guadagnato:`",
  "**{exp} EXP** per la tua recensione",
  "{bonus}",
  "Il ruolo {role} per {hours} ore",
].join("\n");
const ROLE_SWEEP_MS = 5 * 60_000;

type ReviewHook = {
  enabled: boolean;
  channelId: string | null;
  roleId: string | null;
  hours: number;
  thanksEnabled: boolean;
  draft: any;
  /** EXP fissi per una recensione (0 = niente EXP). */
  expAmount: number;
};

const restOf = (client?) => client?.rest || client?._rest || null;
const textDraft = (content: string) => T.normalizeDraft({ content, embed: { enabled: false }, buttons: [] });

function normalizeHook(raw?): ReviewHook {
  const r = raw && typeof raw === "object" ? raw : {};
  const hours = Math.floor(Number(r.hours));
  const expAmount = Math.floor(Number(r.expAmount));
  return {
    enabled: r.enabled === true,
    channelId: T.isId(r.channelId) ? String(r.channelId) : null,
    roleId: T.isId(r.roleId) ? String(r.roleId) : null,
    hours: Number.isFinite(hours) && hours >= 1 && hours <= 720 ? hours : 24,
    thanksEnabled: r.thanksEnabled !== false,
    draft: r.draft ? T.normalizeDraft(r.draft) : textDraft(DEFAULT_THANKS),
    expAmount: Number.isFinite(expAmount) && expAmount >= 0 && expAmount <= 5000 ? expAmount : 100,
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
      global.logger?.warn?.("[site-boards] recensione nel server:", channelId, err?.rawError?.message || err?.message || err);
      return false;
    });
}

function fmtHours(h: number) {
  return h === 1 ? "1 ora" : h % 24 === 0 ? (h === 24 ? "1 giorno" : `${h / 24} giorni`) : `${h} ore`;
}

async function getReviewHook(client?, payload: Record<string, any> = {}) {
  const { err, doc, guildId } = await loadOwned(client, payload.accessToken, payload.listingId);
  if (err) return err;
  const config = normalizeHook(doc.boardReviewHook);
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

async function saveReviewHook(client?, payload: Record<string, any> = {}) {
  const { err, doc } = await loadOwned(client, payload.accessToken, payload.listingId);
  if (err) return err;
  const config = normalizeHook(payload.config);
  doc.boardReviewHook = config;
  doc.markModified("boardReviewHook");
  await doc.save();
  return { ok: true, status: 200, config, message: "Impostazioni delle recensioni salvate." };
}

async function testReviewHook(client?, payload: Record<string, any> = {}) {
  const { err, auth, doc, guildId } = await loadOwned(client, payload.accessToken, payload.listingId);
  if (err) return err;
  const config = normalizeHook(payload.config || doc.boardReviewHook);
  if (!config.channelId) return { ok: false, status: 400, error: "no_channel", message: "Scegli prima il canale dei ringraziamenti." };
  const guild = await resolveGuild(client, guildId);
  if (!guild) return { ok: false, status: 400, error: "bot_not_in_guild", message: "Il bot di Vinili & Caffè non è nel server." };
  const role = config.roleId ? `<@&${config.roleId}>` : "—";
  const vars = await userVarsFor(client, guild, String(auth.userId), {
    service: SERVICE_NAME,
    rating: "5",
    exp: String(config.expAmount || 0),
    bonus: "",
    level: "1",
    hours: fmtHours(config.hours),
    role,
  });
  const ok = await postDraft(client, config.channelId, config.draft, vars, String(auth.userId));
  return ok
    ? { ok: true, status: 200, message: "Messaggio di prova inviato nel canale." }
    : { ok: false, status: 502, error: "send_failed", message: "Invio non riuscito: controlla che il bot possa scrivere nel canale." };
}

async function awardReviewExp(client?, guild?, userId?: string, amount = 0) {
  const base = Math.floor(Number(amount) || 0);
  if (!guild?.id || !userId || base <= 0) return { exp: "0", bonus: "", level: "0" };
  try {
    const LVL = require("../../../MultiGuild/services/levelsRuntime") as typeof import("../../../MultiGuild/services/levelsRuntime");
    if (!LVL.levelsActive(String(guild.id))) return { exp: "0", bonus: "", level: "0" };
  } catch {
    return { exp: "0", bonus: "", level: "0" };
  }
  try {
    const { awardBumpVoteExp } = require("../../Community/services/bumpRewards") as typeof import("../../Community/services/bumpRewards");
    const reward: any = await awardBumpVoteExp(client, guild, userId, "board_review", null, 0, base, null, null, {
      baseExp: base,
      fastGuess: { windowMs: 0, multiplier: 1 },
      streak: { bonusPercentPerWin: 0, maxBonusPercent: 0 },
    });
    if (!reward || reward.effectiveExp == null) return { exp: "0", bonus: "", level: "0" };
    return {
      exp: String(reward.effectiveExp),
      bonus: "",
      level: reward.afterLevel != null ? String(reward.afterLevel) : "0",
    };
  } catch (err) {
    global.logger?.warn?.("[site-boards] review exp:", (err as any)?.message || err);
    return { exp: "0", bonus: "", level: "0" };
  }
}

/** Dopo una recensione: ruolo a tempo, EXP e messaggio nel canale. */
async function onListingReviewed(client?, listingId?: string, userId?: string, rating = 5) {
  const doc: any = await SiteDocument.findOne({ _id: listingId, docType: BL }).select({ boardReviewHook: 1, boardDiscordId: 1, boardKind: 1 }).lean();
  if (!doc || String(doc.boardKind || "") === "bot") return { ok: false, reason: "not_server" };
  const config = normalizeHook(doc.boardReviewHook);
  if (!config.enabled) return { ok: false, reason: "disabled" };
  const gid = String(doc.boardDiscordId || "");
  const guild = await resolveGuild(client, gid);
  if (!guild) return { ok: false, reason: "bot_not_in_guild" };
  const rest = restOf(client);
  if (config.roleId && rest) {
    const ok = await rest
      .put(Routes.guildMemberRole(gid, String(userId), config.roleId), { reason: "Recensione in Vetrina" })
      .then(() => true)
      .catch(() => false);
    if (ok) {
      await SiteDocument.updateOne(
        { _id: listingId, docType: BL },
        {
          $push: {
            boardReviewHookRoles: {
              $each: [{ userId: String(userId), roleId: config.roleId, guildId: gid, until: new Date(Date.now() + config.hours * 3_600_000) }],
              $slice: -500,
            },
          },
        },
      ).catch(() => null);
      ensureRoleSweep(client);
    }
  }
  const expOut = await awardReviewExp(client, guild, String(userId), config.expAmount);
  if (config.thanksEnabled && config.channelId) {
    const role = config.roleId ? `<@&${config.roleId}>` : "—";
    const vars = await userVarsFor(client, guild, String(userId), {
      service: SERVICE_NAME,
      rating: String(Math.max(1, Math.min(5, Math.round(Number(rating) || 5)))),
      hours: fmtHours(config.hours),
      role,
      ...expOut,
    });
    await postDraft(client, config.channelId, config.draft, vars, String(userId));
  }
  return { ok: true };
}

let roleTimer: NodeJS.Timeout | null = null;
function ensureRoleSweep(client?) {
  if (roleTimer) return;
  roleTimer = setInterval(() => void sweepRoles(client).catch(() => null), ROLE_SWEEP_MS);
  roleTimer.unref?.();
}

async function sweepRoles(client?) {
  const now = new Date();
  const docs: any[] = await SiteDocument.find({ docType: BL, "boardReviewHookRoles.until": { $lte: now } })
    .select({ boardReviewHookRoles: 1 })
    .limit(50)
    .lean();
  const rest = restOf(client);
  for (const d of docs) {
    const list: any[] = Array.isArray(d.boardReviewHookRoles) ? d.boardReviewHookRoles : [];
    const due = list.filter((x) => x?.until && new Date(x.until) <= now);
    for (const x of due) {
      const later = list.some((y) => y !== x && y.userId === x.userId && y.roleId === x.roleId && new Date(y.until) > now);
      if (!later && rest) {
        await rest.delete(Routes.guildMemberRole(String(x.guildId), String(x.userId), String(x.roleId)), { reason: "Ruolo della recensione in Vetrina scaduto" }).catch(() => null);
      }
    }
    await SiteDocument.updateOne({ _id: d._id }, { $pull: { boardReviewHookRoles: { until: { $lte: now } } } }).catch(() => null);
  }
}

export = { getReviewHook, saveReviewHook, testReviewHook, onListingReviewed, ensureRoleSweep, normalizeHook };
