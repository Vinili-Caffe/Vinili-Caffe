const { EmbedBuilder, PermissionsBitField } = require("discord.js");
const IDs = require("../Config/ids");
const { guildMemberDisplayAvatarUrlDynamic } = require("../Discord/guildDiscordIdentity");
const BOOST_ANNOUNCE_STAFF_PING_ROLE_ID = "1442568910070349985";

function isPrimaryShard(client) {
  return !client?.shard || client.shard.ids?.[0] === 0;
}

function buildBoostEmbed(member, boostCount) {
  const avatarUrl = guildMemberDisplayAvatarUrlDynamic(member, { size: 256 });
  return new EmbedBuilder()
    .setAuthor({ name: member.user.username, iconURL: avatarUrl || undefined })
    .setTitle(`<a:ThankYou:1329504268369002507> **__GRAZIE ${member.user} PER IL BOOST!__**`)
    .setDescription(
        `<a:VC_Boost:1482706171386269830> **Boostando il server una volta hai sbloccato questi vantaggi:**\n` +
        `<:sparkledred:1470064814502973591> Ruolo <@&${IDs.roles.ServerBooster}> con badge speciale\n` +
        `<a:VC_NewsExclamation:1471891662786527253> Permesso di cambiare il nickname\n` +
        `<:moon:1470064812615667827> Permesso di allegare immagini e link in chat\n` +
        `<:pinkstar:1470064804835229768> Permesso di mandare emoji e adesivi di altri server\n` +
        `<:sparkle:1470064801811140866> Permesso di usare le Soundboard del server\n` +
        "<a:VC_Winner:1482535294757507255> Possibilità di creare un ruolo **custom** con colore **GRADIENTE** scelto da te\n" +
        "<:blueflash:1470064803157643468> Sblocchi i COLORI PLUS in `+colors` <:VC_New:1471891729471770819>\n" +
        "<a:VC_CrownYellow:1482706085440651428> Aggiungi reazioni al messaggio quando ti @menzionano in chat (max. 3)\n" +
        "<a:VC_Money:1482724694699278487> Cooldown sui comandi del nostro bot ridotto (da 30 secondi a 15 secondi)\n" +
        "<a:reddiamond:1443652837346377841> Sblocchi il comando `+ quote`\n" +
        "<:exp:1470067108543987846> X2 EXP Boost\n" +
        "\n" +
        `<a:flyingnitroboost:1443652205705170986> Tutto lo **staff** ti _ringrazia_ per averci __supportato__.\n` +
        "\n" +
        "<:VC_Logo:1498073401317916803> Trovate tutti i vantaggi del nostro server sul nostro sito [viniliecaffe.it](<https://viniliecaffe.it>)!",
    )
    .setColor("#6f4e37")
    .setFooter({ text: `Ora siamo a ${boostCount} boost!` })
    .setThumbnail(avatarUrl || null);
}

function buildBoostEmbedSecond(member, boostCount) {
  const avatarUrl = guildMemberDisplayAvatarUrlDynamic(member, { size: 256 });
  return new EmbedBuilder()
    .setAuthor({ name: member.user.username, iconURL: avatarUrl || undefined })
    .setTitle(`<a:ThankYou:1329504268369002507> **__GRAZIE ${member.user} PER IL DOPPIO BOOST!__**`)
    .setDescription(
        `<a:VC_Boost:1482706171386269830> **Boostando il server due volte hai sbloccato questi vantaggi:**\n` +
        `<:sparkledred:1470064814502973591> Ruolo <@&${IDs.roles.DoubleBooster}> con badge speciale\n` +
        "<:moon:1470064812615667827> Tutti i perks precedenti\n" +
        "<:sparkle:1470064801811140866> Permesso di usare le Soundboard esterne\n" +
        "<:VC_Color:1482532543273238569> Sfondo personalizzato per la tua card del comando `+rank` <:VC_New:1471891729471770819>\n" +
        "<a:VC_Flame:1482725674711126140> Possibilità di aggiungere reazioni ai messaggi in chat\n" +
        "<:blueflash:1470064803157643468> Possibilità di creare un secondo ruolo **custom** e un canale **vocale privato custom** <:VC_New:1471891729471770819>\n" +
        "<a:VC_CrownYellow:1482706085440651428> Aggiungi reazioni al messaggio quando ti @menzionano in chat (max. 5)\n" +
        "<a:VC_Money:1482724694699278487> Cooldown sui comandi del nostro bot ridotto (da 30 secondi a 5 secondi)\n" +
        "<a:reddiamond:1443652837346377841> Bypass requisiti dei giveaway\n" +
        "<:exp:1470067108543987846> X3 EXP Boost\n" +
        "\n" +
        `<a:flyingnitroboost:1443652205705170986> Tutto lo **staff** ti _ringrazia_ per averci __supportato__.\n` +
        "\n" +
        "<:VC_Logo:1498073401317916803> Trovate tutti i vantaggi del nostro server sul nostro sito [viniliecaffe.it](<https://viniliecaffe.it>)!",
    )
    .setColor("#6f4e37")
    .setFooter({ text: `Ora siamo a ${boostCount} boost!` })
    .setThumbnail(avatarUrl || null);
}

function buildBoostAnnounceContent(user) {
  return `<a:VC_Boost:1482706171386269830> \`|\`  ${user} \`|\` <@&${BOOST_ANNOUNCE_STAFF_PING_ROLE_ID}>`;
}

function classifyBotBoostAnnounceMessage(message, botId) {
  if (!message || String(message.author?.id || "") !== String(botId || "")) return null;
  const e = message.embeds?.[0];
  if (!e) return null;
  const title = String(e.title || "");
  if (/GRAZIE\s+PER\s+IL\s+DOPPIO\s+BOOST/i.test(title)) return "second";
  if (/GRAZIE\s+PER\s+IL\s+BOOST/i.test(title)) return "first";
  return null;
}

/** Messaggio annuncio boost del bot (primo o secondo slot), anche se l’embed è obsoleto. */
function isBoostAnnounceBotMessage(message, botId) {
  return classifyBotBoostAnnounceMessage(message, botId) !== null;
}

function extractBoostTargetUserIdFromContent(content, botId) {
  const ids = [...String(content || "").matchAll(/<@!?(\d{5,30})>/g)].map((m) => m[1]);
  const bid = String(botId || "");
  return ids.find((id) => id && id !== bid) || null;
}

/**
 * Al riavvio, aggiorna (edit) gli ultimi due messaggi di annuncio boost nel canale supporters
 * con gli embed attuali e il conteggio boost corrente del server.
 */
async function refreshLastTwoBoostAnnounceEmbedsOnStartup(client, opts = {}) {
  const env = String(process.env.REFRESH_LAST_BOOST_EMBEDS_ON_STARTUP || "").trim().toLowerCase();
  if (env && ["0", "false", "no", "off"].includes(env)) {
    return { ok: false, reason: "disabled_env", updated: 0 };
  }
  if (!isPrimaryShard(client)) return { ok: false, reason: "not_primary_shard", updated: 0 };

  const guildId = String(IDs.guilds?.main || "");
  const channelId = String(IDs.channels?.supporters || "");
  if (!guildId || !channelId) return { ok: false, reason: "missing_ids", updated: 0 };

  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return { ok: false, reason: "guild_not_found", updated: 0 };

  const channel =
    guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId).catch(() => null));
  if (!channel?.isTextBased?.()) return { ok: false, reason: "channel_not_text", updated: 0 };

  const me = guild.members.me;
  const perms = me && channel.permissionsFor ? channel.permissionsFor(me) : null;
  if (!perms?.has?.(PermissionsBitField.Flags.ReadMessageHistory)) {
    return { ok: false, reason: "no_read_history", updated: 0 };
  }
  if (!perms?.has?.(PermissionsBitField.Flags.SendMessages)) {
    return { ok: false, reason: "no_send", updated: 0 };
  }

  const fetchLimit = Math.max(20, Math.min(100, Number(opts.fetchLimit || 80)));
  const messages = await channel.messages.fetch({ limit: fetchLimit }).catch(() => null);
  if (!messages?.size) return { ok: true, updated: 0 };

  const botId = String(client.user?.id || "");
  const rows = [];
  for (const m of messages.values()) {
    if (!isBoostAnnounceBotMessage(m, botId)) continue;
    const uid = extractBoostTargetUserIdFromContent(m.content, botId);
    if (!uid) continue;
    rows.push({ message: m, uid, ts: Number(m.createdTimestamp || 0) });
  }
  if (!rows.length) return { ok: true, updated: 0 };

  rows.sort((a, b) => b.ts - a.ts);
  const top = rows.slice(0, 2);
  const sameUserPair = top.length === 2 && top[0].uid === top[1].uid;
  const work = sameUserPair
    ? [
        { message: top[1].message, uid: top[1].uid, useSecond: false },
        { message: top[0].message, uid: top[0].uid, useSecond: true },
      ]
    : top.map((r) => ({ message: r.message, uid: r.uid, useSecond: false }));

  const freshGuild = await guild.fetch().catch(() => null);
  const boostCount = Number(freshGuild?.premiumSubscriptionCount || guild.premiumSubscriptionCount || 0);

  let updated = 0;
  for (const { message, uid, useSecond } of work) {
    const member =
      (await guild.members.fetch(uid).catch(() => null)) ||
      ({ user: await client.users.fetch(uid).catch(() => null), guild } );
    if (!member?.user) continue;
    const embed = useSecond ? buildBoostEmbedSecond(member, boostCount) : buildBoostEmbed(member, boostCount);
    const content = buildBoostAnnounceContent(member.user);
    const ok = await message.edit({ content, embeds: [embed] }).then(() => true).catch(() => false);
    if (ok) updated += 1;
  }

  return { ok: true, updated };
}

module.exports = {
  buildBoostEmbed,
  buildBoostEmbedSecond,
  buildBoostAnnounceContent,
  refreshLastTwoBoostAnnounceEmbedsOnStartup,
};