const { PermissionFlagsBits } = require("discord.js") as typeof import("discord.js");
const { getOrCreateStaffDoc, ensureStaff } = require("../../Utils/Staff/staffDocUtils") as typeof import("../../Utils/Staff/staffDocUtils");
const { initPartnerManagerFieldsIfMissing } = require("../../Utils/Staff/staffPmUtils") as typeof import("../../Utils/Staff/staffPmUtils");
const { getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache") as typeof import("../../Utils/Interaction/interactionEntityCache");
const {
  resolvePartnershipConfigSync,
  isPartnershipOperational,
  memberHasPartnerManagerRole,
  getPartnershipPingRoleId,
} = require("../../Utils/Partner/partnershipConfigResolver") as typeof import("../../Utils/Partner/partnershipConfigResolver");
const {
  extractInviteCode,
  hasRequiredDiscordInviteLink,
  isValidServerName,
  parseManagerFromContent,
  stripManagerReferencesFromDescription,
  buildPartnershipAboveEmbedContent,
  resolvePartnershipDescriptionForPublish,
} = require("../../Utils/Partner/partnershipMessageUtils") as typeof import("../../Utils/Partner/partnershipMessageUtils");
const {
  extractPartnershipMessageText,
  extractPartnershipMessageHaystack,
  isForwardedDiscordMessage,
} = require("../../Utils/Partner/partnershipMessageBody") as typeof import("../../Utils/Partner/partnershipMessageBody");
const {
  resolvePartnershipPublishPings,
  buildPartnershipPublishAllowedMentions,
} = require("../../Utils/Partner/partnershipPingUtils") as typeof import("../../Utils/Partner/partnershipPingUtils");
const { userSuppressesManagerPing, resolveManagerSelectedBadgeEmojis } = require("./tenantProfilePreferencesService") as typeof import("./tenantProfilePreferencesService");
const { buildThankYouEmbed } = require("../../Utils/Partner/partnershipThankYouEmbed") as typeof import("../../Utils/Partner/partnershipThankYouEmbed");
const {
  resolvePartnerTotalEarned,
  resolvePartnerPointsShown,
} = require("../../Utils/Staff/partnerPointsDisplayUtils") as typeof import("../../Utils/Staff/partnerPointsDisplayUtils");
const { touchPartnershipPublishPings } = require("../../MultiGuild/core/tenantPartnershipSettings") as typeof import("../../MultiGuild/core/tenantPartnershipSettings");
const { reserveAndPersistPartnershipLogId, sendPartnershipExecuteLog } = require("./partnershipExecuteLogService") as typeof import("./partnershipExecuteLogService");
const { evaluateTenantObjectives } = require("./tenantObjectiveService") as typeof import("./tenantObjectiveService");
const { registerShutdownFlush, armShutdownCheckpoint } = require("../../../shared/recovery/shutdownCheckpoint") as typeof import("../../../shared/recovery/shutdownCheckpoint");

const PROCESSING = new Set();
const PENDING_MANAGER_MS = 5000;
const pendingManualPartnerships = new Map();
/* rebootDurability1: cancel pending manual partnerships on shutdown (no orphans) */
let manualPartnershipShutdownFlushRegistered = false;

function pendingKey(guildId?, messageId?) {
  return `${String(guildId || "").trim()}:${String(messageId || "").trim()}`;
}

async function getOrCreateStaffPartnerDoc(guildId?, userId?) {
  const staffDoc = await getOrCreateStaffDoc(guildId, userId);
  if (!staffDoc) return null;
  const s = ensureStaff(staffDoc);
  initPartnerManagerFieldsIfMissing(s);
  return staffDoc;
}

async function fetchInviteMeta(inviteCode?, client = null) {
  const { fetchInviteGuildMeta } = require("../../Utils/Partner/partnershipBlacklistDisplay") as typeof import("../../Utils/Partner/partnershipBlacklistDisplay");
  const meta = await fetchInviteGuildMeta(inviteCode, {
    client,
    timeoutMs: 12_000,
    requireMemberCount: true,
  });
  const code = String(inviteCode || "").trim();
  if (!code) return null;
  const rawCount = meta?.memberCount;
  const memberCount =
    rawCount === null || rawCount === undefined || rawCount === "" || !(Number(rawCount) > 0)
      ? null
      : Math.max(0, Math.floor(Number(rawCount)));
    return {
    guildId: String(meta?.guildId || "").trim() || null,
    serverName: String(meta?.guildName || "").trim() || `discord.gg/${code}`,
    serverIcon: meta?.iconUrl || null,
    memberCount,
    inviteUrl: meta?.invite || `https://discord.gg/${code}`,
  };
}

async function notifyAuthor(message?, content?) {
  await message.author?.send?.({ content }).catch(() => null);
}

function canEditMessage(message?) {
  const me = message.guild?.members?.me;
  if (!me || !message.channel?.permissionsFor) return false;
  const perms = message.channel.permissionsFor(me);
  return Boolean(perms?.has(PermissionFlagsBits.ManageMessages));
}

function isPendingManualPartnershipMessage(guildId?, messageId?) {
  return pendingManualPartnerships.has(pendingKey(guildId, messageId));
}

async function clearPendingManualPartnership(key?, options: Record<string, any> = {}) {
  const pending = pendingManualPartnerships.get(key);
  if (!pending) return;
  if (pending.timeout) clearTimeout(pending.timeout);
  pendingManualPartnerships.delete(key);

  const client = pending.client;
  const guild = client?.guilds?.cache?.get(pending.guildId) || (await client?.guilds?.fetch?.(pending.guildId).catch(() => null));
  const channel =
    guild?.channels?.cache?.get(pending.channelId) ||
    (await guild?.channels?.fetch?.(pending.channelId).catch(() => null));

  if (options.deletePartnershipMessage && channel?.messages?.fetch) {
    const partnershipMessage = await channel.messages.fetch(pending.messageId).catch(() => null);
    await partnershipMessage?.delete?.().catch(() => null);
  }

  if (options.deletePromptMessage && pending.promptMessageId && channel?.messages?.fetch) {
    const promptMessage = await channel.messages.fetch(pending.promptMessageId).catch(() => null);
    await promptMessage?.delete?.().catch(() => null);
  }
}

async function flushCancelPendingManualPartnershipsOnShutdown() {
  const keys = [...pendingManualPartnerships.keys()];
  if (!keys.length) return;
  await Promise.allSettled(
    keys.map((key?) =>
      clearPendingManualPartnership(key, {
        deletePartnershipMessage: true,
        deletePromptMessage: true,
      }),
    ),
  );
}

function ensureManualPartnershipShutdownFlush() {
  if (manualPartnershipShutdownFlushRegistered) return;
  manualPartnershipShutdownFlushRegistered = true;
  armShutdownCheckpoint();
  registerShutdownFlush("vinyls_tenant_manual_partnership_pending", () =>
    flushCancelPendingManualPartnershipsOnShutdown(),
  );
}

function findPendingForAuthorChannel(guildId?, channelId?, authorId?) {
  const gid = String(guildId || "").trim();
  const cid = String(channelId || "").trim();
  const uid = String(authorId || "").trim();
  for (const [key, pending] of pendingManualPartnerships.entries()) {
    if (pending.guildId === gid && pending.channelId === cid && pending.authorId === uid) {
      return { key, pending };
    }
  }
  return null;
}

async function fetchPartnershipMessage(pending?) {
  const client = pending.client;
  const guild =
    client?.guilds?.cache?.get(pending.guildId) ||
    (await client?.guilds?.fetch?.(pending.guildId).catch(() => null));
  const channel =
    guild?.channels?.cache?.get(pending.channelId) ||
    (await guild?.channels?.fetch?.(pending.channelId).catch(() => null));
  if (!channel?.messages?.fetch) return null;
  return channel.messages.fetch(pending.messageId).catch(() => null);
}

async function schedulePendingManagerPrompt(message?, inviteMeta?) {
  ensureManualPartnershipShutdownFlush();
  const guildId = String(message.guild?.id || "").trim();
  const messageId = String(message.id || "").trim();
  const key = pendingKey(guildId, messageId);
  await clearPendingManualPartnership(key);

  const prompt = await message
    .reply({
      content:
        "<:vegax:1443934876440068179> Devi **menzionare il Manager** entro **5 secondi** (nel messaggio o in un altro messaggio), altrimenti la partnership verrà **annullata**.",
      allowedMentions: { parse: [], users: [], roles: [] },
    })
    .catch(() => null);

  const timeout = setTimeout(() => {
    void clearPendingManualPartnership(key, {
      deletePartnershipMessage: true,
      deletePromptMessage: true,
    }).catch(() => null);
  }, PENDING_MANAGER_MS);

  pendingManualPartnerships.set(key, {
    guildId,
    messageId,
    channelId: String(message.channelId || message.channel?.id || ""),
    authorId: String(message.author?.id || ""),
    inviteMeta,
    promptMessageId: prompt?.id || null,
    timeout,
    client: message.client,
  });
}

async function finalizeManualPartnership(message?, managerId?, inviteMeta?, _options: Record<string, any> = {}) {
  const guild = message.guild;
  const guildId = String(guild?.id || "").trim();
  const partnershipCfg = resolvePartnershipConfigSync(guildId);
  const rawContent = extractPartnershipMessageText(message);
  const publishDescription = resolvePartnershipDescriptionForPublish({
    description: rawContent,
    legacy: false,
    contentFilters: partnershipCfg?.contentFilters,
  });
  if (!publishDescription) {
    await notifyAuthor(message, "<:vegax:1443934876440068179> La descrizione partnership è vuota.");
    return { handled: true, delete: true };
  }

  const managerMember = await getGuildMemberCached(guild, managerId).catch(() => null);
  if (!managerMember) {
    await notifyAuthor(message, "<:vegax:1443934876440068179> Il **Manager** indicato non è nel server.");
    return { handled: true, delete: true };
  }

  const staffDoc = await getOrCreateStaffPartnerDoc(guildId, message.author.id);
  if (!staffDoc) {
    await notifyAuthor(message, "<:vegax:1443934876440068179> Impossibile registrare la partnership.");
    return { handled: true, delete: true };
  }

  let serverName = inviteMeta.serverName;
  if (!isValidServerName(serverName)) {
    await notifyAuthor(
      message,
      "<:vegax:1443934876440068179> Invite senza nome server leggibile. Riprova con un altro invite.",
    );
    return { handled: true, delete: true };
  }

  const s = staffDoc.staff;
  const resolvedManagerId = String(managerId || "").trim();
  s.partnerCount++;
  s.managerId = resolvedManagerId;
  const actionEntry = {
    action: "create",
    partner: serverName,
    invite: inviteMeta.inviteUrl,
    partnerGuildId: inviteMeta.guildId,
    managerId: resolvedManagerId,
    partnershipChannelId: partnershipCfg.partnershipsChannelId,
    partnerMessageIds: [message.id],
    manual: true,
    date: new Date(),
  };
  s.partnerActions.push(actionEntry);
  const actionIndex = Math.max(0, s.partnerActions.length - 1);
  staffDoc.markModified("staff");
  await staffDoc.save();

  const pingPlan = resolvePartnershipPublishPings({
    partnerMemberCount: inviteMeta.memberCount,
    pings: partnershipCfg.pings,
    legacy: false,
    legacyPingRoleId: getPartnershipPingRoleId(guildId),
  });
  const pingRoleId = pingPlan.customRoleId;
    const descriptionContent = stripManagerReferencesFromDescription(
    publishDescription,
    resolvedManagerId,
  );
  const managerBadgeEmojis = resolvedManagerId
    ? await resolveManagerSelectedBadgeEmojis(guildId, resolvedManagerId).catch(() => [])
    : [];
  const aboveEmbedContent = buildPartnershipAboveEmbedContent({
    managerId: resolvedManagerId,
    pingPlan,
    badgeEmojis: managerBadgeEmojis,
  });
  const suppressManagerPing =
    Boolean(resolvedManagerId) &&
    (await userSuppressesManagerPing(guildId, resolvedManagerId).catch(() => false));

  if (
    descriptionContent &&
    descriptionContent !== rawContent &&
    !isForwardedDiscordMessage(message) &&
    canEditMessage(message)
  ) {
    await message
      .edit({
        content: descriptionContent,
        allowedMentions: { parse: [], users: [], roles: [] },
      })
      .catch(() => null);
  }

  if (pingPlan.notifyHere || pingPlan.notifyEveryone || pingPlan.notifyCustomRoleId) {
    await touchPartnershipPublishPings(guildId, {
      pingHere: Boolean(pingPlan.notifyHere),
      pingEveryone: Boolean(pingPlan.notifyEveryone),
      customRoleId: pingPlan.notifyCustomRoleId || null,
    }).catch(() => null);
  }

  const member =
    message.member || (await getGuildMemberCached(guild, message.author.id).catch(() => null));
  /* thankYouSpendableOnly1: embed default usa solo spendibile */
  const totalPartnerEarned = resolvePartnerTotalEarned(s);
  const shownPartnerPoints = resolvePartnerPointsShown(s);
  const { embed: thankYouEmbed } = await buildThankYouEmbed({
    guild,
    actorMember: member || message.member || message.author,
    partnershipCfg,
    serverName,
    serverIcon: inviteMeta.serverIcon,
    shownPartnerPoints,
    totalPartnerEarned,
    legacy: false,
    managerId: resolvedManagerId,
    includeManagerInContent: false,
    staffPartnerActions: s.partnerActions || [],
    pingPlan,
  });
  const thankYouPayload: Record<string, any> = { embeds: [thankYouEmbed] };
  if (aboveEmbedContent) {
    thankYouPayload.content = aboveEmbedContent;
    thankYouPayload.allowedMentions = buildPartnershipPublishAllowedMentions(
      pingPlan,
      resolvedManagerId,
      { excludeUserIds: suppressManagerPing ? [resolvedManagerId] : [] },
    );
  }
  const thankYouMessage = await message.channel.send(thankYouPayload).catch(() => null);

  const partnershipLogId = await reserveAndPersistPartnershipLogId(staffDoc, actionIndex);

  if (partnershipCfg.logsChannelId && partnershipLogId) {
    await sendPartnershipExecuteLog({
      client: message.client,
      guild,
      logsChannelId: partnershipCfg.logsChannelId,
      pmUserId: message.author.id,
      managerId: resolvedManagerId,
      pingRoleId,
      pingHere: pingPlan.pingHere,
      pingEveryone: pingPlan.pingEveryone,
      partnershipChannelId: message.channelId,
      partnershipMessageId: message.id,
      partnershipId: partnershipLogId,
    }).catch(() => null);
  }

  if (thankYouMessage?.id && s.partnerActions?.[actionIndex]) {
    s.partnerActions[actionIndex].partnerMessageIds = [message.id, thankYouMessage.id];
    staffDoc.markModified("staff");
    await staffDoc.save().catch(() => null);
  }

  void evaluateTenantObjectives(message.client, guildId, message.author.id, {
    discordLocale: message.author?.locale,
  }).catch(() => null);

  return { handled: true, delete: false };
}

async function validateManualPartnershipDraft(message?) {
  const guild = message.guild;
  const guildId = String(guild?.id || "").trim();
  const rawContent = extractPartnershipMessageHaystack(message);
  if (!rawContent) return { ok: false, delete: true };

  if (!hasRequiredDiscordInviteLink(rawContent)) {
    await notifyAuthor(
      message,
      "<:vegax:1443934876440068179> Devi includere un **link d'invito Discord** valido (`discord.gg/...` o `discord.com/invite/...`).",
    );
    return { ok: false, delete: true, handled: true };
  }

  const inviteCode = extractInviteCode(rawContent);

  const inviteMeta = await fetchInviteMeta(inviteCode, message.client);
  if (!inviteMeta || !isValidServerName(inviteMeta.serverName)) {
    await notifyAuthor(
      message,
      "<:vegax:1443934876440068179> Invito Discord non valido. Controlla il link e riprova.",
    );
    return { ok: false, delete: true, handled: true };
  }
  if (!inviteMeta.guildId || !(Number(inviteMeta.memberCount) > 0)) {
    await notifyAuthor(
      message,
      "<:vegax:1443934876440068179> Non riesco a leggere i dati di questo invito (server/membri). Controlla che il link sia valido e riprova tra poco.",
    );
    return { ok: false, delete: true, handled: true };
  }
  if (inviteMeta.guildId && inviteMeta.guildId === guildId) {
    await notifyAuthor(message, "<:vegax:1443934876440068179> Non puoi fare partner con il tuo server.");
    return { ok: false, delete: true, handled: true };
  }

  const publishDescription = resolvePartnershipDescriptionForPublish({
    description: extractPartnershipMessageText(message) || rawContent,
    legacy: false,
    contentFilters: resolvePartnershipConfigSync(guildId)?.contentFilters,
  });
  if (!publishDescription) {
    await notifyAuthor(message, "<:vegax:1443934876440068179> La descrizione partnership è vuota.");
    return { ok: false, delete: true, handled: true };
  }

  return { ok: true, inviteMeta, publishDescription };
}

async function tryProcessManualPartnershipMessage(message?) {
  const guild = message?.guild;
  const guildId = String(guild?.id || "").trim();
  if (!guildId || !message?.author || message.author.bot || message.webhookId) {
    return { handled: false };
  }

  const partnershipCfg = resolvePartnershipConfigSync(guildId);
  if (!partnershipCfg || partnershipCfg.legacy || !partnershipCfg.manualPartnershipEnabled) {
    return { handled: false };
  }
  if (!isPartnershipOperational(guildId)) return { handled: false };
  if (String(message.channelId || "") !== String(partnershipCfg.partnershipsChannelId || "")) {
    return { handled: false };
  }
  if (isPendingManualPartnershipMessage(guildId, message.id)) {
    return { handled: true, delete: false };
  }

  const member =
    message.member || (await getGuildMemberCached(guild, message.author.id).catch(() => null));
  if (!memberHasPartnerManagerRole(member, guildId)) {
    return { handled: false, delete: true };
  }

  const followUpResult = await tryResolvePendingManualPartnershipFollowUp(message);
  if (followUpResult.handled) return followUpResult;

  const existingPending = findPendingForAuthorChannel(
    guildId,
    String(message.channelId || message.channel?.id || ""),
    message.author.id,
  );
  if (existingPending) {
    return { handled: true, delete: false };
  }

  const lockKey = `${guildId}:${message.id}`;
  if (PROCESSING.has(lockKey)) return { handled: true };
  PROCESSING.add(lockKey);
  try {
    const draft = await validateManualPartnershipDraft(message);
    if (!draft.ok) {
      return { handled: Boolean(draft.handled), delete: Boolean(draft.delete) };
    }

    const managerId = parseManagerFromContent(
      extractPartnershipMessageHaystack(message),
      message.author.id,
    );
    if (!managerId) {
      await schedulePendingManagerPrompt(message, draft.inviteMeta);
      return { handled: true, delete: false };
    }

    return await finalizeManualPartnership(message, managerId, draft.inviteMeta);
  } catch (err) {
    global.logger?.error?.("[manualPartnership]", err);
    return { handled: true, delete: false };
  } finally {
    PROCESSING.delete(lockKey);
  }
}

async function resolvePendingManualPartnership(message?, managerId?, pendingEntry?, options: Record<string, any> = {}) {
  const { key, pending } = pendingEntry;
  const partnershipMessage =
    String(message.id) === String(pending.messageId)
      ? message
      : await fetchPartnershipMessage(pending);
  if (!partnershipMessage) {
    await clearPendingManualPartnership(key, { deletePromptMessage: true });
    return { handled: true, delete: false };
  }

  const lockKey = `${pending.guildId}:${pending.messageId}:resolve`;
  if (PROCESSING.has(lockKey)) return { handled: true, delete: false };
  PROCESSING.add(lockKey);
  try {
    const draft = await validateManualPartnershipDraft(partnershipMessage);
    if (!draft.ok) {
      await clearPendingManualPartnership(key, { deletePromptMessage: true });
      return { handled: Boolean(draft.handled), delete: Boolean(draft.delete) };
    }

    await clearPendingManualPartnership(key, { deletePromptMessage: true });
    const result = await finalizeManualPartnership(
      partnershipMessage,
      managerId,
      draft.inviteMeta || pending.inviteMeta,
      { managerFromFollowUp: true },
    );

    if (result.handled && !result.delete && options.deleteFollowUpMessage) {
      await message.delete().catch(() => null);
    }
    return result;
  } catch (err) {
    global.logger?.error?.("[manualPartnership] pending resolve:", err);
    return { handled: true, delete: false };
  } finally {
    PROCESSING.delete(lockKey);
  }
}

async function tryResolvePendingManualPartnershipFollowUp(message?) {
  const guildId = String(message?.guild?.id || "").trim();
  const channelId = String(message?.channelId || message?.channel?.id || "").trim();
  const authorId = String(message?.author?.id || "").trim();
  if (!guildId || !channelId || !authorId || !message?.author || message.author.bot) {
    return { handled: false };
  }

  const pendingEntry = findPendingForAuthorChannel(guildId, channelId, authorId);
  if (!pendingEntry) return { handled: false };

  const { pending } = pendingEntry;
  const messageId = String(message.id || "").trim();
  if (messageId === String(pending.messageId) || messageId === String(pending.promptMessageId || "")) {
    return { handled: false };
  }

  const managerId = parseManagerFromContent(extractPartnershipMessageHaystack(message), authorId);
  if (!managerId) return { handled: true, delete: false };

  return resolvePendingManualPartnership(message, managerId, pendingEntry, {
    deleteFollowUpMessage: true,
  });
}

async function tryResolvePendingManualPartnershipOnUpdate(_oldMessage?, newMessage?) {
  const message = newMessage;
  const guildId = String(message?.guild?.id || "").trim();
  const messageId = String(message?.id || "").trim();
  if (!guildId || !messageId || !message?.author || message.author.bot) {
    return { handled: false };
  }

  const key = pendingKey(guildId, messageId);
  const pending = pendingManualPartnerships.get(key);
  if (!pending) return { handled: false };
  if (String(message.author?.id || "") !== pending.authorId) return { handled: false };

  const managerId = parseManagerFromContent(
    extractPartnershipMessageHaystack(message),
    message.author.id,
  );
  if (!managerId) return { handled: true, delete: false };

  return resolvePendingManualPartnership(message, managerId, { key, pending });
}

export = {
  tryProcessManualPartnershipMessage,
  tryResolvePendingManualPartnershipOnUpdate,
  isPendingManualPartnershipMessage,
};
