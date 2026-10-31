/** Bacheche: creazione dell'invito al server e valori predefiniti presi dal server. */
const mongoose = require("mongoose") as typeof import("mongoose");
const { SiteDocument } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { buildKnownBotGuildIdSet, syncKnownBotGuildIdsFromRest } = require("../dashboard/siteDashboardApi") as typeof import("../dashboard/siteDashboardApi");
const { PermissionFlagsBits, ChannelType } = require("discord.js") as typeof import("discord.js");
const { voteCountMonthKeyRome } = require("../../Utils/romeVoteMonthKey") as typeof import("../../Utils/romeVoteMonthKey");
const { snowflakeOk, sanitizeUrl, sanitizeCategories, sanitizeLocales, sanitizeSocials, discordGuildBannerUrl, discordGuildIconUrl, preferAnimatedDiscordMediaUrl, discordGuildInviteHint, sanitizeBoardFeatures } = require("./boardSanitize") as typeof import("./boardSanitize");
const { resolveBoardsUser } = require("./boardBanners") as typeof import("./boardBanners");
const { BL, MAIN_GUILD_ID, featureGate, fetchGuildPreferLite } = require("./boardReviews") as typeof import("./boardReviews");
const { listingVotesMonth } = require("./boardVotes") as typeof import("./boardVotes");

const MAIN_GUILD_SITE = "https://www.viniliecaffe.it";

async function resolveGuildBoardDefaults(client?, guildId?) {
  const gid = String(guildId || "").trim();
  if (!snowflakeOk(gid) || !client) return { inviteUrl: "", bannerUrl: "", siteUrl: "" };
  let guild = null;
  try {
    guild = client.guilds.cache.get(gid) || (await fetchGuildPreferLite(client, gid));
  } catch (_) {
    guild = null;
  }
  if (!guild) return { inviteUrl: "", bannerUrl: "", siteUrl: "" };
  try {
    if (!guild.vanityURLCode && guild.features?.includes?.("VANITY_URL")) {
      await guild.fetch().catch(() => null);
    }
  } catch (_) {}
  const siteUrl =
    MAIN_GUILD_ID && String(guild.id) === MAIN_GUILD_ID ? MAIN_GUILD_SITE : "";
  return {
    inviteUrl: discordGuildInviteHint(guild) || "",
    bannerUrl: discordGuildBannerUrl(guild) || "",
    siteUrl,
  };
}

function viniliBotInviteUrl(client?, guildId?) {
  /* botInviteScopes2: always Vinili official + code grant invite */
  const official = String(
    process.env.DISCORD_CLIENT_ID_OFFICIAL ||
      process.env.DISCORD_CLIENT_ID ||
      client?.config?.clientId ||
      client?.user?.id ||
      "",
  ).trim();
  const clientId = snowflakeOk(official) ? official : "";
  if (!clientId) return "";
  const params = new URLSearchParams({
    client_id: clientId,
    permissions: String(PermissionFlagsBits.Administrator),
    response_type: "code",
    redirect_uri: "https://viniliecaffe.it/",
    integration_type: "0",
    scope: "applications.commands.permissions.update bot applications.commands guilds.join",
    prompt: "none",
  });
  const gid = String(guildId || "").trim();
  if (snowflakeOk(gid)) {
    params.set("guild_id", gid);
    params.set("disable_guild_select", "true");
  }
  return `https://discord.com/oauth2/authorize?${params.toString()}`;
}

function listingChecklist(doc?, cfgIn?) {
  const cfg = cfgIn && typeof cfgIn === "object" ? cfgIn : {};
  const minTagline = Math.max(8, Math.min(80, Number(cfg.minTaglineChars) || 20));
  const minDesc = Math.max(20, Math.min(500, Number(cfg.minDescriptionChars) || 80));
  const kind = String(doc?.boardKind || "") === "bot" ? "bot" : "server";
  const name = String(doc?.title || "").trim();
  const tagline = String(doc?.boardTagline || "").trim();
  /* boardsKeepMdDraft1: preferisci boardMarkdown (md lungo) a content */
  const description = String(doc?.boardMarkdown || doc?.content || "").trim();
  const categories = sanitizeCategories(doc?.boardCategories);
  const locales = sanitizeLocales(doc?.boardLocales?.length ? doc.boardLocales : doc?.boardLocale);
  const inviteUrl = String(doc?.boardInviteUrl || "").trim();
  const botInviteUrl = String(doc?.boardBotInviteUrl || "").trim();
  const inviteOk =
    kind === "bot"
      ? Boolean(sanitizeUrl(botInviteUrl) || sanitizeUrl(inviteUrl))
      : Boolean(sanitizeUrl(inviteUrl));
  const items = [
    { id: "name", required: true, ok: Boolean(name), label: "Nome" },
    {
      id: "tagline",
      required: true,
      ok: tagline.length >= minTagline,
      label: "Descrizione breve (min. " + minTagline + " caratteri)",
    },
    {
      id: "description",
      required: true,
      ok: description.length >= minDesc,
      label: "Descrizione completa (min. " + minDesc + " caratteri)",
    },
    { id: "categories", required: true, ok: categories.length >= 1, label: "Almeno una categoria" },
    { id: "locales", required: true, ok: locales.length >= 1, label: "Almeno una lingua" },
    { id: "invite", required: true, ok: inviteOk, label: kind === "bot" ? "Invite bot" : "Invite server" },
    {
      id: "siteUrl",
      required: false,
      ok: Boolean(sanitizeUrl(doc?.boardSiteUrl)),
      label: "Sito web",
    },
    {
      id: "socials",
      required: false,
      ok: Object.keys(sanitizeSocials(doc?.boardSocials)).length > 0,
      label: "Profili social",
    },
  ];
  const missing = items.filter((i?) => i.required && !i.ok).map((i?) => i.id);
  return { items, missing, complete: missing.length === 0, categories, locales };
}

function serializeListing(doc?, opts: Record<string, any> = {}) {
  if (!doc) return null;
  const card = String(opts.mode || "") === "card";
  const wf = doc.boardModeration && typeof doc.boardModeration === "object" ? doc.boardModeration : {};
  const categories = sanitizeCategories(doc.boardCategories);
  const locales = sanitizeLocales(
    Array.isArray(doc.boardLocales) && doc.boardLocales.length
      ? doc.boardLocales
      : doc.boardLocale
        ? [doc.boardLocale]
        : [],
  );
  const socials = card ? {} : sanitizeSocials(doc.boardSocials);
  const checklist = listingChecklist(doc);
  const ownerUserId = String(doc.userId || doc.ownerId || "").trim();
  const authorName = String(
    doc.authorName ||
      (doc.boardModeration && doc.boardModeration.submittedByName) ||
      "",
  ).trim();
  const authorAvatar = String(doc.authorAvatar || doc.authorAvatarHash || "").trim();
  let authorAvatarUrl = preferAnimatedDiscordMediaUrl(String(doc.authorAvatarUrl || "").trim());
  if (!authorAvatarUrl && ownerUserId && authorAvatar) {
    const ext = /^a_/i.test(authorAvatar) ? "gif" : "png";
    authorAvatarUrl = `https://cdn.discordapp.com/avatars/${ownerUserId}/${authorAvatar}.${ext}?size=64`;
  }
  /* boardsListLite1: card → tagline/short desc only (skip full markdown payload) */
  const rawDesc = String(doc.boardMarkdown || doc.content || "");
  const description = card
    ? String(doc.boardTagline || "").trim() || rawDesc.slice(0, 280)
    : rawDesc;
  const out: Record<string, any> = {
    id: String(doc._id),
    kind: String(doc.boardKind || ""),
    discordId: String(doc.boardDiscordId || ""),
    slug: String(doc.boardSlug || ""),
    status: String(doc.status || ""),
    ownerUserId,
    authorName,
    authorAvatar,
    authorAvatarUrl,
    name: String(doc.title || ""),
    tagline: String(doc.boardTagline || ""),
    description,
    tags: Array.isArray(doc.boardTags) ? doc.boardTags.map(String).slice(0, card ? 12 : 48) : [],
    categories,
    locales,
    locale: locales[0] || String(doc.boardLocale || ""),
    visitorNotes: card ? "" : String(doc.boardVisitorNotes || ""),
    siteUrl: String(doc.boardSiteUrl || ""),
    socials,
    inviteUrl: String(doc.boardInviteUrl || ""),
    botInviteUrl: String(doc.boardBotInviteUrl || ""),
    bannerUrl: preferAnimatedDiscordMediaUrl(String(doc.boardBannerUrl || "")),
    iconUrl: preferAnimatedDiscordMediaUrl(String(doc.boardIconUrl || "")),
    nsfw: Boolean(doc.boardNsfw) || categories.includes("nsfw"),
    /* boardsFeatures1 */
    features: card ? [] : sanitizeBoardFeatures(doc.boardFeatures),
    score: Number(doc.boardScore) || 0,
    votes30d: Number(doc.boardVotes30d) || 0,
    /* boardsVoteFlow1 */
    votesMonth: listingVotesMonth(doc),
    votesMonthKey: voteCountMonthKeyRome(),
    bumps7d: Number(doc.boardBumps7d) || 0,
    bumpedAt: doc.boardBumpedAt ? new Date(doc.boardBumpedAt).toISOString() : null,
    ratingAvg: Number(doc.boardRatingAvg) || 0,
    reviewsCount: Number(doc.boardReviewsCount) || 0,
    accent: String(doc.boardAccent || ""),
    markdown: "",
    stats: card
      ? {}
      : doc.boardStats && typeof doc.boardStats === "object"
        ? doc.boardStats
        : {},
    checklist,
    createdAt: doc.createdAt ? new Date(doc.createdAt).toISOString() : null,
    updatedAt: doc.updatedAt ? new Date(doc.updatedAt).toISOString() : null,
  };
  if (opts.includeMod) {
    out.moderation = {
      notes: String(wf.notes || ""),
      reviewedBy: String(wf.reviewedBy || ""),
      reviewedAt: wf.reviewedAt ? String(wf.reviewedAt) : null,
      rejectReason: String(wf.rejectReason || doc.staffReason || ""),
    };
  }
  return out;
}

async function fetchManageableGuilds(accessToken?) {
  const token = String(accessToken || "").trim();
  if (!token) {
    return { ok: false, status: 401, error: "missing_token", message: "Sessione Discord mancante." };
  }
  try {
    const res = await fetch("https://discord.com/api/v10/users/@me/guilds", {
      headers: {
        Authorization: `Bearer ${token}`,
        Accept: "application/json",
        "User-Agent": "DiscordBot (https://www.viniliecaffe.it, 1.0)",
      },
    });
    if (res.status === 401 || res.status === 403) {
      /* Discord spesso risponde 401 anche senza scope guilds (non solo token scaduto) */
      return {
        ok: false,
        status: res.status === 403 ? 403 : 401,
        error: "missing_guilds_scope",
        message:
          "Serve il permesso guilds: clicca “Rifai login Discord” e autorizza l’accesso ai tuoi server.",
      };
    }
    if (!res.ok) {
      return { ok: false, status: 502, error: "discord_guilds_failed", message: "Impossibile recuperare i server." };
    }
    const json: any = await res.json();
    /* boardsOwnerOnly1: solo server di cui l’utente è owner Discord (no admin / gestisci server) */
    const guilds = (Array.isArray(json) ? json : []).filter((row?) => row?.owner === true);
    return { ok: true, guilds };
  } catch {
    return { ok: false, status: 502, error: "discord_unreachable", message: "Discord non raggiungibile." };
  }
}

async function assertBotInGuild(client?, guildId?) {
  const gid = String(guildId || "").trim();
  if (!snowflakeOk(gid) || !client) return false;
  try {
    await syncKnownBotGuildIdsFromRest(client).catch(() => null);
  } catch (_) {}
  const known = buildKnownBotGuildIdSet(client);
  if (known.has(gid)) return true;
  try {
    const g = client.guilds.cache.get(gid) || (await fetchGuildPreferLite(client, gid));
    return Boolean(g);
  } catch {
    return false;
  }
}

async function assertCanClaimServer(client?, accessToken?, discordId?) {
  const gid = String(discordId || "").trim();
  if (!snowflakeOk(gid)) {
    return { ok: false, status: 400, error: "invalid_discord_id", message: "ID server non valido." };
  }
  const list = await fetchManageableGuilds(accessToken);
  if (!list?.ok) {
    return {
      ok: false,
      status: Number(list?.status) || 403,
      error: list?.error || "guilds_failed",
      message: list?.message || "Impossibile verificare i tuoi server.",
    };
  }
  const match = (Array.isArray(list.guilds) ? list.guilds : []).find((g?) => String(g?.id || "") === gid);
  if (!match) {
    return {
      ok: false,
      status: 403,
      error: "not_owner",
      message: "Puoi pubblicare solo server di cui sei il proprietario Discord.",
    };
  }
  const botOk = await assertBotInGuild(client, gid);
  if (!botOk) {
    return {
      ok: false,
      status: 403,
      error: "bot_not_in_guild",
      message:
        "Il bot Vinili & Caffè deve essere presente nel server. Invitalo e riprova.",
    };
  }
  return {
    ok: true,
    guild: match,
    name: String(match.name || "").trim() || `Server ${gid}`,
    iconUrl: match.icon ? discordGuildIconUrl(gid, match.icon, 128) : "",
    botPresent: true,
  };
}

function inviteUrlFromCode(code?) {
  const c = String(code || "").trim().replace(/^https?:\/\/(www\.)?discord\.(gg|com)\/(invite\/)?/i, "");
  if (!c || /[^a-zA-Z0-9-]/i.test(c) || c.length > 64) return "";
  return sanitizeUrl(`https://discord.gg/${c}`);
}

function discordInviteErrorMessage(err?) {
  const code = Number(err?.code || err?.rawError?.code || 0) || 0;
  const raw = String(err?.message || err?.rawError?.message || "").trim();
  if (code === 50013 || /missing permissions/i.test(raw)) {
    return "Al bot mancano i permessi per creare invite. Incolla un link manualmente o dai Crea invito.";
  }
  if (code === 50001 || /missing access/i.test(raw)) {
    return "Il bot non ha accesso a nessun canale adatto. Incolla un invite manualmente.";
  }
  if (code === 30016 || /max number of invites/i.test(raw)) {
    return "Il server ha troppi invite attivi. Usa un invite esistente o cancellane alcuni.";
  }
  if (code === 50055 || /invite/i.test(raw) && /disabled/i.test(raw)) {
    return "Gli invite sono disabilitati su questo server. Incolla un link manualmente.";
  }
  if (/createInvite is not a function|invites\.create is not a function/i.test(raw)) {
    return "Nessun canale adatto per creare invite. Incolla un link manualmente.";
  }
  if (raw && raw.length < 180 && !/^error$/i.test(raw) && !/is not a function/i.test(raw)) return raw;
  return "Impossibile generare l’invite. Incollalo manualmente.";
}

async function generateInvite(client?, payload: Record<string, any> = {}) {
  /* boardsGenInvite3: SEMPRE invite nuovo infinito (no vanity / no riuso esistenti) */
  /* boardsGenInvite4: no thread (createInvite missing) + guild.invites.create */
  /* boardsGenInvite5: site-api usa client._rest (non client.rest) */
  /* boardsGenInvite6: no stub cache (members undefined) + me opzionale */
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const auth = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;
  const id = String(payload.listingId || payload.id || "").trim();
  let guildId = String(payload.guildId || payload.discordId || "").trim();
  let doc = null;
  if (mongoose.isValidObjectId(id)) {
    doc = await SiteDocument.findOne({ _id: id, docType: BL });
    if (!doc) return { ok: false, status: 404, error: "not_found", message: "Scheda non trovata." };
    if (String(doc.userId) !== auth.userId) {
      return { ok: false, status: 403, error: "forbidden", message: "Non sei il proprietario di questa scheda." };
    }
    if (String(doc.boardKind) !== "server") {
      return { ok: false, status: 400, error: "not_server", message: "Invite auto solo per schede server." };
    }
    guildId = String(doc.boardDiscordId || guildId || "").trim();
  }
  if (!snowflakeOk(guildId)) {
    return { ok: false, status: 400, error: "invalid_guild", message: "Server non valido." };
  }
  const claim = await assertCanClaimServer(client, payload.accessToken, guildId);
  if (!claim.ok) return claim;

  let guild = null;
  try {
    /* boardsGenInvite6: site-api cache ha stub partial senza members → forza fetch completo */
    const cached = client.guilds?.cache?.get?.(guildId) || null;
    const needsFull =
      !cached ||
      cached.partial === true ||
      !cached.members ||
      typeof cached.members.fetch !== "function";
    guild = needsFull ? await client.guilds.fetch(guildId) : cached;
  } catch (_) {
    guild = null;
  }
  if (!guild) {
    return {
      ok: false,
      status: 403,
      error: "bot_not_in_guild",
      message: "Il bot non è nel server: invita Vinili & Caffè e riprova.",
      inviteBotUrl: viniliBotInviteUrl(client, guildId),
    };
  }

  const finish = async (inviteUrl?) => {
    const url = sanitizeUrl(inviteUrl) || inviteUrlFromCode(inviteUrl);
    if (!url) {
      return { ok: false, status: 502, error: "invite_failed", message: "Invite creato ma URL non valido." };
    }
    const bannerUrl = discordGuildBannerUrl(guild) || "";
    if (doc) {
      doc.boardInviteUrl = url;
      if (bannerUrl && !String(doc.boardBannerUrl || "").trim()) doc.boardBannerUrl = bannerUrl;
      await doc.save();
      return {
        ok: true,
        status: 200,
        inviteUrl: url,
        bannerUrl,
        listing: serializeListing(doc.toObject(), { includeMod: true }),
      };
    }
    return { ok: true, status: 200, inviteUrl: url, bannerUrl, guildId };
  };

  try {
    if (typeof guild.channels?.fetch === "function") {
      await guild.channels.fetch().catch(() => null);
    }
  } catch (_) {}

  let me = guild.members?.me || null;
  if (!me && typeof guild.members?.fetchMe === "function") {
    me = await guild.members.fetchMe().catch(() => null);
  }
  if (!me && typeof guild.members?.fetch === "function") {
    const meId = String(client?.user?.id || "").trim();
    if (meId) me = await guild.members.fetch(meId).catch(() => null);
  }
  /* boardsGenInvite6: senza me (REST stub) prova createInvite e lascia fallire i 403 */

  const canInvite = (ch?) => {
    if (!ch || ch.type === ChannelType.GuildCategory) return false;
    /* boardsGenInvite4: i thread sono textBased ma NON hanno createInvite */
    try {
      if (typeof ch.isThread === "function" && ch.isThread()) return false;
    } catch (_) {}
    const t = ch.type;
    if (
      t === ChannelType.PublicThread ||
      t === ChannelType.PrivateThread ||
      t === ChannelType.AnnouncementThread
    ) {
      return false;
    }
    const usable =
      t === ChannelType.GuildText ||
      t === ChannelType.GuildAnnouncement ||
      t === ChannelType.GuildForum ||
      t === ChannelType.GuildVoice ||
      t === ChannelType.GuildStageVoice ||
      t === ChannelType.GuildMedia;
    if (!usable) return false;
    if (!me) return true;
    try {
      return Boolean(ch.permissionsFor(me)?.has?.(PermissionFlagsBits.CreateInstantInvite));
    } catch {
      return false;
    }
  };

  const ranked = [...guild.channels.cache.values()]
    .filter(canInvite)
    .sort((a?, b?) => {
      const score = (ch?) => {
        if (guild.systemChannelId && String(ch.id) === String(guild.systemChannelId)) return 0;
        if (guild.rulesChannelId && String(ch.id) === String(guild.rulesChannelId)) return 1;
        if (ch.type === ChannelType.GuildText) return 2;
        if (ch.type === ChannelType.GuildAnnouncement) return 3;
        return 9;
      };
      return score(a) - score(b) || Number(a.rawPosition ?? a.position ?? 0) - Number(b.rawPosition ?? b.position ?? 0);
    });

  if (!ranked.length) {
    return {
      ok: false,
      status: 403,
      error: "no_invite_channel",
      message:
        "Nessun canale dove il bot può creare un invite. Dai a Vinili il permesso “Crea invito” oppure incolla un link manualmente.",
    };
  }

  const inviteOpts = {
    maxAge: 0,
    maxUses: 0,
    unique: true,
    temporary: false,
    reason: `Vetrina Vinili — nuovo invite — ${auth.userId}`,
  };

  async function createInviteOnChannel(channel?) {
    const chId = String(channel?.id || "").trim();
    if (!chId) throw new Error("missing_channel");
    const rest = client?._rest || guild?.client?._rest || client?.rest;
    /* boardsGenInvite6: su site-api preferisci REST diretto (canali/cache senza createInvite) */
    if (client?._isSiteApiRestClient && rest && typeof rest.post === "function") {
      const { Routes } = require("discord.js") as typeof import("discord.js");
      const data = await rest.post(Routes.channelInvites(chId), {
        body: {
          max_age: inviteOpts.maxAge,
          max_uses: inviteOpts.maxUses,
          unique: inviteOpts.unique,
          temporary: inviteOpts.temporary,
        },
        reason: inviteOpts.reason,
      });
      const code = String(data?.code || "").trim();
      return {
        code,
        url: code ? `https://discord.gg/${code}` : "",
      };
    }
    if (typeof channel.createInvite === "function") {
      return channel.createInvite(inviteOpts);
    }
    if (typeof guild.invites?.create === "function") {
      return guild.invites.create(chId, inviteOpts);
    }
    if (rest && typeof rest.post === "function") {
      const { Routes } = require("discord.js") as typeof import("discord.js");
      const data = await rest.post(Routes.channelInvites(chId), {
        body: {
          max_age: inviteOpts.maxAge,
          max_uses: inviteOpts.maxUses,
          unique: inviteOpts.unique,
          temporary: inviteOpts.temporary,
        },
        reason: inviteOpts.reason,
      });
      const code = String(data?.code || "").trim();
      return {
        code,
        url: code ? `https://discord.gg/${code}` : "",
      };
    }
    throw new Error("createInvite unavailable");
  }

  let lastErr = null;
  for (const channel of ranked.slice(0, 8)) {
    try {
      const invite = await createInviteOnChannel(channel);
      const inviteUrl =
        sanitizeUrl(invite?.url) ||
        inviteUrlFromCode(invite?.code) ||
        inviteUrlFromCode(String(invite?.url || "").split("/").pop());
      if (inviteUrl) return finish(inviteUrl);
    } catch (err) {
      lastErr = err;
      global.logger?.warn?.(
        "[BOARDS] generate-invite channel fail",
        guildId,
        channel?.id,
        err?.code || "",
        err?.message || err,
      );
    }
  }

  return {
    ok: false,
    status: 502,
    error: "invite_failed",
    message: discordInviteErrorMessage(lastErr),
    discordCode: Number(lastErr?.code || lastErr?.rawError?.code || 0) || undefined,
  };
}

async function guildBoardDefaults(client?, payload: Record<string, any> = {}) {
  /* boardsFormPrefill1: invite vanity/banner per form */
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const auth = await resolveBoardsUser(payload.accessToken);
  if (!auth.ok) return auth;
  const guildId = String(payload.guildId || payload.discordId || "").trim();
  if (!snowflakeOk(guildId)) {
    return { ok: false, status: 400, error: "invalid_guild", message: "Server non valido." };
  }
  const claim = await assertCanClaimServer(client, payload.accessToken, guildId);
  if (!claim.ok) return claim;
  const defs = await resolveGuildBoardDefaults(client, guildId);
  let inviteUrl = defs.inviteUrl || "";
  if (!inviteUrl) {
    const gen: any = await generateInvite(client, {
      accessToken: payload.accessToken,
      guildId,
    });
    if (gen?.ok && gen.inviteUrl) inviteUrl = gen.inviteUrl;
  }
  return {
    ok: true,
    status: 200,
    guildId,
    inviteUrl: inviteUrl || "",
    bannerUrl: defs.bannerUrl || "",
    siteUrl: defs.siteUrl || "",
    name: claim.name || "",
    iconUrl: claim.iconUrl || "",
  };
}

export = { MAIN_GUILD_SITE, resolveGuildBoardDefaults, viniliBotInviteUrl, listingChecklist, serializeListing, fetchManageableGuilds, assertBotInGuild, assertCanClaimServer, generateInvite, guildBoardDefaults };
