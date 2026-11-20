/**
 * Premi nel server per una recensione in Vetrina.
 * Embed come le recensioni sito sul main; livelli solo sul server principale; ruolo permanente.
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
const EMBED_COLOR = "#826bc2";

type ReviewHook = {
  enabled: boolean;
  channelId: string | null;
  roleId: string | null;
  thanksEnabled: boolean;
  draft: any;
  /** Solo server principale: livelli una tantum. Altri server → sempre 0. */
  rewardLevels: number;
};

const restOf = (client?) => client?.rest || client?._rest || null;

function isMain(guildId?: string) {
  try {
    return T.isMainGuild(String(guildId || ""));
  } catch {
    return false;
  }
}

function schedaUrl(doc?) {
  const slug = String(doc?.boardSlug || doc?.slug || "").trim();
  const id = String(doc?._id || doc?.id || "").trim();
  return slug
    ? `https://www.viniliecaffe.it/vetrina/scheda/?slug=${encodeURIComponent(slug)}`
    : `https://www.viniliecaffe.it/vetrina/scheda/?id=${encodeURIComponent(id)}`;
}

function defaultDraft(link = "https://www.viniliecaffe.it/vetrina/") {
  /* Stesso layout di announceServerReview (recensioni sito sul main). */
  return T.normalizeDraft({
    content: "{user}",
    mentionUsers: true,
    embed: {
      enabled: true,
      title: "Nuova recensione in Vetrina",
      url: link,
      description: "Un membro ha pubblicato una recensione della community.",
      color: EMBED_COLOR,
      thumbnailUrl: "{avatar}",
      authorName: "{username}",
      authorIconUrl: "{avatar}",
      timestamp: true,
      footerText: "viniliecaffe.it · Feedback community",
      fields: [
        { name: "Valutazione", value: "{stars}", inline: true },
        { name: "Inviata", value: "{sent}", inline: true },
        { name: "Testo", value: "{review}", inline: false },
        { name: "Link", value: `[Apri la scheda]({link})`, inline: false },
        { name: "Ricompensa", value: "{reward}", inline: false },
      ],
    },
    buttons: [],
  });
}

function normalizeHook(raw?, seed: Partial<ReviewHook> = {}, guildId = "", listingLink = ""): ReviewHook {
  const r = raw && typeof raw === "object" ? raw : {};
  const main = isMain(guildId);
  const rawLevels = r.rewardLevels ?? seed.rewardLevels;
  const rewardLevels = main ? Math.max(0, Math.min(100, Math.floor(Number(rawLevels)))) : 0;
  const levelsOk = Number.isFinite(rewardLevels) ? rewardLevels : main ? 5 : 0;
  /* Mai sovrascrivere un draft già salvato/inviato: solo seed se manca del tutto. */
  const draft = r.draft
    ? T.normalizeDraft(r.draft)
    : seed.draft
      ? T.normalizeDraft(seed.draft)
      : defaultDraft(listingLink || undefined);
  return {
    enabled: r.enabled === true,
    channelId: T.isId(r.channelId ?? seed.channelId) ? String(r.channelId ?? seed.channelId) : null,
    roleId: T.isId(r.roleId ?? seed.roleId) ? String(r.roleId ?? seed.roleId) : null,
    thanksEnabled: r.thanksEnabled !== false,
    draft,
    rewardLevels: levelsOk,
  };
}

async function seedFromMain(client?, guildId?: string, listingDoc?): Promise<Partial<ReviewHook>> {
  const out: Partial<ReviewHook> = { draft: defaultDraft(schedaUrl(listingDoc)) };
  if (!isMain(guildId)) {
    out.rewardLevels = 0;
    return out;
  }
  try {
    const LVL = require("../../../MultiGuild/services/levelsRuntime") as typeof import("../../../MultiGuild/services/levelsRuntime");
    const cfg: any = await LVL.getConfig(String(guildId));
    if (Number.isFinite(Number(cfg?.reviewRewardLevels))) out.rewardLevels = Math.max(0, Math.floor(Number(cfg.reviewRewardLevels)));
  } catch (_) {
    out.rewardLevels = 5;
  }
  try {
    const { FALLBACK_REVIEW_CHANNEL_ID } = require("../../site/http/siteReviews/constants") as typeof import("../../site/http/siteReviews/constants");
    const ch =
      String(client?.config?.siteReviews?.channelId || "").trim() ||
      String(client?.config?.disboardReviews?.channelId || "").trim() ||
      String(FALLBACK_REVIEW_CHANNEL_ID || "").trim();
    if (T.isId(ch)) out.channelId = ch;
  } catch (_) {}
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

function withListingLink(draft?, link = "") {
  const d = T.normalizeDraft(draft);
  if (!link) return d;
  if (d.embed?.url === "" || d.embed?.url === "https://www.viniliecaffe.it/vetrina/") d.embed.url = link;
  if (d.buttons.length) d.buttons = d.buttons.map((b) => ({ ...b, url: b.url || link }));
  return d;
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

function starsOf(rating?) {
  const n = Math.max(1, Math.min(5, Math.round(Number(rating) || 5)));
  return "⭐".repeat(n);
}

function rewardLine(userId: string, levelsAdded: number, roleId: string | null) {
  if (levelsAdded > 0) {
    const roleBit = roleId ? ` Ruolo <@&${roleId}>.` : "";
    return `<@${userId}>, **+${levelsAdded} livelli** per aver lasciato una recensione.${roleBit}`;
  }
  if (roleId) return `<@${userId}>, ruolo <@&${roleId}> per la tua recensione.`;
  return `Grazie <@${userId}> per il supporto!`;
}

async function getReviewHook(client?, payload: Record<string, any> = {}) {
  const { err, doc, guildId } = await loadOwned(client, payload.accessToken, payload.listingId);
  if (err) return err;
  const link = schedaUrl(doc);
  const seed = doc.boardReviewHook ? {} : await seedFromMain(client, guildId, doc);
  const config = normalizeHook(doc.boardReviewHook, seed, guildId, link);
  let pickers: any = { textChannels: [], roles: [], emojis: [], categories: [] };
  try {
    const { listGuildPickerData } = require("../../Partner/dashboard/siteDashboardPartnershipApi") as typeof import("../../Partner/dashboard/siteDashboardPartnershipApi");
    pickers = (await listGuildPickerData(client, guildId).catch(() => null)) || pickers;
  } catch (_) {}
  const guild = await resolveGuild(client, guildId);
  const me = client?.user;
  const main = isMain(guildId);
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
    seededFromMain: Boolean(!doc.boardReviewHook && main),
    listingLink: link,
  };
}

async function saveReviewHook(client?, payload: Record<string, any> = {}) {
  const { err, doc, guildId } = await loadOwned(client, payload.accessToken, payload.listingId);
  if (err) return err;
  const config = normalizeHook(payload.config, {}, guildId, schedaUrl(doc));
  /* $set diretto: evita che strict/schema vecchio in cache butti via il Mixed */
  await SiteDocument.updateOne({ _id: doc._id, docType: BL }, { $set: { boardReviewHook: config } });
  return { ok: true, status: 200, config, message: "Impostazioni delle recensioni salvate." };
}

async function testReviewHook(client?, payload: Record<string, any> = {}) {
  const { err, auth, doc, guildId } = await loadOwned(client, payload.accessToken, payload.listingId);
  if (err) return err;
  const link = schedaUrl(doc);
  const seed = doc.boardReviewHook ? {} : await seedFromMain(client, guildId, doc);
  const config = normalizeHook(payload.config || doc.boardReviewHook, seed, guildId, link);
  if (!config.channelId) return { ok: false, status: 400, error: "no_channel", message: "Scegli prima il canale." };
  const guild = await resolveGuild(client, guildId);
  if (!guild) return { ok: false, status: 400, error: "bot_not_in_guild", message: "Il bot di Vinili & Caffè non è nel server." };
  const levelsPreview = isMain(guildId) && config.rewardLevels > 0 ? config.rewardLevels : 0;
  const vars = await userVarsFor(client, guild, String(auth.userId), {
    service: SERVICE_NAME,
    stars: starsOf(5),
    review: "Server bellissimo, staff attivo e tanti eventi!",
    link,
    sent: `<t:${Math.floor(Date.now() / 1000)}:R>`,
    reward: rewardLine(String(auth.userId), levelsPreview, config.roleId),
  });
  const ok = await postDraft(client, config.channelId, withListingLink(config.draft, link), vars, String(auth.userId));
  return ok
    ? { ok: true, status: 200, message: "Messaggio di prova inviato nel canale." }
    : { ok: false, status: 502, error: "send_failed", message: "Invio non riuscito: controlla che il bot possa scrivere nel canale." };
}

async function awardReviewLevels(client?, guild?, userId?: string, listingId?: string, levelsToAdd = 0) {
  const guildId = String(guild?.id || "").trim();
  const uid = String(userId || "").trim();
  const lid = String(listingId || "").trim();
  const n = Math.max(0, Math.floor(Number(levelsToAdd) || 0));
  if (!guildId || !uid || !lid || !(n > 0) || !isMain(guildId)) return 0;
  try {
    const LVL = require("../../../MultiGuild/services/levelsRuntime") as typeof import("../../../MultiGuild/services/levelsRuntime");
    if (!LVL.levelsActive(guildId)) return 0;
  } catch {
    return 0;
  }
  try {
    const { computeExpForLevelReward } = require("../../site/http/siteReviews/rewards") as typeof import("../../site/http/siteReviews/rewards");
    const { addExpWithLevel, getLevelInfo } = require("../../Level/services/expService") as typeof import("../../Level/services/expService");
    const claimKey = `board_review_${lid}`;
    const profile = await ActivityUserProfile.findOne({ guildId, userId: uid }).select("profile.totals.exp.totalExp").lean().catch(() => null);
    const currentExp = Number(profile?.profile?.totals?.exp?.totalExp || 0);
    const reward = computeExpForLevelReward(currentExp, n);
    if (!reward.addedExp) return 0;

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
    if (!claimed) return 0;

    const expResult = await addExpWithLevel(guild, uid, reward.addedExp, false, false).catch(() => null);
    const finalLevel = Number(expResult?.levelInfo?.level || getLevelInfo(currentExp + reward.addedExp).level || reward.targetLevel);
    return Math.max(0, finalLevel - reward.currentLevel);
  } catch (err) {
    global.logger?.warn?.("[site-boards] review levels:", (err as any)?.message || err);
    return 0;
  }
}

/**
 * Premi + messaggio dopo una recensione (scheda Vetrina o /recensioni/ sul main).
 * opts.force: annuncia anche se l'hook non è ancora stato “acceso” (es. sync da /recensioni/).
 */
async function onListingReviewed(client?, listingId?: string, userId?: string, rating = 5, reviewText = "", opts: { force?: boolean } = {}) {
  const doc: any = await SiteDocument.findOne({ _id: listingId, docType: BL }).select({ boardReviewHook: 1, boardDiscordId: 1, boardKind: 1, boardSlug: 1 }).lean();
  if (!doc || String(doc.boardKind || "") === "bot") return { ok: false, reason: "not_server" };
  const gid = String(doc.boardDiscordId || "");
  const link = schedaUrl(doc);
  let config = normalizeHook(doc.boardReviewHook, {}, gid, link);
  if (!doc.boardReviewHook && (opts.force || isMain(gid))) {
    const seed = await seedFromMain(client, gid, doc);
    config = normalizeHook({ enabled: true, thanksEnabled: true }, seed, gid, link);
  }
  if (!config.enabled && !opts.force) return { ok: false, reason: "disabled" };
  const guild = await resolveGuild(client, gid);
  if (!guild) return { ok: false, reason: "bot_not_in_guild" };
  const rest = restOf(client);
  /* ruolo permanente: una sola recensione per utente */
  if (config.roleId && rest) {
    await rest.put(Routes.guildMemberRole(gid, String(userId), config.roleId), { reason: "Recensione in Vetrina" }).catch(() => null);
  }
  const levelsAdded = await awardReviewLevels(client, guild, String(userId), String(listingId), config.rewardLevels);
  const thanksOn = config.thanksEnabled !== false && (config.enabled || opts.force);
  if (thanksOn && config.channelId) {
    const body = String(reviewText || "").trim().slice(0, 900) || "—";
    const vars = await userVarsFor(client, guild, String(userId), {
      service: SERVICE_NAME,
      stars: starsOf(rating),
      review: body.length > 1020 ? `${body.slice(0, 1017)}…` : body,
      link,
      sent: `<t:${Math.floor(Date.now() / 1000)}:R>`,
      reward: rewardLine(String(userId), levelsAdded, config.roleId),
    });
    await postDraft(client, config.channelId, withListingLink(config.draft, link), vars, String(userId));
  }
  return { ok: true, levelsAdded, channelId: config.channelId || null };
}

export = { getReviewHook, saveReviewHook, testReviewHook, onListingReviewed, normalizeHook };
