const { readBackupByIdGlobal } = require("./serverBackupService") as typeof import("./serverBackupService");
const { DEFAULT_MESSAGES_LIMIT, sanitizeActions, normalizeMessagesLimit, sleep } = require("./backupLoadSessions") as typeof import("./backupLoadSessions");
const {
  buildPermissionOverwrites,
  syncLoadedRoles,
  syncLoadedChannels,
  normalizeMessagePayload,
  collectMessageFiles,
  remapReactionEmoji,
  resolveAssetInput,
} = require("./backupLoadSync") as typeof import("./backupLoadSync");
const { getActiveLoadState, updateActiveLoad, throwIfCancelled } = require("./backupLoadActive") as typeof import("./backupLoadActive");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");

function mapChannel(channelMap?, oldId?) {
  if (!oldId) return null;
  return channelMap.get(String(oldId)) || null;
}

function sortMessagesChronologically(list?) {
  return [...(Array.isArray(list) ? list : [])].sort((a?, b?) => {
    const ta = Date.parse(String(a?.createdAt || "")) || 0;
    const tb = Date.parse(String(b?.createdAt || "")) || 0;
    return ta - tb;
  });
}

async function getOrCreateRestoreWebhook(channel?, cache?, backupId?) {
  const key = String(channel?.id || "");
  if (!key) return null;
  if (cache.has(key)) return cache.get(key);
  if (typeof channel?.createWebhook !== "function") return null;
  const hook = await channel
    .createWebhook({
      name: "Backup Restore",
      reason: `Backup load ${backupId} — messaggi`,
    })
    .catch(() => null);
  if (hook) cache.set(key, hook);
  return hook;
}

async function cleanupRestoreWebhooks(cache?) {
  for (const hook of cache.values()) {
    await hook.delete("Backup load cleanup").catch(() => null);
  }
  cache.clear();
}

async function applyBackupToGuild(guild?, backupId?, selectedActions?, sourceGuildId = null, messagesLimit = DEFAULT_MESSAGES_LIMIT) {
  const guildKey = String(guild?.id || "");
  const actions = sanitizeActions(selectedActions);
  const ref = sourceGuildId ? `${sourceGuildId}:${backupId}` : backupId;
  const { payload } = await readBackupByIdGlobal(ref);
  const effectiveMessagesLimit = normalizeMessagesLimit(messagesLimit, DEFAULT_MESSAGES_LIMIT);
  const markPhase = (phase?) => updateActiveLoad(guildKey, { phase });
  const bumpProcessed = (delta = 1) => {
    const state = getActiveLoadState(guildKey);
    if (!state) return;
    state.processed = Number(state.processed || 0) + Number(delta || 0);
    state.updatedAtMs = Date.now();
  };

  const stats: Record<string, any> = {
    deletedRoles: 0,
    deletedChannels: 0,
    deletedEmojis: 0,
    deletedStickers: 0,
    deletedEvents: 0,
    deletedAutomodRules: 0,
    createdRoles: 0,
    createdChannels: 0,
    createdThreads: 0,
    updatedMembers: 0,
    loadedBans: 0,
    loadedMessages: 0,
    loadedPinnedMessages: 0,
    loadedEmojis: 0,
    loadedStickers: 0,
    loadedWebhooks: 0,
    loadedInvites: 0,
    loadedEvents: 0,
    loadedAutomodRules: 0,
  };

  const roleMap = new Map();
  roleMap.set(String(guild.id), String(guild.id));
  const forumTagMap = new Map(); // oldTagId -> newTagId
  const restoreHooks = new Map();

  if (actions.has("delete_roles")) {
    markPhase("delete_roles");
    const candidateRoles = [...guild.roles.cache.values()]
      .filter((r?) => !r.managed && r.id !== guild.id)
      .sort((a?, b?) => a.position - b.position);
    const undeletable = candidateRoles.filter((r?) => !r.editable);
    if (undeletable.length > 0) {
      const preview = undeletable
        .slice(0, 8)
        .map((r?) => `@${r.name}`)
        .join(", ");
      throw new Error(
        `${E.VC_Alert} Impossibile eliminare tutti i ruoli: alza il ruolo del bot sopra i ruoli target. Bloccanti: ${preview}${undeletable.length > 8 ? ", ..." : ""}`,
      );
    }
    for (const role of candidateRoles) {
      throwIfCancelled(guildKey);
      const ok = await role.delete("Backup load - delete roles").catch(() => null);
      if (ok) stats.deletedRoles += 1;
      bumpProcessed();
      await sleep(150);
    }
  }

  if (actions.has("load_roles")) {
    markPhase("load_roles");
    const backupRoles = (Array.isArray(payload?.roles) ? payload.roles : [])
      .filter((r?) => String(r?.name || "").trim() !== "@everyone")
      .sort((a?, b?) => Number(a?.position ?? 0) - Number(b?.position ?? 0));

    for (const role of backupRoles) {
      throwIfCancelled(guildKey);
      if (role?.managed) continue;
      const created = await guild.roles
        .create({
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

    // Mappa ruoli managed (bot) e @everyone per i permission overwrite.
    for (const oldRole of Array.isArray(payload?.roles) ? payload.roles : []) {
      const oldId = String(oldRole?.id || "");
      if (!oldId || roleMap.has(oldId)) continue;
      if (String(oldRole?.name || "").trim() === "@everyone") {
        roleMap.set(oldId, String(guild.id));
        continue;
      }
      if (!oldRole?.managed) continue;
      const hit = guild.roles.cache.find(
        (r?) => r.managed && String(r.name) === String(oldRole.name),
      );
      if (hit) roleMap.set(oldId, String(hit.id));
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

    // Permessi @everyone dallo snapshot.
    const everyoneBackup = (Array.isArray(payload?.roles) ? payload.roles : []).find(
      (r?) =>
        String(r?.name || "").trim() === "@everyone" ||
        String(r?.id || "") === String(payload?.guild?.id || ""),
    );
    if (everyoneBackup?.permissions != null) {
      throwIfCancelled(guildKey);
      await guild.roles.everyone
        .setPermissions(BigInt(String(everyoneBackup.permissions || "0")), `Backup load ${backupId}`)
        .catch(() => null);
      bumpProcessed();
    }
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
    const categories = backupChannels
      .filter((c?) => Number(c?.type) === 4)
      .sort((a?, b?) => Number(a?.position ?? 0) - Number(b?.position ?? 0));

    for (const cat of categories) {
      throwIfCancelled(guildKey);
      const created = await guild.channels
        .create({
          name: String(cat.name || "categoria"),
          type: 4,
          position: Number(cat.position ?? 0),
          permissionOverwrites: buildPermissionOverwrites(cat.permissionOverwrites, roleMap, guild),
          reason: `Backup load ${backupId}`,
        })
        .catch(() => null);
      if (!created) continue;
      channelMap.set(String(cat.id), String(created.id));
      stats.createdChannels += 1;
      bumpProcessed();
      await sleep(250);
    }

    const others = backupChannels
      .filter((c?) => Number(c?.type) !== 4)
      .sort((a?, b?) => Number(a?.position ?? 0) - Number(b?.position ?? 0));

    for (const ch of others) {
      throwIfCancelled(guildKey);
      const type = Number(ch?.type ?? 0);
      if (![0, 2, 5, 13, 15, 16].includes(type)) continue;

      const parentId = ch.parentId ? channelMap.get(String(ch.parentId)) || null : null;
      const created = await guild.channels
        .create({
          name: String(ch.name || "canale"),
          type,
          topic: ch.topic || undefined,
          nsfw: Boolean(ch.nsfw),
          rateLimitPerUser: Number(ch.rateLimitPerUser ?? 0),
          bitrate: Number(ch.bitrate ?? 0) || undefined,
          userLimit: Number(ch.userLimit ?? 0) || undefined,
          rtcRegion: ch.rtcRegion || null,
          videoQualityMode: ch.videoQualityMode ?? undefined,
          defaultAutoArchiveDuration: ch.defaultAutoArchiveDuration ?? undefined,
          defaultThreadRateLimitPerUser: ch.defaultThreadRateLimitPerUser ?? undefined,
          defaultForumLayout: ch.defaultForumLayout ?? undefined,
          defaultSortOrder: ch.defaultSortOrder ?? undefined,
          availableTags: Array.isArray(ch.availableTags) ? ch.availableTags : undefined,
          defaultReactionEmoji: ch.defaultReactionEmoji || undefined,
          parent: parentId || undefined,
          position: Number(ch.position ?? 0),
          permissionOverwrites: buildPermissionOverwrites(ch.permissionOverwrites, roleMap, guild),
          reason: `Backup load ${backupId}`,
        })
        .catch(() => null);
      if (!created) continue;
      channelMap.set(String(ch.id), String(created.id));

      // Mappa tag forum per appliedTags dei thread.
      if (type === 15 && Array.isArray(ch.availableTags) && Array.isArray(created.availableTags)) {
        for (const oldTag of ch.availableTags) {
          const oldTagId = String(oldTag?.id || "");
          if (!oldTagId) continue;
          const match = created.availableTags.find(
            (t?) => String(t?.name || "") === String(oldTag?.name || ""),
          );
          if (match?.id) forumTagMap.set(oldTagId, String(match.id));
        }
      }

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
    const bannerInput = await resolveAssetInput(g.bannerData || g.bannerURL || null);
    const splashInput = await resolveAssetInput(g.splashData || g.splashURL || null);
    const discoverySplashInput = await resolveAssetInput(
      g.discoverySplashData || g.discoverySplashURL || null,
    );
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
        premiumProgressBarEnabled: Boolean(
          g.premiumProgressBarEnabled ?? guild.premiumProgressBarEnabled,
        ),
        systemChannelFlags:
          g.systemChannelFlags != null
            ? Number(g.systemChannelFlags)
            : guild.systemChannelFlags?.bitfield,
        afkChannel: g.afkChannelId ? mapChannel(channelMap, g.afkChannelId) : null,
        systemChannel: g.systemChannelId
          ? mapChannel(channelMap, g.systemChannelId) || guild.systemChannelId || null
          : null,
        rulesChannel: g.rulesChannelId
          ? mapChannel(channelMap, g.rulesChannelId) || guild.rulesChannelId || null
          : null,
        publicUpdatesChannel: g.publicUpdatesChannelId
          ? mapChannel(channelMap, g.publicUpdatesChannelId) || guild.publicUpdatesChannelId || null
          : null,
        safetyAlertsChannel: g.safetyAlertsChannelId
          ? mapChannel(channelMap, g.safetyAlertsChannelId) || guild.safetyAlertsChannelId || null
          : null,
        ...(iconInput ? { icon: iconInput } : {}),
        ...(bannerInput ? { banner: bannerInput } : {}),
        ...(splashInput ? { splash: splashInput } : {}),
        ...(discoverySplashInput ? { discoverySplash: discoverySplashInput } : {}),
      })
      .catch(() => null);

    if (typeof guild.setWidgetSettings === "function") {
      await guild
        .setWidgetSettings(
          {
            enabled: Boolean(g.widgetEnabled),
            channel: g.widgetChannelId ? mapChannel(channelMap, g.widgetChannelId) : null,
          },
          `Backup load ${backupId}`,
        )
        .catch(() => null);
    }
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

      const appliedTags = (Array.isArray(thread.appliedTags) ? thread.appliedTags : [])
        .map((oldId?) => forumTagMap.get(String(oldId)) || null)
        .filter(Boolean);

      const created = await parent.threads
        .create({
          name: String(thread.name || "thread"),
          autoArchiveDuration: Number(thread.autoArchiveDuration || 1440),
          rateLimitPerUser: Number(thread.rateLimitPerUser || 0),
          invitable: Boolean(thread.invitable),
          ...(appliedTags.length ? { appliedTags } : {}),
          message: parent.type === 15 ? { content: "·" } : undefined,
          reason: `Backup load ${backupId}`,
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

      const targetRoles = (Array.isArray(memberData.roles) ? memberData.roles : [])
        .map((oldId?) => roleMap.get(String(oldId)))
        .filter(Boolean)
        .filter((id?) => id !== guild.id && guild.roles.cache.has(id));

      await member.roles.set(targetRoles, `Backup load ${backupId}`).catch(() => null);
      if (typeof memberData.nickname === "string") {
        await member.setNickname(memberData.nickname || null, `Backup load ${backupId}`).catch(() => null);
      }
      if (memberData.communicationDisabledUntil) {
        const until = new Date(memberData.communicationDisabledUntil);
        if (!Number.isNaN(until.getTime()) && until.getTime() > Date.now()) {
          await member
            .timeout(until.getTime() - Date.now(), `Backup load ${backupId}`)
            .catch(() => null);
        }
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
      const ok = await guild.bans
        .create(userId, { reason: ban?.reason || `Backup load ${backupId}` })
        .catch(() => null);
      if (ok) stats.loadedBans += 1;
      bumpProcessed();
      await sleep(200);
    }
  }

  // Emoji/sticker/eventi/automod: prima svuota i presenti così il ripristino è 1:1.
  if (actions.has("load_emojis")) {
    markPhase("clear_emojis");
    for (const emoji of [...guild.emojis.cache.values()]) {
      throwIfCancelled(guildKey);
      if (emoji.managed) continue;
      const ok = await emoji.delete(`Backup load ${backupId}`).catch(() => null);
      if (ok) stats.deletedEmojis += 1;
      bumpProcessed();
      await sleep(200);
    }
  }

  if (actions.has("load_stickers")) {
    markPhase("clear_stickers");
    for (const sticker of [...guild.stickers.cache.values()]) {
      throwIfCancelled(guildKey);
      const ok = await sticker.delete(`Backup load ${backupId}`).catch(() => null);
      if (ok) stats.deletedStickers += 1;
      bumpProcessed();
      await sleep(200);
    }
  }

  if (actions.has("load_events")) {
    markPhase("clear_events");
    for (const ev of [...guild.scheduledEvents.cache.values()]) {
      throwIfCancelled(guildKey);
      const ok = await ev.delete(`Backup load ${backupId}`).catch(() => null);
      if (ok) stats.deletedEvents += 1;
      bumpProcessed();
      await sleep(200);
    }
  }

  if (actions.has("load_automod_rules")) {
    markPhase("clear_automod");
    const liveRules = await guild.autoModerationRules.fetch().catch(() => null);
    for (const rule of liveRules ? [...liveRules.values()] : []) {
      throwIfCancelled(guildKey);
      const ok = await rule.delete(`Backup load ${backupId}`).catch(() => null);
      if (ok) stats.deletedAutomodRules += 1;
      bumpProcessed();
      await sleep(200);
    }
  }

  if (actions.has("load_emojis")) {
    markPhase("load_emojis");
    const emojis = Array.isArray(payload?.emojis) ? payload.emojis : [];
    for (const emoji of emojis) {
      throwIfCancelled(guildKey);
      if (!emoji?.name || emoji?.managed) continue;
      const attachment = await resolveAssetInput(emoji.imageData || emoji.url);
      if (!attachment) continue;
      const mappedRoles = (Array.isArray(emoji.roles) ? emoji.roles : [])
        .map((oldId?) => roleMap.get(String(oldId)))
        .filter(Boolean);
      const created = await guild.emojis
        .create({
          attachment,
          name: String(emoji.name),
          roles: mappedRoles,
          reason: `Backup load ${backupId}`,
        })
        .catch(() => null);
      if (!created) continue;
      if (emoji.id) emojiMap.set(String(emoji.id), String(created.id));
      stats.loadedEmojis += 1;
      bumpProcessed();
      await sleep(350);
    }

    // Remappa defaultReactionEmoji dei forum dopo le nuove emoji.
    markPhase("remap_forum_reactions");
    const backupChannels = Array.isArray(payload?.channels) ? payload.channels : [];
    for (const ch of backupChannels) {
      if (Number(ch?.type) !== 15 || !ch?.defaultReactionEmoji) continue;
      const mappedId = channelMap.get(String(ch.id));
      if (!mappedId) continue;
      const live = guild.channels.cache.get(mappedId);
      if (!live || !live.manageable) continue;
      const remapped = remapReactionEmoji(ch.defaultReactionEmoji, emojiMap);
      await live
        .edit({
          defaultReactionEmoji: remapped,
          reason: `Backup load ${backupId}`,
        })
        .catch(() => null);
      bumpProcessed();
    }
  }

  if (actions.has("load_stickers")) {
    markPhase("load_stickers");
    const stickers = Array.isArray(payload?.stickers) ? payload.stickers : [];
    for (const sticker of stickers) {
      throwIfCancelled(guildKey);
      if (!sticker?.name) continue;
      const file = await resolveAssetInput(sticker.imageData || sticker.url);
      if (!file) continue;
      const created = await guild.stickers
        .create({
          file,
          name: String(sticker.name || "sticker"),
          description: sticker.description || undefined,
          tags: String(sticker.tags || "backup"),
          reason: `Backup load ${backupId}`,
        })
        .catch(() => null);
      if (!created) continue;
      if (sticker.id) stickerMap.set(String(sticker.id), String(created.id));
      stats.loadedStickers += 1;
      bumpProcessed();
      await sleep(350);
    }
  }

  if (actions.has("load_messages")) {
    markPhase("load_messages");
    let restoredMessages = 0;

    const sendOne = async (target?, message?) => {
      if (effectiveMessagesLimit != null && restoredMessages >= effectiveMessagesLimit) return false;
      throwIfCancelled(guildKey);
      const files = await collectMessageFiles(message);
      const hook = await getOrCreateRestoreWebhook(target, restoreHooks, backupId);
      const base = normalizeMessagePayload(message, backupId, { viaWebhook: Boolean(hook) });
      const avatarURL =
        base.avatarURL ||
        message?.author?.avatarURL ||
        (message?.author?.id && message?.author?.avatar
          ? `https://cdn.discordapp.com/avatars/${message.author.id}/${message.author.avatar}.png?size=128`
          : undefined);

      let sent = null;
      if (hook) {
        sent = await hook
          .send({
            content: base.content || (files.length ? undefined : "·"),
            username: base.username || "Utente",
            avatarURL: avatarURL || undefined,
            embeds: base.embeds,
            files: files.length ? files : undefined,
            tts: base.tts,
          })
          .catch(() => null);
      }
      if (!sent) {
        const fallback = normalizeMessagePayload(message, backupId, { viaWebhook: false });
        sent = await target
          .send({
            content: fallback.content || (files.length ? undefined : "·"),
            embeds: fallback.embeds,
            files: files.length ? files : undefined,
          })
          .catch(() => null);
      }
      if (!sent) return true;
      stats.loadedMessages += 1;
      restoredMessages += 1;
      bumpProcessed();

      if (actions.has("load_pinned_messages") && message?.pinned) {
        const pinned = await sent.pin("Backup load pinned message").catch(() => null);
        if (pinned) stats.loadedPinnedMessages += 1;
        if (pinned) bumpProcessed();
      }

      // Ripristina reazioni base (best-effort).
      const reactions = Array.isArray(message?.reactions) ? message.reactions : [];
      for (const reaction of reactions.slice(0, 20)) {
        const emoji = reaction?.emoji;
        if (!emoji) continue;
        const resolvable = emoji.id
          ? emojiMap.get(String(emoji.id)) || (emoji.animated ? `a:${emoji.name}:${emoji.id}` : `${emoji.name}:${emoji.id}`)
          : emoji.name;
        if (!resolvable) continue;
        await sent.react(resolvable).catch(() => null);
      }

      await sleep(350);
      return true;
    };

    const msgByChannel = payload?.messages?.channels || {};
    for (const [oldChannelId, messages] of Object.entries(msgByChannel)) {
      if (effectiveMessagesLimit != null && restoredMessages >= effectiveMessagesLimit) break;
      throwIfCancelled(guildKey);
      const mapped = channelMap.get(String(oldChannelId));
      if (!mapped) continue;
      const channel = guild.channels.cache.get(mapped);
      if (!channel || !channel.isTextBased || !channel.isTextBased()) continue;
      for (const message of sortMessagesChronologically(messages)) {
        const cont = await sendOne(channel, message);
        if (!cont) break;
      }
    }

    const msgByThread = payload?.messages?.threads || {};
    for (const [oldThreadId, messages] of Object.entries(msgByThread)) {
      if (effectiveMessagesLimit != null && restoredMessages >= effectiveMessagesLimit) break;
      throwIfCancelled(guildKey);
      const mappedThreadId = threadMap.get(String(oldThreadId));
      if (!mappedThreadId) continue;
      const thread = guild.channels.cache.get(mappedThreadId);
      if (!thread || !thread.isTextBased || !thread.isTextBased()) continue;
      for (const message of sortMessagesChronologically(messages)) {
        const cont = await sendOne(thread, message);
        if (!cont) break;
      }
    }

    await cleanupRestoreWebhooks(restoreHooks);
  }

  if (actions.has("load_webhooks")) {
    markPhase("load_webhooks");
    const webhooks = Array.isArray(payload?.webhooks) ? payload.webhooks : [];
    for (const hook of webhooks) {
      throwIfCancelled(guildKey);
      // Salta webhook di applicazioni (non ricreabili 1:1).
      if (hook?.applicationId) continue;
      const mappedChannelId = channelMap.get(String(hook?.channelId || ""));
      if (!mappedChannelId) continue;
      const channel = guild.channels.cache.get(mappedChannelId);
      if (!channel || typeof channel.createWebhook !== "function") continue;
      const avatar = await resolveAssetInput(
        hook?.avatarData ||
          (hook?.avatar ? `https://cdn.discordapp.com/avatars/${hook.id}/${hook.avatar}.png` : null) ||
          hook?.avatarURL ||
          null,
      );
      const created = await channel
        .createWebhook({
          name: String(hook?.name || "backup-webhook"),
          avatar: avatar || undefined,
          reason: `Backup load ${backupId}`,
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
      const created = await channel
        .createInvite({
          maxAge: Number(invite?.maxAge || 0),
          maxUses: Number(invite?.maxUses || 0),
          temporary: Boolean(invite?.temporary),
          reason: `Backup load ${backupId}`,
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
      // Eventi già conclusi: skip.
      if (Number(ev?.status) === 3 || Number(ev?.status) === 4) continue;
      const mappedChannelId = ev?.channelId ? channelMap.get(String(ev.channelId)) || null : null;
      const image = await resolveAssetInput(ev?.imageData || ev?.imageURL || null);
      const startAt = ev?.scheduledStartAt ? new Date(ev.scheduledStartAt) : null;
      const startSafe =
        startAt && !Number.isNaN(startAt.getTime()) && startAt.getTime() > Date.now() + 60_000
          ? startAt
          : new Date(Date.now() + 3600_000);
      const created = await guild.scheduledEvents
        .create({
          name: String(ev?.name || "Backup Event"),
          description: ev?.description || undefined,
          scheduledStartTime: startSafe,
          scheduledEndTime: ev?.scheduledEndAt || undefined,
          privacyLevel: Number(ev?.privacyLevel || 2),
          entityType: Number(ev?.entityType || 3),
          channel: mappedChannelId || undefined,
          entityMetadata: ev?.entityMetadata || undefined,
          image: image || undefined,
          reason: `Backup load ${backupId}`,
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
      const exemptChannels = (Array.isArray(rule?.exemptChannels) ? rule.exemptChannels : [])
        .map((oldId?) => channelMap.get(String(oldId)))
        .filter(Boolean);
      const exemptRoles = (Array.isArray(rule?.exemptRoles) ? rule.exemptRoles : [])
        .map((oldId?) => roleMap.get(String(oldId)))
        .filter(Boolean);
      // Remappa channelId nelle azioni AutoMod (timeout/block message metadata).
      const mappedActions = (Array.isArray(rule?.actions) ? rule.actions : []).map((action?) => {
        if (!action || typeof action !== "object") return action;
        const clone = { ...action, metadata: action.metadata ? { ...action.metadata } : undefined };
        if (clone.metadata?.channelId) {
          const mapped = channelMap.get(String(clone.metadata.channelId));
          if (mapped) clone.metadata.channelId = mapped;
        }
        return clone;
      });
      const created = await guild.autoModerationRules
        .create({
          name: String(rule?.name || "backup-rule"),
          eventType: Number(rule?.eventType || 1),
          triggerType: Number(rule?.triggerType || 1),
          triggerMetadata: rule?.triggerMetadata || undefined,
          actions: mappedActions,
          enabled: Boolean(rule?.enabled),
          exemptChannels,
          exemptRoles,
          reason: `Backup load ${backupId}`,
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

export = { applyBackupToGuild };
