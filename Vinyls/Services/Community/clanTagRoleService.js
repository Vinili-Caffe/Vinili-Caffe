const { EmbedBuilder } = require("discord.js");
const IDs = require("../../Utils/Config/ids");
const { getGuildMemberCached, getGuildChannelCached } = require("../../Utils/Interaction/interactionEntityCache");
const GLOBAL_GUILDED_ROLE_ID = IDs.roles.Guilded;
const MAIN_GUILD_ID = IDs.guilds.main;
const ANNOUNCE_CHANNEL_ID = IDs.channels.supporters;
const MAIN_SERVER_TAG = "V&C";

/**
 * Checks if a user has any monitored clan tags and updates their roles accordingly.
 * @param {import("discord.js").GuildMember} member 
 */

function hasMatchingTag(member) {
  if (!member?.user) return null;

  const guildTagConfig = IDs.sponsorGuildTagConfig || {};
  const mainTagNormalized = String(MAIN_SERVER_TAG || "").trim().toLowerCase();

  const nativeTag = member.user.clan?.tag;
  if (nativeTag) {
    const tagLower = String(nativeTag).trim().toLowerCase();
    if (tagLower === mainTagNormalized) return { type: "native", tag: nativeTag };
    const sponsor = Object.values(guildTagConfig).find(cfg => String(cfg.tagName || "").toLowerCase() === tagLower);
    if (sponsor) return { type: "native", tag: nativeTag };
  }

  const name = String(member.displayName || member.user.username || "").toLowerCase();

  if (name.includes(`[${mainTagNormalized}]`) || name.startsWith(`${mainTagNormalized} |`) || name.startsWith(`${mainTagNormalized} -`)) {
    return { type: "name", tag: MAIN_SERVER_TAG };
  }
  for (const cfg of Object.values(guildTagConfig)) {
    const sTag = String(cfg.tagName || "").toLowerCase();
    if (!sTag) continue;
    if (name.includes(`[${sTag}]`) || name.startsWith(`${sTag} |`) || name.startsWith(`${sTag} -`)) {
      return { type: "name", tag: cfg.tagName };
    }
  }

  return null;
}

/**
 * Checks if a user has any monitored clan tags and updates their roles accordingly.
 * @param {import("discord.js").GuildMember} member 
 */
async function syncClanTagRoles(member) {
  if (!member || member.user?.bot) return;
  if (member.guild.id !== MAIN_GUILD_ID) return;

  const match = hasMatchingTag(member);
  if (!match) return;

  if (GLOBAL_GUILDED_ROLE_ID && !member.roles.cache.has(GLOBAL_GUILDED_ROLE_ID)) {
    const added = await member.roles.add(GLOBAL_GUILDED_ROLE_ID).then(() => true).catch(() => false);
    if (added) {
      await announceNewGuildedMember(member, match.tag);
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
  if (!client) return;
  const mainGuildId = IDs.guilds.main;
  const guild = client.guilds.cache.get(mainGuildId) || (await client.guilds.fetch(mainGuildId).catch(() => null));
  if (!guild) return;

  try {
    // We fetch with presences because clan tags are often tied to the latest user state in the gateway
    const members = await guild.members.fetch({ withPresences: true }).catch(() => guild.members.cache);
    let count = 0;
    const guildTagConfig = IDs.sponsorGuildTagConfig || {};
    const mainTagNormalized = String(MAIN_SERVER_TAG || "").trim().toLowerCase();

    for (const member of members.values()) {
      if (member.user.bot) continue;

      const match = hasMatchingTag(member);
      if (!match) continue;

      // Debug: Log matches found during startup
      global.logger?.info?.(`[ClanTagDebug] Match found for ${member.user.username}: ${match.tag} (${match.type})`);

      if (GLOBAL_GUILDED_ROLE_ID && !member.roles.cache.has(GLOBAL_GUILDED_ROLE_ID)) {
        const added = await member.roles.add(GLOBAL_GUILDED_ROLE_ID).then(() => true).catch(() => false);
        if (added) {
          count++;
          await announceNewGuildedMember(member, match.tag);
          await new Promise(resolve => setTimeout(resolve, 750));
        }
      }
    }

    if (count > 0) {
      global.logger?.info?.(`[ClanTagService] Startup sync complete. Added Guilded role to ${count} members.`);
    } else {
      global.logger?.info?.(`[ClanTagService] Startup sync finished. No new members found with matching tags (Total members scanned: ${members.size}).`);
    }
  } catch (error) {
    global.logger?.error?.("[ClanTagService] Startup sync failed:", error);
  }
}

module.exports = { syncClanTagRoles, syncAllMembersClanTags };
