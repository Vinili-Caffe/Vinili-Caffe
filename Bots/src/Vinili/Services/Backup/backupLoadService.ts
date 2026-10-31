const { ActionRowBuilder, StringSelectMenuBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder, PermissionFlagsBits, } = require("discord.js") as typeof import("discord.js");
const path = require("path") as typeof import("path");
const { readSnapshotWithMeta, writeSnapshotWithMeta } = require("../../../shared/recovery/snapshotStore") as typeof import("../../../shared/recovery/snapshotStore");
const { registerShutdownFlush, armShutdownCheckpoint } = require("../../../shared/recovery/shutdownCheckpoint") as typeof import("../../../shared/recovery/shutdownCheckpoint");
const { readBackupByIdGlobal, createGuildBackup } = require("./serverBackupService") as typeof import("./serverBackupService");
const { LOAD_ACTIONS, DEFAULT_ACTIONS, DEFAULT_MESSAGES_LIMIT, ACTIVE_LOAD_STALE_MS, activeLoadsByGuild, persistRuntimeSnapshotNow, ensureRuntimeLoaded, sleep, sanitizeActions, normalizeMessagesLimit, formatMessagesLimit, createLoadSession, getLoadSession, updateLoadSessionActions, updateLoadSessionMessagesLimit, deleteLoadSession } = require("./backupLoadSessions") as typeof import("./backupLoadSessions");
const { buildLoadWarningEmbed, buildLoadInProgressEmbed, buildLoadStartComponents, countBackupMessages, countBackupPinnedMessages, buildPreflightWarningEmbed, buildPreflightButtons, buildLoadDoneEmbed, buildLoadErrorEmbed, buildLoadCancelledEmbed, buildLoadComponents, buildDryRunEmbed } = require("./backupLoadEmbeds") as typeof import("./backupLoadEmbeds");
const { buildPermissionOverwrites, syncLoadedRoles, syncLoadedChannels, normalizeMessagePayload, resolveAssetInput, computePermissionDiffs } = require("./backupLoadSync") as typeof import("./backupLoadSync");



class BackupLoadCancelledError extends Error {
  declare code: any;
  constructor(message = "<a:VC_Alert:1482706673176150077> Backup load cancelled by user.") {
    super(message);
    this.name = "BackupLoadCancelledError";
    this.code = "BACKUP_LOAD_CANCELLED";
  }
}

function getActiveLoadState(guildId?) {
  ensureRuntimeLoaded();
  const key = String(guildId || "");
  if (!key) return null;
  const state = activeLoadsByGuild.get(key) || null;
  if (!state) return null;

  const phase = String(state.phase || "").toLowerCase();
  const startedAt = Number(state.startedAtMs || 0);
  const updatedAt = Number(state.updatedAtMs || startedAt || 0);
  const now = Date.now();

  if (["completed", "failed", "cancelled", "done"].includes(phase)) {
    activeLoadsByGuild.delete(key);
    return null;
  }

  if (!startedAt || now - Math.max(startedAt, updatedAt) > ACTIVE_LOAD_STALE_MS) {
    activeLoadsByGuild.delete(key);
    return null;
  }

  return state;
}

function startActiveLoad({ guildId, userId, backupId, actions, messagesLimit }) {
  ensureRuntimeLoaded();
  const key = String(guildId || "");
  if (!key) return null;
  const state = { guildId: key, userId: String(userId || ""), backupId: String(backupId || "").toUpperCase(), actions: Array.from(sanitizeActions(actions)), messagesLimit: normalizeMessagesLimit(messagesLimit, DEFAULT_MESSAGES_LIMIT), startedAtMs: Date.now(), updatedAtMs: Date.now(), cancelRequested: false, phase: "starting", processed: 0, };
  activeLoadsByGuild.set(key, state);
  persistRuntimeSnapshotNow();
  return state;
}

function startActiveLoadIfIdle({ guildId, userId, backupId, actions, messagesLimit }) {
  const key = String(guildId || "");
  if (!key) return null;
  clearStaleActiveLoad(key);
  if (getActiveLoadState(key)) return null;
  return startActiveLoad({
    guildId: key,
    userId,
    backupId,
    actions,
    messagesLimit,
  });
}

function finishActiveLoad(guildId?) {
  ensureRuntimeLoaded();
  const key = String(guildId || "");
  if (!key) return;
  activeLoadsByGuild.delete(key);
  persistRuntimeSnapshotNow();
}

function updateActiveLoad(guildId?, patch: Record<string, any> = {}) {
  ensureRuntimeLoaded();
  const state = getActiveLoadState(guildId);
  if (!state) return null;
  Object.assign(state, patch, { updatedAtMs: Date.now() });
  persistRuntimeSnapshotNow();
  return state;
}

function requestCancelActiveLoad(guildId?) {
  ensureRuntimeLoaded();
  const state = getActiveLoadState(guildId);
  if (!state) return false;
  state.cancelRequested = true;
  state.updatedAtMs = Date.now();
  persistRuntimeSnapshotNow();
  return true;
}

function throwIfCancelled(guildId?) {
  const state = getActiveLoadState(guildId);
  if (state?.cancelRequested) {
    throw new BackupLoadCancelledError();
  }
}

function clearStaleActiveLoad(guildId?) {
  const key = String(guildId || "");
  if (!key) return false;
  const current = activeLoadsByGuild.get(key);
  if (!current) return false;

  const phase = String(current.phase || "").toLowerCase();
  const startedAt = Number(current.startedAtMs || 0);
  const updatedAt = Number(current.updatedAtMs || startedAt || 0);
  const now = Date.now();

  const isTerminal = ["completed", "failed", "cancelled", "done"].includes(phase);
  const isStale = !startedAt || now - Math.max(startedAt, updatedAt) > ACTIVE_LOAD_STALE_MS;

  if (isTerminal || isStale) {
    activeLoadsByGuild.delete(key);
    return true;
  }

  return false;
}

function ensureManageGuild(interaction?) {
  return Boolean(interaction?.memberPermissions?.has?.(PermissionFlagsBits.ManageGuild));
}

async function applyBackupToGuild(guild?, backupId?, selectedActions?, sourceGuildId = null, messagesLimit = DEFAULT_MESSAGES_LIMIT) {
  const guildKey = String(guild?.id || "");
  const actions = sanitizeActions(selectedActions);
  const ref = sourceGuildId ? `${sourceGuildId}:${backupId}` : backupId;
  const { payload } = await readBackupByIdGlobal(ref);
  const effectiveMessagesLimit = normalizeMessagesLimit(messagesLimit, DEFAULT_MESSAGES_LIMIT);
  const markPhase = (phase?) => updateActiveLoad(guildKey, { phase });
  const bumpProcessed = (delta = 1) => { const state = getActiveLoadState(guildKey); if (!state) return; state.processed = Number(state.processed || 0) + Number(delta || 0); state.updatedAtMs = Date.now(); };

  const stats: Record<string, any> = { deletedRoles: 0, deletedChannels: 0, createdRoles: 0, createdChannels: 0, createdThreads: 0, updatedMembers: 0, loadedBans: 0, loadedMessages: 0, loadedPinnedMessages: 0, loadedEmojis: 0, loadedStickers: 0, loadedWebhooks: 0, loadedInvites: 0, loadedEvents: 0, loadedAutomodRules: 0, };

  const roleMap = new Map();
  roleMap.set(String(guild.id), String(guild.id));

  if (actions.has("delete_roles")) {
    markPhase("delete_roles");
    const candidateRoles = [...guild.roles.cache.values()].filter((r?) => !r.managed && r.id !== guild.id).sort((a?, b?) => a.position - b.position);
    const undeletable = candidateRoles.filter((r?) => !r.editable);
    if (undeletable.length > 0) {
      const preview = undeletable.slice(0, 8).map((r?) => `@${r.name}`)
        .join(", ");
      throw new Error(
        `<a:VC_Alert:1482706673176150077> Impossibile eliminare tutti i ruoli: alza il ruolo del bot sopra i ruoli target. Bloccanti: ${preview}${undeletable.length > 8 ? ", ..." : ""}`,
      );
    }
    const roles = candidateRoles;
    for (const role of roles) {
      throwIfCancelled(guildKey);
      const ok = await role.delete("Backup load - delete roles").catch(() => null);
      if (ok) stats.deletedRoles += 1;
      bumpProcessed();
      await sleep(150);
    }
  }

  if (actions.has("load_roles")) {
    markPhase("load_roles");
    const backupRoles = (Array.isArray(payload?.roles) ? payload.roles : []).filter((r?) => String(r?.name || "").trim() !== "@everyone").sort((a?, b?) => Number(a?.position ?? 0) - Number(b?.position ?? 0));

    for (const role of backupRoles) {
      throwIfCancelled(guildKey);
      const created = await guild.roles.create({
        name: String(role.name || "ruolo"),
        colors: { primaryColor: Number(role.color || 0) },
        hoist: Boolean(role.hoist),
        mentionable: Boolean(role.mentionable),
        permissions: BigInt(String(role.permissions || "0")),
        icon: (await resolveAssetInput(role.iconData || role.iconURL || null)) || undefined,
        unicodeEmoji: role.unicodeEmoji || undefined,
        reason: `Backup load ${backupId}`,
      })
        .catch(() => null);
      if (!created) continue;
      roleMap.set(String(role.id), String(created.id));
      stats.createdRoles += 1;
      bumpProcessed();
      await sleep(150);
    }
  } else {
    const backupRoles = Array.isArray(payload?.roles) ? payload.roles : [];
    for (const oldRole of backupRoles) {
      if (String(oldRole?.name || "").trim() === "@everyone") {
        roleMap.set(String(oldRole.id), String(guild.id));
        continue;
      }
      const hit = guild.roles.cache.find((r?) => String(r.name) === String(oldRole.name));
      if (hit) roleMap.set(String(oldRole.id), String(hit.id));
    }
  }

  if (actions.has("load_roles")) {
    markPhase("sync_role_permissions");
    await syncLoadedRoles({
      guild,
      backupRoles: payload?.roles,
      roleMap,
      backupId,
      throwIfCancelledFn: () => throwIfCancelled(guildKey),
      bumpProcessedFn: () => bumpProcessed(),
    });
  }

  const channelMap = new Map();
  const threadMap = new Map();
  const emojiMap = new Map();
  const stickerMap = new Map();

  if (actions.has("delete_channels")) {
    markPhase("delete_channels");
    const channels = [...guild.channels.cache.values()].sort((a?, b?) => a.position - b.position);
    for (const channel of channels) {
      throwIfCancelled(guildKey);
      const ok = await channel.delete("Backup load - delete channels").catch(() => null);
      if (ok) stats.deletedChannels += 1;
      bumpProcessed();
      await sleep(250);
    }
  }

  if (actions.has("load_channels")) {
    markPhase("load_channels");
    const backupChannels = Array.isArray(payload?.channels) ? payload.channels : [];
    const categories = backupChannels.filter((c?) => Number(c?.type) === 4).sort((a?, b?) => Number(a?.position ?? 0) - Number(b?.position ?? 0));

    for (const cat of categories) {
      throwIfCancelled(guildKey);
      const created = await guild.channels.create({
        name: String(cat.name || "categoria"), type: 4, position: Number(cat.position ?? 0), permissionOverwrites: buildPermissionOverwrites(cat.permissionOverwrites, roleMap, guild), reason: `Backup load ${backupId}`,
      })
        .catch(() => null);
      if (!created) continue;
      channelMap.set(String(cat.id), String(created.id));
      stats.createdChannels += 1;
      bumpProcessed();
      await sleep(250);
    }

    const others = backupChannels.filter((c?) => Number(c?.type) !== 4).sort((a?, b?) => Number(a?.position ?? 0) - Number(b?.position ?? 0));

    for (const ch of others) {
      throwIfCancelled(guildKey);
      const type = Number(ch?.type ?? 0);
      if (![0, 2, 5, 13, 15, 16].includes(type)) continue;

      const parentId = ch.parentId ? channelMap.get(String(ch.parentId)) || null : null;
      const created = await guild.channels.create({
        name: String(ch.name || "canale"), type, topic: ch.topic || undefined, nsfw: Boolean(ch.nsfw), rateLimitPerUser: Number(ch.rateLimitPerUser ?? 0), bitrate: Number(ch.bitrate ?? 0) || undefined, userLimit: Number(ch.userLimit ?? 0) || undefined, rtcRegion: ch.rtcRegion || null, videoQualityMode: ch.videoQualityMode ?? undefined, defaultAutoArchiveDuration: ch.defaultAutoArchiveDuration ?? undefined, defaultThreadRateLimitPerUser: ch.defaultThreadRateLimitPerUser ?? undefined, defaultForumLayout: ch.defaultForumLayout ?? undefined, defaultSortOrder: ch.defaultSortOrder ?? undefined, availableTags: Array.isArray(ch.availableTags) ? ch.availableTags : undefined, defaultReactionEmoji: ch.defaultReactionEmoji || undefined, parent: parentId || undefined, position: Number(ch.position ?? 0), permissionOverwrites: buildPermissionOverwrites(ch.permissionOverwrites, roleMap, guild), reason: `Backup load ${backupId}`,
      })
        .catch(() => null);
      if (!created) continue;
      channelMap.set(String(ch.id), String(created.id));
      stats.createdChannels += 1;
      bumpProcessed();
      await sleep(250);
    }
  } else {
    const backupChannels = Array.isArray(payload?.channels) ? payload.channels : [];
    for (const oldChannel of backupChannels) {
      const hit = guild.channels.cache.find((c?) => String(c.name) === String(oldChannel.name));
      if (hit) channelMap.set(String(oldChannel.id), String(hit.id));
    }
  }

  if (actions.has("load_channels")) {
    markPhase("sync_channel_permissions");
    await syncLoadedChannels({
      guild,
      backupChannels: payload?.channels,
      roleMap,
      channelMap,
      backupId,
      throwIfCancelledFn: () => throwIfCancelled(guildKey),
      bumpProcessedFn: () => bumpProcessed(),
    });
  }

  if (actions.has("load_settings")) {
    markPhase("load_settings");
    throwIfCancelled(guildKey);
    const g = payload?.guild || {};
    const iconInput = await resolveAssetInput(g.iconData || g.iconURL || null);
    const bannerInput = await resolveAssetInput(g.bannerData || g.bannerURL || null,);
    const splashInput = await resolveAssetInput(g.splashData || g.splashURL || null,);
    const discoverySplashInput = await resolveAssetInput(g.discoverySplashData || g.discoverySplashURL || null,);
    await guild
      .edit({
        name: g.name || guild.name,
        description: g.description || null,
        verificationLevel: Number(g.verificationLevel ?? guild.verificationLevel),
        defaultMessageNotifications: Number(
          g.defaultMessageNotifications ?? guild.defaultMessageNotifications,
        ),
        explicitContentFilter: Number(g.explicitContentFilter ?? guild.explicitContentFilter),
        preferredLocale: g.preferredLocale || guild.preferredLocale,
        afkTimeout: Number(g.afkTimeout ?? guild.afkTimeout),
        systemChannel: g.systemChannelId
          ? channelMap.get(String(g.systemChannelId)) || guild.systemChannelId || null
          : null,
        rulesChannel: g.rulesChannelId
          ? channelMap.get(String(g.rulesChannelId)) || guild.rulesChannelId || null
          : null,
        publicUpdatesChannel: g.publicUpdatesChannelId
          ? channelMap.get(String(g.publicUpdatesChannelId)) || guild.publicUpdatesChannelId || null
          : null,
        safetyAlertsChannel: g.safetyAlertsChannelId
          ? channelMap.get(String(g.safetyAlertsChannelId)) || guild.safetyAlertsChannelId || null
          : null,
        ...(iconInput ? { icon: iconInput } : {}),
        ...(bannerInput ? { banner: bannerInput } : {}),
        ...(splashInput ? { splash: splashInput } : {}),
        ...(discoverySplashInput ? { discoverySplash: discoverySplashInput } : {}),
      })
      .catch(() => null);
    bumpProcessed();
  }

  if (actions.has("load_threads")) {
    markPhase("load_threads");
    const backupThreads = Array.isArray(payload?.threads) ? payload.threads : [];
    for (const thread of backupThreads) {
      throwIfCancelled(guildKey);
      const mappedParent = channelMap.get(String(thread.parentId || ""));
      if (!mappedParent) continue;
      const parent = guild.channels.cache.get(mappedParent);
      if (!parent || !parent.threads || typeof parent.threads.create !== "function") continue;

      const created = await parent.threads.create({
        name: String(thread.name || "thread"), autoArchiveDuration: Number(thread.autoArchiveDuration || 1440), rateLimitPerUser: Number(thread.rateLimitPerUser || 0), invitable: Boolean(thread.invitable), reason: `Backup load ${backupId}`,
      })
        .catch(() => null);
      if (!created) continue;
      await created
        .edit({
          archived: Boolean(thread.archived),
          locked: Boolean(thread.locked),
          autoArchiveDuration: Number(thread.autoArchiveDuration || 1440),
          rateLimitPerUser: Number(thread.rateLimitPerUser || 0),
          permissionOverwrites: buildPermissionOverwrites(
            thread.permissionOverwrites,
            roleMap,
            guild,
          ),
          reason: `Backup load ${backupId}`,
        })
        .catch(() => null);
      stats.createdThreads += 1;
      threadMap.set(String(thread.id), String(created.id));
      bumpProcessed();
      await sleep(250);
    }
  }

  if (actions.has("load_member_info")) {
    markPhase("load_member_info");
    const backupMembers = Array.isArray(payload?.members) ? payload.members : [];
    for (const memberData of backupMembers) {
      throwIfCancelled(guildKey);
      const member = await guild.members.fetch(String(memberData.id || "")).catch(() => null);
      if (!member) continue;

      const targetRoles = (Array.isArray(memberData.roles) ? memberData.roles : []).map((oldId?) => roleMap.get(String(oldId))).filter(Boolean).filter((id?) => id !== guild.id && guild.roles.cache.has(id));

      await member.roles.set(targetRoles, `Backup load ${backupId}`).catch(() => null);
      if (typeof memberData.nickname === "string") {
        await member.setNickname(memberData.nickname || null, `Backup load ${backupId}`).catch(() => null);
      }
      stats.updatedMembers += 1;
      bumpProcessed();
      await sleep(120);
    }
  }

  if (actions.has("load_bans")) {
    markPhase("load_bans");
    const bans = Array.isArray(payload?.bans) ? payload.bans : [];
    for (const ban of bans) {
      throwIfCancelled(guildKey);
      const userId = String(ban?.user?.id || "").trim();
      if (!userId) continue;
      const ok = await guild.bans.create(userId, { reason: ban?.reason || `Backup load ${backupId}` })
        .catch(() => null);
      if (ok) stats.loadedBans += 1;
      bumpProcessed();
      await sleep(200);
    }
  }

  if (actions.has("load_messages")) {
    markPhase("load_messages");
    const msgByChannel = payload?.messages?.channels || {};
    const entries = Object.entries(msgByChannel);
    let restoredMessages = 0;

    for (const [oldChannelId, messages] of entries) {
      if (effectiveMessagesLimit != null && restoredMessages >= effectiveMessagesLimit) break;
      throwIfCancelled(guildKey);
      const mapped = channelMap.get(String(oldChannelId));
      if (!mapped) continue;
      const channel = guild.channels.cache.get(mapped);
      if (!channel || !channel.isTextBased || !channel.isTextBased()) continue;

      const list = Array.isArray(messages) ? messages : [];
      for (const message of list) {
        if (effectiveMessagesLimit != null && restoredMessages >= effectiveMessagesLimit) break;
        throwIfCancelled(guildKey);
        const payloadToSend = normalizeMessagePayload(message, backupId);
        const sent = await channel.send(payloadToSend).catch(() => null);
        if (!sent) continue;
        stats.loadedMessages += 1;
        restoredMessages += 1;
        bumpProcessed();

        if (actions.has("load_pinned_messages") && message?.pinned) {
          const pinned = await sent.pin("Backup load pinned message").catch(() => null);
          if (pinned) stats.loadedPinnedMessages += 1;
          if (pinned) bumpProcessed();
        }

        await sleep(350);
      }
    }

    const msgByThread = payload?.messages?.threads || {};
    const threadEntries = Object.entries(msgByThread);
    for (const [oldThreadId, messages] of threadEntries) {
      if (effectiveMessagesLimit != null && restoredMessages >= effectiveMessagesLimit) break;
      throwIfCancelled(guildKey);
      const mappedThreadId = threadMap.get(String(oldThreadId));
      if (!mappedThreadId) continue;
      const thread = guild.channels.cache.get(mappedThreadId);
      if (!thread || !thread.isTextBased || !thread.isTextBased()) continue;

      const list = Array.isArray(messages) ? messages : [];
      for (const message of list) {
        if (effectiveMessagesLimit != null && restoredMessages >= effectiveMessagesLimit) break;
        throwIfCancelled(guildKey);
        const payloadToSend = normalizeMessagePayload(message, backupId);
        const sent = await thread.send(payloadToSend).catch(() => null);
        if (!sent) continue;
        stats.loadedMessages += 1;
        restoredMessages += 1;
        bumpProcessed();

        if (actions.has("load_pinned_messages") && message?.pinned) {
          const pinned = await sent.pin("Backup load pinned message").catch(() => null);
          if (pinned) stats.loadedPinnedMessages += 1;
          if (pinned) bumpProcessed();
        }
        await sleep(350);
      }
    }
  }

  if (actions.has("load_emojis")) {
    markPhase("load_emojis");
    const emojis = Array.isArray(payload?.emojis) ? payload.emojis : [];
    for (const emoji of emojis) {
      throwIfCancelled(guildKey);
      if (!emoji?.name) continue;
      if (guild.emojis.cache.some((e?) => String(e.name) === String(emoji.name))) {
        const existing = guild.emojis.cache.find((e?) => String(e.name) === String(emoji.name));
        if (existing && emoji.id) emojiMap.set(String(emoji.id), String(existing.id));
        continue;
      }
      const attachment = await resolveAssetInput(emoji.imageData || emoji.url);
      if (!attachment) continue;
      const mappedRoles = (Array.isArray(emoji.roles) ? emoji.roles : []).map((oldId?) => roleMap.get(String(oldId))).filter(Boolean);
      const created = await guild.emojis.create({
        attachment, name: String(emoji.name), roles: mappedRoles, reason: `Backup load ${backupId}`,
      })
        .catch(() => null);
      if (!created) continue;
      if (emoji.id) emojiMap.set(String(emoji.id), String(created.id));
      stats.loadedEmojis += 1;
      bumpProcessed();
      await sleep(350);
    }
  }

  if (actions.has("load_stickers")) {
    markPhase("load_stickers");
    const stickers = Array.isArray(payload?.stickers) ? payload.stickers : [];
    for (const sticker of stickers) {
      throwIfCancelled(guildKey);
      if (!sticker?.name) continue;
      if (guild.stickers.cache.some((s?) => String(s.name) === String(sticker.name))) {
        const existing = guild.stickers.cache.find((s?) => String(s.name) === String(sticker.name));
        if (existing && sticker.id) stickerMap.set(String(sticker.id), String(existing.id));
        continue;
      }
      const file = await resolveAssetInput(sticker.imageData || sticker.url);
      if (!file) continue;
      const created = await guild.stickers.create({
        file, name: String(sticker.name || "sticker"), description: sticker.description || undefined, tags: String(sticker.tags || "backup"), reason: `Backup load ${backupId}`,
      })
        .catch(() => null);
      if (!created) continue;
      if (sticker.id) stickerMap.set(String(sticker.id), String(created.id));
      stats.loadedStickers += 1;
      bumpProcessed();
      await sleep(350);
    }
  }

  if (actions.has("load_webhooks")) {
    markPhase("load_webhooks");
    const webhooks = Array.isArray(payload?.webhooks) ? payload.webhooks : [];
    for (const hook of webhooks) {
      throwIfCancelled(guildKey);
      const mappedChannelId = channelMap.get(String(hook?.channelId || ""));
      if (!mappedChannelId) continue;
      const channel = guild.channels.cache.get(mappedChannelId);
      if (!channel || typeof channel.createWebhook !== "function") continue;
      const avatar = await resolveAssetInput(hook?.avatar ? `https://cdn.discordapp.com/avatars/${hook.id}/${hook.avatar}.png` : null);
      const created = await channel.createWebhook({
        name: String(hook?.name || "backup-webhook"), avatar: avatar || undefined, reason: `Backup load ${backupId}`,
      })
        .catch(() => null);
      if (!created) continue;
      stats.loadedWebhooks += 1;
      bumpProcessed();
      await sleep(350);
    }
  }

  if (actions.has("load_invites")) {
    markPhase("load_invites");
    const invites = Array.isArray(payload?.invites) ? payload.invites : [];
    for (const invite of invites) {
      throwIfCancelled(guildKey);
      const mappedChannelId = channelMap.get(String(invite?.channelId || ""));
      if (!mappedChannelId) continue;
      const channel = guild.channels.cache.get(mappedChannelId);
      if (!channel || typeof channel.createInvite !== "function") continue;
      const created = await channel.createInvite({
        maxAge: Number(invite?.maxAge || 0), maxUses: Number(invite?.maxUses || 0), temporary: Boolean(invite?.temporary), reason: `Backup load ${backupId}`,
      })
        .catch(() => null);
      if (!created) continue;
      stats.loadedInvites += 1;
      bumpProcessed();
      await sleep(250);
    }
  }

  if (actions.has("load_events")) {
    markPhase("load_events");
    const events = Array.isArray(payload?.scheduledEvents) ? payload.scheduledEvents : [];
    for (const ev of events) {
      throwIfCancelled(guildKey);
      const mappedChannelId = ev?.channelId ? channelMap.get(String(ev.channelId)) || null : null;
      const created = await guild.scheduledEvents.create({
        name: String(ev?.name || "Backup Event"), description: ev?.description || undefined, scheduledStartTime: ev?.scheduledStartAt || new Date(Date.now() + 3600000), scheduledEndTime: ev?.scheduledEndAt || undefined, privacyLevel: Number(ev?.privacyLevel || 2), entityType: Number(ev?.entityType || 3), channel: mappedChannelId || undefined, entityMetadata: ev?.entityMetadata || undefined, reason: `Backup load ${backupId}`,
      })
        .catch(() => null);
      if (!created) continue;
      stats.loadedEvents += 1;
      bumpProcessed();
      await sleep(250);
    }
  }

  if (actions.has("load_automod_rules")) {
    markPhase("load_automod_rules");
    const rules = Array.isArray(payload?.autoModerationRules) ? payload.autoModerationRules : [];
    for (const rule of rules) {
      throwIfCancelled(guildKey);
      const exemptChannels = (Array.isArray(rule?.exemptChannels) ? rule.exemptChannels : []).map((oldId?) => channelMap.get(String(oldId))).filter(Boolean);
      const exemptRoles = (Array.isArray(rule?.exemptRoles) ? rule.exemptRoles : []).map((oldId?) => roleMap.get(String(oldId))).filter(Boolean);
      const created = await guild.autoModerationRules.create({
        name: String(rule?.name || "backup-rule"), eventType: Number(rule?.eventType || 1), triggerType: Number(rule?.triggerType || 1), triggerMetadata: rule?.triggerMetadata || undefined, actions: Array.isArray(rule?.actions) ? rule.actions : [], enabled: Boolean(rule?.enabled), exemptChannels, exemptRoles, reason: `Backup load ${backupId}`,
      })
        .catch(() => null);
      if (!created) continue;
      stats.loadedAutomodRules += 1;
      bumpProcessed();
      await sleep(250);
    }
  }

  markPhase("post_restore_id_sync");
  try {
    const { runPostRestoreIdSync } = require("./postRestoreIdSyncService") as typeof import("./postRestoreIdSyncService");
    const sync = await runPostRestoreIdSync({
      guildId: guild.id,
      backupId,
      roleMap,
      channelMap,
      emojiMap,
      stickerMap,
      syncMongo: true,
    });
    stats.idRemap = sync?.persisted || null;
    stats.mongoRemap = sync?.mongo || null;
  } catch (err) {
    global.logger?.warn?.("[backup.load] postRestoreIdSync failed:", err?.message || err);
    stats.idRemapError = String(err?.message || err);
  }

  markPhase("completed");
  return stats;
}

async function runBackupDryRun(guild?, backupRef?, selectedActions = null, messagesLimit = DEFAULT_MESSAGES_LIMIT) {
  const actions = sanitizeActions(selectedActions || [...DEFAULT_ACTIONS]);
  const { payload, guildId: sourceGuildId, backupId } = await readBackupByIdGlobal(backupRef);
  const diff = computePermissionDiffs(guild, payload);
  const totalMessages = countBackupMessages(payload);
  const effectiveLimit = normalizeMessagesLimit(messagesLimit, DEFAULT_MESSAGES_LIMIT);

  const backupRoles = (Array.isArray(payload?.roles) ? payload.roles : []).filter((r?) => String(r?.name || "").trim() !== "@everyone",);
  const backupChannels = Array.isArray(payload?.channels) ? payload.channels : [];
  const backupThreads = Array.isArray(payload?.threads) ? payload.threads : [];
  const backupMembers = Array.isArray(payload?.members) ? payload.members : [];

  const summary = { backupId: String(backupId || "").toUpperCase(), sourceGuildId: String(sourceGuildId || ""), actions: [...actions], canDeleteRoles: [...guild.roles.cache.values()].every((r?) => r.id === guild.id || r.managed || r.editable), canDeleteChannels: [...guild.channels.cache.values()].every((c?) => c.deletable), expected: { createRoles: backupRoles.length, createChannels: backupChannels.length, createThreads: backupThreads.length, updateMembers: backupMembers.length, loadMessages: effectiveLimit == null ? totalMessages : Math.min(totalMessages, effectiveLimit), loadPinnedMessages: countBackupPinnedMessages(payload), messagesLimit: effectiveLimit, }, permissions: diff, };

  return summary;
}
async function handleBackupLoadInteraction(interaction?) {
  const customId = String(interaction?.customId || "");
  const isSelect = interaction?.isStringSelectMenu?.();
  const isButton = interaction?.isButton?.();

  const isTarget = customId.startsWith("backup_load_actions:") || customId.startsWith("backup_load_messages_limit:") || customId.startsWith("backup_load_confirm:") || customId.startsWith("backup_load_continue:") || customId.startsWith("backup_load_cancel:") || customId.startsWith("backup_load_status:");
  if (!isTarget) return false;

  const sessionId = String(customId || "").split(":")[1] || "";
  const session = getLoadSession(sessionId);
  if (!session) {
    await interaction
      .reply({
        content: "<a:VC_Alert:1482706673176150077> Sessione backup scaduta. Riesegui **+backup** → **Carica backup**.",
        flags: 1 << 6,
      })
      .catch(() => { });
    return true;
  }

  if (String(session.userId) !== String(interaction.user?.id || "")) {
    await interaction
      .reply({
        content: "<a:VC_Alert:1482706673176150077> Questo pannello non è tuo.",
        flags: 1 << 6,
      })
      .catch(() => { });
    return true;
  }

  if (String(session.guildId) !== String(interaction.guildId || "")) {
    await interaction
      .reply({
        content: "<a:VC_Alert:1482706673176150077> Questo pannello appartiene a un altro server.",
        flags: 1 << 6,
      })
      .catch(() => { });
    return true;
  }

  if (!ensureManageGuild(interaction)) {
    await interaction
      .reply({
        content: "<a:VC_Alert:1482706673176150077> Ti serve il permesso Manage Server per usare il backup load.",
        flags: 1 << 6,
      })
      .catch(() => { });
    return true;
  }

  if (isSelect && customId.startsWith("backup_load_actions:")) {
    const next = updateLoadSessionActions(sessionId, interaction.values || []);
    await interaction
      .update({
        embeds: [buildLoadWarningEmbed(next.backupId, next.messagesLimit)],
        components: buildLoadComponents(next.id, next.actions, next.messagesLimit),
      })
      .catch(() => { });
    return true;
  }

  if (isSelect && customId.startsWith("backup_load_messages_limit:")) {
    const selected = String(interaction.values?.[0] || "").trim();
    const next = updateLoadSessionMessagesLimit(sessionId, selected);
    await interaction
      .update({
        embeds: [buildLoadWarningEmbed(next.backupId, next.messagesLimit)],
        components: buildLoadComponents(next.id, next.actions, next.messagesLimit),
      })
      .catch(() => { });
    return true;
  }

  if (isButton && customId.startsWith("backup_load_cancel:")) {
    deleteLoadSession(sessionId);
    await interaction
      .update({
        embeds: [buildLoadCancelledEmbed(session.backupId)],
        components: [],
      })
      .catch(() => { });
    return true;
  }

  if (isButton && customId.startsWith("backup_load_continue:")) {
    try {
      const ref = session.sourceGuildId ? `${session.sourceGuildId}:${session.backupId}`
        : session.backupId;
      const { payload } = await readBackupByIdGlobal(ref);
      await interaction
        .update({
          embeds: [
            buildPreflightWarningEmbed({
              guild: interaction.guild,
              payload,
              actions: [...session.actions],
              backupId: session.backupId,
              messagesLimit: session.messagesLimit,
            }),
          ],
          components: [buildPreflightButtons(session.id)],
        })
        .catch(() => { });
    } catch (error) {
      global.logger?.error?.("[backup.load] failed:", error);
      await interaction
        .update({
          embeds: [buildLoadErrorEmbed(error)],
          components: [],
        })
        .catch(() => { });
    }

    return true;
  }

  if (isButton && customId.startsWith("backup_load_confirm:")) {
    const activeLoad = startActiveLoadIfIdle({
      guildId: interaction.guildId,
      userId: session.userId,
      backupId: session.backupId,
      actions: [...session.actions],
      messagesLimit: session.messagesLimit,
    });
    if (!activeLoad) {
      await interaction
        .reply({
          content: "<a:VC_Alert:1482706673176150077> C'è già un backup load in corso in questo server.",
          flags: 1 << 6,
        })
        .catch(() => { });
      return true;
    }

    const deferred = await interaction.deferUpdate().then(() => true).catch(() => false);
    if (!deferred) {
      finishActiveLoad(interaction.guildId);
      return true;
    }
    await interaction.message
      .edit({
        embeds: [buildLoadInProgressEmbed(session.backupId)],
        components: buildLoadStartComponents(session.id),
      })
      .catch(() => { });

    void (async () => {
      try {
        let checkpointId = null;
        try {
          const checkpoint = await createGuildBackup(interaction.guild, { source: "automatic", });
          checkpointId = String(checkpoint?.backupId || "").toUpperCase() || null;
          updateActiveLoad(interaction.guildId, { checkpointId });
          if (checkpointId) {
            await interaction.message
              .edit({
                embeds: [buildLoadInProgressEmbed(session.backupId, checkpointId)],
                components: buildLoadStartComponents(session.id),
              })
              .catch(() => { });
          }
        } catch (checkpointError) {
          global.logger?.warn?.("[backup.load] checkpoint failed:", checkpointError);
        }

        const stats = await applyBackupToGuild(interaction.guild, session.backupId, [...session.actions], session.sourceGuildId, session.messagesLimit,);
        await interaction.message
          .edit({
            embeds: [buildLoadDoneEmbed(session.backupId, stats)],
            components: [],
          })
          .catch(() => { });
      } catch (error) {
        global.logger?.error?.("[backup.load] failed:", error);
        await interaction.message
          .edit({
            embeds: [
              error?.code === "BACKUP_LOAD_CANCELLED"
                ? buildLoadCancelledEmbed(session.backupId)
                : buildLoadErrorEmbed(error),
            ],
            components: [],
          })
          .catch(() => { });
      } finally {
        finishActiveLoad(interaction.guildId);
        deleteLoadSession(sessionId);
      }
    })();

    return true;
  }

  if (isButton && customId.startsWith("backup_load_status:")) {
    const status = getGuildBackupLoadStatus(interaction.guildId);
    if (!status) {
      await interaction
        .reply({
          content: "<a:VC_Alert:1482706673176150077> Nessun backup load in corso.",
          flags: 1 << 6,
        })
        .catch(() => { });
      return true;
    }

    const startedAt = Math.floor(Number(status.startedAtMs || Date.now()) / 1000);
    await interaction
      .reply({
        embeds: [
          new EmbedBuilder()
            .setColor("#3498db")
            .setTitle("<:VC_update:1478721333096349817> Backup Load Status")
            .setDescription(
              [
                `<:VC_id:1478517313618575419> Backup ID: \`${status.backupId}\``,
                `<:VC_Clock:1473359204189474886> Started: <t:${startedAt}:R>`,
                `<:VC_update:1478721333096349817> Phase: \`${status.phase}\``,
                `<:VC_update:1478721333096349817> Processed items: **${status.processed}**`,
                `<:VC_update:1478721333096349817> Cancel requested: **${status.cancelRequested ? "yes" : "no"}**`,
                `<:VC_update:1478721333096349817> Messages limit: \`${formatMessagesLimit(status.messagesLimit)}\``,
                status.checkpointId ? `<:VC_id:1478517313618575419> Checkpoint: \`${status.checkpointId}\`` : null,
              ].filter(Boolean).join("\n"),
            ),
        ],
        flags: 1 << 6,
      })
      .catch(() => { });
    return true;
  }

  return false;
}

function getGuildBackupLoadStatus(guildId?) {
  const state = getActiveLoadState(guildId);
  if (!state) return null;
  return {
    guildId: state.guildId,
    userId: state.userId,
    backupId: state.backupId,
    actions: Array.isArray(state.actions) ? [...state.actions] : [],
    startedAtMs: Number(state.startedAtMs || Date.now()),
    cancelRequested: Boolean(state.cancelRequested),
    phase: String(state.phase || "starting"),
    processed: Number(state.processed || 0),
    messagesLimit: normalizeMessagesLimit(state.messagesLimit, DEFAULT_MESSAGES_LIMIT),
    checkpointId: state.checkpointId ? String(state.checkpointId).toUpperCase() : null,
  };
}

function cancelGuildBackupLoad(guildId?) {
  return requestCancelActiveLoad(guildId);
}

export = { LOAD_ACTIONS, DEFAULT_ACTIONS, createLoadSession, buildLoadWarningEmbed, buildLoadComponents, handleBackupLoadInteraction, getGuildBackupLoadStatus, cancelGuildBackupLoad, runBackupDryRun, buildDryRunEmbed };