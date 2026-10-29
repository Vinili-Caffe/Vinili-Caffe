const { Routes } = require("discord.js") as typeof import("discord.js");
const axios = require("axios") as typeof import("axios").default;
const { assertDashboardHighStaffAccess } = require("./siteDashboardApi") as typeof import("./siteDashboardApi");
const {
  normalizeSnowflake,
  listBotUsageBlacklist,
  addUserBotUsageBlacklist,
  removeUserBotUsageBlacklist,
  addGuildBotUsageBlacklist,
  patchGuildBotUsageBlacklistMeta,
  removeGuildBotUsageBlacklist,
  leaveGuildIfPresent,
} = require("../../Services/Moderation/botUsageBlacklistService") as typeof import("../../Services/Moderation/botUsageBlacklistService");
const { isViniliProtectedGuild, normalizeGuildId } = require("../../MultiGuild/core/viniliProtectedGuilds") as typeof import("../../MultiGuild/core/viniliProtectedGuilds");

function fail(status?, error?, message?) {
  return { ok: false, status, error, message };
}

function reasonMessage(reason?) {
  const map = {
    invalid_id: "ID non valido.",
    invalid_kind: "Tipo non valido: usa user o guild.",
    protected_guild: "I server Vinili protetti non possono essere messi in blacklist.",
    persist_failed: "Salvataggio non riuscito. Riprova.",
    not_found: "Voce non presente in blacklist.",
  };
  return map[String(reason || "")] || "Operazione non riuscita.";
}

function parseKind(raw?) {
  const k = String(raw || "").trim().toLowerCase();
  if (k === "user" || k === "users") return "user";
  if (k === "guild" || k === "guilds" || k === "server" || k === "servers") return "guild";
  return "";
}

function isUsableGuildDisplayName(name?) {
  const n = String(name || "").trim();
  if (!n) return false;
  if (/^(server\s+sconosciuto|partner|unknown\s+server)$/i.test(n)) return false;
  return true;
}

function guildIconUrl(guild?) {
  const id = String(guild?.id || "").trim();
  const icon = String(guild?.icon || "").trim();
  if (!id || !icon) {
    if (typeof guild?.iconURL === "function") {
      try {
        return guild.iconURL({ size: 64 }) || null;
      } catch {
        return null;
      }
    }
    return null;
  }
  const ext = icon.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/icons/${id}/${icon}.${ext}?size=64`;
}

function iconUrlFromHash(guildId?, iconHash?) {
  const id = String(guildId || "").trim();
  const icon = String(iconHash || "").trim();
  if (!id || !icon) return null;
  const ext = icon.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/icons/${id}/${icon}.${ext}?size=64`;
}

function userAvatarUrl(user?) {
  const id = String(user?.id || "").trim();
  if (!id) return null;
  if (typeof user?.displayAvatarURL === "function") {
    try {
      return user.displayAvatarURL({ size: 64 }) || null;
    } catch {
          }
  }
  const avatar = String(user?.avatar || "").trim();
  if (!avatar) return `https://cdn.discordapp.com/embed/avatars/${Number(BigInt(id) >> 22n) % 6}.png`;
  const ext = avatar.startsWith("a_") ? "gif" : "png";
  return `https://cdn.discordapp.com/avatars/${id}/${avatar}.${ext}?size=64`;
}

function tenantRegistryName(guildId?) {
  try {
    const { getDynamicGuildRowsCache } = require("../../MultiGuild/core/tenantRegistryStore") as typeof import("../../MultiGuild/core/tenantRegistryStore");
    const rows = getDynamicGuildRowsCache();
    const list = Array.isArray(rows) ? rows : [];
    const hit = list.find((r?) => String(r?.id || r?.guildId || "").trim() === guildId);
    const name = String(hit?.name || hit?.guildName || "").trim();
    return isUsableGuildDisplayName(name) ? name : null;
  } catch {
    return null;
  }
}

async function fetchViewerGuildIndex(accessToken?) {
  const token = String(accessToken || "").trim();
  if (!token) return new Map();
  try {
    const res = await axios.get("https://discord.com/api/v10/users/@me/guilds", {
      headers: { Authorization: `Bearer ${token}` },
      timeout: 8_000,
      validateStatus: () => true,
    });
    if (res.status !== 200 || !Array.isArray(res.data)) return new Map();
    const map = new Map();
    for (const g of res.data) {
      const id = String(g?.id || "").trim();
      if (!/^\d{17,22}$/.test(id)) continue;
      const name = String(g?.name || "").trim();
      map.set(id, {
        name: isUsableGuildDisplayName(name) ? name : null,
        iconUrl: iconUrlFromHash(id, g?.icon),
      });
    }
    return map;
  } catch {
    return new Map();
  }
}

async function fetchGuildPreviewMeta(client?, guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid) return null;
  try {
    if (typeof client?.fetchGuildPreview === "function") {
      const preview = await client.fetchGuildPreview(gid).catch(() => null);
      if (preview) {
        const name = String(preview.name || "").trim();
        return {
          name: isUsableGuildDisplayName(name) ? name : null,
          iconUrl:
            (typeof preview.iconURL === "function" ? preview.iconURL({ size: 64 }) : null) ||
            iconUrlFromHash(gid, preview.icon),
        };
      }
    }
  } catch {
      }
  try {
    const rest = client?.rest || client?._rest;
    if (rest && typeof rest.get === "function") {
      const raw = await rest.get(`/guilds/${gid}/preview`).catch(() => null);
      if (raw?.id || raw?.name) {
        const name = String(raw.name || "").trim();
        return {
          name: isUsableGuildDisplayName(name) ? name : null,
          iconUrl: iconUrlFromHash(gid, raw.icon),
        };
      }
    }
  } catch {
      }
  return null;
}

async function fetchGuildWidgetMeta(guildId?) {
  const gid = String(guildId || "").trim();
  if (!gid) return null;
  try {
    const res = await axios.get(`https://discord.com/api/guilds/${encodeURIComponent(gid)}/widget.json`, {
      timeout: 3_000,
      validateStatus: () => true,
    });
    if (res.status !== 200) return null;
    const name = String(res.data?.name || "").trim();
    return {
      name: isUsableGuildDisplayName(name) ? name : null,
      iconUrl: null,
    };
  } catch {
    return null;
  }
}

async function enrichBotbanEntry(client?, row?, caches: Record<string, any> = {}) {
  const partnerMetaCache = caches.partnerMeta instanceof Map ? caches.partnerMeta : new Map();
  const inviteMetaCache = caches.inviteMeta instanceof Map ? caches.inviteMeta : new Map();
  const viewerGuilds = caches.viewerGuilds instanceof Map ? caches.viewerGuilds : new Map();
  const base = {
    id: String(row?.id || "").trim(),
    type: row?.type === "guild" ? "guild" : "user",
    note: String(row?.note || "").trim(),
    addedBy: String(row?.addedBy || "").trim() || null,
    addedAt: row?.addedAt || null,
    name: null,
    iconUrl: null,
    botPresent: null,
    invite: null,
  };
  if (!base.id) return base;

  if (base.type === "guild") {
    const storedName = String(row?.guildName || "").trim();
    base.name = isUsableGuildDisplayName(storedName) ? storedName : null;
    try {
      const guild =
        client?.guilds?.cache?.get?.(base.id) ||
        (typeof client?.guilds?.fetch === "function"
          ? await client.guilds.fetch(base.id).catch(() => null)
          : null);
      if (guild) {
        const gName = String(guild.name || "").trim();
        if (isUsableGuildDisplayName(gName)) base.name = gName;
        base.iconUrl = guildIconUrl(guild);
        base.botPresent = true;
      } else {
        base.botPresent = false;
      }
    } catch {
      base.botPresent = false;
    }

        if ((!base.name || !base.iconUrl) && viewerGuilds.has(base.id)) {
      const vg = viewerGuilds.get(base.id);
      if (!base.name && vg?.name) base.name = vg.name;
      if (!base.iconUrl && vg?.iconUrl) base.iconUrl = vg.iconUrl;
    }

        if (!base.name || !base.iconUrl) {
      try {
        const {
          extractInviteCode,
          fetchInviteGuildMeta,
          findStoredPartnerMetaForGuildId,
        } = require("../Partner/partnershipBlacklistDisplay") as typeof import("../Partner/partnershipBlacklistDisplay");

        let partner = partnerMetaCache.get(base.id);
        if (partner === undefined) {
          partner = await findStoredPartnerMetaForGuildId(base.id).catch(() => null);
          partnerMetaCache.set(base.id, partner || null);
        }
        if (partner) {
          if (!base.name && isUsableGuildDisplayName(partner.guildName)) base.name = partner.guildName;
          if (partner.invite) base.invite = partner.invite;
        }

        if (!base.name) {
          const regName = tenantRegistryName(base.id);
          if (regName) base.name = regName;
        }

        if (!base.name || !base.iconUrl) {
          const preview = await fetchGuildPreviewMeta(client, base.id);
          if (preview) {
            if (!base.name && preview.name) base.name = preview.name;
            if (!base.iconUrl && preview.iconUrl) base.iconUrl = preview.iconUrl;
          }
        }

        if (!base.name) {
          const widget = await fetchGuildWidgetMeta(base.id);
          if (widget?.name) base.name = widget.name;
        }

        const invite = String(base.invite || partner?.invite || "").trim();
        if (invite && (!base.name || !base.iconUrl)) {
          const cacheKey = (extractInviteCode(invite) || invite).toLowerCase();
          let meta = inviteMetaCache.get(cacheKey);
          if (meta === undefined) {
            meta = await fetchInviteGuildMeta(invite, {
              client,
              timeoutMs: 2_500,
              skipIfRateLimited: true,
            }).catch(() => null);
            inviteMetaCache.set(cacheKey, meta || null);
          }
          if (meta) {
            if (!base.name && isUsableGuildDisplayName(meta.guildName)) base.name = meta.guildName;
            if (!base.iconUrl && meta.iconUrl) base.iconUrl = meta.iconUrl;
            if (meta.invite) base.invite = meta.invite;
          }
        }
      } catch {
              }
    }

        if (base.name && !isUsableGuildDisplayName(row?.guildName)) {
      void patchGuildBotUsageBlacklistMeta(base.id, { guildName: base.name }).catch(() => null);
    }
    return base;
  }

  try {
    const rest = client?._rest || client?.rest;
    if (rest) {
      const raw = await rest.get(Routes.user(base.id)).catch(() => null);
      if (raw?.id) {
        base.name = String(raw.global_name || raw.username || "").trim() || null;
        base.iconUrl = userAvatarUrl(raw);
      }
    }
  } catch {
      }
  return base;
}

async function leaveGuildForBotban(client?, guildId?) {
  const gid = normalizeGuildId(guildId) || normalizeSnowflake(guildId);
  if (!gid) return { ok: false, reason: "invalid_id" };
  if (isViniliProtectedGuild(gid)) return { ok: false, reason: "protected_guild" };

  const viaHelper = await leaveGuildIfPresent(client, gid).catch(() => null);
  if (viaHelper?.left) return viaHelper;
  if (viaHelper?.reason === "protected_guild") return viaHelper;

  const rest = client?._rest || client?.rest;
  if (!rest) return viaHelper || { ok: true, left: false, reason: "not_in_guild", id: gid };
  try {
    const path =
      typeof Routes.userGuild === "function" ? Routes.userGuild(gid) : `/users/@me/guilds/${gid}`;
    await rest.delete(path);
    try {
      const { unregisterTenantGuild } = require("../../MultiGuild/core/tenantRegistryStore") as typeof import("../../MultiGuild/core/tenantRegistryStore");
      await unregisterTenantGuild(gid).catch(() => null);
    } catch (_) {}
    return { ok: true, left: true, id: gid };
  } catch (err) {
    const status = Number(err?.status || err?.httpStatus || 0);
    if (status === 404) return { ok: true, left: false, reason: "not_in_guild", id: gid };
    return viaHelper || { ok: true, left: false, reason: "not_in_guild", id: gid };
  }
}

async function listDashboardBotban(client?, accessToken?, query: Record<string, any> = {}) {
  const gate = await assertDashboardHighStaffAccess(client, accessToken);
  if (!gate.ok) return gate;

  const kindRaw = String(query?.kind || "all").trim().toLowerCase();
  const kind =
    kindRaw === "user" || kindRaw === "users"
      ? "users"
      : kindRaw === "guild" || kindRaw === "guilds" || kindRaw === "server" || kindRaw === "servers"
        ? "servers"
        : "all";

  const rows = await listBotUsageBlacklist(kind);
  const viewerGuilds = await fetchViewerGuildIndex(accessToken);
  const caches = { partnerMeta: new Map(), inviteMeta: new Map(), viewerGuilds };
  const entries = await Promise.all(rows.map((row?) => enrichBotbanEntry(client, row, caches)));

  return {
    ok: true,
    status: 200,
    kind,
    users: entries.filter((e?) => e.type === "user").length,
    servers: entries.filter((e?) => e.type === "guild").length,
    entries,
  };
}

async function addDashboardBotban(client?, accessToken?, body: Record<string, any> = {}) {
  const gate = await assertDashboardHighStaffAccess(client, accessToken);
  if (!gate.ok) return gate;

  const payload = body && typeof body === "object" ? body : {};
  const kind = parseKind(payload.kind || payload.type);
  if (!kind) return fail(400, "invalid_kind", reasonMessage("invalid_kind"));

  const id = normalizeSnowflake(payload.id || payload.target || payload.userId || payload.guildId);
  if (!id) return fail(400, "invalid_id", reasonMessage("invalid_id"));
  const note = String(payload.note || "").trim().slice(0, 500);
  const leave = payload.leave !== false;

  let result;
  if (kind === "user") {
    result = await addUserBotUsageBlacklist(id, gate.userId, note);
  } else {
    if (isViniliProtectedGuild(id)) {
      return fail(400, "protected_guild", reasonMessage("protected_guild"));
    }
    let guildName = String(payload.guildName || "").trim().slice(0, 100) || null;
    if (!isUsableGuildDisplayName(guildName)) guildName = null;
    try {
      const guild =
        client?.guilds?.cache?.get?.(id) ||
        (typeof client?.guilds?.fetch === "function" ? await client.guilds.fetch(id).catch(() => null) : null);
      if (guild?.name && isUsableGuildDisplayName(guild.name)) {
        guildName = String(guild.name).trim().slice(0, 100) || guildName;
      }
    } catch (_) {}
    if (!guildName) {
      try {
        const { findStoredPartnerMetaForGuildId } = require("../Partner/partnershipBlacklistDisplay") as typeof import("../Partner/partnershipBlacklistDisplay");
        const partner = await findStoredPartnerMetaForGuildId(id).catch(() => null);
        if (partner?.guildName && isUsableGuildDisplayName(partner.guildName)) {
          guildName = partner.guildName;
        }
      } catch (_) {}
    }
    if (!guildName) {
      const viewerGuilds = await fetchViewerGuildIndex(accessToken);
      const vg = viewerGuilds.get(id);
      if (vg?.name) guildName = vg.name;
    }
    if (!guildName) {
      const preview = await fetchGuildPreviewMeta(client, id);
      if (preview?.name) guildName = preview.name;
    }
    result = await addGuildBotUsageBlacklist(id, gate.userId, note, { guildName });
    if (result?.ok && leave) {
      const left = await leaveGuildForBotban(client, id).catch(() => null);
      if (!guildName && left?.guildName) {
        await patchGuildBotUsageBlacklistMeta(id, { guildName: left.guildName }).catch(() => null);
      }
    }
  }

  if (!result?.ok) {
    return fail(400, result?.reason || "persist_failed", reasonMessage(result?.reason));
  }

  const list = await listDashboardBotban(client, accessToken, { kind: "all" });
  if (!list.ok) return list;
  return {
    ...list,
    added: {
      id: result.id,
      type: result.type,
    },
  };
}

async function removeDashboardBotban(client?, accessToken?, kindRaw?, idRaw?) {
  const gate = await assertDashboardHighStaffAccess(client, accessToken);
  if (!gate.ok) return gate;

  const kind = parseKind(kindRaw);
  if (!kind) return fail(400, "invalid_kind", reasonMessage("invalid_kind"));
  const id = normalizeSnowflake(idRaw);
  if (!id) return fail(400, "invalid_id", reasonMessage("invalid_id"));

  const result =
    kind === "user" ? await removeUserBotUsageBlacklist(id) : await removeGuildBotUsageBlacklist(id);
  if (!result?.ok) {
    return fail(400, result?.reason || "persist_failed", reasonMessage(result?.reason));
  }
  if (!result.deleted) {
    return fail(404, "not_found", reasonMessage("not_found"));
  }

  const list = await listDashboardBotban(client, accessToken, { kind: "all" });
  if (!list.ok) return list;
  return {
    ...list,
    removed: {
      id: result.id,
      type: result.type,
    },
  };
}

export = {
  listDashboardBotban,
  addDashboardBotban,
  removeDashboardBotban,
};
