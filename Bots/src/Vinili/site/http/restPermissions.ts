/** Client REST del sito: calcolo dei permessi. */
const { PermissionsBitField } = require("discord.js") as typeof import("discord.js");

function asCacheMap(seed = []) {
  const map = new Map(seed);
  const api = {
    get: (id?) => map.get(String(id)),
    set: (id?, value?) => map.set(String(id), value),
    has: (id?) => map.has(String(id)),
    delete: (id?) => map.delete(String(id)),
    clear: () => map.clear(),
    get size() {
      return map.size;
    },
    get length() {
      return map.size;
    },
    values: () => map.values(),
    keys: () => map.keys(),
    entries: () => map.entries(),
    [Symbol.iterator]: () => map[Symbol.iterator](),
    forEach: (fn?, thisArg?) => map.forEach(fn, thisArg),
    filter: (fn?) =>
      asCacheMap(
        [...map.values()]
          .filter(fn)
          .map((v?: any) => [String(v?.id || v?.user?.id || ""), v])
          .filter(([id]) => id),
      ),
    find: (fn?) => [...map.values()].find(fn),
    map: (fn?) => [...map.values()].map(fn),
    some: (fn?) => [...map.values()].some(fn),
    every: (fn?) => [...map.values()].every(fn),
    first: () => map.values().next().value ?? null,
    last: () => {
      let out = null;
      for (const value of map.values()) out = value;
      return out;
    },
    at: (index?) => {
      const arr = [...map.values()];
      const i = Number(index);
      if (!Number.isFinite(i)) return null;
      const idx = i < 0 ? arr.length + i : i;
      return idx >= 0 && idx < arr.length ? arr[idx] : null;
    },
  };
  return api;
}

function wrapPermissionBits(raw?) {
  let bits = 0n;
  try {
    bits = BigInt(raw ?? 0);
  } catch {
    bits = 0n;
  }
  return {
    bitfield: bits,
    has: (flag?) => permissionBitsHas(bits, flag),
  };
}

function permissionBitsHas(bits?, flag?) {
  try {
    if (Array.isArray(flag)) return flag.every((f?) => permissionBitsHas(bits, f));
    const f = typeof flag === "bigint" ? flag : BigInt(flag);
    return (bits & f) === f;
  } catch {
    return false;
  }
}

function wrapLivePermissionBits(getBits?) {
  return {
    get bitfield() {
      try {
        return getBits();
      } catch {
        return 0n;
      }
    },
    has: (flag?) => {
      try {
        return permissionBitsHas(getBits(), flag);
      } catch {
        return false;
      }
    },
  };
}

const ADMIN_BIT = (() => {
  try {
    return BigInt(PermissionsBitField.Flags.Administrator);
  } catch {
    return 8n;
  }
})();

function computeMemberGuildPermissionBits(member?, guild?) {
  const g = guild || member?.guild || null;
  if (!member || !g) return 0n;
  const everyone = g.roles?.cache?.get?.(String(g.id));
  let bits = BigInt(everyone?.permissions?.bitfield ?? 0);
  if ((bits & ADMIN_BIT) === ADMIN_BIT) return ~0n;
  const roles = member.roles?.cache;
  if (roles && typeof roles.values === "function") {
    for (const role of roles.values()) {
      bits |= BigInt(role?.permissions?.bitfield ?? 0);
      if ((bits & ADMIN_BIT) === ADMIN_BIT) return ~0n;
    }
  }
  return bits;
}

function computeChannelPermissionBits(channel?, memberOrRole?) {
  if (!channel || !memberOrRole) return 0n;
  const guild = channel.guild || null;
  if (!guild) return 0n;

  const isMember = Boolean(memberOrRole.user || memberOrRole.roles?.cache);
  let bits = 0n;

  if (isMember) {
    bits = computeMemberGuildPermissionBits(memberOrRole, guild);
  } else {
    const everyone = guild.roles?.cache?.get?.(String(guild.id));
    bits = BigInt(everyone?.permissions?.bitfield ?? 0);
    bits |= BigInt(memberOrRole.permissions?.bitfield ?? 0);
  }
  if ((bits & ADMIN_BIT) === ADMIN_BIT) return ~0n;

    let overwriteSource = channel;
  try {
    const isThread = typeof channel.isThread === "function" ? channel.isThread() : [10, 11, 12].includes(Number(channel.type));
    if (isThread && channel.parentId && (!channel.permissionOverwrites?.cache?.size)) {
      const parent = guild.channels?.cache?.get?.(String(channel.parentId));
      if (parent) overwriteSource = parent;
    }
  } catch {
      }

  const overwrites = overwriteSource.permissionOverwrites?.cache;
  if (!overwrites) return bits;

  const applyOw = (ow?) => {
    if (!ow) return;
    bits &= ~BigInt(ow.deny?.bitfield ?? 0);
    bits |= BigInt(ow.allow?.bitfield ?? 0);
  };

  applyOw(overwrites.get?.(String(guild.id)));

  if (isMember) {
    let allow = 0n;
    let deny = 0n;
    const roles = memberOrRole.roles?.cache;
    if (roles && typeof roles.values === "function") {
      for (const role of roles.values()) {
        const ow = overwrites.get?.(String(role.id));
        if (!ow) continue;
        deny |= BigInt(ow.deny?.bitfield ?? 0);
        allow |= BigInt(ow.allow?.bitfield ?? 0);
      }
    }
    bits &= ~deny;
    bits |= allow;
    applyOw(overwrites.get?.(String(memberOrRole.id)));
  } else {
    applyOw(overwrites.get?.(String(memberOrRole.id)));
  }

  return bits;
}

function snowflakeCreatedAt(id?) {
  try {
    const ts = Number((BigInt(String(id)) >> 22n) + 1420070400000n);
    const d = new Date(ts);
    return Number.isFinite(d.getTime()) ? d : null;
  } catch {
    return null;
  }
}

export = { asCacheMap, wrapPermissionBits, wrapLivePermissionBits, computeMemberGuildPermissionBits, computeChannelPermissionBits, snowflakeCreatedAt };
