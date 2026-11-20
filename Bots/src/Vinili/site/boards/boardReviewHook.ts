/**
 * Bacheche: premi nel server quando qualcuno lascia una recensione in Vetrina.
 * Stesso modello del server principale (livelli una tantum + messaggio in canale + ruolo a tempo).
 */
const mongoose = require("mongoose") as typeof import("mongoose");
const { Routes } = require("discord.js") as typeof import("discord.js");
const { SiteDocument, ActivityUserProfile } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
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
  "{review}",
  "",
  "`Hai guadagnato:`",
  "{levels}",
  "{bonus}",
  "Il ruolo {role} per {hours}",
].join("\n");
const ROLE_SWEEP_MS = 5 * 60_000;
const DEFAULT_REWARD_LEVELS = 5;

type ReviewHook = {
  enabled: boolean;
  channelId: string | null;
  roleId: string | null;
  hours: number;
  thanksEnabled: boolean;
  draft: any;
  /** Livelli regalati una sola volta (come sul main / Livelli → Recensione sul sito). */
  rewardLevels: number;
};

const restOf = (client?) => client?.rest || client?._rest || null;
const textDraft = (content: string) => T.normalizeDraft({ content, embed: { enabled: false }, buttons: [] });

function normalizeHook(raw?, seed: Partial<ReviewHook> = {}): ReviewHook {
  const r = raw && typeof raw === "object" ? raw : {};
  const hours = Math.floor(Number(r.hours ?? seed.hours));
  /* migrazione: vecchio expAmount → rewardLevels se non c'è già */
  const rawLevels = r.rewardLevels ?? seed.rewardLevels ?? (r.expAmount != null ? Math.min(20, Math.round(Number(r.expAmount) / 50)) : undefined);
  const rewardLevels = Math.floor(Number(rawLevels));
  return {
    enabled: r.enabled === true,
    channelId: T.isId(r.channelId ?? seed.channelId) ? String(r.channelId ?? seed.channelId) : null,
    roleId: T.isId(r.roleId ?? seed.roleId) ? String(r.roleId ?? seed.roleId) : null,
    hours: Number.isFinite(hours) && hours >= 1 && hours <= 720 ? hours : 24,
    thanksEnabled: r.thanksEnabled !== false,
    draft: r.draft ? T.normalizeDraft(r.draft) : seed.draft ? T.normalizeDraft(seed.draft) : textDraft(DEFAULT_THANKS),
    rewardLevels: Number.isFinite(rewardLevels) && rewardLevels >= 0 && rewardLevels <= 100 ? rewardLevels : DEFAULT_REWARD_LEVELS,
  };
}

/** Parte dalle impostazioni del main: livelli in regalo + canale annunci recensioni. */
async function seedFromMain(client?, guildId?: string): Promise<Partial<ReviewHook>> {
  const out: Partial<ReviewHook> = {};
  try {
    if (!T.isMainGuild(String(guildId || ""))) return out;
  } catch {
    return out;
  }
  try {
    const LVL = require("../../../MultiGuild/services/levelsRuntime") as typeof import("../../../MultiGuild/services/levelsRuntime");
    const cfg: any = await LVL.getConfig(String(guildId));
    if (Number.isFinite(Number(cfg?.reviewRewardLevels))) out.rewardLevels = Math.max(0, Math.floor(Number(cfg.reviewRewardLevels)));
  } catch (_) {}
  try {
    const { FALLBACK_REVIEW_CHANNEL_ID } = require("../../site/http/siteReviews/constants") as typeof import("../../site/http/siteReviews/constants");
    const ch =
      String(client?.config?.siteReviews?.channelId || "").trim() ||
      String(client?.config?.disboardReviews?.channelId || "").trim() ||
      String(FALLBACK_REVIEW_CHANNEL_ID || "").trim();
    if (T.isId(ch)) out.channelId = ch;
  } catch (_) {}
  out.draft = textDraft(DEFAULT_THANKS);
  return out;
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
  const seed = doc.boardReviewHook ? {} : await seedFromMain(client, guildId);
  const config = normalizeHook(doc.boardReviewHook, seed);
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
    seededFromMain: Boolean(!doc.boardReviewHook && (() => { try { return T.isMainGuild(guildId); } catch { return false; } })()),
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
  const config = normalizeHook(payload.config || doc.boardReviewHook, doc.boardReviewHook ? {} : await seedFromMain(client, guildId));
  if (!config.channelId) return { ok: false, status: 400, error: "no_channel", message: "Scegli prima il canale dei ringraziamenti." };
  const guild = await resolveGuild(client, guildId);
  if (!guild) return { ok: false, status: 400, error: "bot_not_in_guild", message: "Il bot di Vinili & Caffè non è nel server." };
  const role = config.roleId ? `<@&${config.roleId}>` : "—";
  const levelsLine =
    config.rewardLevels > 0
      ? `**+${config.rewardLevels} livelli** per la tua recensione`
      : "Grazie per il supporto!";
  const vars = await userVarsFor(client, guild, String(auth.userId), {
    service: SERVICE_NAME,
    rating: "5",
    review: "_Testo di prova della recensione._",
    levels: levelsLine,
    bonus: "",
    hours: fmtHours(config.hours),
    role,
  });
  const ok = await postDraft(client, config.channelId, config.draft, vars, String(auth.userId));
  return ok
    ? { ok: true, status: 200, message: "Messaggio di prova inviato nel canale." }
    : { ok: false, status: 502, error: "send_failed", message: "Invio non riuscito: controlla che il bot possa scrivere nel canale." };
}

/** Come awardServerReviewLevels sul main: +N livelli una tantum. */
async function awardReviewLevels(client?, guild?, userId?: string, listingId?: string, levelsToAdd = 0) {
  const guildId = String(guild?.id || "").trim();
  const uid = String(userId || "").trim();
  const lid = String(listingId || "").trim();
  const n = Math.max(0, Math.floor(Number(levelsToAdd) || 0));
  if (!guildId || !uid || !lid || !(n > 0)) return { addedLevels: 0, levelsLine: "Grazie per il supporto!" };
  try {
    const LVL = require("../../../MultiGuild/services/levelsRuntime") as typeof import("../../../MultiGuild/services/levelsRuntime");
    if (!LVL.levelsActive(guildId)) return { addedLevels: 0, levelsLine: "Grazie per il supporto!" };
  } catch {
    return { addedLevels: 0, levelsLine: "Grazie per il supporto!" };
  }
  try {
    const { computeExpForLevelReward } = require("../../site/http/siteReviews/rewards") as typeof import("../../site/http/siteReviews/rewards");
    const { addExpWithLevel, getLevelInfo } = require("../../Level/services/expService") as typeof import("../../Level/services/expService");
    const claimKey = `board_review_${lid}`;
    const profile = await ActivityUserProfile.findOne({ guildId, userId: uid }).select("profile.totals.exp.totalExp").lean().catch(() => null);
    const currentExp = Number(profile?.profile?.totals?.exp?.totalExp || 0);
    const reward = computeExpForLevelReward(currentExp, n);
    if (!reward.addedExp) return { addedLevels: 0, levelsLine: "Grazie per il supporto!" };

    await ActivityUserProfile.updateOne({ guildId, userId: uid }, { $setOnInsert: { guildId, userId: uid } }, { upsert: true }).catch(() => null);
    const claimed = await ActivityUserProfile.findOneAndUpdate(
      {
        guildId,
        userId: uid,
        $or: [
          { [`profile.totals.exp.bumpVoteRewards.${claimKey}.rewardedAt`]: null },
          { [`profile.totals.exp.bumpVoteRewards.${claimKey}.rewardedAt`]: { $exists: false } },
        ],
      },
      {
        $set: {
          [`profile.totals.exp.bumpVoteRewards.${claimKey}.rewardedBy`]: String(client?.user?.id || ""),
          [`profile.totals.exp.bumpVoteRewards.${claimKey}.rewardedAt`]: new Date(),
        },
      },
      { new: true },
    ).catch(() => null);
    if (!claimed) return { addedLevels: 0, levelsLine: "Grazie per il supporto!" };

    const expResult = await addExpWithLevel(guild, uid, reward.addedExp, false, false).catch(() => null);
    const finalLevel = Number(expResult?.levelInfo?.level || getLevelInfo(currentExp + reward.addedExp).level || reward.targetLevel);
    const addedLevels = Math.max(0, finalLevel - reward.currentLevel);
    return {
      addedLevels,
      levelsLine: addedLevels > 0 ? `**+${addedLevels} livelli** per la tua recensione` : "Grazie per il supporto!",
    };
  } catch (err) {
    global.logger?.warn?.("[site-boards] review levels:", (err as any)?.message || err);
    return { addedLevels: 0, levelsLine: "Grazie per il supporto!" };
  }
}

async function onListingReviewed(client?, listingId?: string, userId?: string, rating = 5, reviewText = "") {
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
  const lvl = await awardReviewLevels(client, guild, String(userId), String(listingId), config.rewardLevels);
  if (config.thanksEnabled && config.channelId) {
    const role = config.roleId ? `<@&${config.roleId}>` : "—";
    const body = String(reviewText || "").trim().slice(0, 900) || "—";
    const vars = await userVarsFor(client, guild, String(userId), {
      service: SERVICE_NAME,
      rating: String(Math.max(1, Math.min(5, Math.round(Number(rating) || 5)))),
      review: body,
      levels: lvl.levelsLine,
      bonus: "",
      hours: fmtHours(config.hours),
      role,
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
