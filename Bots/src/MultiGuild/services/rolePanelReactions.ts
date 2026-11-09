/**
 * Pannelli ruoli in modalità "reazioni": mettere la reazione dà il ruolo, toglierla lo toglie.
 * Con "un solo ruolo" la nuova reazione toglie gli altri ruoli (e le altre reazioni) del pannello.
 */
const { Routes } = require("discord.js") as typeof import("discord.js");
const T = require("../core/tenantCommunityTools") as typeof import("../core/tenantCommunityTools");

/* reazioni tolte dal bot stesso (modalità "uno solo"): non devono togliere il ruolo appena dato */
const selfRemoved = new Set<string>();

function reactionKey(reaction?) {
  const e = reaction?.emoji;
  if (!e) return "";
  return e.id ? String(e.id) : String(e.name || "").replace(/️/g, "");
}

async function resolve(reaction?, user?) {
  if (!user || user.bot) return null;
  if (reaction?.partial) reaction = await reaction.fetch().catch(() => null);
  const message = reaction?.message;
  const guild = message?.guild;
  if (!guild || !message?.id) return null;
  const panels = await T.listRolePanels(guild.id);
  const panel = panels.find((p) => p.mode === "reactions" && p.messageId === String(message.id));
  if (!panel) return null;
  const key = reactionKey(reaction);
  const option = panel.roles.find((o) => T.emojiKey(o.emoji) === key);
  if (!option) return null;
  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) return null;
  return { guild, message, panel, option, member };
}

function manageable(guild?, roleId?: string) {
  const role = guild?.roles?.cache?.get(roleId);
  const me = guild?.members?.me;
  return Boolean(role && me && !role.managed && role.position < me.roles.highest.position && me.permissions?.has?.(268435456n));
}

async function onReactionAdd(reaction?, user?) {
  const ctx = await resolve(reaction, user);
  if (!ctx) return;
  const { guild, message, panel, option, member } = ctx;
  if (!manageable(guild, option.roleId)) return;
  if (!member.roles.cache.has(option.roleId)) await member.roles.add(option.roleId, "Pannello ruoli (reazione)").catch(() => null);
  if (!panel.unique) return;
  const rest = guild.client?.rest;
  for (const other of panel.roles) {
    if (other.roleId === option.roleId) continue;
    if (member.roles.cache.has(other.roleId) && manageable(guild, other.roleId)) {
      await member.roles.remove(other.roleId, "Pannello ruoli (uno solo)").catch(() => null);
    }
    const api = T.emojiForReactionApi(other.emoji);
    if (api && rest) {
      const tag = `${message.id}:${user.id}:${T.emojiKey(other.emoji)}`;
      selfRemoved.add(tag);
      setTimeout(() => selfRemoved.delete(tag), 15_000).unref?.();
      await rest.delete(Routes.channelMessageUserReaction(message.channelId, message.id, api, user.id)).catch(() => selfRemoved.delete(tag));
    }
  }
}

async function onReactionRemove(reaction?, user?) {
  const ctx = await resolve(reaction, user);
  if (!ctx) return;
  const { guild, message, option, member } = ctx;
  const tag = `${message.id}:${user.id}:${T.emojiKey(option.emoji)}`;
  if (selfRemoved.has(tag)) {
    selfRemoved.delete(tag);
    return;
  }
  if (!manageable(guild, option.roleId)) return;
  if (member.roles.cache.has(option.roleId)) await member.roles.remove(option.roleId, "Pannello ruoli (reazione tolta)").catch(() => null);
}

export = { onReactionAdd, onReactionRemove };
