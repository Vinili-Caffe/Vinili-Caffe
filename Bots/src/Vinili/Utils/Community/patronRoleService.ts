const { EmbedBuilder, PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const IDs = require("../Config/ids") as typeof import("../Config/ids");
const { getGuildChannelCached, getGuildMemberCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { shouldSendPublicMemberAnnouncement } = require("./memberPublicAnnouncementGate") as typeof import("./memberPublicAnnouncementGate");
const { memberDisplayName, guildMemberDisplayAvatarUrlDynamic } = require("../../../shared/discord/guildDiscordIdentity") as typeof import("../../../shared/discord/guildDiscordIdentity");
const { applyPronounGenderToEmbedForMember } = require("./pronounGenderUtils") as typeof import("./pronounGenderUtils");

const MAIN_GUILD_ID = String(IDs.guilds?.main || "");
const SUPPORTERS_CHANNEL_ID = IDs.channels?.supporters;
const PATRON_ROLE_ID = String(IDs.roles?.Patron || "").trim();
const PATRON_PREREQUISITE_ROLE_IDS = [
  IDs.roles.SocialSupporter,
  IDs.roles.Fan,
  IDs.roles.Promoter,
]
  .map((id?) => String(id || "").trim())
  .filter(Boolean);

const SOCIAL_ROLE_ANNOUNCE_DEDUPE_TTL_MS = 20_000;
const patronAnnounceDedupe = new Map();

function cleanupPatronAnnounceDedupe(now = Date.now()) {
  for (const [key, ts] of patronAnnounceDedupe.entries()) {
    if (now - Number(ts || 0) > SOCIAL_ROLE_ANNOUNCE_DEDUPE_TTL_MS) {
      patronAnnounceDedupe.delete(key);
    }
  }
}

function shouldSkipPatronAnnounce(guildId?, userId?) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return false;
  const now = Date.now();
  cleanupPatronAnnounceDedupe(now);
  const key = `${gid}:${uid}`;
  const lastTs = Number(patronAnnounceDedupe.get(key) || 0);
  patronAnnounceDedupe.set(key, now);
  return now - lastTs <= SOCIAL_ROLE_ANNOUNCE_DEDUPE_TTL_MS;
}

function rolesCacheChanged(oldMember?, newMember?) {
  const oldRoles = oldMember?.roles?.cache;
  const newRoles = newMember?.roles?.cache;
  if (!oldRoles || !newRoles) return false;
  return (
    oldRoles.size !== newRoles.size ||
    oldRoles.some((role?) => !newRoles.has(role.id)) ||
    newRoles.some((role?) => !oldRoles.has(role.id))
  );
}

function memberHasPatronPrerequisites(member?) {
  if (!member?.roles?.cache || !PATRON_PREREQUISITE_ROLE_IDS.length) return false;
  return PATRON_PREREQUISITE_ROLE_IDS.every((roleId?) => member.roles.cache.has(roleId));
}

function memberHasPatronRole(member?) {
  return Boolean(PATRON_ROLE_ID && member?.roles?.cache?.has(PATRON_ROLE_ID));
}

function canManagePatronRole(member?) {
  const me = member?.guild?.members?.me;
  if (!me?.permissions?.has?.(PermissionsBitField.Flags.ManageRoles)) return false;
  const role = member.guild.roles.cache.get(PATRON_ROLE_ID);
  if (!role || role.position >= me.roles.highest.position) return false;
  return true;
}

async function resolveSupportersChannel(guild?) {
  if (!guild || !SUPPORTERS_CHANNEL_ID) return null;
  return guild.channels.cache.get(SUPPORTERS_CHANNEL_ID) || (await getGuildChannelCached(guild, SUPPORTERS_CHANNEL_ID));
}

async function sendPatronRoleAnnounce(member?, channel?) {
  if (!PATRON_ROLE_ID || !channel?.isTextBased?.()) return false;
  const guild = member?.guild;
  const patronRoleMention = guild?.roles?.cache?.get(PATRON_ROLE_ID)
    ? `<@&${PATRON_ROLE_ID}>`
    : "il tuo ruolo Patron";
  const prereqMentions = PATRON_PREREQUISITE_ROLE_IDS.map((id?) =>
    guild?.roles?.cache?.get(id) ? `<@&${id}>` : "un prerequisito",
  ).join(", ");
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setAuthor({
      name: memberDisplayName(member),
      iconURL: guildMemberDisplayAvatarUrlDynamic(member, { size: 256 }) || undefined,
    })
    .setTitle("Nuovx Patron <a:VC_StarPink:1330194976440848500>")
    .setThumbnail(guildMemberDisplayAvatarUrlDynamic(member, { size: 256 }) || null)
    .setDescription(
      [
        `<@${member.id}>, \`hai sbloccato:\``,
        `<:VC_Reply:1482532158080942191> Ti è stato assegnato il ruolo ${patronRoleMention}!`,
        "<:VC_Dot:1482532364222595303> - Possibilità di **scrivere in gigante**",
        "",
        `<a:VC_Arrow:1482706699365257397> Hai completato i ruoli ${prereqMentions}.`,
        "<a:VC_Arrow:1482706699365257397> Scopri i tuoi vantaggi sul nostro [sito](https://viniliecaffe.it/perks).",
      ].join("\n"),
    )
    .setFooter({ text: "Grazie per il tuo supporto!" });
  applyPronounGenderToEmbedForMember(embed, member);
  const sent = await channel.send({ content: `<@${member.id}>`, embeds: [embed] }).catch(() => null);
  return Boolean(sent?.id);
}

async function grantPatronRole(member?, { announce = true } = {}) {
  if (!PATRON_ROLE_ID || !member?.guild) return false;
  if (memberHasPatronRole(member)) return false;
  if (!memberHasPatronPrerequisites(member)) return false;
  if (!canManagePatronRole(member)) return false;
  await member.roles.add(PATRON_ROLE_ID, "Patron: prerequisiti social completati").catch(() => null);
  const refreshed = await getGuildMemberCached(member.guild, member.id, { preferFresh: true }).catch(() => null);
  if (!memberHasPatronRole(refreshed || member)) return false;
  if (!announce) return true;
  const allowPublic = await shouldSendPublicMemberAnnouncement(refreshed || member).catch(() => false);
  if (!allowPublic) return true;
  const channel = await resolveSupportersChannel(member.guild);
  if (!channel?.isTextBased?.()) return true;
  if (shouldSkipPatronAnnounce(member.guild.id, member.id)) return true;
  await sendPatronRoleAnnounce(refreshed || member, channel);
  return true;
}

async function revokePatronRole(member?) {
  if (!PATRON_ROLE_ID || !member?.guild || !memberHasPatronRole(member)) return false;
  if (!canManagePatronRole(member)) return false;
  await member.roles.remove(PATRON_ROLE_ID, "Patron: prerequisiti social non più soddisfatti").catch(() => null);
  return true;
}

async function maybeSyncPatronRoleForMember(oldMember?, newMember?) {
  if (!oldMember || !newMember?.guild || !newMember.user) return;
  if (String(newMember.guild.id) !== MAIN_GUILD_ID) return;
  if (!PATRON_ROLE_ID || !PATRON_PREREQUISITE_ROLE_IDS.length) return;
  if (!rolesCacheChanged(oldMember, newMember)) return;

  const hasPrereqs = memberHasPatronPrerequisites(newMember);
  const hasPatron = memberHasPatronRole(newMember);

  if (hasPrereqs && !hasPatron) {
    await grantPatronRole(newMember, { announce: true });
    return;
  }
  if (!hasPrereqs && hasPatron) {
    await revokePatronRole(newMember);
  }
}

async function reconcilePatronRolesOnStartup(client?, opts: Record<string, any> = {}) {
  const { isRecoveryPrimaryShard } = require("./supportersChannelEmbedRecoveryUtils") as typeof import("./supportersChannelEmbedRecoveryUtils");
  if (!isRecoveryPrimaryShard(client)) return { ok: false, reason: "not_primary_shard" };
  if (!PATRON_ROLE_ID || !PATRON_PREREQUISITE_ROLE_IDS.length) return { ok: false, reason: "not_configured" };
  const guild = client.guilds.cache.get(MAIN_GUILD_ID) || (await client.guilds.fetch(MAIN_GUILD_ID).catch(() => null));
  if (!guild) return { ok: false, reason: "guild_not_found" };
  await guild.members.fetch().catch(() => null);
  let granted = 0;
  let revoked = 0;
  for (const [, member] of guild.members.cache) {
    if (member.user.bot) continue;
    const hasPrereqs = memberHasPatronPrerequisites(member);
    const hasPatron = memberHasPatronRole(member);
    if (!hasPrereqs && !hasPatron) continue;
    if (hasPrereqs && !hasPatron) {
      const ok = await grantPatronRole(member, { announce: false });
      if (ok) granted += 1;
    } else if (!hasPrereqs && hasPatron) {
      const ok = await revokePatronRole(member);
      if (ok) revoked += 1;
    }
  }
  if (granted > 0 || revoked > 0) {
    global.logger?.info?.("[patron-role] startup reconcile:", { granted, revoked });
  }
  return { ok: true, granted, revoked };
}

async function recoverPatronAnnouncesOnStartup(client?, opts: Record<string, any> = {}) {
  const {
    isRecoveryPrimaryShard,
    DEFAULT_RECOVERY_LOOKBACK_MS,
    EMBED_DEDUPE_LOOKBACK_MS,
    collectRecentRoleAddsFromAudit,
    botSupportersEmbedExistsForUser,
    recoverySleep,
  } = require("./supportersChannelEmbedRecoveryUtils") as typeof import("./supportersChannelEmbedRecoveryUtils");
  if (!isRecoveryPrimaryShard(client)) return { ok: false, reason: "not_primary_shard" };
  if (!PATRON_ROLE_ID) return { ok: false, reason: "not_configured" };
  const guild = client.guilds.cache.get(MAIN_GUILD_ID) || (await client.guilds.fetch(MAIN_GUILD_ID).catch(() => null));
  if (!guild) return { ok: false, reason: "guild_not_found" };
  const channel = await resolveSupportersChannel(guild);
  if (!channel?.isTextBased?.()) return { ok: false, reason: "no_channel" };
  const lookbackMs = Math.max(60 * 60 * 1000, Math.min(7 * 24 * 60 * 60 * 1000, Number(opts.lookbackMs || DEFAULT_RECOVERY_LOOKBACK_MS)));
  const limit = Math.max(1, Math.min(40, Number(opts.limit || 15)));
  const botId = String(client.user?.id || "");
  const embedSinceMs = Date.now() - EMBED_DEDUPE_LOOKBACK_MS;
  const adds = await collectRecentRoleAddsFromAudit(guild, [PATRON_ROLE_ID], lookbackMs);
  let recovered = 0;
  const seen = new Set();
  for (const row of adds) {
    if (recovered >= limit) break;
    const uid = String(row.userId || "");
    if (!uid || seen.has(uid)) continue;
    seen.add(uid);
    const member = await getGuildMemberCached(guild, uid, { preferFresh: true }).catch(() => null);
    if (!memberHasPatronRole(member)) continue;
    if (!(await shouldSendPublicMemberAnnouncement(member).catch(() => false))) continue;
    const exists = await botSupportersEmbedExistsForUser(channel, uid, botId, embedSinceMs, (blob?) => /Nuov\w* Patron/i.test(blob));
    if (exists) continue;
    if (shouldSkipPatronAnnounce(guild.id, uid)) continue;
    const sent = await sendPatronRoleAnnounce(member, channel);
    if (sent) {
      recovered += 1;
      global.logger?.info?.("[patron-role-recovery] announce:", uid);
      await recoverySleep(450);
    }
  }
  if (recovered > 0) global.logger?.info?.("[patron-role-recovery] done:", recovered);
  return { ok: true, recovered };
}

export = {
  memberHasPatronRole,
  maybeSyncPatronRoleForMember,
  reconcilePatronRolesOnStartup,
  recoverPatronAnnouncesOnStartup,
};
