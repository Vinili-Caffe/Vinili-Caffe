/** Client REST del sito: fetch/create/edit ruoli guild. */
const { Routes, PermissionsBitField } = require("discord.js") as typeof import("discord.js");
const { wrapRole, colorValueToInt, buildRoleColorsApiBody, bufferToRoleIconDataUri } = require("./restUserRole") as typeof import("./restUserRole");
const { enrichGuildRoles } = require("./restGuildEnrich") as typeof import("./restGuildEnrich");

function attachGuildRolesApi(guild?, client?) {
  guild.roles.fetch = async (roleId?, opts: Record<string, any> = {}) => {
    const force = Boolean(opts && opts.force);
    if (roleId && !force) {
      const existing = guild.roles.cache.get(String(roleId));
      if (existing) return existing;
    }
    if (roleId && force && client._rest) {
      try {
        const raw = await client._rest.get(Routes.guildRole(guild.id, String(roleId)));
        const prev: any = guild.roles.cache.get(String(roleId));
        const wrapped = wrapRole(raw, guild, prev?.members || null);
        if (wrapped?.id) guild.roles.cache.set(wrapped.id, wrapped);
        return wrapped;
      } catch (_) {
        /* fall through to full enrich */
      }
    }
    await enrichGuildRoles(client._rest, guild);
    return roleId ? guild.roles.cache.get(String(roleId)) || null : guild.roles.cache;
  };

  (guild.roles as any).create = async (options: Record<string, any> = {}) => {
    const rest = client._rest;
    if (!rest) throw new Error("REST unavailable");
    const body: Record<string, any> = {};
    if (options.name != null) body.name = String(options.name).slice(0, 100);
    if (options.hoist != null) body.hoist = Boolean(options.hoist);
    if (options.mentionable != null) body.mentionable = Boolean(options.mentionable);
    if (Object.prototype.hasOwnProperty.call(options, "unicodeEmoji") || Object.prototype.hasOwnProperty.call(options, "unicode_emoji")) {
      const ue = options.unicodeEmoji !== undefined ? options.unicodeEmoji : options.unicode_emoji;
      body.unicode_emoji = ue == null || ue === "" ? null : String(ue);
    }
    if (Object.prototype.hasOwnProperty.call(options, "icon")) {
      if (options.icon == null) body.icon = null;
      else if (Buffer.isBuffer(options.icon) || options.icon instanceof Uint8Array) {
        body.icon = await bufferToRoleIconDataUri(options.icon);
      } else if (typeof options.icon === "string") {
        body.icon = options.icon;
      }
    }
    if (options.permissions != null) {
      try {
        body.permissions = String(PermissionsBitField.resolve(options.permissions));
      } catch (_) {}
    }
    if (options.colors && typeof options.colors === "object") {
      const colorsBody = buildRoleColorsApiBody(options.colors);
      if (colorsBody) body.colors = colorsBody;
    } else if (options.color != null) {
      const c = colorValueToInt(options.color);
      if (c != null) {
        body.colors = { primary_color: c, secondary_color: null, tertiary_color: null };
      }
    }
    const created = await rest.post(Routes.guildRoles(guild.id), {
      body,
      reason: options.reason ? String(options.reason).slice(0, 512) : undefined,
    });
    const wrapped = wrapRole(created, guild);
    if (wrapped?.id) guild.roles.cache.set(wrapped.id, wrapped);
    if (wrapped && options.position != null && typeof wrapped.setPosition === "function") {
      await wrapped.setPosition(options.position, { reason: options.reason }).catch(() => {});
    }
    return wrapped;
  };

  (guild.roles as any).edit = async (roleId?, payload: Record<string, any> = {}, reason?) => {
    const id = String(roleId?.id || roleId || "").trim();
    if (!id) throw new Error("roleId required");
    let role: any = guild.roles.cache.get(id);
    if (!role || typeof role.edit !== "function") {
      role = await guild.roles.fetch(id);
    }
    if (!role || typeof role.edit !== "function") throw new Error("role_not_found");
    return role.edit(payload, reason);
  };
}

export = { attachGuildRolesApi };
