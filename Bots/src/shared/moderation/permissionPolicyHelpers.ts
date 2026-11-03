/**
 * Helper comuni per permissions.json (ruoli/canali/lookup).
 * I bot Vinili-specific (zone staff/thread) restano nei perm* locali.
 */
function createPermissionPolicyHelpers(options: Record<string, any> = {}) {
  const IDs = options.ids || {};
  const transformRoleId =
    typeof options.transformRoleId === "function" ? options.transformRoleId : (id?) => id;

  function resolveRoleReference(value?) {
    if (value == null) return null;
    const raw = String(value).trim();
    if (!raw) return null;
    if (/^\d{16,22}$/.test(raw)) return transformRoleId(raw) || raw;

    let key = raw;
    if (key.startsWith("ids.roles.")) key = key.slice("ids.roles.".length);
    else if (key.startsWith("roles.")) key = key.slice("roles.".length);

    const table = IDs?.roles;
    if (!table || typeof table !== "object") return null;
    let resolved = null;
    if (table[key] != null && String(table[key]).trim() !== "") resolved = String(table[key]);
    else {
      const lower = String(key).toLowerCase();
      for (const k of Object.keys(table)) {
        if (String(k).toLowerCase() === lower) {
          const v = table[k];
          if (v != null && String(v).trim() !== "") {
            resolved = String(v);
            break;
          }
        }
      }
    }
    if (!resolved) return null;
    return transformRoleId(resolved) || resolved;
  }

  function normalizeRoleList(roleIds?) {
    if (!Array.isArray(roleIds)) return roleIds;
    return roleIds.map((value?) => resolveRoleReference(value)).filter(Boolean);
  }

  function asRequiredRoles(roles?) {
    if (roles == null) return null;
    const list = normalizeRoleList(Array.isArray(roles) ? roles : [roles]);
    return Array.isArray(list) && list.length ? list : null;
  }

  function resolveChannelReference(value?) {
    if (value == null) return null;
    const raw = String(value).trim();
    if (!raw) return null;
    if (/^\d{16,22}$/.test(raw)) return raw;

    let key = raw;
    if (key.startsWith("ids.channels.")) key = key.slice("ids.channels.".length);
    else if (key.startsWith("channels.")) key = key.slice("channels.".length);

    const resolved = IDs?.channels?.[key];
    return resolved ? String(resolved) : null;
  }

  function normalizeChannelList(channelIds?) {
    if (!Array.isArray(channelIds)) return channelIds;
    return channelIds.map((value?) => resolveChannelReference(value)).filter(Boolean);
  }

  function channelMatchesPolicyChannelList(channel?, policyIds?) {
    const ids = (Array.isArray(policyIds) ? policyIds : []).map(String).filter(Boolean);
    if (!ids.length) return false;
    const ch = channel;
    if (!ch?.id) return false;
    if (ids.includes(String(ch.id))) return true;
    if (typeof ch.isThread === "function" && ch.isThread()) {
      const parent = String(ch.parentId || "");
      return Boolean(parent && ids.includes(parent));
    }
    return false;
  }

  function resolveCommandChannelPolicy(data?, keys?) {
    const map = data?.channels;
    if (!map || typeof map !== "object") return null;
    for (const key of keys || []) {
      if (!Object.prototype.hasOwnProperty.call(map, key)) continue;
      const normalized = normalizeChannelList(map[key]);
      if (Array.isArray(normalized)) return normalized;
    }
    return null;
  }

  function resolvePrefixCommandChannels(data?, commandName?, subcommandName = null) {
    const cmd = data?.prefix?.[commandName];
    if (!cmd || typeof cmd !== "object") return null;
    const subcommands = cmd.subcommands || {};
    if (
      subcommandName &&
      subcommands[subcommandName] &&
      typeof subcommands[subcommandName] === "object" &&
      Array.isArray(subcommands[subcommandName].channels)
    ) {
      return normalizeChannelList(subcommands[subcommandName].channels);
    }
    if (Array.isArray(cmd.channels)) return normalizeChannelList(cmd.channels);
    return null;
  }

  function buildSlashLookupKeys(commandName?, groupName?, subcommandName?) {
    const command = String(commandName || "").trim().toLowerCase();
    const group = String(groupName || "").trim().toLowerCase();
    const sub = String(subcommandName || "").trim().toLowerCase();
    const out = [];
    if (!command) return out;
    if (group && sub) {
      out.push(`${command}.${group}.${sub}`);
      out.push(`${command}.${group}_${sub}`);
      out.push(`${command}.${group}-${sub}`);
    }
    if (sub) out.push(`${command}.${sub}`);
    out.push(command);
    return out;
  }

  function buildPrefixLookupKeys(commandName?, subcommandName?) {
    const command = String(commandName || "").trim().toLowerCase();
    const sub = String(subcommandName || "").trim().toLowerCase();
    const out = [];
    if (!command) return out;
    if (sub) out.push(`${command}.${sub}`);
    out.push(command);
    return out;
  }

  function collectMemberRoleIds(member?) {
    if (!member) return new Set();
    const ids = new Set();
    if (member?.roles?.cache && typeof member.roles.cache.forEach === "function") {
      member.roles.cache.forEach((_?, roleId?) => ids.add(String(roleId)));
    }
    if (Array.isArray(member?.roles)) {
      for (const roleId of member.roles) {
        if (roleId) ids.add(String(roleId));
      }
    }
    if (Array.isArray(member?._roles)) {
      for (const roleId of member._roles) {
        if (roleId) ids.add(String(roleId));
      }
    }
    return ids;
  }

  function hasAnyRole(member?, roleIds?) {
    const normalized = normalizeRoleList(roleIds);
    if (!Array.isArray(normalized)) return true;
    if (normalized.length === 0) return false;
    const memberRoleIds = collectMemberRoleIds(member);
    if (!memberRoleIds.size) return false;
    return normalized.some((roleId?) => memberRoleIds.has(String(roleId)));
  }

  function resolveSlashRoles(data?, commandName?, groupName?, subcommandName?) {
    const cmd = data?.slash?.[commandName];
    if (!cmd) return null;
    if (Array.isArray(cmd)) return normalizeRoleList(cmd);
    if (typeof cmd !== "object") return null;
    const subcommands = cmd.subcommands || {};
    if (groupName && subcommandName) {
      const key = `${groupName}.${subcommandName}`;
      if (Array.isArray(subcommands[key])) return normalizeRoleList(subcommands[key]);
    }
    if (subcommandName && Array.isArray(subcommands[subcommandName])) {
      return normalizeRoleList(subcommands[subcommandName]);
    }
    if (Array.isArray(cmd.roles)) return normalizeRoleList(cmd.roles);
    if (typeof cmd.roles === "string") {
      const resolved = resolveRoleReference(cmd.roles);
      return resolved ? [resolved] : [];
    }
    return null;
  }

  function resolvePrefixRoles(data?, commandName?, subcommandName = null) {
    const cmd = data?.prefix?.[commandName];
    if (!cmd) return null;
    if (Array.isArray(cmd)) return normalizeRoleList(cmd);
    if (typeof cmd !== "object") return null;
    const subcommands = cmd.subcommands || {};
    if (subcommandName && Array.isArray(subcommands[subcommandName])) {
      return normalizeRoleList(subcommands[subcommandName]);
    }
    if (Array.isArray(cmd.roles)) return normalizeRoleList(cmd.roles);
    if (typeof cmd.roles === "string") {
      const resolved = resolveRoleReference(cmd.roles);
      return resolved ? [resolved] : [];
    }
    return null;
  }

  function resolveComponentPolicy(map?, customId?) {
    if (!map || typeof map !== "object") return null;
    if (Object.prototype.hasOwnProperty.call(map, customId)) return map[customId];
    const wildcardKeys = Object.keys(map)
      .filter((key?) => key.endsWith("*"))
      .sort((a?, b?) => b.length - a.length);
    for (const key of wildcardKeys) {
      const prefix = key.slice(0, -1);
      if (customId.startsWith(prefix)) return map[key];
    }
    return null;
  }

  function normalizeComponentPolicy(policy?) {
    if (policy == null) return null;
    if (typeof policy === "string") {
      const resolved = resolveRoleReference(policy);
      return { roles: resolved ? [resolved] : [] };
    }
    if (Array.isArray(policy)) return { roles: normalizeRoleList(policy) };
    if (typeof policy === "object") {
      let roles = null;
      if (Array.isArray(policy.roles)) roles = normalizeRoleList(policy.roles);
      else if (typeof policy.roles === "string") {
        const resolved = resolveRoleReference(policy.roles);
        roles = resolved ? [resolved] : [];
      }
      const ownerSegment = Number.isFinite(Number.parseInt(policy.ownerSegment, 10))
        ? Number.parseInt(policy.ownerSegment, 10)
        : null;
      return {
        roles,
        ownerSegment,
        ownerSeparator:
          typeof policy.ownerSeparator === "string" && policy.ownerSeparator
            ? policy.ownerSeparator
            : ":",
        ownerFromMessageMention: Boolean(policy.ownerFromMessageMention),
      };
    }
    return null;
  }

  return {
    resolveRoleReference,
    normalizeRoleList,
    asRequiredRoles,
    resolveChannelReference,
    normalizeChannelList,
    channelMatchesPolicyChannelList,
    resolveCommandChannelPolicy,
    resolvePrefixCommandChannels,
    buildSlashLookupKeys,
    buildPrefixLookupKeys,
    collectMemberRoleIds,
    hasAnyRole,
    resolveSlashRoles,
    resolvePrefixRoles,
    resolveComponentPolicy,
    normalizeComponentPolicy,
  };
}

export = { createPermissionPolicyHelpers };
