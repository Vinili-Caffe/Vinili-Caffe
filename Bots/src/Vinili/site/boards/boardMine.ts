/** Bacheche: i server di un utente (crea, modifica, invia, aggiorna, elimina, server rivendicabili). */
const fs = require("node:fs") as typeof import("node:fs");
const path = require("node:path") as typeof import("node:path");
const mongoose = require("mongoose") as typeof import("mongoose");
const { SiteDocument } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const { buildKnownBotGuildIdSet, syncKnownBotGuildIdsFromRest } = require("../../MultiGuild/dashboard/siteDashboardApi") as typeof import("../../MultiGuild/dashboard/siteDashboardApi");
const { snowflakeOk, slugify, sanitizeText, sanitizeUrl, sanitizeTags, sanitizeCategories, sanitizeLocales, sanitizeSocials, discordGuildBannerUrl, discordGuildIconUrl, preferAnimatedDiscordMediaUrl, discordGuildInviteHint, sanitizeAccent, sanitizeBoardFeatures } = require("./boardSanitize") as typeof import("./boardSanitize");
const { BOARD_BANNER_UPLOAD_ROOT, isUploadedBoardBannerUrl, resolveBoardsUser } = require("./boardBanners") as typeof import("./boardBanners");
const { BL, MAIN_GUILD_ID, BR, BREV, emitBoardsChanged, featureGate } = require("./boardReviews") as typeof import("./boardReviews");
const { BV, BB } = require("./boardVotes") as typeof import("./boardVotes");
const { guildTagBadgeCdnUrl, resolveGuildServerTag, refreshListingStats } = require("./boardStats") as typeof import("./boardStats");
const { MAIN_GUILD_SITE, resolveGuildBoardDefaults, viniliBotInviteUrl, listingChecklist, serializeListing, fetchManageableGuilds, assertBotInGuild, assertCanClaimServer } = require("./boardInvites") as typeof import("./boardInvites");
const { enrichListingAuthor } = require("./boardModeration") as typeof import("./boardModeration");

const ACTIVE_STATUSES = ["pending", "approved"];

async function uniqueSlug(base?) {
  let slug = slugify(base);
  for (let i = 0; i < 12; i += 1) {
    const candidate = i === 0 ? slug : `${slug}-${i + 1}`;
    const exists = await SiteDocument.exists({ docType: BL, boardSlug: candidate });
    if (!exists) return candidate;
  }
  return `${slug}-${Date.now().toString(36)}`;
}

async function createListing(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const cfg = gate.cfg;
  const auth = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;

  const kind = String(payload.kind || "").trim().toLowerCase();
  if (kind !== "server" && kind !== "bot") {
    return { ok: false, status: 400, error: "invalid_kind", message: "kind deve essere server o bot." };
  }

  let discordId = String(payload.discordId || "").trim();
  let name = sanitizeText(payload.name, 100);
  let iconUrl = sanitizeUrl(payload.iconUrl);
  let inviteUrl = sanitizeUrl(payload.inviteUrl);
  let botInviteUrl = sanitizeUrl(payload.botInviteUrl);
  const wantPending =
    payload.submit === true || String(payload.status || "").trim().toLowerCase() === "pending";

  if (kind === "server") {
    const claim = await assertCanClaimServer(client, payload.accessToken, discordId);
    if (!claim.ok) return claim;
    if (!name) name = claim.name;
    if (!iconUrl) iconUrl = claim.iconUrl;
  } else {
    if (!snowflakeOk(discordId)) {
      return { ok: false, status: 400, error: "invalid_discord_id", message: "Bot Client ID non valido." };
    }
    if (!name) {
      return { ok: false, status: 400, error: "missing_name", message: "Nome bot obbligatorio." };
    }
    if (!botInviteUrl) {
      botInviteUrl = `https://discord.com/oauth2/authorize?client_id=${discordId}&scope=bot%20applications.commands&permissions=0`;
    }
  }

  const ownDraft = await SiteDocument.findOne({
    docType: BL,
    boardDiscordId: discordId,
    userId: auth.userId,
    status: "draft",
  });
  if (ownDraft) {
    return {
      ok: true,
      status: 200,
      resumed: true,
      listing: serializeListing(ownDraft.toObject(), { includeMod: true }),
      message: "Bozza esistente ripresa.",
    };
  }

  const dup: any = await SiteDocument.findOne({
    docType: BL,
    boardDiscordId: discordId,
    status: { $in: ACTIVE_STATUSES },
  }).lean();
  if (dup) {
    return {
      ok: false,
      status: 409,
      error: "duplicate",
      message: "Esiste già una scheda pending/approved per questo ID Discord.",
      listingId: String(dup._id),
    };
  }

  /* boardsTagline500: descrizione breve max 500 */
  const tagline = sanitizeText(payload.tagline, 500);
  const description = sanitizeText(
    payload.description || payload.markdown,
    Math.max(4000, cfg.maxMarkdownChars || 4000, 8000),
  );
  const tags = sanitizeTags(payload.tags, cfg.maxTags);
  const categories = sanitizeCategories(payload.categories, cfg.maxCategories);
  const locales = sanitizeLocales(payload.locales || payload.locale, cfg.maxLocales);
  const visitorNotes = sanitizeText(payload.visitorNotes, 1000);
  let siteUrl = sanitizeUrl(payload.siteUrl);
  const socials = sanitizeSocials(payload.socials);
  let bannerUrl = sanitizeUrl(payload.bannerUrl);
  if (kind === "server" && (!inviteUrl || !bannerUrl)) {
    const defs = await resolveGuildBoardDefaults(client, discordId);
    if (!inviteUrl && defs.inviteUrl) inviteUrl = defs.inviteUrl;
    if (!bannerUrl && defs.bannerUrl) bannerUrl = defs.bannerUrl;
    if (!siteUrl && defs.siteUrl) siteUrl = defs.siteUrl;
  }
  const locale = locales[0] || sanitizeText(payload.locale, 16).toLowerCase();
  const nsfw = Boolean(payload.nsfw) || categories.includes("nsfw");
  const accent = sanitizeAccent(payload.accent);
  const slug = await uniqueSlug(payload.slug || name || discordId);

  const draftDoc = {
    docType: BL,
    userId: auth.userId,
    ownerId: auth.userId,
    guildId: discordId,
    boardKind: kind,
    boardDiscordId: discordId,
    boardSlug: slug,
    status: "draft",
    title: name,
    boardTagline: tagline,
    content: description,
    boardTags: tags,
    boardCategories: categories,
    boardLocales: locales,
    boardVisitorNotes: visitorNotes,
    boardSiteUrl: siteUrl,
    boardSocials: socials,
    boardInviteUrl: inviteUrl,
    boardBotInviteUrl: botInviteUrl,
    boardBannerUrl: bannerUrl,
    boardIconUrl: iconUrl,
    boardLocale: locale,
    boardNsfw: nsfw,
    boardAccent: accent,
    boardMarkdown: description,
    boardFeatures: sanitizeBoardFeatures(payload.features),
    boardScore: 0,
    boardVotes30d: 0,
    boardBumps7d: 0,
    boardBumpedAt: null,
    boardStats: {},
    boardModeration: { notes: "", submittedByName: auth.globalName || auth.username || "" },
    authorName: auth.globalName || auth.username || "",
    authorAvatar: auth.avatar ? String(auth.avatar) : "",
  };

  if (wantPending) {
    const check = listingChecklist(draftDoc, cfg);
    if (!check.complete) {
      return {
        ok: false,
        status: 400,
        error: "incomplete",
        message: "Compila i campi obbligatori prima di inviare in moderazione.",
        checklist: check,
      };
    }
    draftDoc.status = "pending";
  }

  const doc = await SiteDocument.create(draftDoc);
  if (wantPending) {
    try {
      const { onBoardsListingPending } = require("./siteBoardsInboxBridge") as typeof import("./siteBoardsInboxBridge");
      void onBoardsListingPending(client, doc, {
        subjectName: auth.globalName || auth.username || "",
        notify: true,
      }).catch((err?) => {
        try {
          global.logger?.warn?.("[boards] onBoardsListingPending create failed:", err?.message || err);
        } catch (_) {}
      });
    } catch (err) {
      try {
        global.logger?.warn?.("[boards] onBoardsListingPending require/create failed:", err?.message || err);
      } catch (_) {}
    }
  }
  emitBoardsChanged(wantPending ? "submit" : "create", {
    listingId: String(doc._id),
    slug: String(doc.boardSlug || ""),
    kind: String(doc.boardKind || ""),
  });
  return {
    ok: true,
    status: 201,
    listing: serializeListing(doc.toObject(), { includeMod: true }),
  };
}

async function patchListing(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const cfg = gate.cfg;
  const auth = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;
  const id = String(payload.listingId || payload.id || "").trim();
  if (!mongoose.isValidObjectId(id)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID scheda non valido." };
  }
  const doc = await SiteDocument.findOne({ _id: id, docType: BL });
  if (!doc) return { ok: false, status: 404, error: "not_found", message: "Scheda non trovata." };
  if (String(doc.userId) !== auth.userId) {
    return { ok: false, status: 403, error: "forbidden", message: "Non sei il proprietario di questa scheda." };
  }
  if (doc.status === "suspended") {
    return { ok: false, status: 403, error: "suspended", message: "Scheda sospesa: contatta lo staff." };
  }

  const body = payload.patch && typeof payload.patch === "object" ? payload.patch : payload;
  /* boardsNoRependAfterApprove1: dopo approved le patch restano live, niente re-moderazione/notif */
  if (body.name != null) {
    doc.title = sanitizeText(body.name, 100) || doc.title;
  }
  if (body.tagline != null) {
    doc.boardTagline = sanitizeText(body.tagline, 500);
  }
  if (body.description != null) {
    /* boardsKeepMdDraft1: salva md in boardMarkdown+content, niente strip */
    const desc = sanitizeText(
      body.description,
      Math.max(4000, cfg.maxMarkdownChars || 4000, 8000),
    );
    doc.boardMarkdown = desc;
    doc.content = desc;
  }
  if (body.tags != null) doc.boardTags = sanitizeTags(body.tags, cfg.maxTags);
  if (body.categories != null) {
    doc.boardCategories = sanitizeCategories(body.categories, cfg.maxCategories);
  }
  if (body.locales != null || body.locale != null) {
    const locales = sanitizeLocales(body.locales != null ? body.locales : body.locale, cfg.maxLocales);
    doc.boardLocales = locales;
    if (locales[0]) doc.boardLocale = locales[0];
  }
  if (body.visitorNotes != null) doc.boardVisitorNotes = sanitizeText(body.visitorNotes, 1000);
  if (body.siteUrl != null) doc.boardSiteUrl = sanitizeUrl(body.siteUrl);
  if (body.socials != null) doc.boardSocials = sanitizeSocials(body.socials);
  if (body.features != null) doc.boardFeatures = sanitizeBoardFeatures(body.features);
  if (body.inviteUrl != null) {
    doc.boardInviteUrl = sanitizeUrl(body.inviteUrl);
  }
  if (body.botInviteUrl != null) {
    doc.boardBotInviteUrl = sanitizeUrl(body.botInviteUrl);
  }
  if (body.bannerUrl != null) doc.boardBannerUrl = sanitizeUrl(body.bannerUrl);
  if (body.iconUrl != null) doc.boardIconUrl = sanitizeUrl(body.iconUrl);
  if (body.locale != null && body.locales == null) {
    doc.boardLocale = sanitizeText(body.locale, 16).toLowerCase();
  }
  if (body.nsfw != null) doc.boardNsfw = Boolean(body.nsfw);
  if (body.accent != null) doc.boardAccent = sanitizeAccent(body.accent);
  if (Array.isArray(doc.boardCategories) && doc.boardCategories.includes("nsfw")) {
    doc.boardNsfw = true;
  }

  await doc.save();
  emitBoardsChanged("patch", {
    listingId: String(doc._id),
    slug: String(doc.boardSlug || ""),
    kind: String(doc.boardKind || ""),
  });
  return { ok: true, status: 200, listing: serializeListing(doc.toObject(), { includeMod: true }) };
}

async function listMine(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const auth = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;
  const rows = await SiteDocument.find({ docType: BL, userId: auth.userId }).sort({ updatedAt: -1 }).lean();
  return { ok: true, status: 200, listings: rows.map((r?) => serializeListing(r, { includeMod: true })) };
}

/* boardsMinePreview1: owner legge la propria scheda (anche pending/draft) */
async function getMyListingById(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const auth = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;
  const id = String(payload.listingId || payload.id || "").trim();
  if (!mongoose.isValidObjectId(id)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID scheda non valido." };
  }
  const doc = await SiteDocument.findOne({ _id: id, docType: BL, userId: auth.userId }).lean();
  if (!doc) return { ok: false, status: 404, error: "not_found", message: "Scheda non trovata." };
  let listing = serializeListing(doc, { includeMod: true });
  if (!listing.authorName) listing.authorName = auth.globalName || auth.username || "";
  if (!listing.authorAvatar && auth.avatar) {
    listing.authorAvatar = String(auth.avatar);
    const ext = /^a_/i.test(listing.authorAvatar) ? "gif" : "png";
    listing.authorAvatarUrl = `https://cdn.discordapp.com/avatars/${auth.userId}/${listing.authorAvatar}.${ext}?size=64`;
  }
  await enrichListingAuthor(client, listing);
  listing = await refreshListingStats(client, listing);
  return {
    ok: true,
    status: 200,
    listing,
    ownerPreview: true,
    publicOpen: gate.cfg.publicOpen,
  };
}

/* boardsBotLeftPurge1: cascade delete listing + votes/bumps/reports/reviews + banner */
async function purgeBoardListingDoc(client?, doc?, { reason = "purge" } = {}) {
  if (!doc) return { ok: false, deleted: false };
  const id = String(doc._id || "").trim();
  if (!id || !mongoose.isValidObjectId(id)) return { ok: false, deleted: false };
  const status = String(doc.status || "").trim().toLowerCase();

  try {
    const { onBoardsListingWithdrawn } = require("./siteBoardsInboxBridge") as typeof import("./siteBoardsInboxBridge");
    if (typeof onBoardsListingWithdrawn === "function") {
      await onBoardsListingWithdrawn(client, doc, { reason: String(reason || "purge") }).catch(() => null);
    }
  } catch (_) {}

  await Promise.allSettled([
    SiteDocument.deleteMany({ docType: BV, boardListingId: id }),
    SiteDocument.deleteMany({ docType: BB, boardListingId: id }),
    SiteDocument.deleteMany({ docType: BR, boardListingId: id }),
    SiteDocument.deleteMany({ docType: BREV, boardListingId: id }),
  ]);

  try {
    const bannerUrl = String(doc.boardBannerUrl || "").trim();
    if (bannerUrl.includes("/webhooks/site-boards/files/")) {
      const m = bannerUrl.match(/\/files\/([^/]+)\/([^/?#]+)/);
      if (m) {
        const filePath = path.join(BOARD_BANNER_UPLOAD_ROOT, m[1], m[2]);
        if (filePath.startsWith(BOARD_BANNER_UPLOAD_ROOT)) {
          fs.unlink(filePath, () => {});
        }
      }
    }
  } catch (_) {}

  await SiteDocument.deleteOne({ _id: id, docType: BL });
  emitBoardsChanged("purge", { listingId: id });
  return { ok: true, deleted: true, listingId: id, wasStatus: status };
}

/**
 * Bot uscito dal server: elimina tutte le schede bacheca di quel guild
 * (bozza/pending/approved/…) + dati collegati. Non tocca schede bot.
 */
async function deleteServerListingsForLeftGuild(client?, guildId?, opts: Record<string, any> = {}) {
  const gid = String(guildId || "").trim();
  if (!snowflakeOk(gid)) return { ok: false, deleted: 0, listingIds: [] };
  const reason = String(opts.reason || "bot_left_guild").trim() || "bot_left_guild";
  const docs = await SiteDocument.find({
    docType: BL,
    boardKind: "server",
    $or: [{ boardDiscordId: gid }, { guildId: gid }],
  }).catch(() => []);
  const listingIds = [];
  for (const doc of Array.isArray(docs) ? docs : []) {
    const result = await purgeBoardListingDoc(client, doc, { reason }).catch((err?) => {
      global.logger?.warn?.(
        "[boards] purge on guild leave failed:",
        gid,
        String(doc?._id || ""),
        err?.message || err,
      );
      return null;
    });
    if (result?.deleted) listingIds.push(String(result.listingId));
  }
  if (listingIds.length) {
    global.logger?.info?.(
      `[boards] bot left guild ${gid}: purged ${listingIds.length} server listing(s)`,
      listingIds.join(","),
    );
  }
  return { ok: true, deleted: listingIds.length, listingIds };
}

/* boardsMineDelete1: owner elimina bozza / ritira scheda propria */
async function deleteMyListing(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const auth = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;
  const id = String(payload.listingId || payload.id || "").trim();
  if (!mongoose.isValidObjectId(id)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID scheda non valido." };
  }
  const doc = await SiteDocument.findOne({ _id: id, docType: BL, userId: auth.userId });
  if (!doc) return { ok: false, status: 404, error: "not_found", message: "Scheda non trovata." };
  const status = String(doc.status || "").trim().toLowerCase();
  const deletable = new Set(["draft", "pending", "rejected", "approved", "suspended"]);
  if (!deletable.has(status)) {
    return {
      ok: false,
      status: 400,
      error: "not_deletable",
      message: "Questa scheda non può essere eliminata.",
    };
  }

  const purged = await purgeBoardListingDoc(client, doc, { reason: "owner_delete" });
  if (!purged?.deleted) {
    return { ok: false, status: 500, error: "delete_failed", message: "Eliminazione non riuscita." };
  }
  emitBoardsChanged("delete", { listingId: id });
  return { ok: true, status: 200, deleted: true, listingId: id, wasStatus: status };
}

/* boardsOwnerTools1: owner forza sync Discord (nome/icona/banner/membri/tag) */
async function refreshMyListing(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const auth = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;
  const id = String(payload.listingId || payload.id || "").trim();
  if (!mongoose.isValidObjectId(id)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID scheda non valido." };
  }
  const doc: any = await SiteDocument.findOne({ _id: id, docType: BL, userId: auth.userId }).lean();
  if (!doc) return { ok: false, status: 404, error: "not_found", message: "Scheda non trovata." };
  const kind = String(doc.boardKind || "") === "bot" ? "bot" : "server";
  if (kind !== "server") {
    return {
      ok: false,
      status: 400,
      error: "unsupported_kind",
      message: "Il refresh Discord è disponibile solo per le schede server.",
    };
  }
  const gid = String(doc.boardDiscordId || "").trim();
  if (!snowflakeOk(gid)) {
    return { ok: false, status: 400, error: "invalid_guild", message: "ID server non valido." };
  }
  let guild = null;
  try {
    guild =
      client?.guilds?.cache?.get(gid) || (await client?.guilds?.fetch?.(gid).catch(() => null));
  } catch (_) {
    guild = null;
  }
  if (!guild) {
    return {
      ok: false,
      status: 404,
      error: "guild_unavailable",
      message: "Il bot non è nel server o Discord non risponde. Riprova tra poco.",
    };
  }
  try {
    await guild.fetch().catch(() => null);
  } catch (_) {}

  const prev =
    (doc.boardStats && typeof doc.boardStats === "object" && doc.boardStats) || {};
  const inviteUrl = String(doc.boardInviteUrl || "").trim();
  const tagInfo: any = (await resolveGuildServerTag(client, guild, inviteUrl)) || {};
  const stats = {
    members: Number(guild.memberCount) || 0,
    name: String(guild.name || ""),
    guildTag: tagInfo.guildTag || prev.guildTag || "",
    guildTagBadge: tagInfo.guildTagBadge || prev.guildTagBadge || "",
    guildTagBadgeUrl: tagInfo.guildTagBadgeUrl || prev.guildTagBadgeUrl || "",
    guildTagBadgeColor: tagInfo.guildTagBadgeColor || prev.guildTagBadgeColor || "",
    guildTagBadgeColor2: tagInfo.guildTagBadgeColor2 || prev.guildTagBadgeColor2 || "",
    refreshedAt: new Date().toISOString(),
  };
  if (stats.guildTagBadge && !stats.guildTagBadgeUrl) {
    stats.guildTagBadgeUrl = guildTagBadgeCdnUrl(gid, stats.guildTagBadge);
  }
  const iconUrl =
    (guild.icon ? discordGuildIconUrl(guild, null, 256) : "") ||
    preferAnimatedDiscordMediaUrl(doc.boardIconUrl || "") ||
    "";
  const discordBanner =
    discordGuildBannerUrl(guild) || preferAnimatedDiscordMediaUrl(doc.boardBannerUrl || "") || "";
  const title = String(guild.name || doc.title || "").trim();
  const $set: Record<string, any> = {
    boardStats: stats,
    boardIconUrl: iconUrl,
    updatedAt: new Date(),
  };
  if (title) $set.title = title;
  /* boardsBannerUpload1: non sovrascrivere banner caricati dal form */
  if (discordBanner && !isUploadedBoardBannerUrl(doc.boardBannerUrl)) {
    $set.boardBannerUrl = discordBanner;
  }

  await SiteDocument.updateOne({ _id: doc._id, docType: BL }, { $set });
  const fresh = await SiteDocument.findOne({ _id: doc._id, docType: BL }).lean();
  let listing = serializeListing(fresh, { includeMod: true });
  await enrichListingAuthor(client, listing);
  return {
    ok: true,
    status: 200,
    listing,
    refreshed: true,
    message: "Dati Discord aggiornati.",
  };
}

async function listClaimableServers(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const auth = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;
  const list = await fetchManageableGuilds(payload.accessToken);
  if (!list?.ok) return list;
  try {
    await syncKnownBotGuildIdsFromRest(client).catch(() => null);
  } catch (_) {}
  const known = buildKnownBotGuildIdSet(client);
  const existing = await SiteDocument.find({
    docType: BL,
    boardKind: "server",
    status: { $in: [...ACTIVE_STATUSES, "draft"] },
  })
    .select({ boardDiscordId: 1, status: 1, userId: 1, _id: 1 })
    .lean();
  const taken = new Map();
  const ownDrafts = new Map();
  for (const e of existing) {
    const id = String(e.boardDiscordId || "");
    if (!id) continue;
    if (String(e.status) === "draft" && String(e.userId) === auth.userId) {
      ownDrafts.set(id, String(e._id));
    } else if (ACTIVE_STATUSES.includes(String(e.status))) {
      taken.set(id, String(e.status));
    }
  }
  const guilds = (Array.isArray(list.guilds) ? list.guilds : [])
    .filter((g?) => snowflakeOk(g?.id))
    .map((g?) => {
      const id = String(g.id);
      const botPresent = known.has(id) || Boolean(client?.guilds?.cache?.has?.(id));
      const alreadyListed = taken.has(id);
      const draftId = ownDrafts.get(id) || "";
      const dg = botPresent ? client?.guilds?.cache?.get?.(id) : null;
      const bannerUrl = dg ? discordGuildBannerUrl(dg) : "";
      const inviteUrl = dg ? discordGuildInviteHint(dg) : "";
      const siteUrl =
        MAIN_GUILD_ID && id === MAIN_GUILD_ID ? MAIN_GUILD_SITE : "";
      return {
        id,
        name: String(g.name || ""),
        iconUrl: g.icon ? discordGuildIconUrl(id, g.icon, 128) : "",
        owner: Boolean(g.owner),
        alreadyListed,
        botPresent,
        hasDraft: Boolean(draftId),
        draftId,
        claimable: botPresent && !alreadyListed,
        inviteBotUrl: viniliBotInviteUrl(client, id),
        /* boardsFormPrefill1 */
        bannerUrl: bannerUrl || "",
        inviteUrl: inviteUrl || "",
        siteUrl,
      };
    })
    .sort(
      (a?, b?) =>
        Number(b.claimable) - Number(a.claimable) ||
        Number(b.hasDraft) - Number(a.hasDraft) ||
        a.name.localeCompare(b.name, "it"),
    );
  return {
    ok: true,
    status: 200,
    guilds,
    botInviteUrl: viniliBotInviteUrl(client, null),
    inviteBotHint:
      "Puoi pubblicare solo server di cui sei proprietario Discord. Serve anche il bot Vinili & Caffè nel server.",
  };
}

async function submitListing(client?, payload: Record<string, any> = {}) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const auth = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;
  const id = String(payload.listingId || payload.id || "").trim();
  if (!mongoose.isValidObjectId(id)) {
    return { ok: false, status: 400, error: "invalid_id", message: "ID scheda non valido." };
  }
  const doc = await SiteDocument.findOne({ _id: id, docType: BL });
  if (!doc) return { ok: false, status: 404, error: "not_found", message: "Scheda non trovata." };
  if (String(doc.userId) !== auth.userId) {
    return { ok: false, status: 403, error: "forbidden", message: "Non sei il proprietario di questa scheda." };
  }
  if (doc.status === "suspended") {
    return { ok: false, status: 403, error: "suspended", message: "Scheda sospesa: contatta lo staff." };
  }
  if (doc.status === "pending") {
    return { ok: true, status: 200, listing: serializeListing(doc.toObject(), { includeMod: true }), alreadyPending: true };
  }
  if (doc.status === "approved") {
    return { ok: false, status: 400, error: "already_approved", message: "Scheda già approvata." };
  }
  if (String(doc.boardKind) === "server") {
    const botOk = await assertBotInGuild(client, doc.boardDiscordId);
    if (!botOk) {
      return {
        ok: false,
        status: 403,
        error: "bot_not_in_guild",
        message: "Il bot Vinili & Caffè deve essere presente nel server prima dell’invio.",
      };
    }
  }
  const taglineLen = String(doc.boardTagline || "").length;
  if (taglineLen > 500) {
    return {
      ok: false,
      status: 400,
      error: "tagline_too_long",
      message:
        "Descrizione breve: massimo 500 caratteri (ora " +
        taglineLen +
        ", " +
        (500 - taglineLen) +
        ").",
      listing: serializeListing(doc.toObject(), { includeMod: true }),
    };
  }
  const check = listingChecklist(doc.toObject(), gate.cfg);
  if (!check.complete) {
    return {
      ok: false,
      status: 400,
      error: "incomplete",
      message: "Completa i campi obbligatori prima di inviare in moderazione.",
      checklist: check,
      listing: serializeListing(doc.toObject(), { includeMod: true }),
    };
  }
  doc.status = "pending";
  const mod = doc.boardModeration && typeof doc.boardModeration === "object" ? { ...doc.boardModeration } : {};
  mod.submittedAt = new Date().toISOString();
  mod.submittedByName = auth.globalName || auth.username || "";
  doc.boardModeration = mod;
  await doc.save();
  try {
    const { onBoardsListingPending } = require("./siteBoardsInboxBridge") as typeof import("./siteBoardsInboxBridge");
    void onBoardsListingPending(client, doc, {
      subjectName: auth.globalName || auth.username || "",
      notify: true,
    }).catch((err?) => {
      try {
        global.logger?.warn?.("[boards] onBoardsListingPending submit failed:", err?.message || err);
      } catch (_) {}
    });
  } catch (err) {
    try {
      global.logger?.warn?.("[boards] onBoardsListingPending require/submit failed:", err?.message || err);
    } catch (_) {}
  }
  emitBoardsChanged("submit", {
    listingId: String(doc._id),
    slug: String(doc.boardSlug || ""),
    kind: String(doc.boardKind || ""),
  });
  return { ok: true, status: 200, listing: serializeListing(doc.toObject(), { includeMod: true }) };
}

export = { createListing, patchListing, listMine, getMyListingById, purgeBoardListingDoc, deleteServerListingsForLeftGuild, deleteMyListing, refreshMyListing, listClaimableServers, submitListing };
