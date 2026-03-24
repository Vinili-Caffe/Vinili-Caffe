const { EmbedBuilder } = require("discord.js");
const IDs = require("../../Utils/Config/ids");
const { getGuildMemberCached, getGuildChannelCached } = require("../../Utils/Interaction/interactionEntityCache");
const GLOBAL_GUILDED_ROLE_ID = IDs.roles.Guilded;
const MAIN_GUILD_ID = IDs.guilds.main;
const ANNOUNCE_CHANNEL_ID = IDs.channels.supporters;
const MAIN_SERVER_TAG = "V&C";
const MAIN_BOT_ID = IDs.bots.ViniliCaffeBot || "1329118940110127204";

function normalizeForMatch(text) {
  if (!text) return "";
  return String(text)
    .toLowerCase()
    .normalize("NFKD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/ʟ/g, "l").replace(/ᴜ/g, "u").replace(/ɴ/g, "n").replace(/ᴀ/g, "a")
    .replace(/ᴄ/g, "c").replace(/ꜱ/g, "s").replace(/ʜ/g, "h").replace(/ᴘ/g, "p")
    .replace(/ᴡ/g, "w").replace(/ᴇ/g, "e").replace(/ᴅ/g, "d").replace(/ꜰ/g, "f")
    .replace(/ɪ/g, "i").replace(/ɢ/g, "g").replace(/ღ/g, "o")
    .replace(/𝟨/g, "6").replace(/𝟫/g, "9")
    .replace(/[^a-z0-9]/g, "");
}

async function hasMatchingTag(member, client) {
  if (!member?.user) return null;

  const guildTagConfig = IDs.sponsorGuildTagConfig || {};
  const mainTagNorm = normalizeForMatch(MAIN_SERVER_TAG);

  let clan = member.user.clan;
  if (!clan && client) {
    try {
      const raw = await client.rest.get(`/guilds/${member.guild.id}/members/${member.id}`);
      clan = raw.user?.clan;
    } catch (e) { }
  }

  if (clan?.tag) {
    const tagNorm = normalizeForMatch(clan.tag);
    const clanGuildId = clan.identity_guild_id || clan.identityGuildId;

    const isMainGuild = clanGuildId === MAIN_GUILD_ID;
    const sponsorGuild = clanGuildId ? guildTagConfig[clanGuildId] : null;

    if (isMainGuild && tagNorm === mainTagNorm) {
      return { type: "native", tag: clan.tag };
    }

    if (sponsorGuild && normalizeForMatch(sponsorGuild.tagName) === tagNorm) {
      return { type: "native", tag: clan.tag };
    }
  }

  return null;
}

async function syncClanTagRoles(member) {
  if (!member || member.user?.bot) return;
  if (member.guild.id !== MAIN_GUILD_ID) return;

  const match = await hasMatchingTag(member, member.client);

  if (match) {
    if (GLOBAL_GUILDED_ROLE_ID && !member.roles.cache.has(GLOBAL_GUILDED_ROLE_ID)) {
      const added = await member.roles.add(GLOBAL_GUILDED_ROLE_ID).then(() => true).catch(() => false);
      if (added) {
        await announceNewGuildedMember(member, match.tag);
      }
    }
  } else {
    if (GLOBAL_GUILDED_ROLE_ID && member.roles.cache.has(GLOBAL_GUILDED_ROLE_ID)) {
      await member.roles.remove(GLOBAL_GUILDED_ROLE_ID).catch(() => { });
    }
  }
}

async function announceNewGuildedMember(member, tag) {
  const channelId = ANNOUNCE_CHANNEL_ID;
  const channel = channelId ? (member.guild.channels.cache.get(channelId) || (await getGuildChannelCached(member.guild, channelId))) : null;
  if (!channel?.isTextBased?.()) return;

  const avatarUrl = member.displayAvatarURL({ extension: "png", size: 256, forceStatic: false });
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setAuthor({
      name: member.user.username,
      iconURL: avatarUrl,
    })
    .setTitle("Nuovx Guilded <a:VC_StarPink:1330194976440848500>")
    .setThumbnail(avatarUrl)
    .setDescription(
      [
        `<a:VC_Arrow:1482706699365257397><@${member.id}>`,
        "",
        `<:VC_Reply:1482532158080942191> Ti è stato assegnato il ruolo <@&${GLOBAL_GUILDED_ROLE_ID}>!`,
        `Mettendo una delle nostre **Guild-TAGs**`,
        "<:VC_Luna1:1482497618289496117><:VC_Luna2:1482497653387427902><a:VC_Arrow:1482706699365257397> <https://discord.gg/E6vrm5zE6B>",
        "<:VC_Cash1:1482460724302184450><:VC_Cash2:1482460763346960434><a:VC_Arrow:1482706699365257397> <https://discord.gg/QnTN5P578g>",
        "<:VC_Porn1:1482497744513011944><:VC_Porn2:1482497774892089547><a:VC_Arrow:1482706699365257397> <https://discord.gg/WMuZ4EMAkc>",
        "<:VC_SixNine1:1482497833578922065><:VC_SixNine2:1482497868328865813><a:VC_Arrow:1482706699365257397> <https://discord.gg/uqUNS9f5m5>",
        "<:VC_Weed1:1482497951686201534><:VC_Weed2:1482497986910097592><a:VC_Arrow:1482706699365257397> <https://discord.gg/SzBwnxHXNv>",
        "<:VC_Figa1:1482495980275499169><:VC_Figa2:1482496046222544937><a:VC_Arrow:1482706699365257397> <https://discord.gg/z3EXtJwvQH>",
        "",
        "<a:VC_Arrow:1482706699365257397> Grazie per aver scelto la nostra tag!",
      ].join("\n"),
    )
    .setFooter({ text: "Grazie per il tuo supporto!" });

  await channel.send({
    content: `<@${member.id}>`,
    embeds: [embed],
  }).catch(() => { });
}

async function syncAllMembersClanTags(client) {
  if (!client?.user) return;

  const mainBotId = "1329118940110127204"; // ID di Vinili & Caffè Bot
  if (client.user.id !== mainBotId) return;

  const mainGuildId = IDs.guilds.main;
  const guild = client.guilds.cache.get(mainGuildId) || (await client.guilds.fetch(mainGuildId).catch(() => null));
  if (!guild) return;

  try {
    const members = await guild.members.fetch({ withPresences: true, force: true }).catch(() => guild.members.cache);
    let count = 0;

    for (const member of members.values()) {
      if (member.user.bot) continue;

      const match = await hasMatchingTag(member, client);

      if (match) {
        if (GLOBAL_GUILDED_ROLE_ID && !member.roles.cache.has(GLOBAL_GUILDED_ROLE_ID)) {
          const added = await member.roles.add(GLOBAL_GUILDED_ROLE_ID).then(() => true).catch(() => false);
          if (added) {
            count++;
            await announceNewGuildedMember(member, match.tag);
            await new Promise(resolve => setTimeout(resolve, 750));
          }
        }
      } else {
        if (GLOBAL_GUILDED_ROLE_ID && member.roles.cache.has(GLOBAL_GUILDED_ROLE_ID)) {
          await member.roles.remove(GLOBAL_GUILDED_ROLE_ID).catch(() => { });
        }
      }
    }

    if (count > 0) {
       global.logger?.info?.(`[ClanTagService] Scansione completata. Assegnati ${count} nuovi ruoli.`);
    }
  } catch (error) {
    global.logger?.error?.("[ClanTagService] Startup sync failed:", error);
  }
}

module.exports = { syncClanTagRoles, syncAllMembersClanTags };