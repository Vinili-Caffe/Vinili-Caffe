const fs = require("fs/promises") as typeof import("fs/promises");
const path = require("path") as typeof import("path");
const zlib = require("zlib") as typeof import("zlib");
const { promisify } = require("util") as typeof import("util");
const {
  stringifyBackupPayload,
  toIso,
  serializeMessage,
  serializeChannel,
  serializeThread,
} = require("./serverBackupSerialize") as typeof import("./serverBackupSerialize");
const {
  BACKUP_SCHEMA_VERSION,
  sha256,
  generateBackupId,
  getBackupFolder,
  getBackupBakPath,
  writeFileAtomic,
  writeBackupMetaFile,
} = require("./serverBackupIo") as typeof import("./serverBackupIo");

const gzipAsync = promisify(zlib.gzip);
const FETCH_DELAY_MS = 120;
const MAX_ASSET_BYTES = 10 * 1024 * 1024;
const DEFAULT_MANUAL_MESSAGES_PER_CHANNEL = 2500;
const DEFAULT_AUTO_MESSAGES_PER_CHANNEL = 0;
/** Audit log non è ripristinabile: di default non lo scarichiamo (risparmio enorme). */
const DEFAULT_MANUAL_MAX_AUDIT_LOGS = 0;
const DEFAULT_AUTO_MAX_AUDIT_LOGS = 0;
const ARCHIVED_THREAD_CONCURRENCY = 6;
const ASSET_FETCH_CONCURRENCY = 8;

function resolveBackupCapturePolicy(options: Record<string, any> = {}) {
  const source = String(options.source || "manual").trim().toLowerCase();
  const isAuto = source === "automatic";
  const rawMsgCap = options.maxMessagesPerChannel ?? (isAuto
    ? process.env.BACKUP_AUTO_MAX_MESSAGES_PER_CHANNEL
    : process.env.BACKUP_MAX_MESSAGES_PER_CHANNEL);
  const msgDefault = isAuto ? DEFAULT_AUTO_MESSAGES_PER_CHANNEL : DEFAULT_MANUAL_MESSAGES_PER_CHANNEL;
  const rawAuditCap = options.maxAuditLogs ?? (isAuto ? DEFAULT_AUTO_MAX_AUDIT_LOGS : DEFAULT_MANUAL_MAX_AUDIT_LOGS);
  const structureBytesEnv = String(process.env.BACKUP_AUTO_STRUCTURE_ASSET_BYTES || "1").trim().toLowerCase();
  const structureBytesDefault = isAuto ? structureBytesEnv !== "0" && structureBytesEnv !== "false" : true;
  const includeStructureAssetBytes =
    options.includeStructureAssetBytes != null
      ? Boolean(options.includeStructureAssetBytes)
      : structureBytesDefault;
  return {
    isAuto,
    maxMessagesPerChannel: Math.max(0, Math.min(50000, Math.floor(Number(rawMsgCap ?? msgDefault) || 0))),
    maxAuditLogs: Math.max(0, Math.min(10000, Math.floor(Number(rawAuditCap) || 0))),
    includeAssetData: options.includeAssetData !== false && !isAuto,
    includeStructureAssetBytes,
  };
}

function sleep(ms?) {
  return new Promise((resolve?) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

/** Esegue `fn` su tutti gli item con al massimo `concurrency` in parallelo. */
async function mapPool(items?, concurrency = 4, fn?) {
  const list = Array.isArray(items) ? items : [];
  const limit = Math.max(1, Math.min(32, Math.floor(Number(concurrency) || 4)));
  const out = new Array(list.length);
  let next = 0;
  async function worker() {
    while (next < list.length) {
      const i = next;
      next += 1;
      out[i] = await fn(list[i], i);
    }
  }
  await Promise.all(Array.from({ length: Math.min(limit, list.length) || 1 }, () => worker()));
  return out;
}

async function fetchAssetAsDataUri(url?) {
  const target = String(url || "").trim();
  if (!target || typeof fetch !== "function") return null;
  try {
    const response = await fetch(target);
    if (!response?.ok) return null;
    const contentType = String(response.headers.get("content-type") || "application/octet-stream",);
    const arrayBuffer = await response.arrayBuffer();
    const size = Number(arrayBuffer?.byteLength || 0);
    if (!size || size > MAX_ASSET_BYTES) return null;
    const base64 = Buffer.from(arrayBuffer).toString("base64");
    return `data:${contentType};base64,${base64}`;
  } catch {
    return null;
  }
}

async function fetchAllMessages(channel?, maxCount = Infinity) {
  const cap = Number.isFinite(maxCount) && maxCount >= 0 ? Math.floor(maxCount) : Infinity;
  if (cap === 0) return [];
  const out = [];
  let before;

  while (out.length < cap) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) }).catch(() => null);

    if (!batch || batch.size === 0) break;

    const sorted = [...batch.values()].sort((a?, b?) => a.createdTimestamp - b.createdTimestamp,);
    for (const message of sorted) {
      out.push(serializeMessage(message));
      if (out.length >= cap) break;
    }

    before = batch.last()?.id;
    if (!before || batch.size < 100) break;
    await sleep(FETCH_DELAY_MS);
  }

  const capped = out.length > cap ? out.slice(0, cap) : out;
  // Discord pagina dal più recente: riordina cronologicamente (più vecchio → più nuovo).
  return capped.sort((a?, b?) => {
    const ta = Date.parse(String(a?.createdAt || "")) || 0;
    const tb = Date.parse(String(b?.createdAt || "")) || 0;
    return ta - tb;
  });
}

async function collectArchivedThreads(parentChannel?) {
  if (!parentChannel?.threads) return [];

  const threadList = [];

  const archivedPublic = await parentChannel.threads.fetchArchived({ type: "public", fetchAll: true }).catch(() => null);
  if (archivedPublic?.threads) {
    threadList.push(...archivedPublic.threads.values());
  }

  const archivedPrivate = await parentChannel.threads.fetchArchived({ type: "private", fetchAll: true }).catch(() => null);
  if (archivedPrivate?.threads) {
    threadList.push(...archivedPrivate.threads.values());
  }

  return threadList;
}

async function createGuildBackup(guild?, options: Record<string, any> = {}) {
  const report = (patch: Record<string, any> = {}) => {
    try {
      if (typeof options?.onProgress === "function") options.onProgress(patch);
    } catch (_) {}
  };

  report({ phase: "starting", label: "Avvio snapshot…", percent: 2 });
  await guild.fetch().catch(() => null);
  const capturePolicy = resolveBackupCapturePolicy(options);

  const backupId = generateBackupId();
  const createdAt = new Date();
  report({ phase: "assets", label: "Icone e banner del server…", percent: 5, backupId });
  const [guildIconData, guildBannerData, guildSplashData, guildDiscoverySplashData] = capturePolicy.includeAssetData
    ? await Promise.all([
      fetchAssetAsDataUri(guild.iconURL({ extension: "png", size: 1024 })),
      fetchAssetAsDataUri(guild.bannerURL({ extension: "png", size: 2048 })),
      fetchAssetAsDataUri(guild.splashURL?.({ extension: "png", size: 2048 })),
      fetchAssetAsDataUri(guild.discoverySplashURL?.({ extension: "png", size: 2048 })),
    ])
    : [null, null, null, null];

  const outputDir = getBackupFolder(guild.id);
  await fs.mkdir(outputDir, { recursive: true });

  report({ phase: "members", label: "Membri, ban, invite e webhook…", percent: 12, backupId });
  const [membersCollection, bansCollection, invitesCollection, webhooksCollection] = await Promise.all([
    guild.members.fetch().catch(() => null),
    guild.bans.fetch().catch(() => null),
    guild.invites.fetch().catch(() => null),
    guild.fetchWebhooks().catch(() => null),
  ]);

  report({ phase: "channels", label: "Canali e thread…", percent: 20, backupId });
  const activeThreads = await guild.channels.fetchActiveThreads().catch(() => null);

  const channels = [...guild.channels.cache.values()].filter((channel?) => !channel.isThread());

  const allThreadsById = new Map();
  if (activeThreads?.threads) {
    for (const thread of activeThreads.threads.values()) {
      allThreadsById.set(String(thread.id), thread);
    }
  }

  // Thread archiviati in parallelo (prima erano 1 canale alla volta → minutaggio su server grandi).
  let archivedDone = 0;
  await mapPool(channels, ARCHIVED_THREAD_CONCURRENCY, async (channel?) => {
    const archived = await collectArchivedThreads(channel).catch(() => []);
    for (const thread of archived) {
      allThreadsById.set(String(thread.id), thread);
    }
    archivedDone += 1;
    if (archivedDone % 8 === 0 || archivedDone === channels.length) {
      report({
        phase: "channels",
        label: `Thread archiviati (${archivedDone}/${channels.length})…`,
        percent: 20 + Math.floor((archivedDone / Math.max(1, channels.length)) * 8),
        backupId,
      });
    }
  });

  const serializedChannels = channels.map(serializeChannel);
  const serializedThreads = [...allThreadsById.values()].map(serializeThread);

  const textLikeChannels = channels.filter((channel?) => channel?.isTextBased?.() && typeof channel?.messages?.fetch === "function" && !channel?.isDMBased?.(),);

  const messagesByChannel: Record<string, any> = {};
  const messagesByThread: Record<string, any> = {};
  if (capturePolicy.maxMessagesPerChannel > 0) {
    const channelTotal = Math.max(1, textLikeChannels.length);
    let channelIdx = 0;
    for (const channel of textLikeChannels) {
      channelIdx += 1;
      const pct = 22 + Math.floor((channelIdx / channelTotal) * 40);
      report({
        phase: "messages",
        label: `Messaggi canali (${channelIdx}/${channelTotal})…`,
        percent: Math.min(62, pct),
        current: channelIdx,
        total: channelTotal,
        backupId,
      });
      messagesByChannel[String(channel.id)] = await fetchAllMessages(
        channel,
        capturePolicy.maxMessagesPerChannel,
      ).catch(() => []);
      await sleep(FETCH_DELAY_MS);
    }
    const threadList = [...allThreadsById.values()].filter(
      (thread?) => thread?.isTextBased?.() && typeof thread?.messages?.fetch === "function",
    );
    const threadTotal = Math.max(1, threadList.length);
    let threadIdx = 0;
    for (const thread of threadList) {
      threadIdx += 1;
      const pct = 62 + Math.floor((threadIdx / threadTotal) * 18);
      report({
        phase: "messages",
        label: `Messaggi thread (${threadIdx}/${threadTotal})…`,
        percent: Math.min(80, pct),
        current: threadIdx,
        total: threadTotal,
        backupId,
      });
      messagesByThread[String(thread.id)] = await fetchAllMessages(
        thread,
        capturePolicy.maxMessagesPerChannel,
      ).catch(() => []);
      await sleep(FETCH_DELAY_MS);
    }
  } else {
    report({ phase: "messages", label: "Messaggi saltati (policy)…", percent: 70, backupId });
  }

  report({ phase: "roles", label: "Ruoli, emoji e sticker…", percent: 78, backupId });
  const roles = [...guild.roles.cache.values()].sort((a?, b?) => b.position - a.position).map((role?) => ({ id: String(role.id), name: String(role.name || ""), color: Number(role.color || 0), hoist: Boolean(role.hoist), icon: role.icon || null, iconURL: role.iconURL({ extension: "png", size: 512 }), unicodeEmoji: role.unicodeEmoji || null, position: Number(role.position || 0), permissions: String(role.permissions?.bitfield ?? 0n), managed: Boolean(role.managed), mentionable: Boolean(role.mentionable), tags: role.tags ? { ...role.tags } : null, createdAt: toIso(role.createdAt), iconData: null, }));

  const members = membersCollection ? [...membersCollection.values()].map((member?) => ({ id: String(member.id), user: { id: String(member.user?.id || member.id), username: String(member.user?.username || ""), discriminator: String(member.user?.discriminator || "0"), tag: String(member.user?.tag || ""), globalName: member.user?.globalName || null, bot: Boolean(member.user?.bot), system: Boolean(member.user?.system), avatar: member.user?.avatar || null, banner: member.user?.banner || null, accentColor: member.user?.accentColor ?? null, createdAt: toIso(member.user?.createdAt), }, nickname: member.nickname || null, displayName: member.displayName || null, joinedAt: toIso(member.joinedAt), premiumSince: toIso(member.premiumSince), communicationDisabledUntil: toIso(member.communicationDisabledUntil), pending: Boolean(member.pending), roles: member.roles?.cache ? [...member.roles.cache.keys()].map(String) : [], avatar: member.avatar || null, avatarURL: member.displayAvatarURL({ size: 1024 }), })) : [];

  const emojis = [...guild.emojis.cache.values()].map((emoji?) => ({ id: String(emoji.id), name: String(emoji.name || ""), animated: Boolean(emoji.animated), managed: Boolean(emoji.managed), available: Boolean(emoji.available), createdAt: toIso(emoji.createdAt), url: emoji.imageURL?.() ?? null, roles: emoji.roles?.cache ? [...emoji.roles.cache.keys()].map(String) : [], userId: emoji.author?.id ? String(emoji.author.id) : null, imageData: null, }));

  const stickers = [...guild.stickers.cache.values()].map((sticker?) => ({ id: String(sticker.id), name: String(sticker.name || ""), description: sticker.description || null, format: Number(sticker.format ?? 0), type: Number(sticker.type ?? 0), tags: sticker.tags || null, url: sticker.url || null, available: Boolean(sticker.available), guildId: sticker.guildId ? String(sticker.guildId) : null, userId: sticker.user?.id ? String(sticker.user.id) : null, imageData: null, }));

  report({ phase: "extras", label: "Eventi, integrazioni e AutoMod…", percent: 84, backupId });
  const scheduledEvents = [...guild.scheduledEvents.cache.values()].map((ev?) => ({
    id: String(ev.id),
    name: String(ev.name || ""),
    description: ev.description || null,
    entityType: Number(ev.entityType ?? 0),
    status: Number(ev.status ?? 0),
    privacyLevel: Number(ev.privacyLevel ?? 0),
    entityMetadata: ev.entityMetadata || null,
    channelId: ev.channelId ? String(ev.channelId) : null,
    creatorId: ev.creatorId ? String(ev.creatorId) : null,
    userCount: Number(ev.userCount ?? 0),
    scheduledStartAt: toIso(ev.scheduledStartTimestamp || ev.scheduledStartAt),
    scheduledEndAt: toIso(ev.scheduledEndTimestamp || ev.scheduledEndAt),
    createdAt: toIso(ev.createdAt),
    image: ev.image || null,
    imageURL: typeof ev.coverImageURL === "function" ? ev.coverImageURL({ size: 1024 }) : null,
    imageData: null,
  }));

  const [integrations, autoModerationRules] = await Promise.all([
    guild.fetchIntegrations().catch(() => []),
    guild.autoModerationRules.fetch().catch(() => null),
  ]);

  if (capturePolicy.includeStructureAssetBytes) {
    report({ phase: "assets", label: "Download immagini struttura…", percent: 88, backupId });
    const assetJobs = [] as { kind: string; url: string; apply: (data?) => void }[];
    for (const role of roles) {
      if (!role.iconURL || role.id === String(guild.id)) continue;
      assetJobs.push({ kind: "role", url: role.iconURL, apply: (data?) => { role.iconData = data; } });
    }
    for (const emoji of emojis) {
      if (!emoji.url) continue;
      assetJobs.push({ kind: "emoji", url: emoji.url, apply: (data?) => { emoji.imageData = data; } });
    }
    for (const sticker of stickers) {
      if (!sticker.url || Number(sticker.format) === 3) continue;
      assetJobs.push({ kind: "sticker", url: sticker.url, apply: (data?) => { sticker.imageData = data; } });
    }
    for (const ev of scheduledEvents) {
      if (!ev.imageURL) continue;
      assetJobs.push({ kind: "event", url: ev.imageURL, apply: (data?) => { ev.imageData = data; } });
    }
    let assetDone = 0;
    await mapPool(assetJobs, ASSET_FETCH_CONCURRENCY, async (job?) => {
      const data = await fetchAssetAsDataUri(job.url);
      job.apply(data);
      assetDone += 1;
      if (assetDone % 12 === 0 || assetDone === assetJobs.length) {
        report({
          phase: "assets",
          label: `Immagini struttura (${assetDone}/${assetJobs.length})…`,
          percent: 88 + Math.floor((assetDone / Math.max(1, assetJobs.length)) * 4),
          backupId,
        });
      }
    });
  }

  report({
    phase: "audit",
    label: capturePolicy.maxAuditLogs > 0 ? "Audit log…" : "Audit log saltato…",
    percent: 93,
    backupId,
  });
  let auditLogs = [];
  let before;
  while (capturePolicy.maxAuditLogs > 0 && auditLogs.length < capturePolicy.maxAuditLogs) {
    const logs = await guild.fetchAuditLogs({ limit: 100, ...(before ? { before } : {}) }).catch(() => null);
    if (!logs || logs.entries.size === 0) break;

    const entries = [...logs.entries.values()];
    for (const entry of entries) {
      if (capturePolicy.maxAuditLogs > 0 && auditLogs.length >= capturePolicy.maxAuditLogs) break;
      auditLogs.push({
        id: String(entry.id),
        action: Number(entry.action ?? 0),
        actionType: String(entry.actionType || ""),
        targetId: entry.targetId ? String(entry.targetId) : null,
        executorId: entry.executorId ? String(entry.executorId) : null,
        reason: entry.reason || null,
        createdAt: toIso(entry.createdAt),
        extra: entry.extra || null,
        changes: Array.isArray(entry.changes)
          ? entry.changes.map((change?) => ({
            key: change?.key || null,
            old: change?.old ?? null,
            new: change?.new ?? null,
          }))
          : [],
      });
    }

    before = entries[entries.length - 1]?.id;
    if (!before || entries.length < 100) break;
    if (capturePolicy.maxAuditLogs > 0 && auditLogs.length >= capturePolicy.maxAuditLogs) break;
    await sleep(FETCH_DELAY_MS);
  }

  const backupSource = String(options?.source || "manual").trim().toLowerCase();

  report({ phase: "packing", label: "Compressione e salvataggio…", percent: 95, backupId });
  let webhooks = webhooksCollection
    ? [...webhooksCollection.values()].map((hook?) => ({
      id: String(hook.id),
      type: Number(hook.type ?? 0),
      guildId: hook.guildId ? String(hook.guildId) : null,
      channelId: hook.channelId ? String(hook.channelId) : null,
      name: hook.name || null,
      avatar: hook.avatar || null,
      avatarURL: hook.avatar
        ? `https://cdn.discordapp.com/avatars/${hook.id}/${hook.avatar}.png?size=256`
        : null,
      avatarData: null,
      applicationId: hook.applicationId ? String(hook.applicationId) : null,
      sourceGuildId: hook.sourceGuild?.id ? String(hook.sourceGuild.id) : null,
      sourceChannelId: hook.sourceChannel?.id ? String(hook.sourceChannel.id) : null,
    }))
    : [];
  if (capturePolicy.includeStructureAssetBytes) {
    await mapPool(
      webhooks.filter((h?) => h.avatarURL),
      ASSET_FETCH_CONCURRENCY,
      async (hook?) => {
        hook.avatarData = await fetchAssetAsDataUri(hook.avatarURL);
      },
    );
  }

  const backupPayload = {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    backupId,
    createdAt: createdAt.toISOString(),
    source: backupSource === "automatic" ? "automatic" : "manual",
    capturePolicy: {
      maxMessagesPerChannel: capturePolicy.maxMessagesPerChannel,
      maxAuditLogs: capturePolicy.maxAuditLogs,
      includeAssetData: capturePolicy.includeAssetData,
      includeStructureAssetBytes: Boolean(capturePolicy.includeStructureAssetBytes),
    },
    guild: {
      id: String(guild.id),
      name: String(guild.name || ""),
      icon: guild.icon || null,
      iconURL: guild.iconURL({ size: 2048 }),
      iconData: guildIconData,
      banner: guild.banner || null,
      bannerURL: guild.bannerURL({ size: 2048 }),
      bannerData: guildBannerData,
      splash: guild.splash || null,
      splashURL: guild.splashURL?.({ size: 2048 }) || null,
      splashData: guildSplashData,
      discoverySplash: guild.discoverySplash || null,
      discoverySplashURL: guild.discoverySplashURL?.({ size: 2048 }) || null,
      discoverySplashData: guildDiscoverySplashData,
      description: guild.description || null,
      vanityURLCode: guild.vanityURLCode || null,
      preferredLocale: guild.preferredLocale || null,
      features: Array.isArray(guild.features) ? guild.features : [],
      verificationLevel: Number(guild.verificationLevel ?? 0),
      explicitContentFilter: Number(guild.explicitContentFilter ?? 0),
      defaultMessageNotifications: Number(guild.defaultMessageNotifications ?? 0),
      mfaLevel: Number(guild.mfaLevel ?? 0),
      nsfwLevel: Number(guild.nsfwLevel ?? 0),
      premiumTier: Number(guild.premiumTier ?? 0),
      premiumProgressBarEnabled: Boolean(guild.premiumProgressBarEnabled),
      afkTimeout: Number(guild.afkTimeout ?? 0),
      afkChannelId: guild.afkChannelId ? String(guild.afkChannelId) : null,
      systemChannelId: guild.systemChannelId ? String(guild.systemChannelId) : null,
      systemChannelFlags: Number(guild.systemChannelFlags?.bitfield ?? 0),
      rulesChannelId: guild.rulesChannelId ? String(guild.rulesChannelId) : null,
      publicUpdatesChannelId: guild.publicUpdatesChannelId ? String(guild.publicUpdatesChannelId) : null,
      safetyAlertsChannelId: guild.safetyAlertsChannelId ? String(guild.safetyAlertsChannelId) : null,
      widgetEnabled: Boolean(guild.widgetEnabled),
      widgetChannelId: guild.widgetChannelId ? String(guild.widgetChannelId) : null,
      ownerId: guild.ownerId ? String(guild.ownerId) : null,
      maxMembers: Number(guild.maximumMembers ?? 0),
      maxPresences: Number(guild.maximumPresences ?? 0),
      maxVideoChannelUsers: Number(guild.maxVideoChannelUsers ?? 0),
      memberCount: Number(guild.memberCount ?? 0),
      rolesCount: Number(guild.roles.cache.size || 0),
      channelsCount: Number(channels.length),
      threadsCount: Number(serializedThreads.length),
      emojisCount: Number(guild.emojis.cache.size || 0),
      stickersCount: Number(guild.stickers.cache.size || 0),
      createdAt: toIso(guild.createdAt),
    },
    roles,
    channels: serializedChannels,
    threads: serializedThreads,
    members,
    bans: bansCollection
      ? [...bansCollection.values()].map((ban?) => ({
        user: {
          id: String(ban.user.id),
          username: String(ban.user.username || ""),
          discriminator: String(ban.user.discriminator || "0"),
          tag: String(ban.user.tag || ""),
          bot: Boolean(ban.user.bot),
          createdAt: toIso(ban.user.createdAt),
        },
        reason: ban.reason || null,
      }))
      : [],
    invites: invitesCollection
      ? [...invitesCollection.values()].map((invite?) => ({
        code: String(invite.code),
        url: invite.url || null,
        channelId: invite.channelId ? String(invite.channelId) : null,
        inviterId: invite.inviterId ? String(invite.inviterId) : null,
        targetType: invite.targetType ?? null,
        targetUserId: invite.targetUserId ? String(invite.targetUserId) : null,
        expiresAt: toIso(invite.expiresAt),
        createdAt: toIso(invite.createdAt),
        temporary: Boolean(invite.temporary),
        maxAge: Number(invite.maxAge ?? 0),
        maxUses: Number(invite.maxUses ?? 0),
        uses: Number(invite.uses ?? 0),
      }))
      : [],
    webhooks,
    emojis,
    stickers,
    scheduledEvents,
    integrations: Array.isArray(integrations)
      ? integrations.map((integration?) => ({
        id: String(integration.id),
        name: String(integration.name || ""),
        type: String(integration.type || ""),
        enabled: Boolean(integration.enabled),
        syncing: Boolean(integration.syncing),
        roleId: integration.roleId ? String(integration.roleId) : null,
        expireBehavior: integration.expireBehavior ?? null,
        expireGracePeriod: integration.expireGracePeriod ?? null,
        userId: integration.user?.id ? String(integration.user.id) : null,
        account: integration.account
          ? { id: String(integration.account.id || ""), name: String(integration.account.name || "") }
          : null,
        syncedAt: toIso(integration.syncedAt),
        subscriberCount: Number(integration.subscriberCount ?? 0),
        revoked: Boolean(integration.revoked),
        application: integration.application
          ? {
            id: String(integration.application.id || ""),
            name: String(integration.application.name || ""),
            icon: integration.application.icon || null,
          }
          : null,
      }))
      : [],
    autoModerationRules: autoModerationRules
      ? [...autoModerationRules.values()].map((rule?) => ({
        id: String(rule.id),
        name: String(rule.name || ""),
        creatorId: rule.creatorId ? String(rule.creatorId) : null,
        eventType: Number(rule.eventType ?? 0),
        triggerType: Number(rule.triggerType ?? 0),
        triggerMetadata:
          typeof rule.triggerMetadata?.toJSON === "function"
            ? rule.triggerMetadata.toJSON()
            : rule.triggerMetadata || null,
        enabled: Boolean(rule.enabled),
        exemptChannels: Array.isArray(rule.exemptChannels) ? rule.exemptChannels.map(String) : [],
        exemptRoles: Array.isArray(rule.exemptRoles) ? rule.exemptRoles.map(String) : [],
        actions: Array.isArray(rule.actions)
          ? rule.actions.map((action?) => (typeof action?.toJSON === "function" ? action.toJSON() : action))
          : [],
      }))
      : [],
    auditLogs,
    messages: { channels: messagesByChannel, threads: messagesByThread },
  };

  const serialized = stringifyBackupPayload(backupPayload);
  // level 6 ≈ buono compromesso: BEST_COMPRESSION su snapshot grandi aggiunge secondi inutili
  const compressed = await gzipAsync(serialized, { level: 6 });

  const payloadSha256 = sha256(Buffer.from(serialized, "utf8"));
  const compressedSha256 = sha256(compressed);

  const fileName = `${backupId}.json.gz`;
  const absolutePath = path.join(outputDir, fileName);
  const backupPath = getBackupBakPath(guild.id, backupId);
  await writeFileAtomic(absolutePath, compressed);
  await fs.copyFile(absolutePath, backupPath).catch(() => null);
  const stats = {
    members: members.length,
    roles: roles.length,
    channels: serializedChannels.length,
    threads: serializedThreads.length,
    messages:
      Object.values(messagesByChannel).reduce((sum?, arr?) => sum + arr.length, 0) +
      Object.values(messagesByThread).reduce((sum?, arr?) => sum + arr.length, 0),
    emojis: emojis.length,
    stickers: stickers.length,
    bans: backupPayload.bans.length,
    invites: backupPayload.invites.length,
    webhooks: backupPayload.webhooks.length,
    scheduledEvents: scheduledEvents.length,
    integrations: backupPayload.integrations.length,
    automodRules: backupPayload.autoModerationRules.length,
    auditLogs: auditLogs.length,
  };

  await writeBackupMetaFile(guild.id, backupId, {
    schemaVersion: BACKUP_SCHEMA_VERSION,
    backupId,
    guildId: String(guild.id),
    guildName: String(guild.name || ""),
    createdAt: createdAt.toISOString(),
    source: backupSource === "automatic" ? "automatic" : "manual",
    checksum: {
      algorithm: "sha256",
      payload: payloadSha256,
      compressed: compressedSha256,
    },
    file: {
      primary: path.basename(absolutePath),
      backup: path.basename(backupPath),
      sizeBytes: compressed.length,
    },
    stats,
  });

  try {
    const {
      buildPreviewFromPayload,
      writeBackupPreview,
    } = require("./backupPreviewService") as typeof import("./backupPreviewService");
    const preview = buildPreviewFromPayload(backupPayload, {
      backupId,
      guildId: String(guild.id),
      guildName: String(guild.name || ""),
      createdAt: createdAt.toISOString(),
      source: backupSource === "automatic" ? "automatic" : "manual",
      file: { sizeBytes: compressed.length },
      stats,
    });
    await writeBackupPreview(guild.id, backupId, preview);
  } catch (previewErr) {
    global.logger?.warn?.("[backup] preview write failed:", previewErr);
  }

  report({ phase: "done", label: "Backup completato", percent: 100, backupId });
  return {
    backupId,
    fileName,
    absolutePath,
    sizeBytes: compressed.length,
    checksum: { algorithm: "sha256", payload: payloadSha256, compressed: compressedSha256 },
    stats,
  };
}

export = { createGuildBackup };
