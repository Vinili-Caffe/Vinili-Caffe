const IDs = require("../Config/ids") as typeof import("../Config/ids");
const { isAlreadyVerifiedInThisGuild } = require("../Interaction/verifyUtils") as typeof import("../Interaction/verifyUtils");
const { getGuildMemberCached, addRolesAndGetMember, getClientGuildCached } = require("../Interaction/interactionEntityCache") as typeof import("../Interaction/interactionEntityCache");
const { memberIsInMuteMirrorState } = require("../../Services/Moderation/mutedMirrorRoleService") as typeof import("../../Services/Moderation/mutedMirrorRoleService");

const SWEEP_INTERVAL_MS = 10 * 60 * 1000;
const SWEEP_MEMBER_DELAY_MS = 120;
let preMemberSweepLoopHandle = null;

function preMemberRoleId() {
  return String(IDs.roles?.preMember || "").trim();
}

function mainMemberRoleId() {
  return String(IDs.roles?.Member || "").trim();
}

function isMainGuildMemberContext(member?) {
  const guildId = String(member?.guild?.id || "").trim();
  const mainGuildId = String(IDs.guilds?.main || "").trim();
  return Boolean(guildId && mainGuildId && guildId === mainGuildId);
}

function memberHasPreMemberRole(member?) {
  const rid = preMemberRoleId();
  return Boolean(rid && member?.roles?.cache?.has?.(rid));
}

function memberHasMainMemberRole(member?) {
  const rid = mainMemberRoleId();
  return Boolean(rid && member?.roles?.cache?.has?.(rid));
}

function memberGainedMainMemberRole(oldMember?, newMember?) {
  const rid = mainMemberRoleId();
  if (!rid) return false;
  return !oldMember?.roles?.cache?.has?.(rid) && Boolean(newMember?.roles?.cache?.has?.(rid));
}

function sleep(ms?) {
  return new Promise((resolve?) => {
    const timer = setTimeout(resolve, ms);
    timer.unref?.();
  });
}

async function hasVerifiedTenureInProfile(guildId?, userId?) {
  const gid = String(guildId || "").trim();
  const uid = String(userId || "").trim();
  if (!gid || !uid) return false;
  try {
    const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
    const mongoose = require("mongoose") as typeof import("mongoose");
    if (mongoose.connection?.readyState !== 1) return false;
    const doc = await ActivityUserProfile.findOne({ guildId: gid, userId: uid })
      .select("profile.verificationTenure.verifiedAt")
      .lean()
      .catch(() => null);
    const at = doc?.profile?.verificationTenure?.verifiedAt;
    if (!at) return false;
    const ms = new Date(at).getTime();
    return Number.isFinite(ms) && ms > 0;
  } catch (_) {
    return false;
  }
}

async function removePreMemberRoleIfPresent(member?, reason?) {
  const rid = preMemberRoleId();
  if (!rid || !member?.roles?.cache?.has?.(rid)) return member || null;
  await member.roles.remove(rid, reason || "Verifica completata: ruolo Member assegnato.").catch((err?) => {
    global.logger?.warn?.("[preMemberRole] remove failed:", member?.id, err?.message || err);
  });
  const guild = member.guild;
  if (!guild) return member;
  return (await getGuildMemberCached(guild, member.id, { preferFresh: true }).catch(() => null)) || member;
}

async function reconcileVerifiedMemberPreMember(member?, reason?) {
  if (!member?.guild || member.user?.bot || !isMainGuildMemberContext(member)) return member || null;
  if (memberIsInMuteMirrorState(member)) {
    if (memberHasPreMemberRole(member)) {
      return removePreMemberRoleIfPresent(member, reason || "Timeout/mute attivo: preMember non applicabile.");
    }
    return member;
  }

  const memberRole = mainMemberRoleId();
  let current = member;
  if (memberRole && !current.roles.cache.has(memberRole)) {
    const verifiedInRoles = isAlreadyVerifiedInThisGuild(current, current.guild.id);
    const verifiedInDb = verifiedInRoles ? true : await hasVerifiedTenureInProfile(current.guild.id, current.id);
    if (verifiedInDb) {
      const after = await addRolesAndGetMember(current.guild, current.id, [memberRole]).catch(() => null);
      if (after) current = after;
      else {
        await current.roles.add(memberRole, reason || "Verifica profilo: ripristino Member").catch((err?) => {
          global.logger?.warn?.("[preMemberRole] restore Member failed:", current.id, err?.message || err);
        });
        current =
          (await getGuildMemberCached(current.guild, current.id, { preferFresh: true }).catch(() => null)) || current;
      }
    }
  }

  if (memberHasPreMemberRole(current) && (memberHasMainMemberRole(current) || isAlreadyVerifiedInThisGuild(current, current.guild.id))) {
    return removePreMemberRoleIfPresent(current, reason || "Verifica completata: ruolo Member assegnato.");
  }
  if (memberHasPreMemberRole(current) && (await hasVerifiedTenureInProfile(current.guild.id, current.id))) {
    return removePreMemberRoleIfPresent(current, reason || "Verifica profilo: preMember non applicabile.");
  }
  return current;
}

async function applyPreMemberRoleIfNeeded(member?) {
  const rid = preMemberRoleId();
  if (!rid || !member?.guild || member.user?.bot) return member || null;
  if (!isMainGuildMemberContext(member)) return member || null;
  if (isAlreadyVerifiedInThisGuild(member, member.guild.id) || memberHasMainMemberRole(member)) {
    return removePreMemberRoleIfPresent(member);
  }
  if (memberIsInMuteMirrorState(member)) return member || null;

    if (await hasVerifiedTenureInProfile(member.guild.id, member.id)) {
    return reconcileVerifiedMemberPreMember(member, "Verifica profilo: ripristino post-ingresso.");
  }

  if (member.roles.cache.has(rid)) return member;
  await member.roles.add(rid, "Ingresso: in attesa di verifica Member.").catch((err?) => {
    global.logger?.warn?.("[preMemberRole] add failed:", member?.id, err?.message || err);
  });
  return (await getGuildMemberCached(member.guild, member.id, { preferFresh: true }).catch(() => null)) || member;
}

async function syncPreMemberRoleForMember(member?) {
  if (!member?.guild || member.user?.bot || !isMainGuildMemberContext(member)) return member || null;
  if (isAlreadyVerifiedInThisGuild(member, member.guild.id) || memberHasMainMemberRole(member)) {
    return removePreMemberRoleIfPresent(member);
  }
  if (await hasVerifiedTenureInProfile(member.guild.id, member.id)) {
    return reconcileVerifiedMemberPreMember(member);
  }
  return applyPreMemberRoleIfNeeded(member);
}

async function handlePreMemberRoleOnMemberUpdate(oldMember?, newMember?) {
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
  if (await hasVerifiedTenureInProfile(newMember.guild.id, newMember.id)) {
    await reconcileVerifiedMemberPreMember(newMember);
    return;
  }
  if (!memberHasMainMemberRole(newMember) && !isAlreadyVerifiedInThisGuild(newMember, newMember.guild.id)) {
    await applyPreMemberRoleIfNeeded(newMember);
  }
}

async function sweepStalePreMemberRoles(client?, options: Record<string, any> = {}) {
  const rid = preMemberRoleId();
  const memberRole = mainMemberRoleId();
  const mainGuildId = String(IDs.guilds?.main || "").trim();
  if (!rid || !client?.guilds || !mainGuildId) return { scanned: 0, fixed: 0 };

  const guild = await getClientGuildCached(client, mainGuildId).catch(() => null);
  if (!guild?.members) return { scanned: 0, fixed: 0 };

  if (options.fetchMembers) {
    await guild.members.fetch().catch((err?) => {
      global.logger?.warn?.("[preMemberRole] sweep members.fetch:", err?.message || err);
    });
  }

  let role = guild.roles.cache.get(rid);
  if (!role) role = await guild.roles.fetch(rid).catch(() => null);
  if (!role) return { scanned: 0, fixed: 0 };

  const candidates = [];
  for (const [, member] of role.members) {
    if (member?.user?.bot) continue;
    candidates.push(member);
  }
    if (memberRole) {
    for (const [, member] of guild.members.cache) {
      if (member?.user?.bot) continue;
      if (!member.roles.cache.has(rid)) continue;
      if (!candidates.some((m?) => m.id === member.id)) candidates.push(member);
    }
  }

  let scanned = 0;
  let fixed = 0;
  const limit = Math.max(1, Math.min(500, Number(options.limit) || 200));
  for (const stub of candidates.slice(0, limit)) {
    scanned += 1;
    const member =
      (await getGuildMemberCached(guild, stub.id, { preferFresh: true }).catch(() => null)) || stub;
    if (!memberHasPreMemberRole(member)) continue;

    const before = memberHasPreMemberRole(member);
    const hasMember = memberHasMainMemberRole(member) || isAlreadyVerifiedInThisGuild(member, guild.id);
    const verifiedDb = hasMember ? true : await hasVerifiedTenureInProfile(guild.id, member.id);
    if (!hasMember && !verifiedDb) continue;

    await reconcileVerifiedMemberPreMember(
      member,
      "Sweep Unverified: membro già verificato.",
    );
    await sleep(SWEEP_MEMBER_DELAY_MS);
    const after =
      (await getGuildMemberCached(guild, member.id, { preferFresh: true }).catch(() => null)) || member;
    if (before && !memberHasPreMemberRole(after)) fixed += 1;
  }

  if (fixed > 0) {
    global.logger?.info?.(`[preMemberRole] sweep removed Unverified from ${fixed}/${scanned} member(s)`);
  }
  return { scanned, fixed };
}

function startPreMemberRoleSweepLoop(client?) {
  if (preMemberSweepLoopHandle) return preMemberSweepLoopHandle;
  const tick = () => {
    sweepStalePreMemberRoles(client, { limit: 200 }).catch((err?) => {
      global.logger?.warn?.("[preMemberRole] sweep failed:", err?.message || err);
    });
  };
  tick();
  preMemberSweepLoopHandle = setInterval(tick, SWEEP_INTERVAL_MS);
  preMemberSweepLoopHandle.unref?.();
  return preMemberSweepLoopHandle;
}

export = {
  preMemberRoleId,
  mainMemberRoleId,
  memberGainedMainMemberRole,
  applyPreMemberRoleIfNeeded,
  removePreMemberRoleIfPresent,
  syncPreMemberRoleForMember,
  handlePreMemberRoleOnMemberUpdate,
  reconcileVerifiedMemberPreMember,
  sweepStalePreMemberRoles,
  startPreMemberRoleSweepLoop,
};
