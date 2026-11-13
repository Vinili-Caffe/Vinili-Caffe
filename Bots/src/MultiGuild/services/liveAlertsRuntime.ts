/**
 * Live & Video: alert multi-guild per Twitch / YouTube / Kick / TikTok.
 * Config in BotState (multiGuildLiveAlerts.v1); stato poll in multiGuildLiveAlertState.v1.
 * Seed del principale da client.config.twitchLiveAlerts.
 */
const T = require("../core/tenantCommunityTools") as typeof import("../core/tenantCommunityTools");
const { E } = require("../../shared/emojis/emojiCatalog") as typeof import("../../shared/emojis/emojiCatalog");
const { getClientGuildCached, getGuildChannelCached } = require("../../shared/discord/interactionEntityCache") as typeof import("../../shared/discord/interactionEntityCache");

type LivePlatform = "twitch" | "youtube" | "kick" | "tiktok" | "instagram";
const PLATFORMS: LivePlatform[] = ["twitch", "youtube", "kick", "tiktok", "instagram"];
const SEED_VERSION = 3;
const ACCOUNTS_MAX = 25;
const DEFAULT_POLL = 120;
const DEFAULT_COOLDOWN = 2700;

const PLATFORM_EMBED_COLOR: Record<LivePlatform, string> = {
  twitch: "#9146ff",
  youtube: "#ff0000",
  kick: "#53fc18",
  tiktok: "#25f4ee",
  instagram: "#e1306c",
};

type LiveAccount = {
  id: string;
  displayName: string;
  discordUserId: string | null;
  streamVoiceChannelId: string | null;
  voiceNameOn: string | null;
  voiceNameOff: string | null;
  voiceStatusOn: string | null;
  deleteAnnouncementOnOffline: boolean;
};

type PlatformCfg = {
  enabled: boolean;
  channelId: string | null;
  pingRoleId: string | null;
  /** @deprecated preferisci draft */
  messageTemplate: string;
  /** messaggio per le dirette */
  draft: ReturnType<typeof T.normalizeDraft>;
  /** messaggio per nuovi post/video; se assente o vuoto → draft */
  postsDraft: ReturnType<typeof T.normalizeDraft> | null;
  pollIntervalSec: number;
  reannounceCooldownSec: number;
  streamVoiceChannelId: string | null;
  /** Instagram (e simili): avvisa per dirette */
  notifyLive: boolean;
  /** Instagram: avvisa per nuovi post */
  notifyPosts: boolean;
  accounts: LiveAccount[];
};

type LiveConfig = {
  seedVersion: number;
  userSaved: boolean;
  platforms: Record<LivePlatform, PlatformCfg>;
};

type LiveSnap = {
  title: string;
  game: string;
  viewers: number;
  url: string;
  streamId: string;
  thumbnailUrl: string | null;
  kind?: "live" | "post";
};

const loopStarted = new WeakSet();
let pollInFlight = false;
/** ultimo controllo per server+piattaforma: rispetta "Controlla ogni" scelto in dashboard */
const lastPolledAt = new Map<string, number>();

function clampPoll(n: number) {
  return Math.max(60, Math.min(600, Math.floor(Number(n) || DEFAULT_POLL)));
}
function clampCooldown(n: number) {
  return Math.max(300, Math.min(6 * 3600, Math.floor(Number(n) || DEFAULT_COOLDOWN)));
}
function normHandle(v: unknown, platform: LivePlatform) {
  let s = String(v || "").trim().replace(/^@/, "");
  if (platform === "twitch" || platform === "kick" || platform === "tiktok" || platform === "instagram") s = s.toLowerCase();
  if (platform === "youtube") s = s.replace(/^https?:\/\/(www\.)?youtube\.com\//i, "").replace(/^channel\//i, "").replace(/^@/, "").trim();
  if (platform === "instagram") s = s.replace(/^https?:\/\/(www\.)?instagram\.com\//i, "").replace(/\/.*$/, "").trim();
  return s.slice(0, 120);
}
function platformLabel(p: LivePlatform) {
  return p === "twitch" ? "Twitch" : p === "youtube" ? "YouTube" : p === "kick" ? "Kick" : p === "tiktok" ? "TikTok" : "Instagram";
}
function defaultUrl(platform: LivePlatform, id: string) {
  if (platform === "twitch") return `https://www.twitch.tv/${id}`;
  if (platform === "youtube") return id.startsWith("UC") ? `https://www.youtube.com/channel/${id}/live` : `https://www.youtube.com/@${id}/live`;
  if (platform === "kick") return `https://kick.com/${id}`;
  if (platform === "instagram") return `https://www.instagram.com/${id}/`;
  return `https://www.tiktok.com/@${id}/live`;
}

function supportsPosts(platform: LivePlatform) {
  return platform === "instagram" || platform === "youtube" || platform === "tiktok";
}

function defaultTemplate(platform: LivePlatform) {
  const label = platformLabel(platform).toUpperCase();
  const liveEmoji =
    platform === "twitch"
      ? E.VC_TwitchLive || "🟣"
      : platform === "youtube"
        ? "▶️"
        : platform === "kick"
          ? "🟢"
          : platform === "instagram"
            ? "📸"
            : "🎵";
  const openLabel =
    platform === "youtube" ? "Guarda su YouTube" : platform === "tiktok" ? "Guarda su TikTok" : platform === "instagram" ? "Apri su Instagram" : "Guarda la diretta";
  return [
    `# ${liveEmoji} LIVE SU ${label}`,
    "",
    `> ${E.VC_HeartsPink || "💗"} **{mention}** è in live adesso!`,
    "",
    `${E.VC_Info || "ℹ️"} **{title}**`,
    `${E.VC_CommunityManager || "🎮"} Categoria: **{game}**`,
    `${E.VC_Stats || "📊"} Spettatori: **{viewers}**`,
    "",
    `${E.VC_Reply || "🔗"} [${openLabel}]({url})`,
    "",
    `${E.VC_Ping || "🔔"}︲{ping}`,
  ].join("\n");
}

function defaultPostsTemplate(platform: LivePlatform) {
  const label = platformLabel(platform).toUpperCase();
  const kind = platform === "youtube" ? "video" : "post";
  const emoji = platform === "youtube" ? "▶️" : platform === "tiktok" ? "🎵" : "📸";
  const openLabel = platform === "youtube" ? "Apri su YouTube" : platform === "tiktok" ? "Apri su TikTok" : "Apri su Instagram";
  return [
    `# ${emoji} NUOVO ${kind.toUpperCase()} SU ${label}`,
    "",
    `> ${E.VC_HeartsPink || "💗"} **{mention}** ha pubblicato un nuovo ${kind}!`,
    "",
    `${E.VC_Info || "ℹ️"} **{title}**`,
    "",
    `${E.VC_Reply || "🔗"} [${openLabel}]({url})`,
    "",
    `${E.VC_Ping || "🔔"}︲{ping}`,
  ].join("\n");
}

function defaultDraft(platform: LivePlatform) {
  return T.normalizeDraft({
    content: defaultTemplate(platform),
    mentionUsers: true,
    mentionRoles: true,
    embed: {
      enabled: true,
      title: `{name} è in live su {platform}`,
      description: `{title}`,
      color: PLATFORM_EMBED_COLOR[platform],
      imageUrl: "{thumb}",
      fields: [
        { name: "Categoria", value: "{game}", inline: true },
        { name: "Spettatori", value: "{viewers}", inline: true },
      ],
    },
  });
}

function defaultPostsDraft(platform: LivePlatform) {
  const kind = platform === "youtube" ? "video" : "post";
  return T.normalizeDraft({
    content: defaultPostsTemplate(platform),
    mentionUsers: true,
    mentionRoles: true,
    embed: {
      enabled: true,
      title: `{name} · nuovo ${kind} su {platform}`,
      description: `{title}`,
      color: PLATFORM_EMBED_COLOR[platform],
      imageUrl: "{thumb}",
      fields: [],
    },
  });
}

function emptyPlatform(platform: LivePlatform): PlatformCfg {
  const draft = defaultDraft(platform);
  const posts = supportsPosts(platform);
  return {
    enabled: false,
    channelId: null,
    pingRoleId: null,
    messageTemplate: draft.content,
    draft,
    /* null finché non lo impostano dalla dashboard → in publish si usa draft */
    postsDraft: null,
    pollIntervalSec: DEFAULT_POLL,
    reannounceCooldownSec: DEFAULT_COOLDOWN,
    streamVoiceChannelId: null,
    notifyLive: true,
    notifyPosts: posts,
    accounts: [],
  };
}

function emptyConfig(): LiveConfig {
  return {
    seedVersion: 0,
    userSaved: false,
    platforms: {
      twitch: emptyPlatform("twitch"),
      youtube: emptyPlatform("youtube"),
      kick: emptyPlatform("kick"),
      tiktok: emptyPlatform("tiktok"),
      instagram: emptyPlatform("instagram"),
    },
  };
}

function normalizeAccount(raw: any, platform: LivePlatform): LiveAccount | null {
  const id = normHandle(raw?.id || raw?.login || raw?.handle || raw?.channelId || raw?.uniqueId, platform);
  if (!id || id === "replace_me") return null;
  return {
    id,
    displayName: String(raw?.displayName || raw?.label || id).trim().slice(0, 80) || id,
    discordUserId: T.isId(raw?.discordUserId) ? String(raw.discordUserId) : null,
    streamVoiceChannelId: T.isId(raw?.streamVoiceChannelId) ? String(raw.streamVoiceChannelId) : null,
    voiceNameOn: String(raw?.voiceNameOn || "").trim().slice(0, 100) || null,
    voiceNameOff: String(raw?.voiceNameOff || "").trim().slice(0, 100) || null,
    voiceStatusOn: String(raw?.voiceStatusOn || "").trim().slice(0, 500) || null,
    deleteAnnouncementOnOffline: raw?.deleteAnnouncementOnOffline === true,
  };
}

function normalizePlatform(raw: any, platform: LivePlatform, prev?: PlatformCfg): PlatformCfg {
  const base = prev || emptyPlatform(platform);
  const r = raw && typeof raw === "object" ? raw : {};
  const has = (k: string) => Object.prototype.hasOwnProperty.call(r, k);
  const accountsRaw = has("accounts") ? r.accounts : has("streamers") ? r.streamers : null;
  const accounts = Array.isArray(accountsRaw)
    ? accountsRaw.map((a) => normalizeAccount(a, platform)).filter(Boolean).slice(0, ACCOUNTS_MAX) as LiveAccount[]
    : base.accounts;

  let draft = base.draft || defaultDraft(platform);
  if (has("draft") && r.draft && typeof r.draft === "object") {
    draft = T.normalizeDraft(r.draft);
  } else if (has("messageTemplate") && !has("draft")) {
    const content = String(r.messageTemplate || "").slice(0, 2000) || defaultTemplate(platform);
    draft = T.normalizeDraft({ ...defaultDraft(platform), content });
  }

  let postsDraft: PlatformCfg["postsDraft"] = null;
  if (supportsPosts(platform)) {
    if (has("postsDraft")) {
      postsDraft = r.postsDraft && typeof r.postsDraft === "object" ? T.normalizeDraft(r.postsDraft) : null;
    } else if (prev?.postsDraft && !T.draftIsEmpty(prev.postsDraft)) {
      postsDraft = prev.postsDraft;
    }
  }

  return {
    enabled: has("enabled") ? r.enabled === true : base.enabled,
    channelId: has("channelId") ? (T.isId(r.channelId) ? String(r.channelId) : null) : base.channelId,
    pingRoleId: has("pingRoleId") ? (T.isId(r.pingRoleId) ? String(r.pingRoleId) : null) : base.pingRoleId,
    messageTemplate: draft.content || defaultTemplate(platform),
    draft,
    postsDraft,
    pollIntervalSec: has("pollIntervalSec") ? clampPoll(r.pollIntervalSec) : base.pollIntervalSec,
    reannounceCooldownSec: has("reannounceCooldownSec") ? clampCooldown(r.reannounceCooldownSec) : base.reannounceCooldownSec,
    streamVoiceChannelId: has("streamVoiceChannelId")
      ? T.isId(r.streamVoiceChannelId)
        ? String(r.streamVoiceChannelId)
        : null
      : base.streamVoiceChannelId,
    notifyLive: has("notifyLive") ? r.notifyLive !== false : base.notifyLive !== false,
    notifyPosts: has("notifyPosts")
      ? r.notifyPosts === true
      : supportsPosts(platform)
        ? base.notifyPosts !== false
        : false,
    accounts,
  };
}

function normalizeConfig(raw: any, prev?: LiveConfig): LiveConfig {
  const r = raw && typeof raw === "object" ? raw : {};
  const prevCfg = prev || emptyConfig();
  const platformsIn = r.platforms && typeof r.platforms === "object" ? r.platforms : r;
  const platforms = {} as Record<LivePlatform, PlatformCfg>;
  for (const p of PLATFORMS) {
    platforms[p] = normalizePlatform(platformsIn[p], p, prevCfg.platforms[p]);
  }
  return {
    seedVersion: Math.max(0, Math.floor(Number(r.seedVersion) || prevCfg.seedVersion || 0)),
    userSaved: r.userSaved === true || prevCfg.userSaved === true,
    platforms,
  };
}

function mainSeedFromClient(client?): LiveConfig {
  const IDs = (() => {
    try {
      return require("../../Vinili/Config/ids") as typeof import("../../Vinili/Config/ids");
    } catch {
      return { channels: {}, roles: {}, guilds: {} } as any;
    }
  })();
  const raw = client?.config?.twitchLiveAlerts && typeof client.config.twitchLiveAlerts === "object" ? client.config.twitchLiveAlerts : {};
  const cfg = emptyConfig();
  cfg.seedVersion = SEED_VERSION;
  const twitch = cfg.platforms.twitch;
  twitch.enabled = raw.enabled !== false;
  twitch.channelId = T.isId(raw.channelId) ? String(raw.channelId) : T.isId(IDs.channels?.news) ? String(IDs.channels.news) : null;
  twitch.pingRoleId = T.isId(raw.pingRoleId) ? String(raw.pingRoleId) : T.isId(IDs.roles?.Live) ? String(IDs.roles.Live) : null;
  twitch.pollIntervalSec = clampPoll(raw.pollIntervalSec || 90);
  twitch.reannounceCooldownSec = clampCooldown(raw.reannounceCooldownSec || DEFAULT_COOLDOWN);
  twitch.streamVoiceChannelId = T.isId(raw.streamVoiceChannelId)
    ? String(raw.streamVoiceChannelId)
    : T.isId(IDs.channels?.streamerStage)
      ? String(IDs.channels.streamerStage)
      : null;
  twitch.draft = defaultDraft("twitch");
  twitch.messageTemplate = twitch.draft.content;
  twitch.accounts = (Array.isArray(raw.streamers) ? raw.streamers : [])
    .map((s) =>
      normalizeAccount(
        {
          id: s?.login,
          displayName: s?.displayName,
          discordUserId: s?.discordUserId,
          streamVoiceChannelId: s?.streamVoiceChannelId || raw.streamVoiceChannelId,
          voiceNameOn: s?.voiceNameOn,
          voiceNameOff: s?.voiceNameOff,
          voiceStatusOn: s?.voiceStatusOn,
          deleteAnnouncementOnOffline: s?.deleteAnnouncementOnOffline,
        },
        "twitch",
      ),
    )
    .filter(Boolean) as LiveAccount[];
  return cfg;
}

async function getConfig(guildId: string, fresh = false): Promise<LiveConfig> {
  const prev = await T.getGuildBlob("liveAlerts", guildId, fresh);
  if (!prev) return emptyConfig();
  return normalizeConfig(prev);
}

async function saveConfig(guildId: string, raw: any): Promise<LiveConfig> {
  const prev = await getConfig(guildId, true);
  const next = normalizeConfig(raw, prev);
  next.userSaved = true;
  next.seedVersion = Math.max(next.seedVersion, SEED_VERSION);
  await T.setGuildBlob("liveAlerts", guildId, next);
  return next;
}

async function ensureMainSeed(client?, guildId?) {
  const gid = String(guildId || "");
  if (!T.isMainGuild(gid)) return false;
  const prev = await T.getGuildBlob("liveAlerts", gid, true);
  const seed = mainSeedFromClient(client);
  if (!prev) {
    await T.setGuildBlob("liveAlerts", gid, seed);
    return true;
  }
  const cur = normalizeConfig(prev);
  if (cur.userSaved && cur.seedVersion >= SEED_VERSION) return false;
  let changed = false;
  if (!cur.platforms.twitch.accounts.length && seed.platforms.twitch.accounts.length) {
    cur.platforms.twitch = { ...seed.platforms.twitch, enabled: cur.platforms.twitch.enabled || seed.platforms.twitch.enabled };
    changed = true;
  } else {
    const tw = cur.platforms.twitch;
    if (!tw.channelId && seed.platforms.twitch.channelId) {
      tw.channelId = seed.platforms.twitch.channelId;
      changed = true;
    }
    if (!tw.pingRoleId && seed.platforms.twitch.pingRoleId) {
      tw.pingRoleId = seed.platforms.twitch.pingRoleId;
      changed = true;
    }
    if (!tw.streamVoiceChannelId && seed.platforms.twitch.streamVoiceChannelId) {
      tw.streamVoiceChannelId = seed.platforms.twitch.streamVoiceChannelId;
      changed = true;
    }
    if (!tw.draft || T.draftIsEmpty(tw.draft)) {
      tw.draft = defaultDraft("twitch");
      tw.messageTemplate = tw.draft.content;
      changed = true;
    } else if (!tw.draft.embed && tw.messageTemplate) {
      tw.draft = T.normalizeDraft({ ...defaultDraft("twitch"), content: tw.messageTemplate });
      changed = true;
    }
  }
  if (!changed && cur.seedVersion >= SEED_VERSION) return false;
  cur.seedVersion = Math.max(cur.seedVersion, SEED_VERSION);
  await T.setGuildBlob("liveAlerts", gid, cur);
  return true;
}

/** Compat: forma usata da twitchLiveAlertService.resolveConfig */
function twitchCompatFromConfig(cfg: LiveConfig, client?) {
  const tw = cfg.platforms.twitch;
  const IDs = (() => {
    try {
      return require("../../Vinili/Config/ids") as any;
    } catch {
      return {};
    }
  })();
  return {
    enabled: tw.enabled,
    pollIntervalSec: tw.pollIntervalSec,
    reannounceCooldownSec: tw.reannounceCooldownSec,
    channelId: tw.channelId || String(IDs.channels?.news || ""),
    pingRoleId: tw.pingRoleId || String(IDs.roles?.Live || ""),
    streamVoiceChannelId: tw.streamVoiceChannelId,
    streamers: tw.accounts.map((a) => ({
      login: a.id,
      displayName: a.displayName,
      discordUserId: a.discordUserId,
      streamVoiceChannelId: a.streamVoiceChannelId || tw.streamVoiceChannelId,
      voiceNameOn: a.voiceNameOn,
      voiceNameOff: a.voiceNameOff,
      voiceStatusOn: a.voiceStatusOn || `Sono in live su https://www.twitch.tv/${a.id}`,
      deleteAnnouncementOnOffline: a.deleteAnnouncementOnOffline,
    })),
    clientId: String(process.env.TWITCH_CLIENT_ID || client?.config?.twitchLiveAlerts?.clientId || "").trim(),
    clientSecret: String(process.env.TWITCH_CLIENT_SECRET || client?.config?.twitchLiveAlerts?.clientSecret || "").trim(),
  };
}

function stripEmptyTemplateLines(text: string) {
  return text
    .split("\n")
    .filter((line) => {
      if (/Categoria:\s*\*\*\s*\*\*/i.test(line)) return false;
      if (/Spettatori:\s*\*\*0\*\*/i.test(line)) return false;
      if (/Spettatori:\s*\*\*\s*\*\*/i.test(line)) return false;
      return true;
    })
    .join("\n")
    .replace(/\n{3,}/g, "\n\n")
    .trim();
}

async function loadGuildState(guildId: string) {
  const raw = await T.getGuildBlob("liveAlertsState", guildId, true);
  const platforms = raw?.platforms && typeof raw.platforms === "object" ? raw.platforms : {};
  return { platforms };
}

async function saveAccountState(guildId: string, platform: LivePlatform, accountId: string, patch: Record<string, any>) {
  const state = await loadGuildState(guildId);
  if (!state.platforms[platform] || typeof state.platforms[platform] !== "object") state.platforms[platform] = {};
  const prev = state.platforms[platform][accountId] && typeof state.platforms[platform][accountId] === "object" ? state.platforms[platform][accountId] : {};
  state.platforms[platform][accountId] = { ...prev, ...patch };
  await T.setGuildBlob("liveAlertsState", guildId, state);
}

function parseIsoMs(value?) {
  const ms = Date.parse(String(value || ""));
  return Number.isFinite(ms) ? ms : 0;
}

function shouldAnnounce(prev?, streamId?, cooldownSec?) {
  const sid = String(streamId || "").trim();
  if (!sid) return { publish: false, silent: false };
  if (String(prev?.lastStreamId || "") === sid) return { publish: false, silent: false };
  const cooldownMs = Math.max(0, Number(cooldownSec) || 0) * 1000;
  const last = parseIsoMs(prev?.announcedAt);
  if (cooldownMs > 0 && last > 0 && Date.now() - last < cooldownMs) return { publish: false, silent: true };
  return { publish: true, silent: false };
}

async function publishAlert(client?, guildId: string, platform: LivePlatform, pcfg: PlatformCfg, account: LiveAccount, snap: LiveSnap) {
  const guild = await getClientGuildCached(client, guildId).catch(() => null);
  if (!guild) return { ok: false as const, reason: "guild_unavailable" };
  const channelId = String(pcfg.channelId || "").trim();
  if (!channelId) return { ok: false as const, reason: "no_channel" };
  const channel = guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId));
  if (!channel?.isTextBased?.()) return { ok: false as const, reason: "channel_unavailable" };

  const mention = account.discordUserId ? `<@${account.discordUserId}>` : account.displayName;
  const ping = pcfg.pingRoleId ? `<@&${pcfg.pingRoleId}>` : "";
  const kind = snap.kind === "post" ? "post" : "live";
  const typeLabel =
    kind === "post"
      ? platform === "youtube"
        ? "ha pubblicato un nuovo video"
        : "ha pubblicato un nuovo post"
      : "è in diretta";
  const vars = {
    mention,
    name: account.displayName,
    title: snap.title || (kind === "post" ? "Nuovo post" : "Diretta in corso"),
    game: snap.game || "",
    viewers: snap.viewers > 0 ? snap.viewers.toLocaleString("it-IT") : "",
    url: snap.url,
    ping,
    platform: platformLabel(platform),
    thumb: snap.thumbnailUrl || "",
    type: typeLabel,
    kind,
  };

  const liveDraft =
    pcfg.draft && !T.draftIsEmpty(pcfg.draft)
      ? pcfg.draft
      : T.normalizeDraft({ ...defaultDraft(platform), content: pcfg.messageTemplate || defaultTemplate(platform) });
  /* post/video: postsDraft se impostato, altrimenti stesso messaggio delle dirette (config vecchie) */
  const draft =
    kind === "post" && pcfg.postsDraft && !T.draftIsEmpty(pcfg.postsDraft) ? pcfg.postsDraft : liveDraft;

  const body = T.buildMessageBody(draft, vars, [], { mentionUserId: account.discordUserId });
  if (typeof body.content === "string") body.content = stripEmptyTemplateLines(body.content).slice(0, 2000) || undefined;

  /* campi embed vuoti (game/viewers) fuori; link anteprima sulla live */
  if (Array.isArray(body.embeds) && body.embeds[0]) {
    const emb = body.embeds[0];
    if (Array.isArray(emb.fields)) {
      emb.fields = emb.fields.filter((f?) => String(f?.value || "").trim() && String(f.value).trim() !== "​");
      if (!emb.fields.length) delete emb.fields;
    }
    if (snap.url) emb.url = snap.url;
    if (!emb.image?.url && snap.thumbnailUrl) emb.image = { url: snap.thumbnailUrl };
  }

  const roles = new Set<string>([...(body.allowed_mentions?.roles || []), ...(pcfg.pingRoleId ? [pcfg.pingRoleId] : [])]);
  const users = new Set<string>([...(body.allowed_mentions?.users || []), ...(account.discordUserId ? [account.discordUserId] : [])]);
  body.allowedMentions = {
    parse: body.allowed_mentions?.parse || [],
    roles: [...roles],
    users: [...users],
  };
  delete body.allowed_mentions;

  const sent = await channel.send(body).catch((err?) => {
    global.logger?.warn?.(`[LIVE ${platform}] send failed:`, guildId, err?.message || err);
    return null;
  });
  if (!sent?.id) return { ok: false as const, reason: "send_failed" };

  await saveAccountState(guildId, platform, account.id, {
    lastStreamId: snap.streamId,
    announcedAt: new Date().toISOString(),
    isLive: true,
    messageId: String(sent.id),
    channelId: String(channel.id),
  });
  return { ok: true as const, messageId: String(sent.id) };
}

async function deleteAnnouncement(client?, guildId: string, platform: LivePlatform, account: LiveAccount, prev?) {
  if (!account.deleteAnnouncementOnOffline) return;
  const messageId = String(prev?.messageId || "").trim();
  const channelId = String(prev?.channelId || "").trim();
  if (!messageId || !channelId) return;
  const guild = await getClientGuildCached(client, guildId).catch(() => null);
  if (!guild) return;
  const channel = guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId));
  if (!channel?.isTextBased?.()) return;
  await channel.messages.delete(messageId).catch((err?) => {
    if (err?.code !== 10008) global.logger?.warn?.(`[LIVE ${platform}] delete failed:`, account.id, err?.message || err);
  });
}

async function applyTwitchVoice(client?, guildId: string, account: LiveAccount, pcfg: PlatformCfg, mode: "on" | "off") {
  const Twitch = require("../../Vinili/Community/services/twitchLiveAlertService") as typeof import("../../Vinili/Community/services/twitchLiveAlertService");
  const streamer = {
    login: account.id,
    displayName: account.displayName,
    discordUserId: account.discordUserId,
    streamVoiceChannelId: account.streamVoiceChannelId || pcfg.streamVoiceChannelId,
    voiceNameOn: account.voiceNameOn,
    voiceNameOff: account.voiceNameOff,
    voiceStatusOn: account.voiceStatusOn || `Sono in live su https://www.twitch.tv/${account.id}`,
    deleteAnnouncementOnOffline: account.deleteAnnouncementOnOffline,
  };
  if (!streamer.streamVoiceChannelId) return;
  /* updateStreamVoiceChannel è interno — riusiamo via poll helpers esportati solo in parte.
     Chiamiamo la logica duplicata minima qui sotto se non esportata. */
  try {
    const update = (Twitch as any).updateStreamVoiceChannel;
    if (typeof update === "function") {
      /* patch: temporaneamente forza guild via client.config.mainGuildId già ok per main;
         per tenant usiamo canale diretto. */
      await updateStreamVoiceForGuild(client, guildId, streamer, mode);
    } else {
      await updateStreamVoiceForGuild(client, guildId, streamer, mode);
    }
  } catch (err) {
    global.logger?.warn?.("[LIVE twitch] voice:", err?.message || err);
  }
}

async function updateStreamVoiceForGuild(client?, guildId: string, streamer: any, mode: "on" | "off") {
  const channelId = String(streamer?.streamVoiceChannelId || "").trim();
  if (!channelId) return;
  const guild = await getClientGuildCached(client, guildId).catch(() => null);
  if (!guild) return;
  const channel = guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId));
  if (!channel?.isVoiceBased?.()) return;
  const isOn = mode === "on";
  const nameOn = String(streamer.voiceNameOn || "").trim();
  const nameOff = String(streamer.voiceNameOff || "").trim();
  const canonical = nameOn || nameOff;
  const renameOnToggle = Boolean(nameOn && nameOff && nameOn !== nameOff);
  const name = renameOnToggle ? (isOn ? nameOn : nameOff) : canonical;
  if (name && String(channel.name || "") !== name.slice(0, 100)) {
    await channel.setName(name.slice(0, 100), `Live ${isOn ? "ON" : "OFF"}`).catch(() => null);
  }
  const Twitch = require("../../Vinili/Community/services/twitchLiveAlertService") as any;
  if (typeof Twitch.syncStageOrVoice === "function") {
    await Twitch.syncStageOrVoice(client, guild, channel, streamer, isOn);
  } else {
    /* Stage topic / voice status: best-effort via REST come servizio Twitch */
    const isStage = Number(channel.type) === 13 || (typeof channel.isStageChannel === "function" && channel.isStageChannel());
    if (isStage && guild.stageInstances) {
      try {
        const topic = String(streamer.voiceStatusOn || "").trim().slice(0, 120);
        if (isOn && topic) {
          const existing = await guild.stageInstances.fetch(channelId).catch(() => null);
          if (existing) await guild.stageInstances.edit(channelId, { topic }).catch(() => null);
          else await guild.stageInstances.create(channelId, { topic, privacyLevel: 2 }).catch(() => null);
        } else if (!isOn) {
          await guild.stageInstances.delete(channelId).catch(() => null);
        }
      } catch (_) {}
    } else if (client?.rest) {
      try {
        await client.rest.put(`/channels/${channelId}/voice-status`, {
          body: { status: isOn ? String(streamer.voiceStatusOn || "").slice(0, 500) : "" },
          reason: `Live ${isOn ? "ON" : "OFF"}`,
        });
      } catch (_) {}
    }
  }
}

/* ─── platform fetchers ─── */

async function fetchTwitchLives(logins: string[]): Promise<Map<string, LiveSnap>> {
  const out = new Map<string, LiveSnap>();
  if (!logins.length) return out;
  const Twitch = require("../../Vinili/Community/services/twitchLiveAlertService") as typeof import("../../Vinili/Community/services/twitchLiveAlertService");
  const clientId = String(process.env.TWITCH_CLIENT_ID || "").trim();
  const clientSecret = String(process.env.TWITCH_CLIENT_SECRET || "").trim();
  if (!clientId || !clientSecret) return out;
  const token = await Twitch.getAppAccessToken(clientId, clientSecret);
  const streams = await Twitch.fetchLiveStreams(clientId, token, logins);
  for (const stream of streams || []) {
    const login = Twitch.normalizeLogin(stream?.user_login);
    if (!login) continue;
    const thumb = Twitch.buildStreamThumbnailUrl?.(stream?.thumbnail_url) || null;
    out.set(login, {
      title: String(stream?.title || "Diretta in corso"),
      game: String(stream?.game_name || ""),
      viewers: Math.max(0, Math.floor(Number(stream?.viewer_count) || 0)),
      url: `https://www.twitch.tv/${login}`,
      streamId: String(stream?.id || ""),
      thumbnailUrl: thumb,
    });
  }
  return out;
}

/*
 * YouTube senza bruciare la quota (10.000 unità al giorno):
 *  - @handle → ID canale una volta sola (channels.list forHandle = 1 unità, o dalla pagina del canale), poi in memoria;
 *  - video recenti dal feed RSS pubblico (0 unità);
 *  - quali sono in diretta: videos.list su quegli ID (1 unità ogni 50 video).
 * Prima: 2–4 ricerche da 100 unità per account a ogni controllo → quota finita in circa un'ora.
 */
const ytChannelIdCache = new Map<string, string>();

async function resolveYoutubeChannelId(handleOrId: string): Promise<string | null> {
  const raw = String(handleOrId || "").trim().replace(/^@/, "");
  if (/^UC[\w-]{20,}$/.test(raw)) return raw;
  if (!raw) return null;
  const hit = ytChannelIdCache.get(raw.toLowerCase());
  if (hit) return hit;
  let id = "";
  const key = String(process.env.YOUTUBE_API_KEY || "").trim();
  if (key) {
    const url = new URL("https://www.googleapis.com/youtube/v3/channels");
    url.searchParams.set("part", "id");
    url.searchParams.set("forHandle", "@" + raw);
    url.searchParams.set("key", key);
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
    const data: any = res?.ok ? await res.json().catch(() => ({})) : {};
    id = String(data?.items?.[0]?.id || "").trim();
  }
  if (!id) {
    /* senza chiave (o handle non trovato): dalla pagina pubblica del canale */
    const res = await fetch(`https://www.youtube.com/@${encodeURIComponent(raw)}`, {
      headers: { "User-Agent": "Mozilla/5.0", "Accept-Language": "it-IT,it;q=0.9" },
      signal: AbortSignal.timeout(15_000),
    }).catch(() => null);
    const html = res?.ok ? await res.text().catch(() => "") : "";
    id = (html.match(/"(?:channelId|externalId)":"(UC[\w-]{20,})"/) || html.match(/youtube\.com\/channel\/(UC[\w-]{20,})/) || [])[1] || "";
  }
  if (!id) return null;
  ytChannelIdCache.set(raw.toLowerCase(), id);
  return id;
}

type YtEntry = { videoId: string; title: string; publishedMs: number };

async function youtubeFeed(channelId: string): Promise<YtEntry[]> {
  const res = await fetch(`https://www.youtube.com/feeds/videos.xml?channel_id=${encodeURIComponent(channelId)}`, {
    signal: AbortSignal.timeout(15_000),
  }).catch(() => null);
  if (!res?.ok) return [];
  const xml = await res.text().catch(() => "");
  const out: YtEntry[] = [];
  for (const m of xml.matchAll(/<entry>([\s\S]*?)<\/entry>/g)) {
    const e = m[1];
    const videoId = (e.match(/<yt:videoId>([^<]+)<\/yt:videoId>/) || [])[1];
    if (!videoId) continue;
    const title = ((e.match(/<title>([\s\S]*?)<\/title>/) || [])[1] || "")
      .replace(/&amp;/g, "&")
      .replace(/&lt;/g, "<")
      .replace(/&gt;/g, ">")
      .replace(/&quot;/g, '"')
      .replace(/&#39;/g, "'");
    out.push({ videoId, title, publishedMs: Date.parse((e.match(/<published>([^<]+)<\/published>/) || [])[1] || "") || 0 });
    if (out.length >= 5) break;
  }
  return out;
}

/** Stato dei video (diretta / in programma / normale) e spettatori: 1 unità di quota ogni 50 video. */
async function youtubeVideoDetails(ids: string[]): Promise<Map<string, any>> {
  const out = new Map<string, any>();
  const key = String(process.env.YOUTUBE_API_KEY || "").trim();
  if (!key || !ids.length) return out;
  for (let i = 0; i < ids.length; i += 50) {
    const url = new URL("https://www.googleapis.com/youtube/v3/videos");
    url.searchParams.set("part", "snippet,liveStreamingDetails");
    url.searchParams.set("id", ids.slice(i, i + 50).join(","));
    url.searchParams.set("key", key);
    const res = await fetch(url, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
    const data: any = res?.ok ? await res.json().catch(() => ({})) : {};
    for (const item of Array.isArray(data?.items) ? data.items : []) out.set(String(item.id), item);
  }
  return out;
}

const ytThumb = (videoId: string) => `https://i.ytimg.com/vi/${videoId}/hqdefault.jpg`;

/** Dirette e ultimo video di ogni canale in un solo giro. */
async function fetchYoutube(liveIds: string[], postIds: string[]): Promise<{ lives: Map<string, LiveSnap>; posts: Map<string, LiveSnap> }> {
  const lives = new Map<string, LiveSnap>();
  const posts = new Map<string, LiveSnap>();
  const all = [...new Set([...liveIds, ...postIds])];
  if (!all.length) return { lives, posts };
  const feeds = new Map<string, YtEntry[]>();
  for (const rawId of all) {
    try {
      const channelId = await resolveYoutubeChannelId(rawId);
      if (channelId) feeds.set(rawId, await youtubeFeed(channelId));
    } catch (err) {
      global.logger?.warn?.("[LIVE youtube] feed:", rawId, (err as any)?.message || err);
    }
  }
  const details = await youtubeVideoDetails([...new Set([...feeds.values()].flat().map((e) => e.videoId))]).catch(() => new Map());
  const hasKey = Boolean(String(process.env.YOUTUBE_API_KEY || "").trim());
  for (const [rawId, entries] of feeds) {
    const key = normHandle(rawId, "youtube");
    const stateOf = (e: YtEntry) => String(details.get(e.videoId)?.snippet?.liveBroadcastContent || (hasKey ? "" : "none")).toLowerCase();
    if (liveIds.includes(rawId)) {
      const live = entries.find((e) => stateOf(e) === "live");
      if (live) {
        const d = details.get(live.videoId);
        lives.set(key, {
          title: String(d?.snippet?.title || live.title || "Diretta in corso").slice(0, 200),
          game: "",
          viewers: Math.max(0, Math.floor(Number(d?.liveStreamingDetails?.concurrentViewers) || 0)),
          url: `https://www.youtube.com/watch?v=${live.videoId}`,
          streamId: live.videoId,
          thumbnailUrl: ytThumb(live.videoId),
          kind: "live",
        });
      }
    }
    if (postIds.includes(rawId)) {
      /* l'ultimo video "normale": niente dirette in corso o in programma */
      const video = entries.find((e) => stateOf(e) === "none");
      if (video) {
        posts.set(key, {
          title: video.title.slice(0, 200) || "Nuovo video",
          game: "",
          viewers: 0,
          url: `https://www.youtube.com/watch?v=${video.videoId}`,
          streamId: `post:${video.videoId}`,
          thumbnailUrl: ytThumb(video.videoId),
          kind: "post",
        });
      }
    }
  }
  return { lives, posts };
}

async function fetchKickLives(slugs: string[]): Promise<Map<string, LiveSnap>> {
  const out = new Map<string, LiveSnap>();
  for (const slug of slugs) {
    try {
      const res = await fetch(`https://kick.com/api/v2/channels/${encodeURIComponent(slug)}`, {
        headers: { Accept: "application/json", "User-Agent": "ViniliLiveBot/1.0" },
        signal: AbortSignal.timeout(15_000),
      }).catch(() => null);
      if (!res?.ok) continue;
      const data: any = await res.json().catch(() => ({}));
      const live = data?.livestream;
      if (!live || live.is_live === false) continue;
      const sid = String(live.id || live.session_title || "").trim();
      if (!sid) continue;
      out.set(slug, {
        title: String(live.session_title || live.title || "Diretta in corso"),
        game: String(live.categories?.[0]?.name || live.category?.name || ""),
        viewers: Math.max(0, Math.floor(Number(live.viewer_count || live.viewers) || 0)),
        url: `https://kick.com/${slug}`,
        streamId: sid,
        thumbnailUrl: String(live.thumbnail?.url || live.thumbnail || "").trim() || null,
      });
    } catch (err) {
      global.logger?.warn?.("[LIVE kick] fetch:", slug, (err as any)?.message || err);
    }
  }
  return out;
}

async function fetchTikTokLives(ids: string[]): Promise<Map<string, LiveSnap>> {
  const out = new Map<string, LiveSnap>();
  const session = String(process.env.TIKTOK_SESSION || "").trim();
  for (const uniqueId of ids) {
    try {
      const headers: Record<string, string> = {
        Accept: "text/html,application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      };
      if (session) headers.Cookie = `sessionid=${session}`;
      const res = await fetch(`https://www.tiktok.com/@${encodeURIComponent(uniqueId)}/live`, {
        headers,
        redirect: "follow",
        signal: AbortSignal.timeout(15_000),
      }).catch(() => null);
      if (!res) continue;
      const html = await res.text().catch(() => "");
      const isLive = /"status"\s*:\s*2\b/.test(html) || /"isLive"\s*:\s*true/i.test(html) || /"liveRoomUserInfo"/.test(html);
      if (!isLive) continue;
      const titleMatch = html.match(/"title"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
      const roomMatch = html.match(/"roomId"\s*:\s*"?(\d+)"?/);
      const title = titleMatch ? JSON.parse(`"${titleMatch[1]}"`) : "Diretta in corso";
      const roomId = roomMatch?.[1] || uniqueId;
      out.set(uniqueId, {
        title: String(title || "Diretta in corso").slice(0, 200),
        game: "",
        viewers: 0,
        url: `https://www.tiktok.com/@${uniqueId}/live`,
        streamId: String(roomId),
        thumbnailUrl: null,
        kind: "live",
      });
    } catch (err) {
      global.logger?.warn?.("[LIVE tiktok] fetch:", uniqueId, (err as any)?.message || err);
    }
  }
  return out;
}

async function fetchTikTokPosts(ids: string[]): Promise<Map<string, LiveSnap>> {
  const out = new Map<string, LiveSnap>();
  const session = String(process.env.TIKTOK_SESSION || "").trim();
  for (const uniqueId of ids) {
    try {
      const headers: Record<string, string> = {
        Accept: "text/html,application/json",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
      };
      if (session) headers.Cookie = `sessionid=${session}`;
      const res = await fetch(`https://www.tiktok.com/@${encodeURIComponent(uniqueId)}`, {
        headers,
        redirect: "follow",
        signal: AbortSignal.timeout(15_000),
      }).catch(() => null);
      if (!res) continue;
      const html = await res.text().catch(() => "");
      const vid =
        html.match(/\/@[^/"']+\/video\/(\d+)/)?.[1] ||
        html.match(/"aweme_id"\s*:\s*"(\d+)"/)?.[1] ||
        html.match(/"video"\s*:\s*\{\s*"id"\s*:\s*"(\d+)"/)?.[1];
      if (!vid) continue;
      let title = "Nuovo post";
      const desc = html.match(/"desc"\s*:\s*"([^"\\]*(?:\\.[^"\\]*)*)"/);
      if (desc?.[1]) {
        try {
          title = JSON.parse(`"${desc[1]}"`).slice(0, 200) || title;
        } catch {
          title = desc[1].slice(0, 200);
        }
      }
      out.set(uniqueId, {
        title,
        game: "",
        viewers: 0,
        url: `https://www.tiktok.com/@${uniqueId}/video/${vid}`,
        streamId: `post:${vid}`,
        thumbnailUrl: null,
        kind: "post",
      });
    } catch (err) {
      global.logger?.warn?.("[LIVE tiktok] posts:", uniqueId, (err as any)?.message || err);
    }
  }
  return out;
}

async function fetchInstagram(ids: string[]): Promise<{ lives: Map<string, LiveSnap>; posts: Map<string, LiveSnap> }> {
  const lives = new Map<string, LiveSnap>();
  const posts = new Map<string, LiveSnap>();
  const session = String(process.env.INSTAGRAM_SESSION || "").trim();
  const token = String(process.env.INSTAGRAM_ACCESS_TOKEN || "").trim();

  for (const username of ids) {
    try {
      /* Graph API (account business collegato) */
      if (token) {
        const meUrl = new URL("https://graph.facebook.com/v21.0/me");
        meUrl.searchParams.set("fields", "id,username");
        meUrl.searchParams.set("access_token", token);
        /* se il token è di una IG user: media recenti */
        const mediaUrl = new URL(`https://graph.facebook.com/v21.0/${encodeURIComponent(username)}/media`);
        mediaUrl.searchParams.set("fields", "id,caption,media_type,permalink,thumbnail_url,timestamp,media_url");
        mediaUrl.searchParams.set("limit", "1");
        mediaUrl.searchParams.set("access_token", token);
        const mediaRes = await fetch(mediaUrl, { signal: AbortSignal.timeout(15_000) }).catch(() => null);
        if (mediaRes?.ok) {
          const mediaData: any = await mediaRes.json().catch(() => ({}));
          const item = mediaData?.data?.[0];
          if (item?.id) {
            posts.set(username, {
              title: String(item.caption || "Nuovo post").slice(0, 200),
              game: "",
              viewers: 0,
              url: String(item.permalink || `https://www.instagram.com/${username}/`),
              streamId: `post:${item.id}`,
              thumbnailUrl: String(item.thumbnail_url || item.media_url || "").trim() || null,
              kind: "post",
            });
          }
        }
        void meUrl;
      }

      const headers: Record<string, string> = {
        Accept: "application/json,text/html",
        "User-Agent": "Mozilla/5.0 (Windows NT 10.0; Win64; x64) AppleWebKit/537.36 (KHTML, like Gecko) Chrome/120.0.0.0 Safari/537.36",
        "X-IG-App-ID": "936619743392459",
      };
      if (session) headers.Cookie = `sessionid=${session}`;

      const apiRes = await fetch(`https://www.instagram.com/api/v1/users/web_profile_info/?username=${encodeURIComponent(username)}`, {
        headers,
        signal: AbortSignal.timeout(15_000),
      }).catch(() => null);

      let user: any = null;
      if (apiRes?.ok) {
        const data: any = await apiRes.json().catch(() => ({}));
        user = data?.data?.user || null;
      }

      if (!user) {
        const pageRes = await fetch(`https://www.instagram.com/${encodeURIComponent(username)}/`, {
          headers: { ...headers, Accept: "text/html" },
          signal: AbortSignal.timeout(15_000),
        }).catch(() => null);
        const html = pageRes ? await pageRes.text().catch(() => "") : "";
        const m = html.match(/<script type="application\/ld\+json"[^>]*>([\s\S]*?)<\/script>/i);
        if (/"isLive"\s*:\s*true/i.test(html) || /"broadcast_id"\s*:\s*"?\d+"/i.test(html)) {
          lives.set(username, {
            title: "Diretta in corso",
            game: "",
            viewers: 0,
            url: `https://www.instagram.com/${username}/live/`,
            streamId: `live:${username}`,
            thumbnailUrl: null,
            kind: "live",
          });
        }
        /* ultimo post da HTML (shortcode) */
        const short = html.match(/"shortcode"\s*:\s*"([A-Za-z0-9_-]+)"/);
        const caption = html.match(/"text"\s*:\s*"([^"\\]{0,200})"/);
        if (short?.[1] && !posts.has(username)) {
          posts.set(username, {
            title: caption?.[1] ? String(caption[1]).slice(0, 200) : "Nuovo post",
            game: "",
            viewers: 0,
            url: `https://www.instagram.com/p/${short[1]}/`,
            streamId: `post:${short[1]}`,
            thumbnailUrl: null,
            kind: "post",
          });
        }
        void m;
        continue;
      }

      const isLive = Boolean(user.is_live || user.live_broadcast_id || user.broadcast_id);
      if (isLive) {
        const bid = String(user.live_broadcast_id || user.broadcast_id || user.id || username);
        lives.set(username, {
          title: String(user.live_broadcast_title || "Diretta in corso").slice(0, 200),
          game: "",
          viewers: Math.max(0, Math.floor(Number(user.live_viewer_count) || 0)),
          url: `https://www.instagram.com/${username}/live/`,
          streamId: `live:${bid}`,
          thumbnailUrl: String(user.profile_pic_url_hd || user.profile_pic_url || "").trim() || null,
          kind: "live",
        });
      }

      const edge = user.edge_owner_to_timeline_media?.edges?.[0]?.node;
      if (edge?.id || edge?.shortcode) {
        const sid = String(edge.shortcode || edge.id);
        const cap = edge.edge_media_to_caption?.edges?.[0]?.node?.text || "";
        posts.set(username, {
          title: String(cap || "Nuovo post").slice(0, 200),
          game: "",
          viewers: 0,
          url: `https://www.instagram.com/p/${edge.shortcode || sid}/`,
          streamId: `post:${sid}`,
          thumbnailUrl: String(edge.display_url || edge.thumbnail_src || "").trim() || null,
          kind: "post",
        });
      }
    } catch (err) {
      global.logger?.warn?.("[LIVE instagram] fetch:", username, (err as any)?.message || err);
    }
  }
  return { lives, posts };
}

async function processPlatform(
  client?,
  guildId: string,
  platform: LivePlatform,
  pcfg: PlatformCfg,
  lives: Map<string, LiveSnap>,
) {
  if (!pcfg.enabled || !pcfg.accounts.length) return;
  if (pcfg.notifyLive === false) return;
  const state = await loadGuildState(guildId);
  const platState = state.platforms[platform] && typeof state.platforms[platform] === "object" ? state.platforms[platform] : {};

  for (const account of pcfg.accounts) {
    const snap = lives.get(account.id);
    const prev = platState[account.id];

    if (!snap?.streamId) {
      if (prev?.isLive || prev?.voiceChannelMode === "on") {
        await deleteAnnouncement(client, guildId, platform, account, prev);
        await saveAccountState(guildId, platform, account.id, {
          isLive: false,
          voiceChannelMode: "off",
          lastOfflineAt: new Date().toISOString(),
          messageId: null,
          channelId: null,
        });
        if (platform === "twitch") await applyTwitchVoice(client, guildId, account, pcfg, "off");
        if (platform === "twitch" && T.isMainGuild(guildId)) {
          try {
            const { broadcastSiteLiveStreamChanged } = require("../../Vinili/site/suggestions/siteSuggestionsBroadcast") as any;
            broadcastSiteLiveStreamChanged?.({ platform: "twitch", login: account.id, live: false });
          } catch (_) {}
        }
      }
      continue;
    }

    if (platform === "twitch") await applyTwitchVoice(client, guildId, account, pcfg, "on");

    if (!prev?.isLive) {
      await saveAccountState(guildId, platform, account.id, {
        isLive: true,
        lastStreamId: snap.streamId,
        voiceChannelMode: platform === "twitch" && (account.streamVoiceChannelId || pcfg.streamVoiceChannelId) ? "on" : prev?.voiceChannelMode,
      });
      if (platform === "twitch" && T.isMainGuild(guildId)) {
        try {
          const { broadcastSiteLiveStreamChanged } = require("../../Vinili/site/suggestions/siteSuggestionsBroadcast") as any;
          broadcastSiteLiveStreamChanged?.({ platform: "twitch", login: account.id, live: true });
        } catch (_) {}
      }
    }

    const decision = shouldAnnounce(prev, snap.streamId, pcfg.reannounceCooldownSec);
    if (!decision.publish) {
      if (decision.silent) {
        await saveAccountState(guildId, platform, account.id, { isLive: true, lastStreamId: snap.streamId });
      }
      continue;
    }
    await publishAlert(client, guildId, platform, pcfg, account, snap);
  }
}

/** Nuovi post/video: prima osservazione = baseline (niente annuncio), poi solo se cambia id. */
async function processContentPosts(
  client?,
  guildId: string,
  platform: LivePlatform,
  pcfg: PlatformCfg,
  posts: Map<string, LiveSnap>,
) {
  if (!pcfg.enabled || !pcfg.notifyPosts || !pcfg.accounts.length) return;
  const state = await loadGuildState(guildId);
  const platState = state.platforms[platform] && typeof state.platforms[platform] === "object" ? state.platforms[platform] : {};

  for (const account of pcfg.accounts) {
    const snap = posts.get(account.id);
    if (!snap?.streamId) continue;
    const key = `${account.id}::post`;
    const prev = platState[key];
    if (!prev?.lastStreamId) {
      await saveAccountState(guildId, platform, key, { lastStreamId: snap.streamId, announcedAt: new Date().toISOString() });
      continue;
    }
    if (String(prev.lastStreamId) === String(snap.streamId)) continue;
    await publishAlert(client, guildId, platform, pcfg, account, snap);
    await saveAccountState(guildId, platform, key, {
      lastStreamId: snap.streamId,
      announcedAt: new Date().toISOString(),
    });
  }
}

async function runLiveAlertsPoll(client?) {
  if (pollInFlight) return;
  pollInFlight = true;
  try {
    const all = await T.allGuildBlobs("liveAlerts", true).catch(() => ({}));
    const MS = require("../core/moduleSwitches") as typeof import("../core/moduleSwitches");

    /* main: assicurati seed se manca blob */
    try {
      const mainId = String(client?.config?.mainGuildId || "").trim();
      if (mainId && !all[mainId]) {
        await ensureMainSeed(client, mainId);
        const cfg = await getConfig(mainId, true);
        all[mainId] = cfg;
      }
    } catch (_) {}

    type Job = { guildId: string; platform: LivePlatform; pcfg: PlatformCfg };
    const jobs: Job[] = [];
    for (const [guildId, raw] of Object.entries(all || {})) {
      if (!MS.isModuleOn(guildId, "live")) continue;
      const cfg = normalizeConfig(raw);
      for (const platform of PLATFORMS) {
        const pcfg = cfg.platforms[platform];
        if (!pcfg.enabled || !pcfg.accounts.length || !pcfg.channelId) continue;
        const pollKey = `${guildId}:${platform}`;
        const now = Date.now();
        /* 5 s di margine: il giro gira ogni 30 s */
        if (now - (lastPolledAt.get(pollKey) || 0) < pcfg.pollIntervalSec * 1000 - 5_000) continue;
        lastPolledAt.set(pollKey, now);
        jobs.push({ guildId, platform, pcfg });
      }
    }
    if (!jobs.length) return;

    const twitchIds = new Set<string>();
    const ytLiveIds = new Set<string>();
    const ytPostIds = new Set<string>();
    const kickIds = new Set<string>();
    const ttLiveIds = new Set<string>();
    const ttPostIds = new Set<string>();
    const igIds = new Set<string>();
    for (const j of jobs) {
      for (const a of j.pcfg.accounts) {
        if (j.platform === "twitch") twitchIds.add(a.id);
        if (j.platform === "youtube") {
          if (j.pcfg.notifyLive !== false) ytLiveIds.add(a.id);
          if (j.pcfg.notifyPosts) ytPostIds.add(a.id);
        }
        if (j.platform === "kick") kickIds.add(a.id);
        if (j.platform === "tiktok") {
          if (j.pcfg.notifyLive !== false) ttLiveIds.add(a.id);
          if (j.pcfg.notifyPosts) ttPostIds.add(a.id);
        }
        if (j.platform === "instagram") igIds.add(a.id);
      }
    }

    const [twLives, yt, kickLives, ttLives, ttPosts, ig] = await Promise.all([
      fetchTwitchLives([...twitchIds]),
      fetchYoutube([...ytLiveIds], [...ytPostIds]),
      fetchKickLives([...kickIds]),
      fetchTikTokLives([...ttLiveIds]),
      fetchTikTokPosts([...ttPostIds]),
      fetchInstagram([...igIds]),
    ]);

    const ytLives = yt.lives;
    const ytPosts = yt.posts;
    const livesOf = (p: LivePlatform) =>
      p === "twitch" ? twLives : p === "youtube" ? ytLives : p === "kick" ? kickLives : p === "tiktok" ? ttLives : ig.lives;
    const postsOf = (p: LivePlatform) => (p === "youtube" ? ytPosts : p === "tiktok" ? ttPosts : p === "instagram" ? ig.posts : null);

    for (const j of jobs) {
      await processPlatform(client, j.guildId, j.platform, j.pcfg, livesOf(j.platform));
      const posts = postsOf(j.platform);
      if (posts) await processContentPosts(client, j.guildId, j.platform, j.pcfg, posts);
    }
  } catch (err) {
    global.logger?.warn?.("[LIVE] poll failed:", (err as any)?.message || err);
  } finally {
    pollInFlight = false;
  }
}

function startLiveAlertsLoop(client?) {
  const dedicated = String(process.env.COMMUNITY_POLL_WORKER || "").trim() === "1";
  const external = String(process.env.COMMUNITY_POLL_EXTERNAL || "").trim() === "1";
  if (external && !dedicated) return;
  if (!client || loopStarted.has(client)) return;
  loopStarted.add(client);

  const tick = () => runLiveAlertsPoll(client).catch(() => {});
  tick();
  /* giro ogni 30 s: ogni server/piattaforma viene controllato solo quando è passato il suo "Controlla ogni" */
  const timer = setInterval(tick, 30_000);
  timer.unref?.();
  (client as any)._liveAlertsInterval = timer;
  if (String(process.env.BOOT_VERBOSE || "").trim() === "1") {
    global.logger?.info?.("[LIVE] multi-platform alert loop started (30s, per server)");
  }
}

export = {
  PLATFORMS,
  ACCOUNTS_MAX,
  SEED_VERSION,
  normalizeConfig,
  emptyConfig,
  defaultTemplate,
  getConfig,
  saveConfig,
  ensureMainSeed,
  twitchCompatFromConfig,
  startLiveAlertsLoop,
  runLiveAlertsPoll,
  mainSeedFromClient,
};
