const { EmbedBuilder, PermissionsBitField, AuditLogEvent } = require("discord.js");
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

/** Uno qualsiasi di questi ruoli (anche manuale) deve comportare <@&PicPerms>. */
const PIC_PERMS_AUTO_TRIGGER_ROLE_IDS = [
  IDs.roles.Guilded,
  IDs.roles.SocialSupporter,
  IDs.roles.Fan,
  IDs.roles.Follower,
  IDs.roles.VerifiedNeo,
  IDs.roles.Verificata,
  IDs.roles.Verificato,
].filter(Boolean);

const AUDIT_FETCH_LIMIT = 40;
const AUDIT_LOOKBACK_MS = 180 * 1000;
const MEMBER_ROLE_AUDIT_TYPE = AuditLogEvent.MemberRoleUpdate ?? 25;

const SELFIE_VERIFIED_GUILDED_STYLE_SPECS = [
  {
    roleId: IDs.roles.Verificato,
    title: "Nuovx Verified ʰᵉᐟʰⁱᵐ <a:VC_StarPink:1330194976440848500>",
  },
  {
    roleId: IDs.roles.Verificata,
    title: "Nuovx Verified ˢʰᵉᐟʰᵉʳ <a:VC_StarPink:1330194976440848500>",
  },
  {
    roleId: IDs.roles.VerifiedNeo,
    title: "Nuovx Verified ⁿ^ᐟꜝ <a:VC_StarPink:1330194976440848500>",
  },
].filter((s) => s.roleId);

function sleep(ms) {
  return new Promise((resolve) => setTimeout(resolve, ms));
}

function auditLogChangesArray(entry) {
  const ch = entry?.changes;
  if (!ch) return [];
  if (Array.isArray(ch)) return ch;
  if (typeof ch.values === "function") return Array.from(ch.values());
  return [];
}

function changeNewRoleIds(c) {
  if (String(c?.key || "") !== "$add") return [];
  const raw = c?.new ?? c?.new_value ?? c?.newValue;
  const list = Array.isArray(raw) ? raw : raw != null && typeof raw === "object" ? [raw] : [];
  return list.map((r) => String(r?.id ?? r ?? "").trim()).filter(Boolean);
}

function auditEntryAddsAnyRole(entry, roleIdSet) {
  const set = roleIdSet instanceof Set ? roleIdSet : new Set(Array.isArray(roleIdSet) ? roleIdSet : []);
  if (!set.size) return false;
  for (const c of auditLogChangesArray(entry)) {
    for (const rid of changeNewRoleIds(c)) {
      if (set.has(rid)) return true;
    }
  }
  return false;
}

function pickNewestRoleAddEntryForMember(logs, targetUserId, roleIdSet) {
  if (!logs?.entries?.size) return null;
  const tid = String(targetUserId || "");
  const nowMs = Date.now();
  const rows = Array.from(logs.entries.values())
    .filter((item) => {
      const createdMs = Number(item?.createdTimestamp || 0);
      const targetId = String(item?.target?.id || item?.targetId || "");
      const withinWindow = createdMs > 0 && nowMs - createdMs <= AUDIT_LOOKBACK_MS;
      return withinWindow && targetId === tid && auditEntryAddsAnyRole(item, roleIdSet);
    })
    .sort((a, b) => Number(b?.createdTimestamp || 0) - Number(a?.createdTimestamp || 0));
  return rows[0] || null;
}

async function fetchRecentMemberRoleAddExecutor(guild, targetUserId, addedRoleIdSet) {
  if (
    !guild?.members?.me?.permissions?.has?.(
      PermissionsBitField.Flags.ViewAuditLog,
    )
  ) {
    return null;
  }
  const tid = String(targetUserId || "");
  if (!tid) return null;
  const idSet =
    addedRoleIdSet instanceof Set
      ? addedRoleIdSet
      : new Set((Array.isArray(addedRoleIdSet) ? addedRoleIdSet : []).map((x) => String(x || "").trim()).filter(Boolean));
  if (!idSet.size) return null;
  let best = null;
  for (let attempt = 0; attempt < 3; attempt += 1) {
    const logsRole = await guild
      .fetchAuditLogs({ type: MEMBER_ROLE_AUDIT_TYPE, limit: AUDIT_FETCH_LIMIT })
      .catch(() => null);
    best = pickNewestRoleAddEntryForMember(logsRole, tid, idSet);
    if (!best) {
      const logsMember = await guild
        .fetchAuditLogs({ type: AuditLogEvent.MemberUpdate, limit: AUDIT_FETCH_LIMIT })
        .catch(() => null);
      best = pickNewestRoleAddEntryForMember(logsMember, tid, idSet);
    }
    if (best) break;
    if (attempt < 2) await sleep(700);
  }
  return best?.executor || null;
}

async function wasSelfieVerifiedRoleAddedByHumanStaff(guild, targetUserId, addedSelfieRoleIds) {
  const idSet = new Set(
    (Array.isArray(addedSelfieRoleIds) ? addedSelfieRoleIds : [])
      .map((x) => String(x || "").trim())
      .filter(Boolean),
  );
  const executor = await fetchRecentMemberRoleAddExecutor(guild, targetUserId, idSet);
  if (!executor) return false;
  if (executor.bot) return false;
  const botId = String(guild.client?.user?.id || "");
  if (botId && String(executor.id) === botId) return false;
  return true;
}

function buildSelfieVerifiedGuildedStyleEmbed(member, roleId, title) {
  const avatarUrl = guildMemberDisplayAvatarUrlDynamic(member, { size: 256 });
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setAuthor({
      name: accountUsername(member),
      iconURL: avatarUrl,
    })
    .setTitle(title)
    .setThumbnail(avatarUrl)
    .setDescription(
      [
        `<@${member.id}>, \`hai sbloccato:\``,
        `<:VC_Reply:1482532158080942191> Ti è stato assegnato il ruolo <@&${roleId}>!`,
        "<a:VC_Infinity:1448687797266288832> - Permesso di allegare immagini e link in chat",
        "<a:VC_HeartWhite:1448673535253024860> - Permesso di scrivere nel canale <#1470029899740873029>",
        "",
        "<a:VC_Arrow:1482706699365257397> Scopri i tuoi vantaggi sul nostro [sito](https://viniliecaffe.it/perks).",
      ].join("\n"),
    )
    .setFooter({ text: "Grazie per il tuo supporto!" });
}

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

async function tryGrantPicPermsRoleIfMissing(member) {
  if (!member?.guild || !PIC_PERMS_ROLE_ID) return;
  const me = member.guild.members.me;
  if (!me || !hasManageRolesPermission(member)) return;
  const role = member.guild.roles.cache.get(PIC_PERMS_ROLE_ID);
  if (!role || role.position >= me.roles.highest.position) return;
  if (member.roles.cache.has(PIC_PERMS_ROLE_ID)) return;
  await member.roles.add(PIC_PERMS_ROLE_ID).catch(() => null);
}

async function tryGrantPicPermsIfBundleComplete(member) {
  if (!member?.guild || !PIC_PERMS_ROLE_ID) return;
  if (!PIC_PERMS_BUNDLE_ROLE_IDS.length) return;
  const hasAll = PIC_PERMS_BUNDLE_ROLE_IDS.every((rid) => member.roles.cache.has(rid));
  if (!hasAll) return;
  await tryGrantPicPermsRoleIfMissing(member);
}

async function tryGrantPicPermsIfAnyAutoTrigger(member) {
  if (!member?.guild || !PIC_PERMS_ROLE_ID || !PIC_PERMS_AUTO_TRIGGER_ROLE_IDS.length) return;
  const hasAny = PIC_PERMS_AUTO_TRIGGER_ROLE_IDS.some((rid) => rid && member.roles.cache.has(rid));
  if (!hasAny) return;
  await tryGrantPicPermsRoleIfMissing(member);
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
        "<a:VC_Infinity:1448687797266288832> - Permesso di allegare immagini e link in chat",
        "<a:VC_HeartWhite:1448673535253024860> - Permesso di cambiare nickname",
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
        "<a:VC_Infinity:1448687797266288832> - Permesso di allegare immagini e link in chat",
        "<a:VC_HeartWhite:1448673535253024860> - Permesso di cambiare nickname",
        "",
        "<a:VC_Arrow:1482706699365257397> Metti `.gg/viniliecaffe` o `discord.gg/viniliecaffe` nella tua bio."
        ].join("\n"),
      ],
      footer: "Grazie per il tuo supporto!",
      roleId: socialSupId,
    });
    await channel.send({ content: `<@${newMember.id}>`, embeds: [embed] }).catch(() => null);
  }

  const addedSelfieRoleIds = SELFIE_VERIFIED_GUILDED_STYLE_SPECS.filter((spec) =>
    roleWasAdded(oldMember, newMember, spec.roleId),
  ).map((spec) => spec.roleId);
  const addedAnySelfieVerified = addedSelfieRoleIds.length > 0;
  if (addedAnySelfieVerified && channel?.isTextBased?.()) {
    const manualStaff = await wasSelfieVerifiedRoleAddedByHumanStaff(
      newMember.guild,
      newMember.id,
      addedSelfieRoleIds,
    );
    if (manualStaff) {
      for (const spec of SELFIE_VERIFIED_GUILDED_STYLE_SPECS) {
        if (!roleWasAdded(oldMember, newMember, spec.roleId)) continue;
        const embed = buildSelfieVerifiedGuildedStyleEmbed(newMember, spec.roleId, spec.title);
        await channel.send({ content: `<@${newMember.id}>`, embeds: [embed] }).catch(() => null);
      }
    }
  }

  await tryGrantPicPermsIfBundleComplete(newMember);
  await tryGrantPicPermsIfAnyAutoTrigger(newMember);
}

module.exports = { maybeAnnounceManualSocialRolesAndGrantPicPermsBundle };