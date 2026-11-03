/** Vocali pubbliche: permessi dei canali creati e della lobby. */
const { PermissionsBitField, OverwriteType } = require("discord.js") as typeof import("discord.js");
const IDs: any = require("../../Config/ids") as typeof import("../../Config/ids");

const HUB_LOBBY_SPEAK_FLAGS = [
  PermissionsBitField.Flags.Speak,
  PermissionsBitField.Flags.UseVAD,
  PermissionsBitField.Flags.Stream,
  PermissionsBitField.Flags.UseEmbeddedActivities,
  PermissionsBitField.Flags.UseExternalApps,
];
const HUB_SPAWN_MEMBER_TEXT_FLAGS = [PermissionsBitField.Flags.SendMessages];

function copyPermissionOverwrites(channel?) {
  const cache = channel.permissionOverwrites?.cache;
  if (!cache) return [];
  const entries = typeof cache.values === "function" ? [...cache.values()] : [];
  return entries.map((overwrite?) => ({
    id: overwrite.id,
    type: overwrite.type,
    allow: overwrite.allow,
    deny: overwrite.deny,
  }));
}

function hubLobbyRoleIds(guild?) {
  const ids = new Set([String(guild.roles.everyone.id)]);
  const memberRoleId = String(IDs.roles?.Member || "").trim();
  if (memberRoleId) ids.add(memberRoleId);
  return [...ids];
}

function mergeOverwriteFlags(overwrite?, flags?, allow?) {
  const allowBits = new PermissionsBitField(overwrite.allow?.bitfield ?? overwrite.allow ?? 0n);
  const denyBits = new PermissionsBitField(overwrite.deny?.bitfield ?? overwrite.deny ?? 0n);
  for (const flag of flags) {
    if (allow) {
      denyBits.remove(flag);
      allowBits.add(flag);
    } else {
      allowBits.remove(flag);
      denyBits.add(flag);
    }
  }
  return {
    id: overwrite.id,
    type: overwrite.type,
    allow: allowBits.bitfield,
    deny: denyBits.bitfield,
  };
}

function mergeOverwriteSpeak(overwrite?, allowSpeak?) {
  return mergeOverwriteFlags(overwrite, HUB_LOBBY_SPEAK_FLAGS, allowSpeak);
}

function mergeSpawnOverwriteForRole(overwrite?, lobbyRoles?) {
  const id = String(overwrite.id);
  let patched = lobbyRoles.has(id) ? mergeOverwriteSpeak(overwrite, true) : overwrite;
  const memberRoleId = String(IDs.roles?.Member || "").trim();
  if (memberRoleId && id === memberRoleId) {
    patched = mergeOverwriteFlags(patched, HUB_SPAWN_MEMBER_TEXT_FLAGS, true);
  }
  return patched;
}

async function ensureSpawnedChannelMemberTextAccess(channel?, guild?) {
  if (!channel?.permissionOverwrites?.cache || !channel.manageable) return;
  const patch = {
    SendMessages: true,
    UseEmbeddedActivities: true,
    UseExternalApps: true,
  };
  const targets = [];
  const memberRoleId = String(IDs.roles?.Member || "").trim();
  if (memberRoleId) targets.push(memberRoleId);
  const everyoneId = String(guild?.roles?.everyone?.id || "").trim();
  if (everyoneId) targets.push(everyoneId);
  for (const roleId of targets) {
    const existing = channel.permissionOverwrites.cache.get(roleId);
    if (existing) {
      await channel.permissionOverwrites.edit(roleId, patch).catch((err?) => {
        global.logger?.warn?.("[publicVoiceHub] spawn activity/text edit failed:", channel.id, err?.message || err);
      });
      continue;
    }
    if (roleId === memberRoleId) {
      await channel.permissionOverwrites
        .create(roleId, { type: OverwriteType.Role, ...patch })
        .catch((err?) => {
          global.logger?.warn?.("[publicVoiceHub] spawn activity/text create failed:", channel.id, err?.message || err);
        });
    }
  }
}

function buildSpawnPermissionOverwrites(hubChannel?, guild?) {
  const lobbyRoles = new Set(hubLobbyRoleIds(guild));
  const memberRoleId = String(IDs.roles?.Member || "").trim();
  const byId = new Map();
  for (const overwrite of copyPermissionOverwrites(hubChannel)) {
    byId.set(String(overwrite.id), overwrite);
  }
  const result = [];
  for (const overwrite of byId.values()) {
    result.push(mergeSpawnOverwriteForRole(overwrite, lobbyRoles));
  }
  for (const roleId of lobbyRoles) {
    if (byId.has(roleId)) continue;
    let entry = {
      id: roleId,
      type: OverwriteType.Role,
      allow:
        PermissionsBitField.Flags.Speak |
        PermissionsBitField.Flags.UseVAD |
        PermissionsBitField.Flags.Stream |
        PermissionsBitField.Flags.UseEmbeddedActivities |
        PermissionsBitField.Flags.UseExternalApps,
      deny: 0n,
    };
    if (memberRoleId && roleId === memberRoleId) {
      entry = mergeOverwriteFlags(entry, HUB_SPAWN_MEMBER_TEXT_FLAGS, true);
    }
    result.push(entry);
  }
  return result;
}

async function ensureHubLobbySpeakDenied(hubChannel?, guild?) {
  if (!hubChannel?.permissionOverwrites || !hubChannel.manageable) return;
  for (const roleId of hubLobbyRoleIds(guild)) {
    const existing = hubChannel.permissionOverwrites.cache.get(roleId);
    const patch = {
      Speak: false,
      UseVAD: false,
      Stream: false,
      UseEmbeddedActivities: false,
      UseExternalApps: false,
      Connect: true,
      ViewChannel: true,
    };
    if (existing) {
      // Anche se Speak è già negato, forza Connect/View (lobby join).
      await hubChannel.permissionOverwrites.edit(roleId, patch).catch((err?) => {
        global.logger?.warn?.("[publicVoiceHub] hub speak deny edit failed:", hubChannel.id, roleId, err?.message || err);
      });
      continue;
    }
    await hubChannel.permissionOverwrites
      .create(roleId, { type: OverwriteType.Role, ...patch })
      .catch((err?) => {
        global.logger?.warn?.("[publicVoiceHub] hub speak deny create failed:", hubChannel.id, roleId, err?.message || err);
      });
  }
}

export = { ensureSpawnedChannelMemberTextAccess, buildSpawnPermissionOverwrites, ensureHubLobbySpeakDenied };
