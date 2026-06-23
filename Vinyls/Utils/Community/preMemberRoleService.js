const IDs = require("../Config/ids");
const { isAlreadyVerifiedInThisGuild } = require("../Interaction/verifyUtils");
const { getGuildMemberCached } = require("../Interaction/interactionEntityCache");
const { memberIsInMuteMirrorState } = require("../../Services/Moderation/mutedMirrorRoleService");

function preMemberRoleId() {
  return String(IDs.roles?.preMember || "").trim();
}

function mainMemberRoleId() {
  return String(IDs.roles?.Member || "").trim();
}

function isMainGuildMemberContext(member) {
  const guildId = String(member?.guild?.id || "").trim();
  const mainGuildId = String(IDs.guilds?.main || "").trim();
  return Boolean(guildId && mainGuildId && guildId === mainGuildId);
}

function memberHasPreMemberRole(member) {
  const rid = preMemberRoleId();
  return Boolean(rid && member?.roles?.cache?.has?.(rid));
}

function memberHasMainMemberRole(member) {
  const rid = mainMemberRoleId();
  return Boolean(rid && member?.roles?.cache?.has?.(rid));
}

function memberGainedMainMemberRole(oldMember, newMember) {
  const rid = mainMemberRoleId();
  if (!rid) return false;
  return !oldMember?.roles?.cache?.has?.(rid) && Boolean(newMember?.roles?.cache?.has?.(rid));
}

async function removePreMemberRoleIfPresent(member, reason) {
  const rid = preMemberRoleId();
  if (!rid || !member?.roles?.cache?.has?.(rid)) return member || null;
  await member.roles.remove(rid, reason || "Verifica completata: ruolo Member assegnato.").catch((err) => {
    global.logger?.warn?.("[preMemberRole] remove failed:", member?.id, err?.message || err);
  });
  const guild = member.guild;
  if (!guild) return member;
  return (await getGuildMemberCached(guild, member.id, { preferFresh: true }).catch(() => null)) || member;
}

async function applyPreMemberRoleIfNeeded(member) {
  const rid = preMemberRoleId();
  if (!rid || !member?.guild || member.user?.bot) return member || null;
  if (!isMainGuildMemberContext(member)) return member || null;
  if (isAlreadyVerifiedInThisGuild(member, member.guild.id) || memberHasMainMemberRole(member)) {
    return removePreMemberRoleIfPresent(member);
  }
  if (memberIsInMuteMirrorState(member)) return member || null;
  if (member.roles.cache.has(rid)) return member;
  await member.roles.add(rid, "Ingresso: in attesa di verifica Member.").catch((err) => {
    global.logger?.warn?.("[preMemberRole] add failed:", member?.id, err?.message || err);
  });
  return (await getGuildMemberCached(member.guild, member.id, { preferFresh: true }).catch(() => null)) || member;
}

async function syncPreMemberRoleForMember(member) {
  if (!member?.guild || member.user?.bot || !isMainGuildMemberContext(member)) return member || null;
  if (isAlreadyVerifiedInThisGuild(member, member.guild.id) || memberHasMainMemberRole(member)) {
    return removePreMemberRoleIfPresent(member);
  }
  return applyPreMemberRoleIfNeeded(member);
}

async function handlePreMemberRoleOnMemberUpdate(oldMember, newMember) {
  if (!newMember?.guild || newMember.user?.bot || !isMainGuildMemberContext(newMember)) return;
  if (memberGainedMainMemberRole(oldMember, newMember) || memberHasMainMemberRole(newMember)) {
    await removePreMemberRoleIfPresent(newMember);
    return;
  }
  if (memberIsInMuteMirrorState(newMember)) {
    if (memberHasPreMemberRole(newMember)) {
      await removePreMemberRoleIfPresent(newMember, "Timeout/mute attivo: preMember non applicabile.");
    }
    return;
  }
  if (!memberHasMainMemberRole(newMember) && !isAlreadyVerifiedInThisGuild(newMember, newMember.guild.id)) {
    await applyPreMemberRoleIfNeeded(newMember);
  }
}

module.exports = {
  preMemberRoleId,
  mainMemberRoleId,
  memberGainedMainMemberRole,
  applyPreMemberRoleIfNeeded,
  removePreMemberRoleIfPresent,
  syncPreMemberRoleForMember,
  handlePreMemberRoleOnMemberUpdate,
};