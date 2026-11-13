const { Routes } = require("discord.js") as typeof import("discord.js");
const { isViniliFullFeatureGuild } = require("../../core/guildFeatureScope") as typeof import("../../core/guildFeatureScope");
const { isViniliProtectedGuild } = require("../../core/viniliProtectedGuilds") as typeof import("../../core/viniliProtectedGuilds");
const {
  DEFAULT_PREFIX,
  PREFIX_MAX_LEN,
  getTenantSettingsSnapshotSync,
  refreshTenantGuildSettingsCache,
  setTenantPrefix,
  setTenantDashboardRoles,
  setTenantDashboardUsers,
  setTenantUpdatesChannel,
  setTenantBoards,
  normalizePrefix,
  normalizeRoleId,
  normalizeRoleIdList,
  normalizeUserIdList,
  normalizeChannelId,
  normalizeBoardsMode,
} = require("../../core/tenantGuildSettings") as typeof import("../../core/tenantGuildSettings");
const { verifyDashboardGuildAccess } = require("./siteDashboardApi") as typeof import("./siteDashboardApi");
const { listGuildPickerData } = require("../../../Vinili/Partner/dashboard/siteDashboardPartnershipApi") as typeof import("../../../Vinili/Partner/dashboard/siteDashboardPartnershipApi");
const {
  ensureTenantPremiumCacheFresh,
  getTenantPremiumSync,
  serializePremiumPublic,
  isTenantPremiumActiveSync,
} = require("../../core/tenantPremium") as typeof import("../../core/tenantPremium");
const {
  ensureTenantPremiumIdentityCacheFresh,
  getTenantPremiumIdentitySync,
  patchTenantPremiumIdentity,
  identityHasCustom,
} = require("../../core/tenantPremiumIdentity") as typeof import("../../core/tenantPremiumIdentity");

const REASON_MESSAGES = {
  protected_guild: "Questa impostazione non è disponibile su questo server.",
  mongo_not_ready: "Database non disponibile. Riprova tra poco.",
  persist_failed: "Salvataggio non riuscito. Riprova.",
  invalid_channel: "Canale non valido.",
  invalid_role: "Ruolo non valido.",
  role_managed:
    "Non puoi selezionare ruoli gestiti da un bot o da un’integrazione.",
  invalid_user: "Utente non valido.",
  too_many_users: "Puoi aggiungere al massimo 25 utenti per l’accesso dashboard.",
  invalid_prefix: `Prefix non valido (1–${PREFIX_MAX_LEN} caratteri, senza spazi).`,
  invalid_boards: "Configurazione bacheca non valida.",
  main_guild: "Il server principale non usa queste impostazioni.",
  bot_missing: "Il bot non è presente in questo server.",
  nick_too_long: "Il nickname può avere al massimo 32 caratteri.",
  avatar_invalid: "Avatar non valido. Usa un’immagine PNG, JPG o GIF (max ~8 MB).",
  avatar_failed: "Impossibile aggiornare l’avatar sul server.",
  banner_invalid: "Banner non valido. Usa un’immagine PNG, JPG o GIF (max ~8 MB).",
  banner_failed: "Impossibile aggiornare il banner sul server.",
  nick_failed: "Impossibile aggiornare il nickname sul server.",
  premium_required:
    "Questa personalizzazione richiede Vinili Premium (nickname, avatar e banner). Il prefisso resta gratuito.",
};

function reasonToMessage(reason?) {
  return REASON_MESSAGES[String(reason || "")] || "Operazione non riuscita.";
}

/* stato del bot com'è ora su Discord (anteprima live in dashboard): online/assente/occupato + attività */
const ACTIVITY_PREFIX: Record<number, string> = { 0: "Gioca a ", 1: "In diretta: ", 2: "Ascolta ", 3: "Guarda ", 5: "Compete in " };
const VALID_DASH_PRESENCE = new Set(["online", "idle", "dnd", "invisible", "offline"]);

function formatPresenceActivityText(act?) {
  if (!act || typeof act !== "object") return "";
  const type = Number(act.type);
  let text = "";
  if (type === 4) text = String(act.state || act.name || "").trim();
  else text = `${ACTIVITY_PREFIX[type] || ""}${String(act.name || "").trim()}`.trim();
  if (type !== 4 && act.state) text = `${text} · ${String(act.state).trim()}`;
  return text.slice(0, 128);
}

function readConfiguredBotPresence(client?) {
  try {
    const {
      resolveBotPresenceStatus,
      buildBotPresenceActivities,
    } = require("../../../shared/discord/botPresenceActivity") as typeof import("../../../shared/discord/botPresenceActivity");
    const status = resolveBotPresenceStatus(client);
    const acts = buildBotPresenceActivities(client);
    return { status, text: formatPresenceActivityText(acts?.[0]) };
  } catch {
    const raw = String(client?.config?.status || "idle").trim().toLowerCase();
    const status = VALID_DASH_PRESENCE.has(raw) ? raw : "idle";
    const name = String(client?.config?.presence?.activityName || "").trim();
    return { status, text: name ? `Guarda ${name}`.slice(0, 128) : "" };
  }
}

function readBotPresence(client?) {
  try {
    /* site-api è REST-only: non ha Gateway → client.user.presence è sempre offline.
       L'anteprima usa allora lo status/attività configurati (quelli applicati da bots-vinyls). */
    if (client?._isSiteApiRestClient === true) {
      return readConfiguredBotPresence(client);
    }
    const presence = client?.presence || client?.user?.presence;
    let status = String(presence?.status || "").trim().toLowerCase();
    if (!VALID_DASH_PRESENCE.has(status)) {
      status = client?.isReady?.() ? "online" : "offline";
    }
    const acts = Array.isArray(presence?.activities) ? presence.activities : [];
    const text = formatPresenceActivityText(acts[0]);
    if ((status === "offline" || status === "invisible") && client?.user) {
      const configured = readConfiguredBotPresence(client);
      if (configured.status && configured.status !== "offline" && configured.status !== "invisible") {
        return configured;
      }
    }
    return { status, text };
  } catch (_) {
    return readConfiguredBotPresence(client);
  }
}

function fail(status?, error?, message?) {
  return { ok: false, status, error, message };
}

function parseOptionalId(value?) {
  if (value === null || value === undefined || value === "" || value === "off" || value === "null") {
    return { clear: true, id: null };
  }
  const id = String(value).trim();
  if (!/^\d{16,22}$/.test(id)) return { clear: false, id: null, invalid: true };
  return { clear: false, id };
}

function guildMemberAvatarUrl(guildId?, userId?, avatarHash?, userAvatarHash?, size = 128) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (avatarHash && gid && uid) {
    const ext = String(avatarHash).startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/guilds/${gid}/users/${uid}/avatars/${avatarHash}.${ext}?size=${size}`;
  }
  if (userAvatarHash && uid) {
    const ext = String(userAvatarHash).startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/avatars/${uid}/${userAvatarHash}.${ext}?size=${size}`;
  }
  if (uid) {
    try {
      const idx = Number((BigInt(uid) >> 22n) % 6n);
      return `https://cdn.discordapp.com/embed/avatars/${idx}.png`;
    } catch {
      return null;
    }
  }
  return null;
}

function guildMemberBannerUrl(guildId?, userId?, bannerHash?, userBannerHash?, size = 512) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (bannerHash && gid && uid) {
    const ext = String(bannerHash).startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/guilds/${gid}/users/${uid}/banners/${bannerHash}.${ext}?size=${size}`;
  }
  if (userBannerHash && uid) {
    const ext = String(userBannerHash).startsWith("a_") ? "gif" : "png";
    return `https://cdn.discordapp.com/banners/${uid}/${userBannerHash}.${ext}?size=${size}`;
  }
  return null;
}

async function resolveGuildOrFail(client?, guildId?) {
  return (
    client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null)) || null
  );
}

/** Proprietario del server: ha sempre accesso alla dashboard, la mostra come voce fissa. */
async function readGuildOwner(client?, guildId?) {
  const gid = String(guildId || "");
  const rest = client?._rest || client?.rest;
  let ownerId = String(client?.guilds?.cache?.get?.(gid)?.ownerId || "");
  if (!ownerId && rest) {
    const g: any = await rest.get(Routes.guild(gid)).catch(() => null);
    ownerId = String(g?.owner_id || "");
  }
  if (!ownerId) return null;
  let label = ownerId;
  const cached = client?.users?.cache?.get?.(ownerId);
  const u: any = cached || (rest ? await rest.get(Routes.user(ownerId)).catch(() => null) : null);
  if (u) label = String(u.globalName || u.global_name || u.username || ownerId);
  return { id: ownerId, label };
}

/** Lingua Discord del server (preferred_locale) mappata ai codici tenant (it/en/…). */
async function readGuildDiscordLanguage(client?, guildId?) {
  const gid = String(guildId || "");
  let raw =
    client?.guilds?.cache?.get?.(gid)?.preferredLocale ||
    client?.guilds?.cache?.get?.(gid)?.preferred_locale ||
    "";
  if (!raw) {
    const rest = client?._rest || client?.rest;
    if (rest) {
      const g: any = await rest.get(Routes.guild(gid)).catch(() => null);
      raw = g?.preferred_locale || g?.preferredLocale || "";
    }
  }
  try {
    const { mapDiscordLocaleToTenantLanguage } = require("../../../Vinili/Partner/i18n/tenantPartnershipI18n/languages") as typeof import("../../../Vinili/Partner/i18n/tenantPartnershipI18n/languages");
    return mapDiscordLocaleToTenantLanguage(raw);
  } catch {
    const base = String(raw || "")
      .trim()
      .toLowerCase()
      .split("-")[0];
    return /^[a-z]{2}$/.test(base) ? base : null;
  }
}

async function readBotGuildIdentity(client?, guildId?) {
  const botId = String(client?.user?.id || "").trim();
  let nickname = null;
  let guildAvatarHash = null;
  let guildBannerHash = null;
  let userAvatarHash = client?.user?.avatar || null;
  let userBannerHash = client?.user?.banner || null;

      const rest = client?._rest || client?.rest;
  if (rest && botId) {
    try {
      const raw = await rest.get(Routes.guildMember(String(guildId), botId));
      if (raw && typeof raw === "object") {
        nickname = raw.nick != null ? String(raw.nick) : null;
        guildAvatarHash = raw.avatar || null;
        guildBannerHash = raw.banner || null;
        if (raw.user?.avatar) userAvatarHash = raw.user.avatar;
        if (raw.user?.banner) userBannerHash = raw.user.banner;
      }
    } catch (_) {}
  }

  if (!userBannerHash && rest) {
    try {
      const meUser = await rest.get(Routes.user("@me"));
      if (meUser?.banner) userBannerHash = meUser.banner;
      if (meUser?.avatar) userAvatarHash = meUser.avatar;
    } catch (_) {}
  }

  if (guildAvatarHash == null || guildBannerHash == null || nickname === undefined) {
    try {
      const guild = await resolveGuildOrFail(client, guildId);
      const me =
        guild?.members?.me ||
        (guild?.members?.fetch && botId ? await guild.members.fetch(botId).catch(() => null) : null);
      if (me) {
        if (nickname == null) nickname = me.nickname || null;
        if (!guildAvatarHash) guildAvatarHash = me.avatar || null;
        if (!guildBannerHash) guildBannerHash = me.banner || null;
        if (!userAvatarHash && me.user?.avatar) userAvatarHash = me.user.avatar;
        if (!userBannerHash && me.user?.banner) userBannerHash = me.user.banner;
      }
    } catch (_) {}
  }

  const hasGuildAvatar = Boolean(guildAvatarHash);
  const hasGuildBanner = Boolean(guildBannerHash);
  let avatarUrl = guildMemberAvatarUrl(
    guildId,
    botId,
    guildAvatarHash,
    userAvatarHash,
    128,
  );
  if (!avatarUrl && typeof client?.user?.displayAvatarURL === "function") {
    avatarUrl = client.user.displayAvatarURL({ size: 128 });
  }
    if (avatarUrl) {
    const stamp = String(guildAvatarHash || userAvatarHash || Date.now());
    avatarUrl = `${avatarUrl}${avatarUrl.includes("?") ? "&" : "?"}v=${encodeURIComponent(stamp)}`;
  }

  let bannerUrl = guildMemberBannerUrl(
    guildId,
    botId,
    guildBannerHash,
    userBannerHash,
    512,
  );
  if (bannerUrl) {
    const stamp = String(guildBannerHash || userBannerHash || Date.now());
    bannerUrl = `${bannerUrl}${bannerUrl.includes("?") ? "&" : "?"}v=${encodeURIComponent(stamp)}`;
  }

  return {
    botNickname: nickname,
    botAvatarUrl: avatarUrl,
    hasGuildAvatar,
    botBannerUrl: bannerUrl,
    hasGuildBanner,
    botUsername: String(client?.user?.username || "").trim() || null,
  };
}

function normalizeAvatarDataUri(value?) {
  if (value === null || value === undefined || value === "" || value === "null") {
    return { clear: true, dataUri: null };
  }
  const raw = String(value).trim();
  if (!raw) return { clear: true, dataUri: null };
  const m = raw.match(/^data:(image\/(?:png|jpeg|jpg|gif));base64,([A-Za-z0-9+/=\s]+)$/i);
  if (!m) return { invalid: true };
  const b64 = m[2].replace(/\s+/g, "");
    if (b64.length > 11_000_000) return { invalid: true, tooLarge: true };
  const mime = m[1].toLowerCase().replace("image/jpg", "image/jpeg");
  return { clear: false, dataUri: `data:${mime};base64,${b64}` };
}

async function patchBotGuildIdentity(client, guildId, { nick, avatar, banner }) {
  const body: Record<string, any> = {};
  if (nick !== undefined) body.nick = nick;
  if (avatar !== undefined) body.avatar = avatar;
  if (banner !== undefined) body.banner = banner;

  if (!Object.keys(body).length) return { ok: true };

  const rest = client?._rest || client?.rest;
    if (rest) {
    try {
      await rest.patch(Routes.guildMember(String(guildId), "@me"), { body });
      return { ok: true };
    } catch (err) {
      global.logger?.warn?.("[DASHBOARD] REST identity:", err?.message || err);
    }
  }

  try {
    const guild = await resolveGuildOrFail(client, guildId);
    if (guild?.members?.editMe) {
      await guild.members.editMe(body);
      return { ok: true };
    }
  } catch (err) {
    global.logger?.warn?.("[DASHBOARD] editMe identity:", err?.message || err);
  }

  if (banner !== undefined) return { ok: false, reason: "banner_failed" };
  if (avatar !== undefined) return { ok: false, reason: "avatar_failed" };
  return { ok: false, reason: "nick_failed" };
}

async function getDashboardGuildSettings(client?, accessToken?, guildId?) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) return access;

  if (!access.botPresent) {
    return fail(400, "bot_missing", reasonToMessage("bot_missing"));
  }

  await refreshTenantGuildSettingsCache().catch(() => null);
  await ensureTenantPremiumCacheFresh().catch(() => null);
  await ensureTenantPremiumIdentityCacheFresh().catch(() => null);
  const snapshot = getTenantSettingsSnapshotSync(access.guildId);
  const identity = await readBotGuildIdentity(client, access.guildId);
  const protectedGuild =
    isViniliFullFeatureGuild(access.guildId) || isViniliProtectedGuild(access.guildId);
    const premium = protectedGuild
    ? { active: true, plan: "premium", until: null }
    : serializePremiumPublic(getTenantPremiumSync(access.guildId));
  const savedIdentity = protectedGuild
    ? null
    : getTenantPremiumIdentitySync(access.guildId);
  const showSavedWhileSuspended =
    !protectedGuild &&
    premium.active !== true &&
    identityHasCustom(savedIdentity);

  let pickers = { textChannels: [], categories: [], roles: [] };
  const [guildOwner, discordLanguage] = await Promise.all([
    readGuildOwner(client, access.guildId).catch(() => null),
    readGuildDiscordLanguage(client, access.guildId).catch(() => null),
  ]);
  try {
    pickers = await listGuildPickerData(client, access.guildId);
  } catch (err) {
    global.logger?.warn?.("[DASHBOARD] settings listGuildPickerData:", err?.message || err);
  }

  return {
    ok: true,
    status: 200,
    guildId: access.guildId,
    premium,
    protectedGuild,
    settings: {
      prefix: snapshot.prefix || DEFAULT_PREFIX,
      prefixMaxLength: PREFIX_MAX_LEN,
      dashboardRoleId: snapshot.dashboardRoleId,
      dashboardRoleIds: Array.isArray(snapshot.dashboardRoleIds) ? snapshot.dashboardRoleIds : [],
      dashboardUserIds: Array.isArray(snapshot.dashboardUserIds) ? snapshot.dashboardUserIds : [],
      dashboardRolesConfigured: snapshot.dashboardRolesConfigured === true,
      guildOwner,
      updatesChannelId: snapshot.updatesChannelId,
      language: snapshot.language ?? null,
      discordLanguage,
      timezone: snapshot.timezone || "Europe/Rome",
      boards: snapshot.boards || {
        enabled: false,
        mode: "shared",
        sharedChannelId: null,
        quoteChannelId: null,
        repostChannelId: null,
        clipChannelId: null,
        skullChannelId: null,
        features: { quote: true, repost: true, clip: true, skull: true },
        quoteStyle: {
          bg: "black",
          font: "sans",
          bold: true,
          flip: false,
          orientation: "horizontal",
        },
      },
      botNickname: showSavedWhileSuspended ? savedIdentity.nick : identity.botNickname,
      botAvatarUrl: showSavedWhileSuspended
        ? savedIdentity.avatar || identity.botAvatarUrl
        : identity.botAvatarUrl,
      hasGuildAvatar: showSavedWhileSuspended
        ? Boolean(savedIdentity.avatar)
        : identity.hasGuildAvatar,
      botBannerUrl: showSavedWhileSuspended
        ? savedIdentity.banner || identity.botBannerUrl
        : identity.botBannerUrl,
      hasGuildBanner: showSavedWhileSuspended
        ? Boolean(savedIdentity.banner)
        : identity.hasGuildBanner,
      botUsername: identity.botUsername,
      botPresence: readBotPresence(client),
      identitySuspended: showSavedWhileSuspended,
            prefixLocked: protectedGuild,
      rolesLocked: false,
    },
    pickers,
  };
}

async function patchDashboardGuildSettings(client?, accessToken?, guildId?, body?) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) return access;

  if (!access.botPresent) {
    return fail(400, "bot_missing", reasonToMessage("bot_missing"));
  }

  const gid = access.guildId;
  const protectedGuild =
    isViniliFullFeatureGuild(gid) || isViniliProtectedGuild(gid);
  const patch = body && typeof body === "object" ? body : {};

  if (!protectedGuild && Object.prototype.hasOwnProperty.call(patch, "prefix")) {
    const parsed = normalizePrefix(patch.prefix);
    if (!parsed.ok) return fail(400, "invalid_prefix", reasonToMessage("invalid_prefix"));
    const saved: any = await setTenantPrefix(gid, parsed.prefix);
    if (!saved.ok) return fail(400, saved.reason || "persist_failed", reasonToMessage(saved.reason));
  }

  if (
    Object.prototype.hasOwnProperty.call(patch, "dashboardRoleIds") ||
    Object.prototype.hasOwnProperty.call(patch, "dashboardRoleId")
  ) {
    let roleIds = [];
    if (Object.prototype.hasOwnProperty.call(patch, "dashboardRoleIds")) {
      roleIds = normalizeRoleIdList(patch.dashboardRoleIds);
      if (Array.isArray(patch.dashboardRoleIds) && patch.dashboardRoleIds.length && !roleIds.length) {
        return fail(400, "invalid_role", reasonToMessage("invalid_role"));
      }
    } else {
      const parsed = parseOptionalId(patch.dashboardRoleId);
      if (parsed.invalid) return fail(400, "invalid_role", reasonToMessage("invalid_role"));
      const roleId = parsed.clear ? null : normalizeRoleId(parsed.id);
      if (!parsed.clear && !roleId) return fail(400, "invalid_role", reasonToMessage("invalid_role"));
      roleIds = roleId ? [roleId] : [];
    }
    if (roleIds.length) {
      const guild = await resolveGuildOrFail(client, gid);
      if (!guild) return fail(400, "bot_missing", reasonToMessage("bot_missing"));
      let roleList = [];
      try {
        if (guild.roles?.cache?.size) {
          roleList = [...guild.roles.cache.values()];
        } else {
          const fetched = await guild.roles.fetch();
          roleList = fetched && typeof fetched.values === "function" ? [...fetched.values()] : [];
        }
      } catch {
        roleList = guild.roles?.cache?.size ? [...guild.roles.cache.values()] : [];
      }
      const byId = new Map(roleList.map((r?) => [String(r.id), r]));
      for (const rid of roleIds) {
        const role = byId.get(String(rid));
        if (!role) return fail(400, "invalid_role", reasonToMessage("invalid_role"));
        if (role.managed) {
          return fail(400, "role_managed", reasonToMessage("role_managed"));
        }
      }
    }
    const saved: any = await setTenantDashboardRoles(gid, roleIds);
    if (!saved.ok) return fail(400, saved.reason || "persist_failed", reasonToMessage(saved.reason));
  }

  if (Object.prototype.hasOwnProperty.call(patch, "dashboardUserIds")) {
    const userIds = normalizeUserIdList(patch.dashboardUserIds);
    if (Array.isArray(patch.dashboardUserIds) && patch.dashboardUserIds.length && !userIds.length) {
      return fail(400, "invalid_user", reasonToMessage("invalid_user"));
    }
    if (userIds.length > 25) {
      return fail(400, "too_many_users", reasonToMessage("too_many_users"));
    }
    const savedUsers: any = await setTenantDashboardUsers(gid, userIds);
    if (!savedUsers.ok) {
      return fail(400, savedUsers.reason || "persist_failed", reasonToMessage(savedUsers.reason));
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, "language") || Object.prototype.hasOwnProperty.call(patch, "timezone")) {
    const { setTenantLocaleSettings } = require("../../core/tenantGuildSettings") as typeof import("../../core/tenantGuildSettings");
    const localePatch: { language?: unknown; timezone?: unknown } = {};
    if (Object.prototype.hasOwnProperty.call(patch, "language")) localePatch.language = patch.language;
    if (Object.prototype.hasOwnProperty.call(patch, "timezone")) localePatch.timezone = patch.timezone;
    const saved: any = await setTenantLocaleSettings(gid, localePatch);
    if (!saved.ok) {
      const msg = saved.reason === "invalid_language" ? "Lingua non valida." : saved.reason === "invalid_timezone" ? "Fuso orario non valido." : reasonToMessage(saved.reason);
      return fail(400, saved.reason || "persist_failed", msg);
    }
  }

  if (!protectedGuild && Object.prototype.hasOwnProperty.call(patch, "updatesChannelId")) {
    const parsed = parseOptionalId(patch.updatesChannelId);
    if (parsed.invalid) return fail(400, "invalid_channel", reasonToMessage("invalid_channel"));
    const channelId = parsed.clear ? null : normalizeChannelId(parsed.id);
    if (!parsed.clear && !channelId) {
      return fail(400, "invalid_channel", reasonToMessage("invalid_channel"));
    }
    const saved: any = await setTenantUpdatesChannel(gid, channelId);
    if (!saved.ok) return fail(400, saved.reason || "persist_failed", reasonToMessage(saved.reason));

    try {
      const {
        ensureTenantUpdatesWebhook,
        clearTenantUpdatesWebhook,
      } = require("../../../Vinili/Community/services/botUpdatesRelayService") as typeof import("../../../Vinili/Community/services/botUpdatesRelayService");
      if (channelId) {
        const ensured = await ensureTenantUpdatesWebhook(client, gid, channelId);
        if (!ensured.ok) {
          global.logger?.warn?.(
            `[dashboard settings] updates webhook guild=${gid}:`,
            ensured.reason || "failed",
          );
        }
      } else {
        await clearTenantUpdatesWebhook(client, gid);
      }
    } catch (err) {
      global.logger?.warn?.("[dashboard settings] updates webhook:", err?.message || err);
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, "boards")) {
    const boardsRaw = patch.boards;
    if (!boardsRaw || typeof boardsRaw !== "object" || Array.isArray(boardsRaw)) {
      return fail(400, "invalid_boards", reasonToMessage("invalid_boards"));
    }
    const boardsPatch: Record<string, any> = {};
    if (Object.prototype.hasOwnProperty.call(boardsRaw, "enabled")) {
      boardsPatch.enabled = boardsRaw.enabled !== false;
    }
    if (Object.prototype.hasOwnProperty.call(boardsRaw, "features")) {
      boardsPatch.features = boardsRaw.features;
    }
    if (Object.prototype.hasOwnProperty.call(boardsRaw, "clipTranscription")) {
      boardsPatch.clipTranscription = boardsRaw.clipTranscription !== false;
    }
    if (Object.prototype.hasOwnProperty.call(boardsRaw, "quoteStyle")) {
      await ensureTenantPremiumCacheFresh().catch(() => null);
      if (!protectedGuild && !isTenantPremiumActiveSync(gid)) {
        return fail(402, "premium_required", reasonToMessage("premium_required"));
      }
      boardsPatch.quoteStyle = boardsRaw.quoteStyle;
    }
    if (protectedGuild) {
            const allowed =
        Object.prototype.hasOwnProperty.call(boardsPatch, "quoteStyle") ||
        Object.prototype.hasOwnProperty.call(boardsPatch, "features") ||
        Object.prototype.hasOwnProperty.call(boardsPatch, "enabled") ||
        Object.prototype.hasOwnProperty.call(boardsPatch, "clipTranscription");
      if (!allowed) {
        return fail(
          400,
          "protected_guild",
          reasonToMessage("protected_guild") ||
            "Questa impostazione non è disponibile sul server protetto.",
        );
      }
    } else {
      if (Object.prototype.hasOwnProperty.call(boardsRaw, "mode")) {
        boardsPatch.mode = normalizeBoardsMode(boardsRaw.mode);
      }
      for (const key of ["sharedChannelId", "quoteChannelId", "repostChannelId", "clipChannelId", "skullChannelId"]) {
        if (!Object.prototype.hasOwnProperty.call(boardsRaw, key)) continue;
        boardsPatch[key] = boardsRaw[key];
      }
    }
    const saved: any = await setTenantBoards(gid, boardsPatch);
    if (!saved.ok) {
      return fail(400, saved.reason || "persist_failed", reasonToMessage(saved.reason));
    }
  }

  const identityPatch: Record<string, any> = {};
  if (Object.prototype.hasOwnProperty.call(patch, "botNickname")) {
    if (patch.botNickname === null || patch.botNickname === "") {
      identityPatch.nick = null;
    } else {
      const nick = String(patch.botNickname).trim();
      if (nick.length > 32) return fail(400, "nick_too_long", reasonToMessage("nick_too_long"));
      identityPatch.nick = nick || null;
    }
  }

  if (Object.prototype.hasOwnProperty.call(patch, "botAvatar")) {
    const av = normalizeAvatarDataUri(patch.botAvatar);
    if (av.invalid) return fail(400, "avatar_invalid", reasonToMessage("avatar_invalid"));
    identityPatch.avatar = av.clear ? null : av.dataUri;
  }

  if (Object.prototype.hasOwnProperty.call(patch, "botBanner")) {
    const bn = normalizeAvatarDataUri(patch.botBanner);
    if (bn.invalid) return fail(400, "banner_invalid", reasonToMessage("banner_invalid"));
    identityPatch.banner = bn.clear ? null : bn.dataUri;
  }

  if (Object.keys(identityPatch).length) {
    const writingCustom = Object.values(identityPatch).some((v?) => v != null);
    if (writingCustom && !protectedGuild) {
      await ensureTenantPremiumCacheFresh().catch(() => null);
      if (!isTenantPremiumActiveSync(gid)) {
        return fail(402, "premium_required", reasonToMessage("premium_required"));
      }
    }
    const applied = await patchBotGuildIdentity(client, gid, (identityPatch as any));
    if (!applied.ok) {
      return fail(400, applied.reason || "nick_failed", reasonToMessage(applied.reason));
    }
        if (!protectedGuild) {
      const identitySave: Record<string, any> = {};
      if (Object.prototype.hasOwnProperty.call(identityPatch, "nick")) {
        identitySave.nick = identityPatch.nick;
      }
      if (Object.prototype.hasOwnProperty.call(identityPatch, "avatar")) {
        identitySave.avatar = identityPatch.avatar;
      }
      if (Object.prototype.hasOwnProperty.call(identityPatch, "banner")) {
        identitySave.banner = identityPatch.banner;
      }
      identitySave.visuallyApplied = true;
      await patchTenantPremiumIdentity(gid, identitySave).catch((err?) => {
        global.logger?.warn?.(
          "[DASHBOARD] premium identity snapshot failed:",
          gid,
          err?.message || err,
        );
      });
    }
  }

  await refreshTenantGuildSettingsCache().catch(() => null);
  await ensureTenantPremiumCacheFresh().catch(() => null);
  await ensureTenantPremiumIdentityCacheFresh().catch(() => null);
  const snapshot = getTenantSettingsSnapshotSync(gid);
  const identity = await readBotGuildIdentity(client, gid);
  const premium = protectedGuild
    ? { active: true, plan: "premium", until: null }
    : serializePremiumPublic(getTenantPremiumSync(gid));
  const savedIdentity = protectedGuild ? null : getTenantPremiumIdentitySync(gid);
  const showSavedWhileSuspended =
    !protectedGuild && premium.active !== true && identityHasCustom(savedIdentity);

  let pickers = { textChannels: [], categories: [], roles: [] };
  try {
    pickers = await listGuildPickerData(client, gid);
  } catch (_) {}
  const [guildOwner, discordLanguage] = await Promise.all([
    readGuildOwner(client, gid).catch(() => null),
    readGuildDiscordLanguage(client, gid).catch(() => null),
  ]);

  return {
    ok: true,
    status: 200,
    guildId: gid,
    premium,
    protectedGuild,
    settings: {
      prefix: snapshot.prefix || DEFAULT_PREFIX,
      prefixMaxLength: PREFIX_MAX_LEN,
      dashboardRoleId: snapshot.dashboardRoleId,
      dashboardRoleIds: Array.isArray(snapshot.dashboardRoleIds) ? snapshot.dashboardRoleIds : [],
      dashboardUserIds: Array.isArray(snapshot.dashboardUserIds) ? snapshot.dashboardUserIds : [],
      dashboardRolesConfigured: snapshot.dashboardRolesConfigured === true,
      guildOwner,
      updatesChannelId: snapshot.updatesChannelId,
      language: snapshot.language ?? null,
      discordLanguage,
      timezone: snapshot.timezone || "Europe/Rome",
      boards: snapshot.boards || {
        enabled: false,
        mode: "shared",
        sharedChannelId: null,
        quoteChannelId: null,
        repostChannelId: null,
        clipChannelId: null,
        skullChannelId: null,
        features: { quote: true, repost: true, clip: true, skull: true },
        quoteStyle: {
          bg: "black",
          font: "sans",
          bold: true,
          flip: false,
          orientation: "horizontal",
        },
      },
      botNickname: showSavedWhileSuspended ? savedIdentity.nick : identity.botNickname,
      botAvatarUrl: showSavedWhileSuspended
        ? savedIdentity.avatar || identity.botAvatarUrl
        : identity.botAvatarUrl,
      hasGuildAvatar: showSavedWhileSuspended
        ? Boolean(savedIdentity.avatar)
        : identity.hasGuildAvatar,
      botBannerUrl: showSavedWhileSuspended
        ? savedIdentity.banner || identity.botBannerUrl
        : identity.botBannerUrl,
      hasGuildBanner: showSavedWhileSuspended
        ? Boolean(savedIdentity.banner)
        : identity.hasGuildBanner,
      botUsername: identity.botUsername,
      botPresence: readBotPresence(client),
      identitySuspended: showSavedWhileSuspended,
      prefixLocked: protectedGuild,
      rolesLocked: false,
    },
    pickers,
    message: "Impostazioni salvate.",
  };
}

async function previewDashboardQuoteStyle(client?, accessToken?, guildId?, quoteStyle?) {
  const access = await verifyDashboardGuildAccess(client, accessToken, guildId);
  if (!access.ok) return access;

  const { normalizeQuoteStyle } = require("../../../Vinili/Community/utils/Quote/quoteStyle") as typeof import("../../../Vinili/Community/utils/Quote/quoteStyle");
  const renderQuoteCanvas = require("../../../Vinili/Community/utils/Render/quoteCanvas") as typeof import("../../../Vinili/Community/utils/Render/quoteCanvas");
  const {
    guildMemberDisplayAvatarUrlStatic,
    memberDisplayName,
  } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");

  const style = normalizeQuoteStyle({
    ...(quoteStyle && typeof quoteStyle === "object" ? quoteStyle : {}),
    /* anteprima dashboard: sempre PNG statico (niente GIF lente) */
    avatarMode: "static",
  });

  const guild =
    client?.guilds?.cache?.get?.(access.guildId) ||
    (await client?.guilds?.fetch?.(access.guildId).catch(() => null));
  const member =
    (guild &&
      (guild.members?.cache?.get?.(access.userId) ||
        (await guild.members?.fetch?.(access.userId).catch(() => null)))) ||
    null;
  const coverImageUrl = member ? guildMemberDisplayAvatarUrlStatic(member, { size: 512 }) || "" : "";
  const username = member
    ? memberDisplayName(member, member.user) || String(access.userId)
    : "Anteprima";

  try {
    const out = await renderQuoteCanvas({
      coverImageUrl,
      message: "Esempio di citazione sul server.",
      username,
      style,
    });
    const buffer = out?.buffer;
    if (!buffer || !Buffer.isBuffer(buffer) && !(buffer instanceof Uint8Array)) {
      return { ok: false, status: 500, error: "preview_failed", message: "Impossibile generare anteprima quote." };
    }
    return {
      ok: true,
      status: 200,
      image: Buffer.from(buffer),
      mimeType: out?.format === "gif" ? "image/gif" : "image/png",
    };
  } catch (err) {
    global.logger?.warn?.("[dashboard quote preview]", err?.message || err);
    return { ok: false, status: 500, error: "preview_failed", message: "Impossibile generare anteprima quote." };
  }
}

export = {
  getDashboardGuildSettings,
  patchDashboardGuildSettings,
  previewDashboardQuoteStyle,
};
