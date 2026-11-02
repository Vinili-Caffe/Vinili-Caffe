/** Classifiche utenti: ruolo e vocale personalizzati nel profilo. */
const { PermissionsBitField, OverwriteType } = require("discord.js") as typeof import("discord.js");
const { CustomRole } = require("../../Schemas/Community/communitySchemas") as typeof import("../../Schemas/Community/communitySchemas");
const { findCustomVoiceByOwner, findCustomVoiceByRole } = require("../../Utils/Interaction/customRoleUtils") as typeof import("../../Utils/Interaction/customRoleUtils");
const { discordRoleIconUrl } = require("../../Utils/Discord/discordRoleIconUrl") as typeof import("../../Utils/Discord/discordRoleIconUrl");
const { siteMemberAvatarUrl, resolveCustomProfileOwnerMember } = require("./usersLbIdentity") as typeof import("./usersLbIdentity");

function roleHexPair(role?) {
  if (!role) return { color: "", color2: "", colorMode: "solid" };
  const primary =
    String(role.hexColor || "").trim() && String(role.hexColor || "").trim() !== "#000000"
      ? String(role.hexColor || "").trim().toLowerCase()
      : "";
  let color2 = "";
  let tertiary = 0;
  let secondaryInt = 0;
  let primaryInt = 0;
  try {
    primaryInt = Number(role.colors?.primaryColor ?? 0) || 0;
    secondaryInt = Number(role.colors?.secondaryColor ?? 0) || 0;
    tertiary = Number(role.colors?.tertiaryColor ?? 0) || 0;
    if (secondaryInt > 0) {
      color2 = `#${secondaryInt.toString(16).padStart(6, "0")}`.toLowerCase();
    }
  } catch (_) {
      }
    const HOLO_P = 11127295;
  const HOLO_S = 16759788;
  const HOLO_T = 16761760;
  let colorMode = "solid";
  if (primaryInt === HOLO_P && secondaryInt === HOLO_S && tertiary === HOLO_T) {
    colorMode = "holo";
  } else if (secondaryInt > 0) {
    colorMode = "gradient";
  }
  return { color: primary, color2, colorMode };
}

function snowflakeCreatedAtIso(id?) {
  try {
    const sid = String(id || "").trim();
    if (!/^\d{17,22}$/.test(sid)) return "";
    const ms = Number((BigInt(sid) >> 22n) + 1420070400000n);
    if (!Number.isFinite(ms) || ms < 1_420_070_400_000) return "";
    return new Date(ms).toISOString();
  } catch {
    return "";
  }
}

function entityCreatedAtIso(entity?) {
  if (entity?.createdAt) {
    try {
      const d = new Date(entity.createdAt);
      if (Number.isFinite(d.getTime())) return d.toISOString();
    } catch {
          }
  }
  return snowflakeCreatedAtIso(entity?.id);
}

function countVoiceSharedOverwrites(voice?, ownerSid?, botSid?) {
  let count = 0;
  const sharedIds = [];
  if (!voice?.permissionOverwrites?.cache) return { count: 0, sharedIds };
  const V = PermissionsBitField.Flags.ViewChannel;
  const C = PermissionsBitField.Flags.Connect;
  const M = PermissionsBitField.Flags.ManageChannels;
  voice.permissionOverwrites.cache.forEach((overwrite?) => {
    if (overwrite.type !== OverwriteType.Member) return;
    const sid = String(overwrite.id || "");
    if (!sid || sid === ownerSid || (botSid && sid === botSid)) return;
    const allow = overwrite.allow;
    if (!allow?.has?.(V) || !allow?.has?.(C)) return;
    if (allow.has(M)) return;
    sharedIds.push(sid);
    count += 1;
  });
  return { count, sharedIds };
}

const customRoleMembersHydrateAt = new Map();
const customRoleMembersHydrateInflight = new Map();
const CUSTOM_ROLE_MEMBERS_HYDRATE_TTL_MS = 10 * 60 * 1000;

function isSiteApiRestGuild(guild?) {
  return Boolean(guild?.client?._isSiteApiRestClient || (guild?.client?._rest && !guild?.client?.ws));
}

async function hydrateCustomRoleMembersForSiteApi(guild?, roleIds?) {
  if (!isSiteApiRestGuild(guild) || typeof guild?.members?.fetch !== "function") return false;
  const ids = [...new Set((Array.isArray(roleIds) ? roleIds : []).map((id?) => String(id || "").trim()).filter(Boolean))];
  if (!ids.length) return false;
  let needs = false;
  for (const rid of ids) {
    const role = guild.roles.cache.get(rid);
    if (!role) continue;
    if (Number(role.members?.size || 0) <= 1) {
      needs = true;
      break;
    }
  }
  if (!needs) return false;
  const gid = String(guild.id || "");
  const last = Number(customRoleMembersHydrateAt.get(gid) || 0);
  if (last && Date.now() - last < CUSTOM_ROLE_MEMBERS_HYDRATE_TTL_MS) return true;
  let inflight = customRoleMembersHydrateInflight.get(gid);
  if (!inflight) {
    inflight = Promise.resolve()
      .then(() => guild.members.fetch())
      .then(() => {
        customRoleMembersHydrateAt.set(gid, Date.now());
        return true;
      })
      .catch(() => false)
      .finally(() => {
        customRoleMembersHydrateInflight.delete(gid);
      });
    customRoleMembersHydrateInflight.set(gid, inflight);
  }
  return inflight;
}

async function buildCustomProfileData(guild?, userId?, opts?) {
  const lite = Boolean(opts && opts.lite);
  const ultraLite = Boolean(opts && opts.ultraLite);
  if (!guild || !userId) return null;
  const doc = await CustomRole.findOne({ guildId: guild.id, userId: String(userId) }).lean().catch(() => null);
  if (!doc || (!doc.roleId && !doc.secondaryRoleId && !doc.customVocChannelId)) return null;
  const ownerSid = String(userId || "").trim();
  const botSid = String(guild.members?.me?.id || guild.client?.user?.id || "").trim();
  const ownerMember = await resolveCustomProfileOwnerMember(guild, ownerSid);
  if (!ownerMember || ownerMember.user?.bot) return null;

    if (ultraLite) {
    const role = doc.roleId ? guild.roles.cache.get(String(doc.roleId)) || null : null;
    const secondaryRole = doc.secondaryRoleId
      ? guild.roles.cache.get(String(doc.secondaryRoleId)) || null
      : null;
    const channelId = String(doc.customVocChannelId || "").trim();
    const voice = channelId ? guild.channels.cache.get(channelId) || null : null;
    const primaryColors = roleHexPair(role);
    const secondaryColors = roleHexPair(secondaryRole);
    const voiceShared = countVoiceSharedOverwrites(voice, ownerSid, botSid);
    let roleMemberCount = Number(role?.members?.size) || 0;
    let secondaryMemberCount = Number(secondaryRole?.members?.size) || 0;
    try {
      const { getFreshMemberIdSnapshot } = require("../../Utils/Discord/threadRoleMembers") as typeof import("../../Utils/Discord/threadRoleMembers");
      const snap = getFreshMemberIdSnapshot(guild.id);
      if (snap?.byRole) {
        if (role?.id) {
          const ids = snap.byRole.get(String(role.id));
          if (Array.isArray(ids) && ids.length) {
            roleMemberCount = Math.max(roleMemberCount, ids.filter((id?) => id !== ownerSid).length);
          }
        }
        if (secondaryRole?.id) {
          const ids = snap.byRole.get(String(secondaryRole.id));
          if (Array.isArray(ids) && ids.length) {
            secondaryMemberCount = Math.max(
              secondaryMemberCount,
              ids.filter((id?) => id !== ownerSid).length,
            );
          }
        }
      }
    } catch {
          }
        if (role?.members?.size) {
      let shared = 0;
      for (const m of role.members.values()) {
        if (m?.user?.bot) continue;
        if (String(m.id) === ownerSid) continue;
        shared += 1;
      }
      roleMemberCount = Math.max(roleMemberCount, shared);
    }
    if (secondaryRole?.members?.size) {
      let shared = 0;
      for (const m of secondaryRole.members.values()) {
        if (m?.user?.bot) continue;
        if (String(m.id) === ownerSid) continue;
        shared += 1;
      }
      secondaryMemberCount = Math.max(secondaryMemberCount, shared);
    }
    return {
      expiresAt: doc?.expiresAt ? new Date(doc.expiresAt).toISOString() : "",
      role: role
        ? {
            id: String(role.id),
            name: String(role.name || "Ruolo personalizzato"),
            color: primaryColors.color,
            color2: primaryColors.color2,
            colorMode: primaryColors.colorMode || "solid",
            emoji: String(role.unicodeEmoji || "").trim(),
            ...(() => {
              const ic = discordRoleIconUrl(role, { size: 128 });
              return { iconUrl: ic.iconUrl, iconAnimated: ic.iconAnimated };
            })(),
            createdAt: entityCreatedAtIso(role),
            memberCount: roleMemberCount,
            sharedMembers: [],
          }
        : doc.roleId
          ? {
              id: String(doc.roleId),
              name: "Ruolo personalizzato",
              color: "",
              color2: "",
              colorMode: "solid",
              emoji: "",
              iconUrl: "",
              createdAt: snowflakeCreatedAtIso(doc.roleId),
              memberCount: 0,
              sharedMembers: [],
            }
          : null,
      secondaryRole: secondaryRole
        ? {
            id: String(secondaryRole.id),
            name: String(secondaryRole.name || "Ruolo personalizzato secondario"),
            color: secondaryColors.color,
            color2: secondaryColors.color2,
            colorMode: secondaryColors.colorMode || "solid",
            emoji: String(secondaryRole.unicodeEmoji || "").trim(),
            ...(() => {
              const ic = discordRoleIconUrl(secondaryRole, { size: 128 });
              return { iconUrl: ic.iconUrl, iconAnimated: ic.iconAnimated };
            })(),
            createdAt: entityCreatedAtIso(secondaryRole),
            memberCount: secondaryMemberCount,
            sharedMembers: [],
          }
        : null,
      voice: voice
        ? {
            id: String(voice.id || ""),
            name: String(voice.name || "Canale vocale privato"),
            emoji: String(doc?.customVocEmoji || "").trim(),
            createdAt: entityCreatedAtIso(voice),
            memberCount: voiceShared.count,
            sharedMembers: [],
          }
        : channelId
          ? {
              id: channelId,
              name: "Canale vocale privato",
              emoji: String(doc?.customVocEmoji || "").trim(),
              createdAt: snowflakeCreatedAtIso(channelId),
              memberCount: 0,
              sharedMembers: [],
            }
          : null,
    };
  }

  const role =
    doc.roleId
      ? guild.roles.cache.get(String(doc.roleId)) || (await guild.roles.fetch(String(doc.roleId)).catch(() => null))
      : null;
  const secondaryRole =
    doc.secondaryRoleId
      ? guild.roles.cache.get(String(doc.secondaryRoleId)) || (await guild.roles.fetch(String(doc.secondaryRoleId)).catch(() => null))
      : null;
  const channelId = String(doc.customVocChannelId || "").trim();
  const storedVoice = channelId
    ? guild.channels.cache.get(channelId) || (await guild.channels.fetch(channelId).catch(() => null))
    : null;
  const voice =
    storedVoice ||
    findCustomVoiceByOwner(guild, userId) ||
    (role ? findCustomVoiceByRole(guild, role.id) : null) ||
    (secondaryRole ? findCustomVoiceByRole(guild, secondaryRole.id) : null);

  if (voice?.id && String(doc.customVocChannelId || "") !== String(voice.id)) {
    await CustomRole.updateOne(
      { guildId: guild.id, userId: String(userId) },
      { $set: { customVocChannelId: String(voice.id) } },
    ).catch(() => null);
  }

    await hydrateCustomRoleMembersForSiteApi(guild, [
    role?.id || doc.roleId,
    secondaryRole?.id || doc.secondaryRoleId,
  ]);

  let roleMembers = role?.members ? Array.from(role.members.values()).filter((m?: any) => !m.user?.bot) : [];
  if (role && roleMembers.length === 0) {
        const ownerMember =
      guild.members.cache.get(ownerSid) ||
      (await guild.members.fetch({ user: ownerSid, force: false }).catch(() => null));
    if (ownerMember && !ownerMember.user?.bot && ownerMember.roles?.cache?.has?.(role.id)) {
      roleMembers = [ownerMember];
    }
  }
    try {
    const { getFreshMemberIdSnapshot } = require("../../Utils/Discord/threadRoleMembers") as typeof import("../../Utils/Discord/threadRoleMembers");
    const snap = getFreshMemberIdSnapshot(guild.id);
    if (snap?.byRole && role?.id) {
      const ids = snap.byRole.get(String(role.id)) || [];
      if (Array.isArray(ids) && ids.length) {
        const have = new Set(roleMembers.map((m?: any) => String(m.id)));
        const missing = ids.filter((id?) => id && !have.has(String(id))).slice(0, lite ? 12 : 40);
        for (const id of missing) {
          const m = guild.members.cache.get(String(id));
          if (m && !m.user?.bot && m.roles?.cache?.has?.(role.id)) roleMembers.push(m);
        }
        const stillMissing = missing.filter((id?) => !guild.members.cache.has(String(id))).slice(0, lite ? 8 : 16);
        if (stillMissing.length) {
          await Promise.all(
            stillMissing.map((id?) => guild.members.fetch({ user: String(id), force: false }).catch(() => null)),
          );
          for (const id of stillMissing) {
            const m = guild.members.cache.get(String(id));
            if (
              m &&
              !m.user?.bot &&
              m.roles?.cache?.has?.(role.id) &&
              !roleMembers.some((x?: any) => String(x.id) === String(id))
            ) {
              roleMembers.push(m);
            }
          }
        }
      }
    }
  } catch {
      }
  const mapSharedMember = (member?, isOwner?) => ({
    id: String(member.id || member.user?.id || ""),
    username: String(member.user?.username || "").trim(),
    displayName: String(member.displayName || member.user?.globalName || member.user?.username || "Utente").trim(),
    avatarUrl: siteMemberAvatarUrl(member, 128),
    isOwner: Boolean(isOwner),
  });
  const sortSharedMembers = (a?, b?) => {
    if (a.isOwner && !b.isOwner) return -1;
    if (!a.isOwner && b.isOwner) return 1;
    return String(a.displayName || a.username || "").localeCompare(String(b.displayName || b.username || ""), "it");
  };
  const roleSharedMembers = roleMembers
    .map((member?: any) => mapSharedMember(member, String(member.id || member.user?.id || "") === ownerSid))
    .filter((member?) => member.id)
    .sort(sortSharedMembers)
    .slice(0, 60);
  if (ownerSid && role && !roleSharedMembers.some((m?) => m.id === ownerSid)) {
    const ownerMember =
      guild.members.cache.get(ownerSid) ||
      (await guild.members.fetch({ user: ownerSid, force: false }).catch(() => null));
    if (ownerMember && !ownerMember.user?.bot) {
      roleSharedMembers.unshift(mapSharedMember(ownerMember, true));
    } else {
      roleSharedMembers.unshift({ id: ownerSid, username: "", displayName: "Tu", avatarUrl: "", isOwner: true });
    }
  }
      let roleSharedCount = roleSharedMembers.filter((m?) => !m.isOwner).length;
  if (role?.members?.size) {
    let fromCache = 0;
    for (const m of role.members.values()) {
      if (m?.user?.bot) continue;
      if (String(m.id) === ownerSid) continue;
      fromCache += 1;
    }
    roleSharedCount = Math.max(roleSharedCount, fromCache);
  }
  try {
    const { getFreshMemberIdSnapshot } = require("../../Utils/Discord/threadRoleMembers") as typeof import("../../Utils/Discord/threadRoleMembers");
    const snap = getFreshMemberIdSnapshot(guild.id);
    if (snap?.byRole && role?.id) {
      const ids = snap.byRole.get(String(role.id)) || [];
      const fromSnap = ids.filter((id?) => id && String(id) !== ownerSid).length;
      roleSharedCount = Math.max(roleSharedCount, fromSnap);
    }
  } catch {
      }
  let secondaryRoleMembers = secondaryRole?.members
    ? Array.from(secondaryRole.members.values()).filter((m?: any) => !m.user?.bot)
    : [];
  if (secondaryRole && secondaryRoleMembers.length === 0) {
    const ownerMember =
      guild.members.cache.get(ownerSid) ||
      (await guild.members.fetch({ user: ownerSid, force: false }).catch(() => null));
    if (ownerMember && !ownerMember.user?.bot && ownerMember.roles?.cache?.has?.(secondaryRole.id)) {
      secondaryRoleMembers = [ownerMember];
    }
  }
  try {
    const { getFreshMemberIdSnapshot } = require("../../Utils/Discord/threadRoleMembers") as typeof import("../../Utils/Discord/threadRoleMembers");
    const snap = getFreshMemberIdSnapshot(guild.id);
    if (snap?.byRole && secondaryRole?.id) {
      const ids = snap.byRole.get(String(secondaryRole.id)) || [];
      if (Array.isArray(ids) && ids.length) {
        const have = new Set(secondaryRoleMembers.map((m?: any) => String(m.id)));
        const missing = ids.filter((id?) => id && !have.has(String(id))).slice(0, lite ? 12 : 40);
        for (const id of missing) {
          const m = guild.members.cache.get(String(id));
          if (m && !m.user?.bot && m.roles?.cache?.has?.(secondaryRole.id)) secondaryRoleMembers.push(m);
        }
        const stillMissing = missing.filter((id?) => !guild.members.cache.has(String(id))).slice(0, lite ? 8 : 16);
        if (stillMissing.length) {
          await Promise.all(
            stillMissing.map((id?) => guild.members.fetch({ user: String(id), force: false }).catch(() => null)),
          );
          for (const id of stillMissing) {
            const m = guild.members.cache.get(String(id));
            if (
              m &&
              !m.user?.bot &&
              m.roles?.cache?.has?.(secondaryRole.id) &&
              !secondaryRoleMembers.some((x?: any) => String(x.id) === String(id))
            ) {
              secondaryRoleMembers.push(m);
            }
          }
        }
      }
    }
  } catch {
      }
  const secondaryRoleSharedMembers = secondaryRoleMembers
    .map((member?: any) => mapSharedMember(member, String(member.id || member.user?.id || "") === ownerSid))
    .filter((member?) => member.id)
    .sort(sortSharedMembers)
    .slice(0, 60);
  if (ownerSid && secondaryRole && !secondaryRoleSharedMembers.some((m?) => m.id === ownerSid)) {
    const ownerMember =
      guild.members.cache.get(ownerSid) ||
      (await guild.members.fetch({ user: ownerSid, force: false }).catch(() => null));
    if (ownerMember && !ownerMember.user?.bot) {
      secondaryRoleSharedMembers.unshift(mapSharedMember(ownerMember, true));
    } else {
      secondaryRoleSharedMembers.unshift({ id: ownerSid, username: "", displayName: "Tu", avatarUrl: "", isOwner: true });
    }
  }
  const secondaryRoleSharedCountResolved = secondaryRoleSharedMembers.filter((m?) => !m.isOwner).length;
  let secondaryRoleSharedCount = secondaryRoleSharedCountResolved;
  if (secondaryRole?.members?.size) {
    let fromCache = 0;
    for (const m of secondaryRole.members.values()) {
      if (m?.user?.bot) continue;
      if (String(m.id) === ownerSid) continue;
      fromCache += 1;
    }
    secondaryRoleSharedCount = Math.max(secondaryRoleSharedCount, fromCache);
  }
  try {
    const { getFreshMemberIdSnapshot } = require("../../Utils/Discord/threadRoleMembers") as typeof import("../../Utils/Discord/threadRoleMembers");
    const snap = getFreshMemberIdSnapshot(guild.id);
    if (snap?.byRole && secondaryRole?.id) {
      const ids = snap.byRole.get(String(secondaryRole.id)) || [];
      const fromSnap = ids.filter((id?) => id && String(id) !== ownerSid).length;
      secondaryRoleSharedCount = Math.max(secondaryRoleSharedCount, fromSnap);
    }
  } catch {
      }
    const voiceSharedMeta = countVoiceSharedOverwrites(voice, ownerSid, botSid);
  let voiceSharedCount = voiceSharedMeta.count;
  const voiceSharedMembers = [];
  if (voice?.permissionOverwrites?.cache) {
    const sharedIds = voiceSharedMeta.sharedIds;
    const ownerMember =
      guild.members.cache.get(ownerSid) ||
      (await guild.members.fetch({ user: ownerSid, force: false }).catch(() => null));
    if (ownerMember && !ownerMember.user?.bot) {
      voiceSharedMembers.push(mapSharedMember(ownerMember, true));
    } else if (ownerSid) {
      voiceSharedMembers.push({
        id: ownerSid,
        username: "",
        displayName: "Tu",
        avatarUrl: "",
        isOwner: true,
      });
    }
    const sharedSlice = sharedIds.slice(0, lite ? 12 : 59);
    if (!lite) {
      const missing = sharedSlice.filter((sid?) => !guild.members.cache.has(sid)).slice(0, 16);
      if (missing.length) {
        await Promise.all(
          missing.map((sid?) => guild.members.fetch({ user: sid, force: false }).catch(() => null)),
        );
      }
    } else {
      const missing = sharedSlice.filter((sid?) => !guild.members.cache.has(sid)).slice(0, 8);
      if (missing.length) {
        await Promise.all(
          missing.map((sid?) => guild.members.fetch({ user: sid, force: false }).catch(() => null)),
        );
      }
    }
    for (const sid of sharedSlice) {
      const member = guild.members.cache.get(sid);
      if (!member || member.user?.bot) continue;
      voiceSharedMembers.push(mapSharedMember(member, false));
    }
    voiceSharedMembers.sort(sortSharedMembers);
  }

  const primaryColors = roleHexPair(role);
  const secondaryColors = roleHexPair(secondaryRole);

  return {
    expiresAt: doc?.expiresAt ? new Date(doc.expiresAt).toISOString() : "",
    role: role
      ? {
          id: String(role.id),
          name: String(role.name || "Ruolo personalizzato"),
          color: primaryColors.color,
          color2: primaryColors.color2,
          colorMode: primaryColors.colorMode || "solid",
          emoji: String(role.unicodeEmoji || "").trim(),
          ...(() => {
            const ic = discordRoleIconUrl(role, { size: 128 });
            return { iconUrl: ic.iconUrl, iconAnimated: ic.iconAnimated };
          })(),
          createdAt: entityCreatedAtIso(role),
          memberCount: roleSharedCount,
          sharedMembers: roleSharedMembers,
        }
      : null,
    secondaryRole: secondaryRole
      ? {
          id: String(secondaryRole.id),
          name: String(secondaryRole.name || "Ruolo personalizzato secondario"),
          color: secondaryColors.color,
          color2: secondaryColors.color2,
          colorMode: secondaryColors.colorMode || "solid",
          emoji: String(secondaryRole.unicodeEmoji || "").trim(),
          ...(() => {
            const ic = discordRoleIconUrl(secondaryRole, { size: 128 });
            return { iconUrl: ic.iconUrl, iconAnimated: ic.iconAnimated };
          })(),
          createdAt: entityCreatedAtIso(secondaryRole),
          memberCount: secondaryRoleSharedCount,
          sharedMembers: secondaryRoleSharedMembers,
        }
      : null,
    voice: voice
      ? {
          id: String(voice.id || ""),
          name: String(voice.name || "Canale vocale privato"),
          emoji: String(doc?.customVocEmoji || "").trim(),
          createdAt: entityCreatedAtIso(voice),
          memberCount: voiceSharedCount,
          sharedMembers: voiceSharedMembers,
        }
      : null,
  };
}

export = { buildCustomProfileData };
