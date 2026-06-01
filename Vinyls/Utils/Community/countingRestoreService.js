const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js");
const mongoose = require("mongoose");
const IDs = require("../Config/ids");
const { getCountingConfigFromBucket } = require("../Global/globalSettingsBucket");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { isValidGuildUserId } = require("../DB/validateWriteIds");
const COUNTING_RESTORE_PREFIX = "vc_counting_restore:";
const TOKEN_TTL_MS = 60 * 60 * 1000;
const COUNTING_RESTORE_TIME_ZONE = "Europe/Rome";
const restoreTokens = new Map();
const COUNTING_RESTORE_ROLE_IDS = [IDs?.roles?.DoubleBooster, IDs?.roles?.VIPplus, IDs?.roles?.["VIP+"]].filter(Boolean);

function getCountingRestoreRomeDayKey(date = new Date()) {
  const formatter = new Intl.DateTimeFormat("en-GB", {
    timeZone: COUNTING_RESTORE_TIME_ZONE,
    year: "numeric",
    month: "2-digit",
    day: "2-digit",
  });
  const parts = formatter.formatToParts(date);
  const map = {};
  for (const part of parts) {
    if (part.type !== "literal") map[part.type] = part.value;
  }
  return `${map.year}-${map.month}-${map.day}`;
}

async function reserveCountingRestoreForToday(guildId, userId) {
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

function memberCanRestoreCounting(member) {
  return Boolean(
    member?.roles?.cache &&
    COUNTING_RESTORE_ROLE_IDS.some((roleId) => member.roles.cache.has(roleId)),
  );
}

function pruneRestoreTokens() {
  const now = Date.now();
  for (const [key, entry] of restoreTokens.entries()) {
    if (!entry || entry.used || now - Number(entry.createdAt || 0) > TOKEN_TTL_MS) {
      restoreTokens.delete(key);
    }
  }
}

function createRestoreToken({ guildId, lostCount, lostLastUser, channelId }) {
  pruneRestoreTokens();
  const token = `${Date.now().toString(36)}_${Math.random().toString(36).slice(2, 10)}`;
  restoreTokens.set(token, {
    guildId: String(guildId || ""),
    lostCount: Math.max(0, Math.floor(Number(lostCount || 0))),
    lostLastUser: String(lostLastUser ?? " ").trim() || " ",
    channelId: String(channelId || ""),
    messageId: "",
    createdAt: Date.now(),
    used: false,
  });
  return token;
}

function attachRestoreMessageId(token, messageId) {
  const entry = restoreTokens.get(String(token || ""));
  if (!entry || entry.used) return;
  entry.messageId = String(messageId || "");
}

function getRestoreToken(token) {
  const entry = restoreTokens.get(String(token || ""));
  if (!entry || entry.used) return null;
  if (Date.now() - Number(entry.createdAt || 0) > TOKEN_TTL_MS) {
    restoreTokens.delete(String(token || ""));
    return null;
  }
  return entry;
}

function buildCountingRestoreRow(token) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${COUNTING_RESTORE_PREFIX}${token}`)
      .setLabel("Ripristina")
      .setEmoji("<:VC_Vip:1482534921472835895>")
      .setStyle(ButtonStyle.Success),
  );
}

function buildCountingRestoredEmbed(restoredByUserId, restoredCount) {
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

async function updateFailureEmbedAfterRestore(client, entry, { restoredByUserId, restoredCount }) {
  if (!entry?.channelId || !entry?.messageId) return;
  const channel =
    client?.channels?.cache?.get(entry.channelId) ||
    (await client?.channels?.fetch?.(entry.channelId).catch(() => null));
  const message = await channel?.messages?.fetch?.(entry.messageId).catch(() => null);
  if (!message?.editable) return;
  await message.edit({
    embeds: [buildCountingRestoredEmbed(restoredByUserId, restoredCount)],
    components: [],
    allowedMentions: { users: restoredByUserId ? [String(restoredByUserId)] : [] },
  }).catch(() => null);
}

async function clearRestoreButtonOnMessage(client, entry) {
  if (!entry?.channelId || !entry?.messageId) return;
  const channel =
    client?.channels?.cache?.get(entry.channelId) ||
    (await client?.channels?.fetch?.(entry.channelId).catch(() => null));
  const message = await channel?.messages?.fetch?.(entry.messageId).catch(() => null);
  if (!message?.editable) return;
  await message.edit({ components: [] }).catch(() => null);
}

async function handleCountingRestoreButton(interaction, client, invalidateCountingConfig) {
  const token = String(interaction?.customId || "").slice(COUNTING_RESTORE_PREFIX.length);
  const entry = getRestoreToken(token);
  if (!entry) {
    await interaction.reply({
      content: "<:cancel:1461730653677551691> Questo ripristino non è più disponibile.",
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
    entry.used = true;
    restoreTokens.delete(token);
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
  entry.used = true;
  restoreTokens.delete(token);
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

module.exports = { COUNTING_RESTORE_PREFIX, memberCanRestoreCounting, createRestoreToken, attachRestoreMessageId, buildCountingRestoreRow, handleCountingRestoreButton };