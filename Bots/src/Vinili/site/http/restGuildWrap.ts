/** Client REST del sito: wrap guild e attacco API REST. */
const { asCacheMap, snowflakeCreatedAt } = require("./restPermissions") as typeof import("./restPermissions");
const { attachGuildRolesApi } = require("./restGuildRoles") as typeof import("./restGuildRoles");
const { attachGuildChannelsApi } = require("./restGuildChannels") as typeof import("./restGuildChannels");
const { attachGuildMembersApi } = require("./restGuildMembers") as typeof import("./restGuildMembers");
const { attachGuildLookupApis, attachGuildCollectionApis } = require("./restGuildResources") as typeof import("./restGuildResources");

function wrapGuild(raw?, client?) {
  const approxMembers = Number(raw?.approximate_member_count);
  const approxOnline = Number(raw?.approximate_presence_count);
  const exactMembers = Number(raw?.member_count ?? raw?.memberCount);
  const memberCount =
    Number.isFinite(exactMembers) && exactMembers >= 0
      ? exactMembers
      : Number.isFinite(approxMembers) && approxMembers >= 0
        ? approxMembers
        : null;
  const approximatePresenceCount =
    Number.isFinite(approxOnline) && approxOnline >= 0 ? approxOnline : null;

  const guild = {
    id: String(raw.id),
    name: raw.name,
    icon: raw.icon || null,
    banner: raw.banner || null,
    splash: raw.splash || null,
    discoverySplash: raw.discovery_splash || null,
    description: raw.description || null,
    vanityURLCode: raw.vanity_url_code || null,
    preferredLocale: raw.preferred_locale || null,
    features: Array.isArray(raw.features) ? raw.features : [],
    verificationLevel: Number(raw.verification_level ?? 0),
    explicitContentFilter: Number(raw.explicit_content_filter ?? 0),
    defaultMessageNotifications: Number(raw.default_message_notifications ?? 0),
    mfaLevel: Number(raw.mfa_level ?? 0),
    nsfwLevel: Number(raw.nsfw_level ?? 0),
    premiumTier: Number(raw.premium_tier ?? 0),
    premiumProgressBarEnabled: Boolean(raw.premium_progress_bar_enabled),
    afkTimeout: Number(raw.afk_timeout ?? 0),
    afkChannelId: raw.afk_channel_id ? String(raw.afk_channel_id) : null,
    systemChannelId: raw.system_channel_id ? String(raw.system_channel_id) : null,
    rulesChannelId: raw.rules_channel_id ? String(raw.rules_channel_id) : null,
    publicUpdatesChannelId: raw.public_updates_channel_id
      ? String(raw.public_updates_channel_id)
      : null,
    safetyAlertsChannelId: raw.safety_alerts_channel_id
      ? String(raw.safety_alerts_channel_id)
      : null,
    widgetEnabled: Boolean(raw.widget_enabled),
    widgetChannelId: raw.widget_channel_id ? String(raw.widget_channel_id) : null,
    ownerId: raw.owner_id ? String(raw.owner_id) : null,
    maximumMembers: Number(raw.max_members ?? 0),
    maximumPresences: Number(raw.max_presences ?? 0),
    maxVideoChannelUsers: Number(raw.max_video_channel_users ?? 0),
    createdAt: snowflakeCreatedAt(raw.id),
    client,
    memberCount,
    approximateMemberCount: Number.isFinite(approxMembers) && approxMembers >= 0 ? approxMembers : memberCount,
    approximatePresenceCount,
    members: null,
    roles: { cache: asCacheMap(), fetch: null, everyone: null },
    channels: { cache: asCacheMap(), fetch: null, fetchActiveThreads: null },
    emojis: { cache: asCacheMap() },
    stickers: { cache: asCacheMap() },
    scheduledEvents: { cache: asCacheMap(), fetch: null },
    autoModerationRules: { fetch: null },
    bans: null,
    iconURL: (opts: Record<string, any> = {}) => {
      const hash = String(raw.icon || "").trim();
      if (!hash) return null;
      const size = Number(opts.size) > 0 ? Number(opts.size) : 256;
      const ext = opts.extension || (hash.startsWith("a_") ? "gif" : "png");
      return `https://cdn.discordapp.com/icons/${raw.id}/${hash}.${ext}?size=${size}`;
    },
    bannerURL: (opts: Record<string, any> = {}) => {
      const hash = String(raw.banner || "").trim();
      if (!hash) return null;
      const size = Number(opts.size) > 0 ? Number(opts.size) : 1024;
      const ext = opts.extension || (hash.startsWith("a_") ? "gif" : "png");
      return `https://cdn.discordapp.com/banners/${raw.id}/${hash}.${ext}?size=${size}`;
    },
    splashURL: (opts: Record<string, any> = {}) => {
      const hash = String(raw.splash || "").trim();
      if (!hash) return null;
      const size = Number(opts.size) > 0 ? Number(opts.size) : 2048;
      return `https://cdn.discordapp.com/splashes/${raw.id}/${hash}.png?size=${size}`;
    },
    discoverySplashURL: (opts: Record<string, any> = {}) => {
      const hash = String(raw.discovery_splash || "").trim();
      if (!hash) return null;
      const size = Number(opts.size) > 0 ? Number(opts.size) : 2048;
      return `https://cdn.discordapp.com/discovery-splashes/${raw.id}/${hash}.png?size=${size}`;
    },
    fetch: async () => {
      const refreshed = await client.guilds.fetch(guild.id);
      return refreshed;
    },
  };

  attachGuildLookupApis(guild, client);
  attachGuildRolesApi(guild, client);
  attachGuildChannelsApi(guild, client);
  attachGuildMembersApi(guild, client);
  attachGuildCollectionApis(guild, client);

  return guild;
}

export = { wrapGuild };
