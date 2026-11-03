const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const mongoose = require("mongoose") as typeof import("mongoose");
const IDs = require("../Config/ids") as typeof import("../Config/ids");
const { getCountingConfigFromBucket } = require("../Global/globalSettingsBucket") as typeof import("../Global/globalSettingsBucket");
const { ActivityUserProfile, SiteDocument, SITE_DOCUMENT_TYPE } = require("../../../../../../src/Vinili/Community/schemas/communitySchemas") as typeof import("../../../../../../src/Vinili/Community/schemas/communitySchemas");

const COUNTING_RESTORE_DOC_TYPE = SITE_DOCUMENT_TYPE.COUNTING_RESTORE_TOKEN;
const { isValidGuildUserId } = require("../DB/validateWriteIds") as typeof import("../DB/validateWriteIds");

const COUNTING_RESTORE_PREFIX = "vc_counting_restore:";
const TOKEN_TTL_MS = 24 * 60 * 60 * 1000;
const COUNTING_RESTORE_TIME_ZONE = "Europe/Rome";
const EXPIRY_SWEEP_INTERVAL_MS = 10 * 60 * 1000;
const RESTORE_TOKEN_RETENTION_MS = 7 * 24 * 60 * 60 * 1000;
/** TEMP: ripristino counting disabilitato (sito + bot). Rimetti `true` per riattivare. */
const COUNTING_RESTORE_ENABLED = false;

const restoreTokens = new Map();
const expiryTimers = new Map();
let expirySweepHandle = null;

const COUNTING_RESTORE_ROLE_IDS = [IDs?.roles?.DoubleBooster, IDs?.roles?.VIPplus, IDs?.roles?.["VIP+"]].filter(Boolean);

function getCountingRestoreRomeDayKey(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: COUNTING_RESTORE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const map: Record<string, any> = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return `${map.year}-${map.month}-${map.day}`;
}

function entryFromDoc(doc?) {
  if (!doc) return null;
  const expiresAtMs = new Date(doc.expiresAt || 0).getTime();
  const status = String(doc.status || "active");
  return {
    token: String(doc.requestToken || ""),
    guildId: String(doc.guildId || ""),
    lostCount: Math.max(0, Math.floor(Number(doc.rawOrder?.lostCount || 0))),
    lostLastUser: String(doc.rawOrder?.lostLastUser ?? " ").trim() || " ",
    channelId: String(doc.dmChannelId || ""),
    messageId: String(doc.dmMessageId || ""),
    createdAt: new Date(doc.createdAt || Date.now()).getTime(),
    expiresAt: expiresAtMs,
    used: status === "used",
    buttonDisabled: status === "disabled",
  };
}

function isTokenExpired(entry?) {
  return !entry || Date.now() >= Number(entry.expiresAt || 0);
}

async function reserveCountingRestoreForToday(guildId?, userId?) {
  if (!isValidGuildUserId(guildId, userId)) return false;
  if (mongoose.connection?.readyState !== 1) return false;
  const todayKey = getCountingRestoreRomeDayKey();
  const doc = await ActivityUserProfile.findOneAndUpdate(
    {
      guildId: String(guildId),
      userId: String(userId),
      $or: [
        { "profile.countingRestoreLastDayKey": { $ne: todayKey } },
        { "profile.countingRestoreLastDayKey": null },
        { "profile.countingRestoreLastDayKey": { $exists: false } },
      ],
    },
    {
      $setOnInsert: { guildId: String(guildId), userId: String(userId) },
      $set: { "profile.countingRestoreLastDayKey": todayKey },
    },
    { upsert: true, setDefaultsOnInsert: true },
  ).catch(() => null);
  return Boolean(doc);
}

function memberCanRestoreCounting(member?) {
  return Boolean(
    member?.roles?.cache &&
    COUNTING_RESTORE_ROLE_IDS.some((roleId?) => member.roles.cache.has(roleId)),
  );
}

function clearExpiryTimer(token?) {
  const key = String(token || "");
  const timer = expiryTimers.get(key);
  if (!timer) return;
  clearTimeout(timer);
  expiryTimers.delete(key);
}

function statusFromEntry(entry?) {
  if (entry?.used) return "used";
  if (entry?.buttonDisabled) return "disabled";
  return "active";
}

async function persistRestoreToken(entry?) {
  if (!entry?.token || mongoose.connection?.readyState !== 1) return;
  await SiteDocument.updateOne(
    { docType: COUNTING_RESTORE_DOC_TYPE, requestToken: entry.token },
    {
      $set: {
        guildId: entry.guildId,
        dmChannelId: entry.channelId,
        dmMessageId: entry.messageId,
        status: statusFromEntry(entry),
        expiresAt: new Date(Number(entry.expiresAt || Date.now())),
        rawOrder: { lostCount: entry.lostCount, lostLastUser: entry.lostLastUser },
      },
    },
    { upsert: true },
  ).catch((err?) => {
    global.logger?.warn?.("[COUNTING RESTORE] persist failed:", err?.message || err);
  });
}

async function consumeRestoreToken(token?) {
  const key = String(token || "");
  if (!key) return;
  clearExpiryTimer(key);
  restoreTokens.delete(key);
  if (mongoose.connection?.readyState !== 1) return;
  await SiteDocument.updateOne(
    { docType: COUNTING_RESTORE_DOC_TYPE, requestToken: key },
    { $set: { status: "used" } },
  ).catch(() => null);
}

async function lookupRestoreTokenDoc(token?) {
  const key = String(token || "");
  if (!key || mongoose.connection?.readyState !== 1) return null;
  return SiteDocument.findOne({ docType: COUNTING_RESTORE_DOC_TYPE, requestToken: key }).lean().catch(() => null);
}

function buildCountingRestoreRow(token?, { disabled = false } = {}) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${COUNTING_RESTORE_PREFIX}${token}`)
      .setLabel(disabled ? "Scaduto" : "Ripristina")
      .setEmoji("<:VC_Vip:1482534921472835895>")
      .setStyle(disabled ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setDisabled(Boolean(disabled)),
  );
}

function buildCountingRestoredEmbed(restoredByUserId?, restoredCount?) {
  const count = Math.max(0, Math.floor(Number(restoredCount || 0)));
  const nextNumber = count + 1;
  const restorer = String(restoredByUserId || "").trim();
  const byLine = restorer ? ` da <@${restorer}>` : "";
  return new EmbedBuilder()
    .setColor("#4ade80")
    .setDescription(
      `<a:VC_ThankYou:1330186319673950401> Counting ripristinato${byLine}!\n<a:VC_clap:1507868436095696976> Contatore riportato a **${count}**. Prossimo numero da scrivere: **${nextNumber}**.`,
    );
}

async function fetchRestoreMessage(client?, entry?) {
  if (!entry?.channelId || !entry?.messageId) return null;
  const channel =
    client?.channels?.cache?.get(entry.channelId) ||
    (await client?.channels?.fetch?.(entry.channelId).catch(() => null));
  return channel?.messages?.fetch?.(entry.messageId).catch(() => null);
}

async function updateFailureEmbedAfterRestore(client, entry, { restoredByUserId, restoredCount }) {
  const message = await fetchRestoreMessage(client, entry);
  if (!message?.editable) return;
      try {
    const { safeMessageEdit } = require("../../../shared/discord/replyRuntime") as typeof import("../../../shared/discord/replyRuntime");
    await safeMessageEdit(
      message,
      {
        embeds: [buildCountingRestoredEmbed(restoredByUserId, restoredCount)],
        components: [],
        allowedMentions: { users: restoredByUserId ? [String(restoredByUserId)] : [] },
      },
      message,
    );
  } catch {
    await message
      .edit({
        embeds: [buildCountingRestoredEmbed(restoredByUserId, restoredCount)],
        components: [],
        attachments: [],
        allowedMentions: { users: restoredByUserId ? [String(restoredByUserId)] : [] },
      })
      .catch(() => null);
  }
}

async function clearRestoreButtonOnMessage(client?, entry?) {
  const message = await fetchRestoreMessage(client, entry);
  if (!message?.editable) return;
  await message.edit({ components: [] }).catch(() => null);
}

async function disableRestoreButtonOnMessage(client?, entry?) {
  if (!entry?.token || !entry?.channelId || !entry?.messageId) return;
  const message = await fetchRestoreMessage(client, entry);
  if (!message?.editable) return;
  await message.edit({
    components: [buildCountingRestoreRow(entry.token, { disabled: true })],
  }).catch(() => null);
}

async function expireCountingRestoreToken(client?, token?, entry?) {
  const key = String(token || "");
  if (!key) return;
  clearExpiryTimer(key);

  const active = entry || restoreTokens.get(key) || entryFromDoc(await lookupRestoreTokenDoc(key));
  restoreTokens.delete(key);
  if (active?.buttonDisabled) return;

  if (active) {
    active.buttonDisabled = true;
    await persistRestoreToken(active);
    await disableRestoreButtonOnMessage(client, active);
  } else if (mongoose.connection?.readyState === 1) {
    await SiteDocument.updateOne(
      { docType: COUNTING_RESTORE_DOC_TYPE, requestToken: key },
      { $set: { status: "disabled" } },
    ).catch(() => null);
  }
}

function scheduleRestoreTokenExpiry(client?, entry?) {
  const token = String(entry?.token || "");
  if (!token || !client || entry?.used || entry?.buttonDisabled) return;

  clearExpiryTimer(token);
  const remaining = Number(entry.expiresAt || 0) - Date.now();
  if (remaining <= 0) {
    void expireCountingRestoreToken(client, token, entry);
    return;
  }

  const timer = setTimeout(() => {
    expiryTimers.delete(token);
    void expireCountingRestoreToken(client, token, restoreTokens.get(token) || entry);
  }, remaining);
  timer.unref?.();
  expiryTimers.set(token, timer);
}

async function createRestoreToken({ guildId, lostCount, lostLastUser, channelId }) {
  if (!COUNTING_RESTORE_ENABLED) return null;
  const token = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  const expiresAt = Date.now() + TOKEN_TTL_MS;
  const entry = {
    token,
    guildId: String(guildId || ""),
    lostCount: Math.max(0, Math.floor(Number(lostCount || 0))),
    lostLastUser: String(lostLastUser ?? " ").trim() || " ",
    channelId: String(channelId || ""),
    messageId: "",
    createdAt: Date.now(),
    expiresAt,
    used: false,
    buttonDisabled: false,
  };
  restoreTokens.set(token, entry);
  await persistRestoreToken(entry);
  return token;
}

async function attachRestoreMessageId(token?, messageId?, client?) {
  const key = String(token || "");
  const entry = restoreTokens.get(key) || entryFromDoc(await lookupRestoreTokenDoc(key));
  if (!entry || entry.used) return;
  entry.messageId = String(messageId || "");
  restoreTokens.set(key, entry);
  await persistRestoreToken(entry);
  if (client) scheduleRestoreTokenExpiry(client, entry);
}

async function getRestoreToken(token?) {
  const key = String(token || "");
  if (!key) return null;

  let entry = restoreTokens.get(key);
  if (!entry) {
    const doc = await lookupRestoreTokenDoc(key);
    entry = entryFromDoc(doc);
    if (entry && !entry.used) restoreTokens.set(key, entry);
  }

  if (!entry || entry.used || isTokenExpired(entry)) {
    restoreTokens.delete(key);
    return null;
  }
  return entry;
}

async function describeUnavailableRestore(token?) {
  const doc = await lookupRestoreTokenDoc(token);
  if (!doc) {
    return "<:cancel:1461730653677551691> Questo ripristino non è più disponibile.";
  }
  if (doc.used) {
    return "<:cancel:1461730653677551691> Questo ripristino è già stato usato.";
  }
  if (new Date(doc.expiresAt).getTime() <= Date.now()) {
    return "<:cancel:1461730653677551691> Questo ripristino è scaduto (**24 ore** dalla segnalazione dell'errore).";
  }
  return "<:cancel:1461730653677551691> Questo ripristino non è più disponibile.";
}

async function sweepExpiredRestoreTokens(client?) {
  if (mongoose.connection?.readyState !== 1) return;

  const now = new Date();
  const expired = await SiteDocument.find({
    docType: COUNTING_RESTORE_DOC_TYPE,
    status: "active",
    expiresAt: { $lte: now },
  }).lean().catch(() => []);

  for (const doc of expired) {
    await expireCountingRestoreToken(client, doc.requestToken, entryFromDoc(doc));
  }

  const retentionCutoff = new Date(Date.now() - RESTORE_TOKEN_RETENTION_MS);
  await SiteDocument.deleteMany({
    docType: COUNTING_RESTORE_DOC_TYPE,
    $or: [
      { status: "used", updatedAt: { $lt: retentionCutoff } },
      { expiresAt: { $lt: retentionCutoff } },
    ],
  }).catch(() => null);
}

async function hydrateCountingRestoreTokens(client?) {
  if (mongoose.connection?.readyState !== 1) return;

  const now = new Date();
  const active = await SiteDocument.find({
    docType: COUNTING_RESTORE_DOC_TYPE,
    status: "active",
    expiresAt: { $gt: now },
  }).lean().catch(() => []);

  for (const doc of active) {
    const entry = entryFromDoc(doc);
    if (!entry?.token) continue;
    restoreTokens.set(entry.token, entry);
    if (!entry.buttonDisabled && entry.messageId) {
      scheduleRestoreTokenExpiry(client, entry);
    }
  }

  await sweepExpiredRestoreTokens(client);
}

function startCountingRestoreMaintenance(client?) {
  if (expirySweepHandle || !client) return;
  expirySweepHandle = setInterval(() => {
    void sweepExpiredRestoreTokens(client).catch((err?) => {
      global.logger?.warn?.("[COUNTING RESTORE] sweep failed:", err?.message || err);
    });
  }, EXPIRY_SWEEP_INTERVAL_MS);
  expirySweepHandle.unref?.();
}

async function handleCountingRestoreButton(interaction?, client?, invalidateCountingConfig?) {
  if (!COUNTING_RESTORE_ENABLED) {
    await interaction.reply({
      content: "<:cancel:1461730653677551691> Il ripristino counting è temporaneamente disabilitato.",
      flags: 1 << 6,
    }).catch(() => null);
    return;
  }
  const token = String(interaction?.customId || "").slice(COUNTING_RESTORE_PREFIX.length);
  const entry = await getRestoreToken(token);
  if (!entry) {
    await interaction.reply({
      content: await describeUnavailableRestore(token),
      flags: 1 << 6,
    }).catch(() => null);
    return;
  }
  if (String(interaction.guildId || "") !== entry.guildId) {
    await interaction.reply({
      content: "<:cancel:1461730653677551691> Ripristino non valido in questo server.",
      flags: 1 << 6,
    }).catch(() => null);
    return;
  }
  const member = interaction.member;
  if (!memberCanRestoreCounting(member)) {
    await interaction.reply({
      content: `<:cancel:1461730653677551691> Solo <@&${IDs.roles.DoubleBooster}> e <@&${IDs.roles.VIPplus}> possono ripristinare il counting.`,
      flags: 1 << 6,
    }).catch(() => null);
    return;
  }
  const countdata = await getCountingConfigFromBucket(entry.guildId);
  if (!countdata) {
    await interaction.reply({
      content: "<:cancel:1461730653677551691> Config counting non trovata.",
      flags: 1 << 6,
    }).catch(() => null);
    return;
  }
  if (Number(countdata.Count || 0) !== 0) {
    await consumeRestoreToken(token);
    await clearRestoreButtonOnMessage(client, entry);
    await interaction.reply({
      content: "<:cancel:1461730653677551691> Il counting è già ripartito: non si può più ripristinare.",
      flags: 1 << 6,
    }).catch(() => null);
    return;
  }
  const userId = String(interaction.user?.id || "");
  if (!(await reserveCountingRestoreForToday(entry.guildId, userId))) {
    await interaction.reply({
      content: "<:cancel:1461730653677551691> Hai già usato il ripristino counting oggi (max **1 al giorno**). Riprova domani.",
      flags: 1 << 6,
    }).catch(() => null);
    return;
  }
  countdata.Count = entry.lostCount;
  countdata.LastUser = entry.lostLastUser;
  await countdata.save();
  if (typeof invalidateCountingConfig === "function") {
    invalidateCountingConfig(entry.guildId);
  }
  await consumeRestoreToken(token);
  await updateFailureEmbedAfterRestore(client, entry, {
    restoredByUserId: userId,
    restoredCount: entry.lostCount,
  });
  const nextNumber = entry.lostCount + 1;
  await interaction.reply({
    content: `<a:VC_ThankYou:1330186319673950401> Counting ripristinato a **${entry.lostCount}**. <a:VC_uaskelly:1507868393305411655> Prossimo numero: **${nextNumber}**.`,
    flags: 1 << 6,
  }).catch(() => null);
}

export = {
  COUNTING_RESTORE_ENABLED,
  COUNTING_RESTORE_PREFIX,
  TOKEN_TTL_MS,
  memberCanRestoreCounting,
  createRestoreToken,
  attachRestoreMessageId,
  buildCountingRestoreRow,
  handleCountingRestoreButton,
  hydrateCountingRestoreTokens,
  startCountingRestoreMaintenance,
};
