const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { memberDisplayName, guildMemberDisplayAvatarUrlDynamic } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");
const { getGuildChannelCached, getGuildMemberCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { wasRoleRestoredByMuteMirror } = require("../../Moderation/services/mutedMirrorRoleService") as typeof import("../../Moderation/services/mutedMirrorRoleService");
const { MENTION_RESPONSE_PERK_LINE_DISCORD } = require("./mentionResponseAccessUtils") as typeof import("./mentionResponseAccessUtils");
const { collectRecentRoleAddsFromAudit } = require("./supportersChannelEmbedRecoveryUtils") as typeof import("./supportersChannelEmbedRecoveryUtils");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const TIER_RANK = { donator: 1, vip: 2, vipPlus: 3 };
const DONATION_ANNOUNCE_DEBOUNCE_MS = 5000;
const DONATION_ANNOUNCE_COOLDOWN_MS = 90_000;
const pendingDonationAnnounceByMember = new Map();
const lastDonationAnnounceByMember = new Map();
const ROLE_ID_BY_TIER = {
  donator: IDs.roles.Donator,
  vip: IDs.roles.VIP,
  vipPlus: IDs.roles.VIPplus,
};

const TIER_PACKAGE_LABEL = {
  donator: "DONATOR",
  vip: "VIP",
  vipPlus: "VIP+",
};

function buildDonationPackageHeading(tier?, member?, isPurchase = false) {
  const label = TIER_PACKAGE_LABEL[tier] || "VIP+";
  if (isPurchase) {
    return `### ${E.ThankYou} **__GRAZIE ${member.user} PER AVER ACQUISTATO IL PACCHETTO ${label}!__**`;
  }
  return `### ${E.ThankYou} **__${member.user} HAI RICEVUTO IL RUOLO ${label}!__**`;
}

async function resolveRoleAddWasManualPurchase(guild?, userId?, roleId?, client?) {
  const uid = String(userId || "").trim();
  const rid = String(roleId || "").trim();
  if (!guild?.fetchAuditLogs || !uid || !rid) return false;
  const rows = await collectRecentRoleAddsFromAudit(guild, [rid], 3 * 60 * 1000);
  const match = rows.find((row?) => String(row.userId) === uid && String(row.roleId) === rid);
  const executorId = String(match?.executorId || "").trim();
  if (!executorId) return false;
  const botId = String(client?.user?.id || "").trim();
  if (botId && executorId === botId) return false;
  const executor =
    guild.members.cache.get(executorId) ||
    (await guild.members.fetch(executorId).catch(() => null));
  if (!executor || executor.user?.bot) return false;
  return true;
}

function pickHighestNewPurchasedTier(oldMember?, newMember?) {
  let best = null;
  let bestRank = 0;
  for (const [tier, rank] of Object.entries(TIER_RANK)) {
    const rid = ROLE_ID_BY_TIER[tier];
    if (!rid) continue;
    if (
      newMember.roles.cache.has(rid) &&
      !oldMember.roles.cache.has(rid) &&
      !wasRoleRestoredByMuteMirror(newMember.guild.id, newMember.id, rid) &&
      rank > bestRank
    ) {
      bestRank = rank;
      best = tier;
    }
  }
  return best;
}

function buildDonationPackageEmbed(tier?, member?, isPurchase = false) {
  const avatarUrl = guildMemberDisplayAvatarUrlDynamic(member, { size: 256 });
  const roleMention = (id?) => `<@&${id}>`;
  const heading = buildDonationPackageHeading(tier, member, isPurchase);

  let perkBlock = "";
  if (tier === "donator") {
    perkBlock =
      `${heading}\n` +
      "\n" +
      "**Con questo ruolo hai sbloccato i seguenti vantaggi:**\n" +
      "\n" +
      `${E.sparkledred} Permesso di allegare **link e immagini** in chat\n` +
      `${E.sparkle} Permesso di usare le **Soundboard** di altri server\n` +
      `${E.pinkstar} Permesso di mandare **sticker ed emoji** di altri server\n` +
      `${E.reddiamond} Bypass dei requisiti nei **giveaway**\n` +
      `${E.moon} Permesso di cambiare il tuo **nickname**\n` +
      `${E.blueflash} Sblocchi i **COLORI PLUS** in [Personalizza](https://www.viniliecaffe.it/personalizza/)\n` +
      `${E.reddiamond} Sblocchi i comandi \`+quote\` e \`+repost\` (gestione dal profilo sul sito)\n` +
      `${E.exp} X4 EXP boost\n` +
      "\n" +
      `${E.flyingnitroboost} Tutto lo **staff** ti _ringrazia_ per averci __supportato__.\n` +
      "\n" +
      `${E.VC_Link} Trovate tutti i vantaggi del nostro server sul nostro sito [viniliecaffe.it](<https://viniliecaffe.it>)!`;
  } else if (tier === "vip") {
    perkBlock =
      `${heading}\n` +
      "\n" +
      "**Con questo ruolo hai sbloccato i seguenti vantaggi:**\n" +
      "\n" +
      `${E.sparkledred} Tutti i perks del ruolo ${roleMention(IDs.roles.Donator)}\n` +
      `${E.VC_Loading__969578} Cooldown sui comandi del nostro bot ridotto (da 30 secondi a 15 secondi)\n` +
      `${E.VC_Flame} Possibilità di aggiungere reazioni ai messaggi in chat\n` +
      `${E.VC_Winner} Possibilità di creare una vocale privata per te e i tuoi amici\n` +
      `${E.VC_CrownYellow} Aggiungi reazioni al messaggio quando ti @menzionano in chat (max. 3)\n` +
      `${MENTION_RESPONSE_PERK_LINE_DISCORD}\n` +
      `${E.VC_Color} Possibilità di creare un ruolo **custom** con colore **GRADIENTE** scelto da te\n` +
      `${E.exp} X5 EXP boost\n` +
      "\n" +
      `${E.flyingnitroboost} Tutto lo **staff** ti _ringrazia_ per averci __supportato__.\n` +
      "\n" +
      `${E.VC_Link} Trovate tutti i vantaggi del nostro server sul nostro sito [viniliecaffe.it](<https://viniliecaffe.it>)!`;
  } else {
    perkBlock =
      `${heading}\n` +
      "\n" +
      "**Con questo ruolo hai sbloccato i seguenti vantaggi:**\n" +
      "\n" +
      `${E.sparkledred} Tutti i perks del ruolo ${roleMention(IDs.roles.VIP)}\n` +
      "\n" +
      `${E.VC_Loading__969578} Cooldown sui comandi del nostro bot ridotto (da 30 secondi a 1 secondo)\n` +
      `${E.VC_Color} Sfondo personalizzato per la tua card del comando \`+rank\` sul sito\n` +
      `${E.VC_Winner} Possibilità di creare un secondo ruolo **custom** con colore **GRADIENTE** scelto da te\n` +
      `${E.VC_CrownYellow} Aggiungi reazioni al messaggio quando ti @menzionano in chat (max. 5)\n` +
      `${MENTION_RESPONSE_PERK_LINE_DISCORD}\n` +
      `${E.exp} X6 EXP boost\n` +
      "\n" +
      `${E.flyingnitroboost} Tutto lo **staff** ti _ringrazia_ per averci __supportato__.\n` +
      "\n" +
      `${E.VC_Link} Trovate tutti i vantaggi del nostro server sul nostro sito [viniliecaffe.it](<https://viniliecaffe.it>)!`;
  }

  return new EmbedBuilder()
    .setAuthor({ name: memberDisplayName(member), iconURL: avatarUrl || undefined })
    .setDescription(perkBlock)
    .setColor("#6f4e37")
    .setThumbnail(avatarUrl || null)
}

function memberAnnounceKey(guildId?, userId?) {
  return `${String(guildId || "").trim()}:${String(userId || "").trim()}`;
}

function mergePendingDonationAnnounce(key?, tier?, newMember?) {
  const rank = TIER_RANK[tier] || 0;
  let pending = pendingDonationAnnounceByMember.get(key);
  if (!pending) {
    pending = { maxTier: tier, maxRank: rank, guild: newMember.guild, userId: newMember.id, timer: null };
    pendingDonationAnnounceByMember.set(key, pending);
  } else if (rank >= pending.maxRank) {
    pending.maxTier = tier;
    pending.maxRank = rank;
  }
  pending.guild = newMember.guild;
  if (pending.timer) clearTimeout(pending.timer);
  pending.timer = setTimeout(() => {
    void flushDonationPackageAnnounce(key).catch(() => null);
  }, DONATION_ANNOUNCE_DEBOUNCE_MS);
}

async function flushDonationPackageAnnounce(key?) {
  const pending = pendingDonationAnnounceByMember.get(key);
  if (!pending) return;
  pendingDonationAnnounceByMember.delete(key);
  if (pending.timer) clearTimeout(pending.timer);

  const tier = pending.maxTier;
  const rank = TIER_RANK[tier] || 0;
  if (!tier || !rank) return;

  const now = Date.now();
  const last = lastDonationAnnounceByMember.get(key);
  if (last && now - last.at < DONATION_ANNOUNCE_COOLDOWN_MS && rank <= (TIER_RANK[last.tier] || 0)) return;

  const guild = pending.guild;
  const userId = String(pending.userId || "");
  const mainId = String(IDs.guilds?.main || "");
  if (!guild || String(guild.id) !== mainId || !userId) return;

  const channelId = IDs.channels?.supporters;
  if (!channelId) return;

  const member = await getGuildMemberCached(guild, userId, { preferFresh: true }).catch(() => null);
  if (!member?.guild) return;

  const channel =
    member.guild.channels.cache.get(channelId) || (await getGuildChannelCached(member.guild, channelId));
  if (!channel?.isTextBased?.()) return;

  const roleId = ROLE_ID_BY_TIER[tier];
  const isPurchase = await resolveRoleAddWasManualPurchase(guild, userId, roleId, guild.client);

  const staffPing = String(IDs.roles?.Staff || "").trim();
  const content = staffPing
    ? `${E.ThankYou} \`|\`  ${member.user} \`|\` <@&${staffPing}>`
    : `${E.ThankYou} \`|\`  ${member.user}`;

  await channel
    .send({
      content,
      embeds: [buildDonationPackageEmbed(tier, member, isPurchase)],
    })
    .catch(() => null);

  lastDonationAnnounceByMember.set(key, { tier, at: now });
}

function tierForMemberRoles(member?) {
  if (member?.roles?.cache?.has?.(ROLE_ID_BY_TIER.vipPlus)) return "vipPlus";
  if (member?.roles?.cache?.has?.(ROLE_ID_BY_TIER.vip)) return "vip";
  if (member?.roles?.cache?.has?.(ROLE_ID_BY_TIER.donator)) return "donator";
  return null;
}

async function sendDonationPackageAnnounceNow(member?, tier?, opts: Record<string, any> = {}) {
  const rank = TIER_RANK[tier] || 0;
  if (!tier || !rank || !member?.guild) return { ok: false, reason: "invalid_input" };
  const mainId = String(IDs.guilds?.main || "");
  if (String(member.guild.id) !== mainId) return { ok: false, reason: "wrong_guild" };
  const channelId = IDs.channels?.supporters;
  if (!channelId) return { ok: false, reason: "no_channel" };
  const channel =
    member.guild.channels.cache.get(channelId) || (await getGuildChannelCached(member.guild, channelId));
  if (!channel?.isTextBased?.()) return { ok: false, reason: "channel_not_text" };
  const roleId = ROLE_ID_BY_TIER[tier];
  let isPurchase = opts.isPurchase;
  if (typeof isPurchase !== "boolean") {
    isPurchase = await resolveRoleAddWasManualPurchase(
      member.guild,
      member.id,
      roleId,
      member.client || opts.client,
    );
  }
  const staffPing = String(IDs.roles?.Staff || "").trim();
  const content = staffPing
    ? `${E.ThankYou} \`|\`  ${member.user} \`|\` <@&${staffPing}>`
    : `${E.ThankYou} \`|\`  ${member.user}`;
  const sent = await channel
    .send({
      content,
      embeds: [buildDonationPackageEmbed(tier, member, isPurchase)],
    })
    .catch(() => null);
  if (!sent?.id) return { ok: false, reason: "send_failed" };
  lastDonationAnnounceByMember.set(memberAnnounceKey(member.guild.id, member.id), { tier, at: Date.now() });
  return { ok: true, messageId: String(sent.id) };
}

function donationAnnounceBlobMatchesTier(blob?, tier?) {
  const text = String(blob || "");
  if (tier === "vipPlus") {
    return /PACCHETTO\s+VIP\+/i.test(text) || /HAI RICEVUTO IL RUOLO VIP\+/i.test(text);
  }
  if (tier === "vip") {
        return /PACCHETTO\s+VIP(?!\+)/i.test(text) || /HAI RICEVUTO IL RUOLO VIP(?!\+)/i.test(text);
  }
  if (tier === "donator") {
    return /PACCHETTO\s+DONATOR/i.test(text) || /HAI RICEVUTO IL RUOLO DONATOR/i.test(text);
  }
  return (
    /PACCHETTO\s+(DONATOR|VIP\+|VIP)/i.test(text) ||
    /HAI RICEVUTO IL RUOLO (DONATOR|VIP\+|VIP)/i.test(text)
  );
}

async function recoverDonationPackageAnnouncesOnStartup(client?, opts: Record<string, any> = {}) {
  const {
    isRecoveryPrimaryShard,
    DEFAULT_RECOVERY_LOOKBACK_MS,
    EMBED_DEDUPE_LOOKBACK_MS,
    collectRecentRoleAddsFromAudit,
    botSupportersEmbedExistsForUser,
    recoverySleep,
  } = require("./supportersChannelEmbedRecoveryUtils") as typeof import("./supportersChannelEmbedRecoveryUtils");
  if (!isRecoveryPrimaryShard(client)) return { ok: false, reason: "not_primary_shard" };
  const guildId = String(IDs.guilds?.main || "");
  if (!guildId) return { ok: false, reason: "no_main_guild" };
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return { ok: false, reason: "guild_not_found" };
  const lookbackMs = Math.max(60 * 60 * 1000, Math.min(7 * 24 * 60 * 60 * 1000, Number(opts.lookbackMs || DEFAULT_RECOVERY_LOOKBACK_MS)));
  const limit = Math.max(1, Math.min(40, Number(opts.limit || 20)));
  const channelId = IDs.channels?.supporters;
  if (!channelId) return { ok: false, reason: "no_channel" };
  const channel = guild.channels.cache.get(channelId) || (await getGuildChannelCached(guild, channelId));
  if (!channel?.isTextBased?.()) return { ok: false, reason: "channel_not_text" };
  const botId = String(client.user?.id || "");
  /* come patron/social: dedupe su 90g, non roleAdd-5min (ri-add ruolo / mute restore → falso "missing") */
  const embedSinceMs = Date.now() - EMBED_DEDUPE_LOOKBACK_MS;
  const roleIds = Object.values(ROLE_ID_BY_TIER).filter(Boolean);
  const adds = await collectRecentRoleAddsFromAudit(guild, roleIds, lookbackMs);
  const seen = new Set();
  let recovered = 0;
  for (const row of adds) {
    if (recovered >= limit) break;
    const uid = String(row.userId || "");
    const rid = String(row.roleId || "");
    const dedupe = `${uid}:${rid}`;
    if (!uid || seen.has(dedupe)) continue;
    seen.add(dedupe);
    let tier = null;
    for (const [t, id] of Object.entries(ROLE_ID_BY_TIER)) {
      if (String(id) === rid) {
        tier = t;
        break;
      }
    }
    if (!tier) continue;
    const member = await getGuildMemberCached(guild, uid, { preferFresh: true }).catch(() => null);
    if (!member?.roles?.cache?.has(rid)) continue;
    const bestTier = tierForMemberRoles(member) || tier;
    const exists = await botSupportersEmbedExistsForUser(channel, uid, botId, embedSinceMs, (blob?) =>
      donationAnnounceBlobMatchesTier(blob, bestTier),
    );
    if (exists) continue;
    const executorId = String(row.executorId || "").trim();
    const isPurchase =
      Boolean(executorId) &&
      executorId !== botId &&
      !(await guild.members.fetch(executorId).then((m?) => m?.user?.bot).catch(() => true));
    const result = await sendDonationPackageAnnounceNow(member, bestTier, { isPurchase, client });
    if (result?.ok) {
      recovered += 1;
      global.logger?.info?.("[donation-recovery] announce:", uid, bestTier);
      await recoverySleep(450);
    }
  }
  if (recovered > 0) global.logger?.info?.("[donation-recovery] done:", recovered);
  return { ok: true, recovered };
}

async function maybeAnnounceDonationPackageInSupporters(oldMember?, newMember?) {
  const mainId = String(IDs.guilds?.main || "");
  if (!mainId || String(newMember.guild.id) !== mainId) return;
  if (newMember.user?.bot) return;

  const tier = pickHighestNewPurchasedTier(oldMember, newMember);
  if (!tier) return;

  mergePendingDonationAnnounce(memberAnnounceKey(newMember.guild.id, newMember.id), tier, newMember);
}

export = {
  maybeAnnounceDonationPackageInSupporters,
  recoverDonationPackageAnnouncesOnStartup,
};