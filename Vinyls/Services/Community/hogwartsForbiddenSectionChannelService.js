const { ChannelType, PermissionsBitField, AuditLogEvent } = require("discord.js");
const { SiteDocument, SITE_DOCUMENT_TYPE } = require("../../Schemas/Community/communitySchemas");
const { resolveHogwartsEventConfig } = require("../../Utils/Web/hogwartsSortingConfig");
const {
  FORBIDDEN_DOC,
  forbiddenEventDedupeKey,
  forbiddenEventOpen,
  resolveForbiddenRoundRuntime,
} = require("./hogwartsForbiddenBooksService");
const { applyBotPresence } = require("../../../shared/discord/botPresenceActivity");

const FORBIDDEN_CHANNEL_DECOR_OWNER_ID = "__event_channels__";
const CHANNEL_NAME_PREFIX = "༄";
const CHANNEL_NAME_SEP = "︲";
const DEFAULT_BOOK_EMOJI = "📖";
const SYNC_INTERVAL_MS = 60 * 1000;
const RENAME_GAP_MS = 650;
const loopState = new WeakSet();

function isStrictTextChannel(channel) {
  if (!channel) return false;
  if (typeof channel.isVoiceBased === "function" && channel.isVoiceBased()) return false;
  if (typeof channel.isTextBased !== "function" || !channel.isTextBased()) return false;
  const type = Number(channel.type);
  return type === ChannelType.GuildText || type === ChannelType.GuildAnnouncement;
}

function isNameDecorChannel(channel) {
  if (!isStrictTextChannel(channel)) return false;
  return Boolean(parseVcChannelName(channel.name));
}

function isTopicDecorChannel(channel) {
  if (!isStrictTextChannel(channel)) return false;
  return typeof channel.setTopic === "function";
}

function decorCfg(client) {
  const root = client?.config?.hogwartsForbiddenBooks && typeof client.config.hogwartsForbiddenBooks === "object"
    ? client.config.hogwartsForbiddenBooks
    : {};
  const presence = client?.config?.presence?.forbiddenSectionEvent && typeof client.config.presence.forbiddenSectionEvent === "object"
    ? client.config.presence.forbiddenSectionEvent
    : {};
  const raw = root.channelDecor && typeof root.channelDecor === "object" ? root.channelDecor : {};
  return {
    enabled: raw.enabled !== false,
    nameChannelCount: Math.max(1, Math.min(4, Number(raw.nameChannelCount) || 2)),
    bookEmoji: String(raw.bookEmoji || presence.bookEmoji || DEFAULT_BOOK_EMOJI).trim() || DEFAULT_BOOK_EMOJI,
  };
}

function resolveMainGuild(client) {
  const guildId = String(client?.config?.mainGuildId || "").trim();
  if (!guildId) return null;
  return client.guilds.cache.get(guildId) || null;
}

function parseVcChannelName(name) {
  const raw = String(name || "");
  const sepIdx = raw.indexOf(CHANNEL_NAME_SEP);
  if (!raw.startsWith(CHANNEL_NAME_PREFIX) || sepIdx <= 1) return null;
  return {
    originalName: raw,
    emoji: raw.slice(CHANNEL_NAME_PREFIX.length, sepIdx),
    tail: raw.slice(sepIdx + CHANNEL_NAME_SEP.length),
  };
}

function buildVcChannelName(emoji, tail) {
  return `${CHANNEL_NAME_PREFIX}${emoji}${CHANNEL_NAME_SEP}${String(tail || "")}`;
}

function mergeNameOriginalCatalog(existingPayload, entries) {
  const catalog = { ...(existingPayload?.nameOriginals && typeof existingPayload.nameOriginals === "object" ? existingPayload.nameOriginals : {}) };
  for (const entry of Array.isArray(entries) ? entries : []) {
    const channelId = String(entry?.channelId || "").trim();
    const originalName = String(entry?.originalName || "").trim();
    if (channelId && originalName && !catalog[channelId]) catalog[channelId] = originalName;
  }
  if (Array.isArray(existingPayload?.nameChannelsHistory)) {
    for (const entry of existingPayload.nameChannelsHistory) {
      const channelId = String(entry?.channelId || "").trim();
      const originalName = String(entry?.originalName || "").trim();
      if (channelId && originalName && !catalog[channelId]) catalog[channelId] = originalName;
    }
  }
  return catalog;
}

function appendNameChannelsHistory(existingPayload, entries) {
  const history = Array.isArray(existingPayload?.nameChannelsHistory) ? [...existingPayload.nameChannelsHistory] : [];
  const seen = new Set(history.map((entry) => String(entry?.channelId || "").trim()).filter(Boolean));
  for (const entry of Array.isArray(entries) ? entries : []) {
    const channelId = String(entry?.channelId || "").trim();
    if (!channelId || seen.has(channelId)) continue;
    seen.add(channelId);
    history.push({
      channelId,
      originalName: String(entry?.originalName || "").trim(),
      eventName: String(entry?.eventName || "").trim(),
      recordedAt: new Date().toISOString(),
    });
  }
  return history;
}

function listBookDecoratedChannels(guild, bookEmoji) {
  const emoji = String(bookEmoji || "").trim();
  return [...guild.channels.cache.values()].filter((channel) => {
    if (!isStrictTextChannel(channel)) return false;
    const parsed = parseVcChannelName(channel.name);
    return Boolean(parsed && parsed.emoji === emoji);
  });
}

function collectActiveDecorChannelIds(payload) {
  const ids = new Set();
  for (const entry of Array.isArray(payload?.nameChannels) ? payload.nameChannels : []) {
    const channelId = String(entry?.channelId || "").trim();
    if (channelId) ids.add(channelId);
  }
  const topicId = payload?.topicChannel?.channelId ? String(payload.topicChannel.channelId).trim() : "";
  if (topicId) ids.add(topicId);
  return ids;
}

async function restoreOrphanedBookNameDecor(guild, decor, payload, options = {}) {
  const preserveActive = options.preserveActive === true;
  const activeIds = preserveActive ? collectActiveDecorChannelIds(payload) : new Set();
  const catalog = mergeNameOriginalCatalog(payload, [
    ...(Array.isArray(payload?.nameChannels) ? payload.nameChannels : []),
    ...(Array.isArray(payload?.nameChannelsHistory) ? payload.nameChannelsHistory : []),
  ]);
  let restored = 0;
      for (const [channelId, originalNameRaw] of Object.entries(catalog)) {
    if (activeIds.has(channelId)) continue;
    const originalName = String(originalNameRaw || "").trim();
    if (!originalName) continue;
    const channel = await fetchGuildChannel(guild, channelId);
    if (!channel || !isStrictTextChannel(channel)) continue;
    if (String(channel.name || "") === originalName) continue;
    if (await setChannelNameSafe(channel, originalName)) restored += 1;
    await sleep(RENAME_GAP_MS);
  }

    const leftovers = listBookDecoratedChannels(guild, decor.bookEmoji).filter((channel) => {
    if (activeIds.has(channel.id)) return false;
    const known = String(catalog[channel.id] || "").trim();
    return !known || known !== String(channel.name || "");
  });
  if (leftovers.length) {
    const fromAudit = await resolveOriginalNamesFromAuditLogs(
      guild,
      leftovers.map((channel) => channel.id),
      decor.bookEmoji,
    );
    for (const channel of leftovers) {
      const originalName = String(fromAudit.get(channel.id) || "").trim();
      if (!originalName || originalName === String(channel.name || "")) continue;
      if (await setChannelNameSafe(channel, originalName)) restored += 1;
      await sleep(RENAME_GAP_MS);
    }
  }
  return restored;
}

async function resolveOriginalNamesFromAuditLogs(guild, channelIds, bookEmoji) {
  const wanted = new Set((Array.isArray(channelIds) ? channelIds : []).map((id) => String(id || "").trim()).filter(Boolean));
  const out = new Map();
  if (!guild?.fetchAuditLogs || !wanted.size) return out;
  const emoji = String(bookEmoji || "").trim();
  let before;
  for (let page = 0; page < 12 && out.size < wanted.size; page += 1) {
    const logs = await guild
      .fetchAuditLogs({
        type: AuditLogEvent.ChannelUpdate,
        limit: 100,
        ...(before ? { before } : {}),
      })
      .catch(() => null);
    if (!logs?.entries?.size) break;
    const entries = [...logs.entries.values()];
    before = entries[entries.length - 1]?.id;
    for (const entry of entries) {
      const targetId = String(entry.targetId || entry.target?.id || "").trim();
      if (!wanted.has(targetId) || out.has(targetId)) continue;
      for (const change of entry.changes || []) {
        if (change.key !== "name") continue;
        const oldName = String(change.old || "").trim();
        const newName = String(change.new || "").trim();
        if (!oldName || !newName) continue;
        const oldParsed = parseVcChannelName(oldName);
        const newParsed = parseVcChannelName(newName);
        if (!oldParsed || !newParsed) continue;
        if (newParsed.emoji !== emoji) continue;
        if (oldParsed.emoji === emoji) continue;
        out.set(targetId, oldName);
        break;
      }
    }
  }
  return out;
}

function guildHasBookTopicDecor(guild, bookEmoji) {
  const emoji = String(bookEmoji || "").trim();
  if (!emoji) return false;
  return [...guild.channels.cache.values()].some((channel) => {
    if (!isTopicDecorChannel(channel)) return false;
    return channelTopicHasBookEmoji(channel, emoji);
  });
}

function channelNameHasBookEmoji(channel, bookEmoji) {
  const parsed = parseVcChannelName(channel?.name);
  return Boolean(parsed && parsed.emoji === String(bookEmoji || "").trim());
}

function channelTopicHasBookEmoji(channel, bookEmoji) {
  if (!isTopicDecorChannel(channel)) return false;
  const emoji = String(bookEmoji || "").trim();
  if (!emoji) return false;
  return String(channel.topic || "").trim().startsWith(emoji);
}

function buildForbiddenSectionEventTopic(decor, originalTopic) {
  const trimmedTopic = String(originalTopic || "").trim();
  if (trimmedTopic.startsWith(decor.bookEmoji)) return trimmedTopic;
  return `${decor.bookEmoji}${trimmedTopic ? ` ${trimmedTopic}` : ""}`.trim();
}

async function restoreAllForbiddenSectionTopics(guild, decor, payload) {
  const emoji = String(decor?.bookEmoji || "").trim();
  let restored = 0;
  const topicEntry = payload?.topicChannel && typeof payload.topicChannel === "object" ? payload.topicChannel : null;
  if (topicEntry?.channelId) {
    const channel = await fetchGuildChannel(guild, String(topicEntry.channelId));
    if (channel) {
      const originalTopic = topicEntry.originalTopic == null ? null : String(topicEntry.originalTopic);
      const expected = originalTopic || null;
      const current = channel?.topic ?? null;
      if (current !== expected && (await setChannelTopicSafe(channel, expected))) restored += 1;
    }
  }
  for (const channel of guild.channels.cache.values()) {
    if (!isTopicDecorChannel(channel)) continue;
    if (topicEntry && channel.id === String(topicEntry.channelId)) continue;
    const topic = String(channel.topic || "").trim();
    if (!topic.startsWith(emoji)) continue;
    const cleaned = topic.slice(emoji.length).trim() || null;
    const current = channel?.topic ?? null;
    if (current === cleaned) continue;
    if (await setChannelTopicSafe(channel, cleaned)) restored += 1;
  }
  return restored;
}

function isChannelVisibleToMembers(channel, guild) {
  if (!channel || !guild) return false;
  try {
    const perms = channel.permissionsFor(guild.roles.everyone);
    if (!perms) return false;
    return perms.has(PermissionsBitField.Flags.ViewChannel);
  } catch {
    return false;
  }
}

function channelSupportsTopic(channel) {
  return isTopicDecorChannel(channel);
}

function isManageableDecorChannel(channel, guild, { forTopic = false } = {}) {
  if (!channel || !guild) return false;
  if (forTopic ? !isTopicDecorChannel(channel) : !isNameDecorChannel(channel)) return false;
  if (!isChannelVisibleToMembers(channel, guild)) return false;
  if (!channel.manageable) return false;
  return true;
}

function shuffle(list) {
  const arr = Array.isArray(list) ? [...list] : [];
  for (let i = arr.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [arr[i], arr[j]] = [arr[j], arr[i]];
  }
  return arr;
}

function sleep(ms) {
  return new Promise((resolve) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

function readDiscordRetryAfterMs(err) {
  const retryAfter = Number(err?.retryAfter ?? err?.data?.retry_after ?? err?.rawError?.retry_after);
  if (Number.isFinite(retryAfter) && retryAfter > 0) return Math.ceil(retryAfter * 1000);
  return 0;
}

async function setChannelNameSafe(channel, nextName) {
  const expected = String(nextName || "").trim();
  if (!channel?.setName || !expected || channel.name === expected) return true;
  if (typeof channel.isVoiceBased === "function" && channel.isVoiceBased()) return false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await channel.setName(expected, "Sezione proibita — decorazione evento");
      return true;
    } catch (err) {
      const waitMs = readDiscordRetryAfterMs(err);
      if (waitMs > 0 && attempt < 2) {
        await sleep(waitMs + 300);
        continue;
      }
      global.logger?.warn?.(
        "[FORBIDDEN CHANNELS] rename failed:",
        channel.id,
        channel.name,
        "->",
        expected,
        err?.message || err,
      );
      return false;
    }
  }
  return false;
}

async function setChannelTopicSafe(channel, nextTopic) {
  if (!isTopicDecorChannel(channel)) return false;
  const expected = nextTopic == null ? null : String(nextTopic);
  const current = channel?.topic ?? null;
  if (current === expected) return true;
  if (typeof channel?.setTopic !== "function") return false;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    try {
      await channel.setTopic(expected, "Sezione proibita — decorazione evento");
      return true;
    } catch (err) {
      const waitMs = readDiscordRetryAfterMs(err);
      if (waitMs > 0 && attempt < 2) {
        await sleep(waitMs + 300);
        continue;
      }
      global.logger?.warn?.(
        "[FORBIDDEN CHANNELS] topic failed:",
        channel.id,
        err?.message || err,
      );
      return false;
    }
  }
  return false;
}

async function getDecorDoc(guildId, dedupeKey) {
  return SiteDocument.findOne({
    docType: FORBIDDEN_DOC,
    guildId: String(guildId || "").trim(),
    userId: FORBIDDEN_CHANNEL_DECOR_OWNER_ID,
    dedupeKey: String(dedupeKey || "").trim(),
  })
    .lean()
    .catch(() => null);
}

async function listAppliedDecorDocs(guildId, excludeDedupeKey = "") {
  const query = {
    docType: FORBIDDEN_DOC,
    guildId: String(guildId || "").trim(),
    userId: FORBIDDEN_CHANNEL_DECOR_OWNER_ID,
    status: { $in: ["applied", "partial"] },
  };
  const exclude = String(excludeDedupeKey || "").trim();
  if (exclude) query.dedupeKey = { $ne: exclude };
  return SiteDocument.find(query).lean().catch(() => []);
}

async function restoreChannelDecorDoc(guild, decor, doc) {
  if (!doc || !guild) return { ok: false, code: "no_doc" };
  const payload = doc?.rawWebhook && typeof doc.rawWebhook === "object" ? doc.rawWebhook : {};
  const namesRestored = await restoreOrphanedBookNameDecor(guild, decor, payload, { preserveActive: false });
  const topicsRestored = await restoreAllForbiddenSectionTopics(guild, decor, payload);
  await SiteDocument.updateOne(
    {
      docType: FORBIDDEN_DOC,
      guildId: guild.id,
      userId: FORBIDDEN_CHANNEL_DECOR_OWNER_ID,
      dedupeKey: doc.dedupeKey,
    },
    {
      $set: {
        status: "restored",
        "rawWebhook.restoredAt": new Date().toISOString(),
        "rawWebhook.restoredReason": "round_transition",
      },
    },
  ).catch(() => null);
  return { ok: true, namesRestored, topicsRestored };
}

async function restoreOtherRoundChannelDecor(guild, decor, activeDedupeKey) {
  const docs = await listAppliedDecorDocs(guild.id, activeDedupeKey);
  let totalNames = 0;
  let totalTopics = 0;
  for (const doc of docs) {
    const result = await restoreChannelDecorDoc(guild, decor, doc);
    if (!result.ok) continue;
    totalNames += Number(result.namesRestored) || 0;
    totalTopics += Number(result.topicsRestored) || 0;
  }
  if (totalNames > 0 || totalTopics > 0) {
    global.logger?.info?.(
      "[FORBIDDEN CHANNELS] restored previous round decor:",
      `names=${totalNames}`,
      `topics=${totalTopics}`,
    );
  }
  return { ok: true, totalNames, totalTopics, clearedDocs: docs.length };
}

async function isForbiddenBooksClosed(client, nowMs = Date.now()) {
  const runtime = await resolveForbiddenRoundRuntime(client, nowMs);
  return runtime.roundActive !== true;
}

async function forbiddenBooksHuntActive(client, nowMs = Date.now()) {
  const runtime = await resolveForbiddenRoundRuntime(client, nowMs);
  return runtime.roundActive === true;
}

function setHuntActiveCache(client, active) {
  if (!client || typeof client !== "object") return;
  client._forbiddenBooksHuntActive = Boolean(active);
}

function isForbiddenBooksHuntActiveCached(client, nowMs = Date.now()) {
  if (client?._forbiddenBooksHuntActive === true) return true;
  if (client?._forbiddenBooksHuntActive === false) return false;
  const presence = client?.config?.presence?.forbiddenSectionEvent;
  if (presence?.enabled === false) return false;
  return false;
}

function pickDecorTargets(guild, bookEmoji, nameCount, excludeChannelIds = null) {
  const excluded = excludeChannelIds instanceof Set ? excludeChannelIds : new Set();
  const channels = [...guild.channels.cache.values()].filter((channel) => isManageableDecorChannel(channel, guild));
  const namePool = channels.filter((channel) => {
    if (excluded.has(channel.id)) return false;
    const parsed = parseVcChannelName(channel.name);
    return parsed && parsed.emoji !== bookEmoji;
  });
  const topicPool = [...guild.channels.cache.values()].filter(
    (channel) => isManageableDecorChannel(channel, guild, { forTopic: true }) && !excluded.has(channel.id),
  );
  const pickedNames = shuffle(namePool).slice(0, nameCount);
  const used = new Set(pickedNames.map((channel) => channel.id));
  const pickedTopic = shuffle(topicPool.filter((channel) => !used.has(channel.id)))[0] || null;
  return { pickedNames, pickedTopic };
}

async function fetchGuildChannel(guild, channelId) {
  const id = String(channelId || "").trim();
  if (!id || !guild) return null;
  return guild.channels.cache.get(id) || (await guild.channels.fetch(id).catch(() => null));
}

async function repairInvalidDecorChannels(client, guild, doc, decor) {
  const payload = doc?.rawWebhook && typeof doc.rawWebhook === "object" ? doc.rawWebhook : null;
  const docStatus = String(doc?.status || "");
  if (!payload || !["applied", "partial"].includes(docStatus)) {
    return { repaired: false, needsTopUp: false, payload: null };
  }

  let repaired = false;
  const orphanRestored = await restoreOrphanedBookNameDecor(guild, decor, payload, { preserveActive: true });
  if (orphanRestored > 0) repaired = true;

  const validNameChannels = [];

  for (const entry of Array.isArray(payload.nameChannels) ? payload.nameChannels : []) {
    const channelId = String(entry?.channelId || "").trim();
    const originalName = String(entry?.originalName || "").trim();
    if (!channelId) continue;
    const channel = await fetchGuildChannel(guild, channelId);
    if (!channel || !isNameDecorChannel(channel)) {
      if (channel && originalName) await setChannelNameSafe(channel, originalName);
      repaired = true;
      continue;
    }
    if (!channelNameHasBookEmoji(channel, decor.bookEmoji)) {
      const parsed = parseVcChannelName(channel.name);
      const eventName = parsed ? buildVcChannelName(decor.bookEmoji, parsed.tail) : "";
      if (eventName && await setChannelNameSafe(channel, eventName)) {
        validNameChannels.push({ ...entry, eventName });
        repaired = true;
      } else {
        if (originalName) await setChannelNameSafe(channel, originalName);
        repaired = true;
      }
      await sleep(RENAME_GAP_MS);
      continue;
    }
    validNameChannels.push(entry);
  }

  let topicChannel = payload.topicChannel && typeof payload.topicChannel === "object" ? payload.topicChannel : null;
  if (topicChannel?.channelId) {
    const channel = await fetchGuildChannel(guild, String(topicChannel.channelId));
    if (!channel || !isTopicDecorChannel(channel)) {
      if (channel) {
        const originalTopic = topicChannel.originalTopic == null ? null : String(topicChannel.originalTopic);
        await setChannelTopicSafe(channel, originalTopic || null);
      }
      topicChannel = null;
      repaired = true;
    } else if (!channelTopicHasBookEmoji(channel, decor.bookEmoji)) {
      const originalTopic = topicChannel.originalTopic == null ? null : String(topicChannel.originalTopic);
      const eventTopic = buildForbiddenSectionEventTopic(decor, originalTopic);
      if (await setChannelTopicSafe(channel, eventTopic)) {
        topicChannel = { ...topicChannel, eventTopic };
        repaired = true;
      } else {
        topicChannel = null;
        repaired = true;
      }
    }
  }

  const nextPayload = {
    ...payload,
    nameChannels: validNameChannels.slice(0, decor.nameChannelCount),
    topicChannel: topicChannel || null,
    nameOriginals: mergeNameOriginalCatalog(payload, validNameChannels),
    nameChannelsHistory: appendNameChannelsHistory(payload, validNameChannels),
  };
  const needsTopUp =
    nextPayload.nameChannels.length < decor.nameChannelCount || !topicChannel;

  if (repaired || needsTopUp) {
    await SiteDocument.updateOne(
      {
        docType: FORBIDDEN_DOC,
        guildId: guild.id,
        userId: FORBIDDEN_CHANNEL_DECOR_OWNER_ID,
        dedupeKey: doc.dedupeKey,
      },
      { $set: { rawWebhook: nextPayload, status: needsTopUp ? "partial" : "applied" } },
    ).catch(() => null);
  }

  return { repaired, needsTopUp, payload: nextPayload };
}

async function topUpForbiddenSectionChannelDecor(client, guild, decor, dedupeKey, existingPayload) {
  const usedIds = new Set(
    [
      ...(Array.isArray(existingPayload?.nameChannels) ? existingPayload.nameChannels : []).map((e) => e.channelId),
      existingPayload?.topicChannel?.channelId,
    ]
      .map((id) => String(id || "").trim())
      .filter(Boolean),
  );
  const haveNames = Array.isArray(existingPayload?.nameChannels) ? existingPayload.nameChannels : [];
  const needNames = Math.max(0, decor.nameChannelCount - haveNames.length);
  const needTopic = !existingPayload?.topicChannel?.channelId;
  if (needNames <= 0 && !needTopic) return { ok: true, code: "complete" };

  const { pickedNames, pickedTopic } = pickDecorTargets(guild, decor.bookEmoji, needNames, usedIds);
  const nameChannels = [...haveNames];

  for (const channel of pickedNames) {
    if (!isNameDecorChannel(channel)) continue;
    const parsed = parseVcChannelName(channel.name);
    if (!parsed) continue;
    const eventName = buildVcChannelName(decor.bookEmoji, parsed.tail);
    const renamed = await setChannelNameSafe(channel, eventName);
    if (!renamed) continue;
    nameChannels.push({ channelId: channel.id, originalName: parsed.originalName, eventName });
    usedIds.add(channel.id);
    await sleep(RENAME_GAP_MS);
  }

  let topicEntry = existingPayload?.topicChannel && typeof existingPayload.topicChannel === "object"
    ? existingPayload.topicChannel
    : null;
  if (needTopic && pickedTopic && isTopicDecorChannel(pickedTopic)) {
    const originalTopic = pickedTopic.topic ?? "";
    const eventTopic = buildForbiddenSectionEventTopic(decor, originalTopic);
    const topicOk = await setChannelTopicSafe(pickedTopic, eventTopic);
    if (topicOk) {
      topicEntry = {
        channelId: pickedTopic.id,
        originalTopic,
        eventTopic,
      };
    }
  }

  if (nameChannels.length < decor.nameChannelCount || !topicEntry?.channelId) {
    return { ok: false, code: "insufficient_channels" };
  }

  const payload = {
    bookEmoji: decor.bookEmoji,
    nameChannels: nameChannels.slice(0, decor.nameChannelCount),
    topicChannel: topicEntry,
    nameOriginals: mergeNameOriginalCatalog(existingPayload, nameChannels),
    nameChannelsHistory: appendNameChannelsHistory(existingPayload, nameChannels),
    appliedAt: existingPayload?.appliedAt || new Date().toISOString(),
    toppedUpAt: new Date().toISOString(),
  };

  await SiteDocument.findOneAndUpdate(
    {
      docType: FORBIDDEN_DOC,
      guildId: guild.id,
      userId: FORBIDDEN_CHANNEL_DECOR_OWNER_ID,
      dedupeKey,
    },
    { $set: { status: "applied", rawWebhook: payload } },
  ).catch(() => null);

  global.logger?.info?.(
    "[FORBIDDEN CHANNELS] topped up:",
    nameChannels.map((entry) => entry.channelId).join(", "),
    "topic:",
    topicEntry.channelId,
  );
  return { ok: true, code: "topped_up", payload };
}

async function forceRepairForbiddenSectionChannelDecor(client) {
  const decor = decorCfg(client);
  const guild = resolveMainGuild(client);
  if (!guild) return { ok: false, code: "no_guild" };
  const cfg = resolveHogwartsEventConfig(client);
  const dedupeKey = forbiddenEventDedupeKey(cfg);
  const doc = await getDecorDoc(guild.id, dedupeKey);
  if (!doc) return { ok: false, code: "no_doc" };
  await guild.channels.fetch().catch(() => null);
  await restoreOrphanedBookNameDecor(guild, decor, doc?.rawWebhook || null);
  const repair = await repairInvalidDecorChannels(client, guild, doc, decor);
  if (repair.needsTopUp) {
    return topUpForbiddenSectionChannelDecor(client, guild, decor, dedupeKey, repair.payload);
  }
  if (repair.repaired) {
    await SiteDocument.updateOne(
      {
        docType: FORBIDDEN_DOC,
        guildId: guild.id,
        userId: FORBIDDEN_CHANNEL_DECOR_OWNER_ID,
        dedupeKey,
      },
      { $set: { status: "applied", rawWebhook: repair.payload } },
    ).catch(() => null);
  }
  return { ok: true, code: "repaired", repair };
}

async function applyForbiddenSectionChannelDecor(client) {
  const decor = decorCfg(client);
  if (!decor.enabled) return { ok: false, code: "disabled" };
  const runtime = await resolveForbiddenRoundRuntime(client);
  if (!runtime.roundActive || !runtime.dedupeKey) return { ok: false, code: "round_inactive" };
  const guild = resolveMainGuild(client);
  if (!guild) return { ok: false, code: "no_guild" };
  const dedupeKey = runtime.dedupeKey;
  const existing = await getDecorDoc(guild.id, dedupeKey);
  const existingStatus = String(existing?.status || "");
  if (existingStatus === "applied") return { ok: true, code: "already_applied" };
  if (existingStatus === "partial") {
    const repair = await repairInvalidDecorChannels(client, guild, existing, decor);
    return topUpForbiddenSectionChannelDecor(client, guild, decor, dedupeKey, repair.payload || existing.rawWebhook);
  }

  await restoreOrphanedBookNameDecor(guild, decor, existing?.rawWebhook || null);

  const { pickedNames, pickedTopic } = pickDecorTargets(guild, decor.bookEmoji, decor.nameChannelCount);
  if (pickedNames.length < decor.nameChannelCount || !pickedTopic) {
    global.logger?.warn?.(
      "[FORBIDDEN CHANNELS] insufficient channels:",
      `names=${pickedNames.length}/${decor.nameChannelCount}`,
      `topic=${pickedTopic ? "ok" : "missing"}`,
    );
    return { ok: false, code: "insufficient_channels" };
  }

  const nameChannels = [];
  for (const channel of pickedNames) {
    if (!isNameDecorChannel(channel)) continue;
    const parsed = parseVcChannelName(channel.name);
    if (!parsed) continue;
    const eventName = buildVcChannelName(decor.bookEmoji, parsed.tail);
    const renamed = await setChannelNameSafe(channel, eventName);
    if (!renamed) continue;
    nameChannels.push({ channelId: channel.id, originalName: parsed.originalName, eventName });
    await sleep(RENAME_GAP_MS);
  }

  const originalTopic = pickedTopic.topic ?? "";
  const eventTopic = buildForbiddenSectionEventTopic(decor, originalTopic);
  if (nameChannels.length < decor.nameChannelCount) {
    for (const entry of nameChannels) {
      const channel = guild.channels.cache.get(entry.channelId);
      if (channel) await setChannelNameSafe(channel, entry.originalName);
    }
    return { ok: false, code: "rename_failed" };
  }
  if (!isTopicDecorChannel(pickedTopic)) {
    for (const entry of nameChannels) {
      const channel = guild.channels.cache.get(entry.channelId);
      if (channel) await setChannelNameSafe(channel, entry.originalName);
    }
    return { ok: false, code: "invalid_topic_channel" };
  }
  const topicOk = await setChannelTopicSafe(pickedTopic, eventTopic);
  if (!topicOk) {
    for (const entry of nameChannels) {
      const channel = guild.channels.cache.get(entry.channelId);
      if (channel) await setChannelNameSafe(channel, entry.originalName);
    }
    return { ok: false, code: "topic_failed" };
  }

  const payload = {
    bookEmoji: decor.bookEmoji,
    nameChannels: nameChannels.slice(0, decor.nameChannelCount),
    topicChannel: {
      channelId: pickedTopic.id,
      originalTopic,
      eventTopic,
    },
    nameOriginals: mergeNameOriginalCatalog(existing?.rawWebhook, nameChannels),
    nameChannelsHistory: appendNameChannelsHistory(existing?.rawWebhook, nameChannels),
    appliedAt: new Date().toISOString(),
  };

  await SiteDocument.findOneAndUpdate(
    {
      docType: FORBIDDEN_DOC,
      guildId: guild.id,
      userId: FORBIDDEN_CHANNEL_DECOR_OWNER_ID,
      dedupeKey,
    },
    {
      $setOnInsert: {
        docType: FORBIDDEN_DOC,
        guildId: guild.id,
        userId: FORBIDDEN_CHANNEL_DECOR_OWNER_ID,
        dedupeKey,
        createdBy: "bot",
      },
      $set: {
        status: "applied",
        rawWebhook: payload,
      },
    },
    { upsert: true },
  ).catch(() => null);

  global.logger?.info?.(
    "[FORBIDDEN CHANNELS] applied:",
    nameChannels.map((entry) => entry.channelId).join(", "),
    "topic:",
    pickedTopic.id,
  );
  return { ok: true, code: "applied", payload };
}

async function restoreForbiddenSectionChannelDecor(client, reason = "event_closed") {
  const decor = decorCfg(client);
  const guild = resolveMainGuild(client);
  if (!guild) return { ok: false, code: "no_guild" };
  const runtime = await resolveForbiddenRoundRuntime(client);
  const cfg = resolveHogwartsEventConfig(client);
  const dedupeKey = runtime.dedupeKey || forbiddenEventDedupeKey(cfg);
  const doc = await getDecorDoc(guild.id, dedupeKey);
  const payload = doc?.rawWebhook && typeof doc.rawWebhook === "object" ? doc.rawWebhook : {};
  const docStatus = String(doc?.status || "");

  await guild.channels.fetch().catch(() => null);

  const decoratedChannels = listBookDecoratedChannels(guild, decor.bookEmoji);
  const hasBookTopic = guildHasBookTopicDecor(guild, decor.bookEmoji);
  if (!decoratedChannels.length && !hasBookTopic && docStatus === "restored") {
    setHuntActiveCache(client, false);
    return { ok: true, code: "nothing_to_restore" };
  }

  const namesRestored = await restoreOrphanedBookNameDecor(guild, decor, payload);
  const topicsRestored = await restoreAllForbiddenSectionTopics(guild, decor, payload);

  if (doc) {
    await SiteDocument.updateOne(
      {
        docType: FORBIDDEN_DOC,
        guildId: guild.id,
        userId: FORBIDDEN_CHANNEL_DECOR_OWNER_ID,
        dedupeKey,
      },
      {
        $set: {
          status: "restored",
          "rawWebhook.restoredAt": new Date().toISOString(),
          "rawWebhook.restoredReason": String(reason || "").trim() || "event_closed",
        },
      },
    ).catch(() => null);
  }

  setHuntActiveCache(client, false);
  await applyBotPresence(client).catch(() => null);
  if (namesRestored > 0 || topicsRestored > 0) {
    global.logger?.info?.(
      "[FORBIDDEN CHANNELS] restored:",
      reason,
      `names=${namesRestored}`,
      `topics=${topicsRestored}`,
    );
  }
  return { ok: true, code: "restored", namesRestored, topicsRestored };
}

async function syncForbiddenSectionChannelDecor(client) {
  const decor = decorCfg(client);
  if (!decor.enabled) {
    setHuntActiveCache(client, false);
    await applyBotPresence(client).catch(() => null);
    return;
  }
  const guild = resolveMainGuild(client);
  if (!guild) return;
  const cfg = resolveHogwartsEventConfig(client);
  const runtime = await resolveForbiddenRoundRuntime(client);
  const dedupeKey = runtime.dedupeKey || forbiddenEventDedupeKey(cfg);
  const doc = await getDecorDoc(guild.id, dedupeKey);
  const docStatus = String(doc?.status || "");
  const applied = docStatus === "applied" || docStatus === "partial";
  const huntActive = runtime.roundActive === true;

  if (!huntActive) {
        if (docStatus === "restored" || docStatus === "") {
      await guild.channels.fetch().catch(() => null);
      const leftovers = listBookDecoratedChannels(guild, decor.bookEmoji);
      const hasBookTopic = guildHasBookTopicDecor(guild, decor.bookEmoji);
      if (!leftovers.length && !hasBookTopic) {
        setHuntActiveCache(client, false);
        return;
      }
      const lastCleanupAt = Number(client._forbiddenLeftoverCleanupAt || 0);
      if (Date.now() - lastCleanupAt < 6 * 60 * 60 * 1000) {
        setHuntActiveCache(client, false);
        return;
      }
      client._forbiddenLeftoverCleanupAt = Date.now();
      await restoreForbiddenSectionChannelDecor(client, "leftover_cleanup");
      return;
    }
    await restoreForbiddenSectionChannelDecor(client, runtime.betweenRounds ? "between_rounds" : "winners_closed");
    return;
  }

  if (huntActive && applied) {
    await guild.channels.fetch().catch(() => null);
    const repair = await repairInvalidDecorChannels(client, guild, doc, decor);
    if (repair.needsTopUp) {
      await topUpForbiddenSectionChannelDecor(client, guild, decor, dedupeKey, repair.payload);
    }
  }

  if (huntActive && !applied) {
    await restoreOtherRoundChannelDecor(guild, decor, dedupeKey);
    const result = await applyForbiddenSectionChannelDecor(client);
    if (result.ok) {
      setHuntActiveCache(client, true);
      await applyBotPresence(client).catch(() => null);
    }
    return;
  }

  if (!huntActive && applied) {
    await restoreForbiddenSectionChannelDecor(client, forbiddenEventOpen(client) ? "winners_closed" : "schedule_ended");
    return;
  }

  setHuntActiveCache(client, huntActive);
  await applyBotPresence(client).catch(() => null);
}

async function syncForbiddenSectionPresence(client) {
  const decor = decorCfg(client);
  if (!decor.enabled) {
    setHuntActiveCache(client, false);
    await applyBotPresence(client).catch(() => null);
    return;
  }
  const runtime = await resolveForbiddenRoundRuntime(client);
  setHuntActiveCache(client, runtime.roundActive === true);
  await applyBotPresence(client).catch(() => null);
}

function startForbiddenSectionPresenceLoop(client) {
  const { isHogwartsRuntimeDisabled } = require("../../Utils/Web/hogwartsRuntimeKillSwitch");
  if (isHogwartsRuntimeDisabled(client)) return;
  if (!client || client._forbiddenSectionPresenceLoop) return;
  client._forbiddenSectionPresenceLoop = true;
  const tick = () => {
    syncForbiddenSectionPresence(client).catch((err) => {
      global.logger?.warn?.("[FORBIDDEN CHANNELS] presence sync failed:", err?.message || err);
    });
  };
  tick();
  const timer = setInterval(tick, SYNC_INTERVAL_MS);
  timer.unref?.();
  client._forbiddenSectionPresenceInterval = timer;
}

function startForbiddenSectionChannelDecorLoop(client) {
  const { isHogwartsRuntimeDisabled } = require("../../Utils/Web/hogwartsRuntimeKillSwitch");
  if (isHogwartsRuntimeDisabled(client)) return;
  if (!client || loopState.has(client)) return;
  loopState.add(client);
  const tick = () => {
    syncForbiddenSectionChannelDecor(client).catch((err) => {
      global.logger?.warn?.("[FORBIDDEN CHANNELS] sync failed:", err?.message || err);
    });
  };
  tick();
  const timer = setInterval(tick, SYNC_INTERVAL_MS);
  timer.unref?.();
  client._forbiddenSectionChannelDecorInterval = timer;
}

module.exports = {
  FORBIDDEN_CHANNEL_DECOR_OWNER_ID,
  parseVcChannelName,
  buildVcChannelName,
  decorCfg,
  resolveMainGuild,
  isNameDecorChannel,
  isTopicDecorChannel,
  forbiddenBooksHuntActive,
  isForbiddenBooksHuntActiveCached,
  repairInvalidDecorChannels,
  topUpForbiddenSectionChannelDecor,
  forceRepairForbiddenSectionChannelDecor,
  applyForbiddenSectionChannelDecor,
  restoreForbiddenSectionChannelDecor,
  syncForbiddenSectionChannelDecor,
  syncForbiddenSectionPresence,
  startForbiddenSectionPresenceLoop,
  startForbiddenSectionChannelDecorLoop,
  channelNameHasBookEmoji,
  channelTopicHasBookEmoji,
  collectActiveDecorChannelIds,
  restoreOrphanedBookNameDecor,
  restoreOtherRoundChannelDecor,
  listBookDecoratedChannels,
};