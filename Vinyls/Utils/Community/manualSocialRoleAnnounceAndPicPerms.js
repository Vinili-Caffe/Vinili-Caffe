const { EmbedBuilder, PermissionsBitField } = require("discord.js");
const { DIVIDER_URL } = require("../../../shared/discord/constants");
const IDs = require("../Config/ids");
const { getGuildChannelCached } = require("../Interaction/interactionEntityCache");
const { shouldSendPublicMemberAnnouncement } = require("./memberPublicAnnouncementGate");
const { accountUsername, guildMemberDisplayAvatarUrlDynamic } = require("../Discord/guildDiscordIdentity");

const MAIN_GUILD_ID = String(IDs.guilds?.main || "");
const SUPPORTERS_CHANNEL_ID = IDs.channels?.supporters;
const PIC_PERMS_ROLE_ID = IDs.roles.PicPerms;
const PIC_PERMS_BUNDLE_ROLE_IDS = [
  IDs.roles.Follower,
  IDs.roles.SocialSupporter,
  IDs.roles.Fan,
  IDs.roles.Guilded,
].filter(Boolean);

function rolesCacheChanged(oldMember, newMember) {
  const oldRoles = oldMember?.roles?.cache;
  const newRoles = newMember?.roles?.cache;
  if (!oldRoles || !newRoles) return false;
  return (
    oldRoles.size !== newRoles.size ||
    oldRoles.some((role) => !newRoles.has(role.id)) ||
    newRoles.some((role) => !oldRoles.has(role.id))
  );
}

function roleWasAdded(oldMember, newMember, roleId) {
  const id = String(roleId || "").trim();
  if (!id) return false;
  return !oldMember.roles.cache.has(id) && newMember.roles.cache.has(id);
}

function hasManageRolesPermission(member) {
  const me = member.guild.members.me;
  return Boolean(me?.permissions?.has(PermissionsBitField.Flags.ManageRoles));
}

async function tryGrantPicPermsIfBundleComplete(member) {
  if (!member?.guild || !PIC_PERMS_ROLE_ID) return;
  if (!PIC_PERMS_BUNDLE_ROLE_IDS.length) return;
  const hasAll = PIC_PERMS_BUNDLE_ROLE_IDS.every((rid) => member.roles.cache.has(rid));
  if (!hasAll) return;
  const me = member.guild.members.me;
  if (!me || !hasManageRolesPermission(member)) return;
  const role = member.guild.roles.cache.get(PIC_PERMS_ROLE_ID);
  if (!role || role.position >= me.roles.highest.position) return;
  if (member.roles.cache.has(PIC_PERMS_ROLE_ID)) return;
  await member.roles.add(PIC_PERMS_ROLE_ID).catch(() => null);
}

function buildSocialUnlockEmbed(member, { title, roleId }) {
  const thumb = guildMemberDisplayAvatarUrlDynamic(member, { size: 256 });
  const lines = [
    `<@${member.id}>, \`hai sbloccato:\``,
    `<:VC_Reply:1482532158080942191> Ti è stato assegnato il ruolo <@&${roleId}>!`,
    "<a:VC_Coffe:1448695567244066827> - Grazie per il supporto a **Vinili & Caffè** sui social",
    "",
    `<a:VC_Arrow:1482706699365257397> Con **Follower**, **Supporter** (social), **Fan** (status) e **Guilded** ottieni anche <@&${IDs.roles.PicPerms}>.`,
  ];
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setAuthor({ name: accountUsername(member), iconURL: thumb || undefined })
    .setTitle(title)
    .setThumbnail(thumb || null)
    .setDescription(lines.join("\n"))
    .setFooter({ text: "Grazie per il tuo supporto!" })
    .setImage(DIVIDER_URL);
}

async function resolveSupportersChannel(guild) {
  if (!guild || !SUPPORTERS_CHANNEL_ID) return null;
  return guild.channels.cache.get(SUPPORTERS_CHANNEL_ID) || (await getGuildChannelCached(guild, SUPPORTERS_CHANNEL_ID));
}

async function maybeAnnounceManualSocialRolesAndGrantPicPermsBundle(oldMember, newMember) {
  if (!oldMember || !newMember?.guild || !newMember.user) return;
  if (String(newMember.guild.id) !== MAIN_GUILD_ID) return;
  if (!rolesCacheChanged(oldMember, newMember)) return;

  const channel = await resolveSupportersChannel(newMember.guild);
  const allowPublic = await shouldSendPublicMemberAnnouncement(newMember).catch(() => false);

  const followerId = IDs.roles.Follower;
  if (followerId && roleWasAdded(oldMember, newMember, followerId) && channel?.isTextBased?.() && allowPublic) {
    const embed = buildSocialUnlockEmbed(newMember, {
      title: "Nuovx Follower <a:VC_StarPink:1330194976440848500>",
      description: [
        [
          `<@${member.id}>, \`hai sbloccato:\``,
        `<:VC_Reply:1482532158080942191> Ti è stato assegnato il ruolo <@&${followerId}>!`,
        "<a:VC_Infinity:1448687797266288832> - Inviare **media** in __ogni chat__",
        "<a:VC_HeartWhite:1448673535253024860> - Mandare **adesivi** __esterni__ in **qualsiasi chat**",
        "",
        "<a:VC_Arrow:1482706699365257397> Seguici su [Instagram](https://instagram.com/viniliecaffe) e [TikTok](https://tiktok.com/@viniliecaffe)!",
        ].join("\n"),
      ],
      footer: "Grazie per il tuo supporto!",
      roleId: followerId,
    });
    await channel.send({ content: `<@${newMember.id}>`, embeds: [embed] }).catch(() => null);
  }

  const socialSupId = IDs.roles.SocialSupporter;
  if (socialSupId && roleWasAdded(oldMember, newMember, socialSupId) && channel?.isTextBased?.() && allowPublic) {
    const embed = buildSocialUnlockEmbed(newMember, {
      title: "Nuovx Supporter <a:VC_StarPink:1330194976440848500>",
      description: [
        [
          `<@${member.id}>, \`hai sbloccato:\``,
        `<:VC_Reply:1482532158080942191> Ti è stato assegnato il ruolo <@&${socialSupId}>!`,
        "<a:VC_Infinity:1448687797266288832> - Inviare **media** in __ogni chat__",
        "<a:VC_HeartWhite:1448673535253024860> - Mandare **adesivi** __esterni__ in **qualsiasi chat**",
        "",
        "<a:VC_Arrow:1482706699365257397> Metti `.gg/viniliecaffe` o `discord.gg/viniliecaffe` nella tua bio."
        ].join("\n"),
      ],
      footer: "Grazie per il tuo supporto!",
      roleId: socialSupId,
    });
    await channel.send({ content: `<@${newMember.id}>`, embeds: [embed] }).catch(() => null);
  }

  await tryGrantPicPermsIfBundleComplete(newMember);
}

module.exports = { maybeAnnounceManualSocialRolesAndGrantPicPermsBundle };