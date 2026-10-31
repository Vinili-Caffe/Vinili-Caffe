/* SNAPSHOT counting logic estratto da officialMessageCommunityHandlers.ts — codice morto, non caricato a runtime.
   Dipende da: countingChannelBanService, countingRestoreService, getCountingConfigFromBucket, IDs.channels.counting
   Ripristino: reinserire nel handler live + re-wire Events/ready + Buttons/countingRestore.
*/


/* ---- lines 5-5 ---- */
const { getCountingConfigFromBucket } = require("../Global/globalSettingsBucket") as typeof import("../Global/globalSettingsBucket");

/* ---- lines 14-22 ---- */
const { revokeCountingChannelSend, applyObviousWrongDayBan, formatBanUntilRomeTime } = require("../Community/countingChannelBanService") as typeof import("../Community/countingChannelBanService");
const COUNTING_CHANNEL_ID = IDs.channels.counting;
const COUNTING_ALLOWED_REGEX = /^[0-9+\-*/x:() ]+$/;

function isCountingEnabled(client?) {
  const cfg = client?.config?.counting;
  if (cfg && typeof cfg === "object" && cfg.enabled === false) return false;
  return true;
}

/* ---- lines 626-669 ---- */
const COUNTING_CACHE_TTL_MS = 60_000;
const countingConfigCache = new Map();
const countingGuildQueues = new Map();

function withCountingGuildLock(guildId?, work?) {
  const key = String(guildId || "") || "_";
  const prev = countingGuildQueues.get(key) || Promise.resolve();
  const run = prev.catch(() => null).then(() => work());
  countingGuildQueues.set(
    key,
    run.then(
      () => null,
      () => null,
    ),
  );
  return run;
}

async function getCountingConfig(guildId?, { bypassCache = false } = {}) {
  if (mongoose.connection?.readyState !== 1) return null;
  const key = String(guildId || "");
  if (!key) return null;
  const now = Date.now();
  if (!bypassCache) {
    const cached = countingConfigCache.get(key);
    if (cached?.value && now < Number(cached.expiresAt || 0)) {
      return cached.value;
    }
  } else {
    countingConfigCache.delete(key);
  }
  const doc = await getCountingConfigFromBucket(key).catch(() => null);
  countingConfigCache.set(key, {
    value: doc || null,
    expiresAt: now + COUNTING_CACHE_TTL_MS,
  });
  return doc || null;
}

function invalidateCountingConfig(guildId?) {
  const key = String(guildId || "");
  if (!key) return;
  countingConfigCache.delete(key);
}

/* ---- lines 1130-1705 ---- */
function isBenignCountingReactionError(err?) {
  const code = Number(err?.code ?? err?.rawError?.code);
  if (code === 90001) return true;
  return /reaction blocked/i.test(String(err?.message || err?.rawError?.message || ""));
}

function logCountingReactionError(client?, err?) {
  if (isBenignCountingReactionError(err)) return;
  logEventError(client, "COUNTING", err);
}

async function sendCountingFailureReply(message?, embed?, client?, restoreContext = null) {
  const {
    COUNTING_RESTORE_ENABLED,
    createRestoreToken,
    attachRestoreMessageId,
    buildCountingRestoreRow,
  } = require("../Community/countingRestoreService") as typeof import("../Community/countingRestoreService");
  const components = [];
  const lostCount = Math.max(0, Math.floor(Number(restoreContext?.lostCount || 0)));
  const guildId = String(restoreContext?.guildId || message?.guild?.id || "");
  let restoreToken = null;
  if (COUNTING_RESTORE_ENABLED && lostCount > 0 && guildId) {
    restoreToken = await createRestoreToken({
      guildId,
      lostCount,
      lostLastUser: restoreContext?.lostLastUser,
      channelId: message?.channel?.id,
    });
    if (restoreToken) components.push(buildCountingRestoreRow(restoreToken));
  }
  try {
    const sent = await safeMessageReply(message, {
      embeds: [embed],
      components,
      allowedMentions: { repliedUser: false },
    });
    if (sent?.id && restoreToken) {
      await attachRestoreMessageId(restoreToken, sent.id, client);
    }
    return sent;
  } catch (err) {
    logEventError(client, "COUNTING REPLY", err);
    return null;
  }
}

const MESSAGE_DELETE_AUDIT = AuditLogEvent?.MessageDelete ?? 72;
const MESSAGE_BULK_DELETE_AUDIT = AuditLogEvent?.MessageBulkDelete ?? 73;
const COUNTING_AUDIT_LOOKBACK_MS = 9000;

function sleep(ms?) {
  return new Promise((resolve?) => {
    const t = setTimeout(resolve, ms);
    t.unref?.();
  });
}

function evaluateCountingContent(raw?) {
  const content = String(raw || "").trim();
  if (!content || !COUNTING_ALLOWED_REGEX.test(content)) return null;
  try {
    const math = require("mathjs") as typeof import("mathjs");
    const expression = content.replace(/\s+/g, "").replace(/x/g, "*").replace(/:/g, "/");
    const value = math.evaluate(expression);
    const n = Number(value);
    return Number.isFinite(n) ? n : null;
  } catch {
    return null;
  }
}

function isCountingNumericContent(raw?) {
  return evaluateCountingContent(raw) !== null;
}

function isCountingMessageAlreadyAccepted(countdata?, messageValue?, authorId?) {
  const value = Math.floor(Number(messageValue));
  const count = Math.floor(Number(countdata?.Count || 0));
  if (!Number.isFinite(value)) return false;
  if (value === count && String(authorId || "") === String(countdata?.LastUser || "")) return true;
  return false;
}

async function resolveCountingTextChannel(guild?) {
  if (!guild?.id) return null;
  const countdata = await getCountingConfig(guild.id);
  if (!countdata) return null;
  const mainGuildId = IDs.guilds?.main || null;
  const countingChannelId =
    countdata.Channel ||
    (String(guild.id) === String(mainGuildId) ? COUNTING_CHANNEL_ID : null);
  if (!countingChannelId) return null;
  const cached = guild.channels.cache.get(countingChannelId);
  if (cached?.isTextBased?.()) return cached;
  const fetched = await guild.channels.fetch(countingChannelId).catch(() => null);
  return fetched?.isTextBased?.() ? fetched : null;
}

async function resolveSingleMessageDeleteExecutor(guild?, channelId?, messageAuthorId?) {
  const me = guild.members?.me;
  if (!me?.permissions?.has?.(PermissionFlagsBits.ViewAuditLog)) return null;
  const now = Date.now();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const logs = await guild
      .fetchAuditLogs({ type: MESSAGE_DELETE_AUDIT, limit: 18 })
      .catch(() => null);
    for (const entry of logs?.entries?.values?.() || []) {
      if (entry.action !== MESSAGE_DELETE_AUDIT) continue;
      const created = Number(entry.createdTimestamp || 0);
      if (!created || now - created > COUNTING_AUDIT_LOOKBACK_MS) continue;
      const chId = String(entry.extra?.channel?.id || "");
      if (chId !== String(channelId)) continue;
      if (String(entry.targetId || "") !== String(messageAuthorId)) continue;
      const ex = entry.executor;
      if (!ex || ex.bot) return null;
      return ex.id;
    }
    if (attempt < 2) await sleep(450);
  }
  return null;
}

async function resolveBulkMessageDeleteExecutor(guild?, channelId?, deletedCount?) {
  const me = guild.members?.me;
  if (!me?.permissions?.has?.(PermissionFlagsBits.ViewAuditLog)) return null;
  const now = Date.now();
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const logs = await guild
      .fetchAuditLogs({ type: MESSAGE_BULK_DELETE_AUDIT, limit: 12 })
      .catch(() => null);
    const candidates = [];
    for (const entry of logs?.entries?.values?.() || []) {
      if (entry.action !== MESSAGE_BULK_DELETE_AUDIT) continue;
      const created = Number(entry.createdTimestamp || 0);
      if (!created || now - created > COUNTING_AUDIT_LOOKBACK_MS) continue;
      const sameChannel =
        String(entry.extra?.channel?.id || "") === String(channelId) ||
        String(entry.target?.id || "") === String(channelId);
      if (!sameChannel) continue;
      const count = Number(entry.extra?.count || 0);
      const wanted = Number(deletedCount || 0);
      let score = 0;
      if (sameChannel) score += 4;
      if (count > 0 && count === wanted) score += 4;
      else if (count > 0 && wanted > 0 && Math.abs(count - wanted) <= 2) score += 2;
      candidates.push({ entry, score, created });
    }
    if (candidates.length) {
      candidates.sort((a?, b?) => {
        if (b.score !== a.score) return b.score - a.score;
        return b.created - a.created;
      });
      const best = candidates[0];
      if (best?.score >= 4) {
        const ex = best.entry?.executor;
        if (!ex || ex.bot) return null;
        return ex.id;
      }
    }
    if (attempt < 2) await sleep(650);
  }
  return null;
}

async function maybePunishCountingOnDelete(message?, client?) {
  if (!isCountingEnabled(client)) return;
  try {
    const guild = message?.guild;
    if (!guild || message.author?.bot) return;
    const channelId = String(message.channelId || message.channel?.id || "");
    if (!channelId) return;
    const countChannel = await resolveCountingTextChannel(guild);
    if (!countChannel || countChannel.id !== channelId) return;
    const content = String(message.content || "");
    if (!isCountingNumericContent(content)) return;
    const authorId = message.author?.id;
    if (!authorId) return;
    const executorId = await resolveSingleMessageDeleteExecutor(
      guild,
      channelId,
      authorId,
    );
    const targetUserId = executorId || authorId;
    await revokeCountingChannelSend(
      guild,
      countChannel,
      targetUserId,
      client,
      "Counting: eliminazione messaggio numerico",
    );
  } catch (err) {
    logEventError(client, "COUNTING DELETE SANCTION", err);
  }
}

async function maybePunishCountingOnEdit(previous?, updated?, client?) {
  if (!isCountingEnabled(client)) return;
  try {
    if (!updated?.guild || updated.author?.bot) return;
    const countChannel = await resolveCountingTextChannel(updated.guild);
    if (!countChannel || countChannel.id !== updated.channelId) return;
    const before = String(previous?.content || "");
    const after = String(updated?.content || "");
    if (before === after) return;
    if (!isCountingNumericContent(before)) return;
    await revokeCountingChannelSend(
      updated.guild,
      countChannel,
      updated.author.id,
      client,
      "Counting: modifica messaggio numerico",
    );
  } catch (err) {
    logEventError(client, "COUNTING EDIT SANCTION", err);
  }
}

async function maybePunishCountingOnBulkDelete(messages?, client?) {
  if (!isCountingEnabled(client)) return;
  try {
    if (!messages?.size) return;
    const sample = messages.first();
    const guild = sample?.guild;
    if (!guild) return;
    const channelId = String(sample.channelId || sample.channel?.id || "");
    const countChannel = await resolveCountingTextChannel(guild);
    if (!countChannel || countChannel.id !== channelId) return;
    let anyCounting = false;
    for (const m of messages.values()) {
      if (m?.author?.bot) continue;
      if (isCountingNumericContent(m?.content)) {
        anyCounting = true;
        break;
      }
    }
    if (!anyCounting) return;
    const executorId = await resolveBulkMessageDeleteExecutor(
      guild,
      channelId,
      messages.size,
    );
    if (!executorId) return;
    await revokeCountingChannelSend(
      guild,
      countChannel,
      executorId,
      client,
      "Counting: eliminazione massiva messaggi nel canale",
    );
  } catch (err) {
    logEventError(client, "COUNTING BULK SANCTION", err);
  }
}

async function resolveCountingMember(message?) {
  if (message.member) return message.member;
  const guild = message.guild || message.channel?.guild;
  const authorId = message.author?.id;
  if (!guild || !authorId || message.author?.bot) return null;
  const cached = guild.members.cache.get(authorId);
  if (cached) return cached;
  return guild.members.fetch(authorId).catch(() => null);
}

async function handleCounting(message?, client?) {
  if (!isCountingEnabled(client)) return;
  const guildId =
    message?.guild?.id || message?.channel?.guild?.id || message?.guildId;
  if (!guildId) return;
  return withCountingGuildLock(guildId, () => handleCountingLocked(message, client, guildId));
}

async function handleCountingLocked(message?, client?, guildId?) {
    const countdata = await getCountingConfig(guildId, { bypassCache: true });
  if (!countdata) return;
  const member = await resolveCountingMember(message);
  if (!member) return;
  const mainGuildId = IDs.guilds?.main || null;
  const countingChannelId = countdata.Channel || (String(guildId) === String(mainGuildId) ? COUNTING_CHANNEL_ID : null);
  if (!countingChannelId) return;
  const guild = message.guild || message.channel?.guild;
  if (!guild?.channels?.cache) return;
  const countchannel = guild.channels.cache.get(countingChannelId);
  if (!countchannel) {
    logEventError(
      client,
      "COUNTING",
      `Counting channel not found for guild: ${guildId}`,
    );
    return;
  }
  const messageChannelId = message?.channel?.id;
  if (!messageChannelId) return;
  if (messageChannelId !== countchannel.id) return;
  if (!COUNTING_ALLOWED_REGEX.test(message.content)) {
    return message.delete().catch(() => { });
  }
  try {
    const sendPerms = countchannel.permissionsFor?.(member);
        if (sendPerms && !sendPerms.has(PermissionFlagsBits.SendMessages)) return;
  } catch {
      }
  const messageValue = evaluateCountingContent(message.content);
  if (messageValue === null) {
    return message.delete().catch(() => { });
  }
  const reaction = "<:success:1461731530333229226>";
  if (isCountingMessageAlreadyAccepted(countdata, messageValue, message.author.id)) {
    if (!messageHasBotSuccessReaction(message)) {
      await message.react(reaction).catch((err?) => logCountingReactionError(client, err));
    }
    return;
  }
  if (messageHasBotSuccessReaction(message)) return;
  const countNow = Math.floor(Number(countdata.Count || 0));
  const expectedNext = countNow + 1;
      const isWrongNumber =
    messageValue - 1 !== countNow ||
    messageValue === countNow ||
    messageValue > countNow + 1;
  const isAlone = String(message.author.id) === String(countdata.LastUser || "").trim();
      if (isWrongNumber) {
    const lostCount = countNow;
    const lostLastUser = countdata.LastUser;
    const banOutcome = await applyObviousWrongDayBan({
      member,
      channel: countchannel,
      client,
      expectedNext,
      submittedValue: messageValue,
    });
    let failureText =
      `<:cancel:1461730653677551691> Hai sbagliato numero! Counting perso a: **${lostCount}**! Riparti scrivendo **1**.`;
    if (banOutcome?.applied) {
      failureText += `\n<a:VC_uaskelly:1507868393305411655> Numero **molto** lontano da **${expectedNext}**: bloccato/a in questo canale fino a **${formatBanUntilRomeTime(banOutcome.banUntilMs)}**.`;
    }
    await sendCountingFailureReply(
      message,
      new EmbedBuilder()
        .setDescription(failureText)
        .setColor("#6f4e37"),
      client,
      { guildId, lostCount, lostLastUser },
    );
    countdata.Count = 0;
    countdata.LastUser = " ";
    message
      .react("<:cancel:1461730653677551691>")
      .catch((err?) => logCountingReactionError(client, err));
  } else if (isAlone) {
    const lostCount = countNow;
    const lostLastUser = countdata.LastUser;
    await sendCountingFailureReply(
      message,
      new EmbedBuilder()
        .setDescription(
          `<:cancel:1461730653677551691> Non puoi contare da solo! Counting perso a: **${lostCount}**! Riparti scrivendo **1**.`,
        )
        .setColor("#6f4e37"),
      client,
      { guildId, lostCount, lostLastUser },
    );
    countdata.Count = 0;
    countdata.LastUser = " ";
    message
      .react("<:cancel:1461730653677551691>")
      .catch((err?) => logCountingReactionError(client, err));
  } else {
    countdata.Count = countNow + 1;
    countdata.LastUser = message.author.id;
    message
      .react(reaction)
      .catch((err?) => logCountingReactionError(client, err));
  }
  await countdata.save();
  invalidateCountingConfig(guildId);
}

const COUNTING_CATCHUP_FETCH_LIMIT = 100;
const COUNTING_SUCCESS_EMOJI_ID = "1461731530333229226";
const COUNTING_CANCEL_EMOJI_ID = "1461730653677551691";
let countingCatchUpInFlight = null;

function messageHasBotCountingReaction(message?) {
  return message.reactions.cache.some((r?) => r.me === true);
}

function messageHasBotSuccessReaction(message?) {
  return message.reactions.cache.some(
    (r?) =>
      r.me === true &&
      (String(r.emoji?.id || "") === COUNTING_SUCCESS_EMOJI_ID ||
        String(r.emoji?.name || "").toLowerCase() === "success"),
  );
}

function messageHasBotCancelReaction(message?) {
  return message.reactions.cache.some(
    (r?) =>
      r.me === true &&
      (String(r.emoji?.id || "") === COUNTING_CANCEL_EMOJI_ID ||
        String(r.emoji?.name || "").toLowerCase() === "cancel"),
  );
}

function findLastBotSuccessTimestamp(messages?) {
  let lastTs = 0;
  for (const message of messages.values()) {
    if (!messageHasBotSuccessReaction(message)) continue;
    if (message.createdTimestamp > lastTs) lastTs = message.createdTimestamp;
  }
  return lastTs;
}

async function resolveCountingTextChannelForSync(guild?, client?, channelId?) {
  if (!channelId) return null;
  const cached = guild.channels.cache.get(channelId) || client.channels.cache.get(channelId);
  if (cached?.messages?.fetch) return cached;
  const fetched = await guild.channels.fetch(channelId).catch(() => null);
  if (fetched?.messages?.fetch) return fetched;
  return null;
}

async function softSyncCountingCatchUpForGuild(guild?, client?, countdata?) {
  const mainGuildId = IDs.guilds?.main || null;
  const channelId = countdata.Channel || (guild.id === mainGuildId ? COUNTING_CHANNEL_ID : null);
  const channel = await resolveCountingTextChannelForSync(guild, client, channelId);
  if (!channel?.messages?.fetch) return { advanced: 0 };

  let messages;
  try {
    messages = await channel.messages.fetch({ limit: COUNTING_CATCHUP_FETCH_LIMIT });
  } catch (err) {
    global.logger?.warn?.("[COUNTING] catch-up fetch failed:", guild.id, err?.message || err);
    return { advanced: 0 };
  }

  invalidateCountingConfig(guild.id);
  const fresh = (await getCountingConfig(guild.id)) || countdata;
  let counterNow = Math.floor(Number(fresh.Count || 0));
  let lastUser = String(fresh.LastUser || "").trim();
  const successReaction = "<:success:1461731530333229226>";

  const chronological = [...messages.values()]
    .filter((m?) => !m.author?.bot && COUNTING_ALLOWED_REGEX.test(m.content))
    .sort((a?, b?) => a.createdTimestamp - b.createdTimestamp);

          let dirty = false;
  let lastCleanSuccess = null;
  for (let i = chronological.length - 1; i >= 0; i -= 1) {
    const m = chronological[i];
    if (!messageHasBotSuccessReaction(m)) continue;
    if (messageHasBotCancelReaction(m)) continue;
    const v = Math.floor(Number(evaluateCountingContent(m.content)));
    if (!Number.isFinite(v)) continue;
    lastCleanSuccess = {
      value: v,
      authorId: String(m.author?.id || "").trim(),
      createdTimestamp: m.createdTimestamp,
    };
    break;
  }
  const hasFailAfterLastSuccess = lastCleanSuccess
    ? chronological.some(
        (m?) =>
          m.createdTimestamp > lastCleanSuccess.createdTimestamp &&
          messageHasBotCancelReaction(m),
      )
    : false;
  if (lastCleanSuccess && !hasFailAfterLastSuccess) {
    const { value: v, authorId } = lastCleanSuccess;
    if (v !== counterNow || authorId !== lastUser) {
      counterNow = v;
      lastUser = authorId || lastUser;
      fresh.Count = counterNow;
      fresh.LastUser = lastUser || " ";
      dirty = true;
      global.logger?.info?.(
        `[COUNTING] catch-up guild ${guild.id}: ripristino da ultimo successo → ${counterNow}`,
      );
    }
  } else if (lastCleanSuccess && hasFailAfterLastSuccess && counterNow === 0) {
    global.logger?.info?.(
      `[COUNTING] catch-up guild ${guild.id}: fail dopo ultimo successo → lascio counter a 0 (Ripristina)`,
    );
  }

    for (const m of chronological) {
    if (!messageHasBotCancelReaction(m) || !messageHasBotSuccessReaction(m)) continue;
    const success = m.reactions.cache.find(
      (r?) =>
        r.me === true &&
        (String(r.emoji?.id || "") === COUNTING_SUCCESS_EMOJI_ID ||
          String(r.emoji?.name || "").toLowerCase() === "success"),
    );
    if (success) {
      await success.users.remove(client.user.id).catch(() => null);
    }
  }

  const pending = chronological.filter((m?) => {
    if (messageHasBotCancelReaction(m)) return false;
    if (messageHasBotSuccessReaction(m)) return false;
    const v = Math.floor(Number(evaluateCountingContent(m.content)));
    if (!Number.isFinite(v)) return false;
    return v > counterNow;
  });
  if (!pending.length && !dirty) return { advanced: 0 };
  if (pending.length) {
    global.logger?.info?.(
      `[COUNTING] catch-up guild ${guild.id}: ${pending.length} messaggio/i da allineare (counter DB: ${counterNow})`,
    );
  }

  let advanced = 0;
  for (const message of pending) {
    const value = Math.floor(Number(evaluateCountingContent(message.content)));
    if (!Number.isFinite(value)) break;
    const authorId = String(message.author?.id || "");
    if (value === counterNow && authorId && authorId === lastUser) {
      if (!messageHasBotSuccessReaction(message)) {
        await message.react(successReaction).catch((err?) => logCountingReactionError(client, err));
      }
      continue;
    }
    if (value !== counterNow + 1) break;
    if (authorId && authorId === lastUser) break;

    counterNow = value;
    lastUser = authorId || lastUser;
    fresh.Count = counterNow;
    fresh.LastUser = lastUser || " ";
    dirty = true;
    advanced += 1;
    if (!messageHasBotSuccessReaction(message)) {
      await message.react(successReaction).catch((err?) => logCountingReactionError(client, err));
    }
  }

  if (dirty) {
    await fresh.save();
    invalidateCountingConfig(guild.id);
    global.logger?.info?.(
      `[COUNTING] catch-up guild ${guild.id}: allineato a ${counterNow} (+${advanced})`,
    );
  }
  return { advanced, counterNow };
}

async function processPendingCountingMessages(client?) {
  if (!isCountingEnabled(client)) return;
  if (!client?.user?.id) return;
  if (mongoose.connection?.readyState !== 1) return;
  if (countingCatchUpInFlight) return countingCatchUpInFlight;

  countingCatchUpInFlight = (async () => {
    try {
      for (const guild of client.guilds.cache.values()) {
        try {
          await withCountingGuildLock(guild.id, async () => {
            const countdata = await getCountingConfig(guild.id, { bypassCache: true });
            if (!countdata) return;
            await softSyncCountingCatchUpForGuild(guild, client, countdata);
          });
        } catch (err) {
          global.logger?.warn?.("[COUNTING] catch-up guild failed:", guild.id, err?.message || err);
        }
      }
    } finally {
      countingCatchUpInFlight = null;
    }
  })();

  return countingCatchUpInFlight;
}
