/**
 * Pannelli ruoli in modalità "reazioni".
 *   comportamento "toggle": metti → ruolo, togli → via · "give": metti → ruolo (toglierla non toglie)
 *   "remove": metti → toglie il ruolo
 * Con "un solo ruolo" / limite: le reazioni in più vengono tolte. Con "togli la reazione" il bot la rimuove
 * subito dopo aver dato il ruolo (il pannello resta pulito).
 */
const { Routes } = require("discord.js") as typeof import("discord.js");
const T = require("../core/tenantCommunityTools") as typeof import("../core/tenantCommunityTools");

/* reazioni tolte dal bot stesso: il relativo evento "tolta" va ignorato */
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
  const member = await guild.members.fetch(user.id).catch(() => null);
  if (!member) return null;
  return { guild, message, panel, option, member, key };
}

function manageable(guild?, roleId?: string) {
  const role = guild?.roles?.cache?.get(roleId);
  const me = guild?.members?.me;
  return Boolean(role && me && !role.managed && role.position < me.roles.highest.position && me.permissions?.has?.(268435456n));
}

async function removeUserReaction(guild?, message?, userId?: string, emojiRaw?: string, rawKey?: string) {
  const rest = guild?.client?.rest;
  const api = emojiRaw ? T.emojiForReactionApi(emojiRaw) : "";
  if (!rest || !api) return;
  const tag = `${message.id}:${userId}:${rawKey || T.emojiKey(emojiRaw)}`;
  selfRemoved.add(tag);
  setTimeout(() => selfRemoved.delete(tag), 15_000).unref?.();
  await rest.delete(Routes.channelMessageUserReaction(message.channelId, message.id, api, userId)).catch(() => selfRemoved.delete(tag));
}

async function applyWant(guild?, member?, panel?, want?: Set<string>) {
  for (const o of panel.roles) {
    const has = member.roles.cache.has(o.roleId);
    const should = want.has(o.roleId);
    if (has === should || !manageable(guild, o.roleId)) continue;
    if (should) await member.roles.add(o.roleId, "Pannello ruoli (reazione)").catch(() => null);
    else await member.roles.remove(o.roleId, "Pannello ruoli (reazione)").catch(() => null);
  }
}

async function onReactionAdd(reaction?, user?) {
  const ctx = await resolve(reaction, user);
  if (!ctx) return;
  const { guild, message, panel, option, member, key } = ctx;
  /* reazione che non corrisponde a nessun ruolo: la togliamo per tenere pulito il pannello */
  if (!option) {
    const em = reaction?.emoji;
    const raw = em?.id ? `<${em.animated ? "a" : ""}:${em.name}:${em.id}>` : String(em?.name || "");
    await removeUserReaction(guild, message, user.id, raw, key);
    return;
  }
  const held = new Set<string>([...member.roles.cache.keys()].map(String));
  const denied = T.rolePanelAccessError(panel, held);
  const decision = denied ? { want: held, error: denied } : T.decideRolePanel(panel, held, { type: "click", roleId: option.roleId });
  if (decision.error) {
    await removeUserReaction(guild, message, user.id, option.emoji);
    return;
  }
  await applyWant(guild, member, panel, decision.want);
  /* uno solo / limite: togli le reazioni dei ruoli che non ha più */
  for (const other of panel.roles) {
    if (other.roleId === option.roleId) continue;
    if (!decision.want.has(other.roleId) && held.has(other.roleId)) await removeUserReaction(guild, message, user.id, other.emoji);
  }
  if (panel.clearReaction || panel.behavior === "remove") await removeUserReaction(guild, message, user.id, option.emoji);
}

async function onReactionRemove(reaction?, user?) {
  const ctx = await resolve(reaction, user);
  if (!ctx?.option) return;
  const { guild, message, panel, option, member } = ctx;
  const tag = `${message.id}:${user.id}:${T.emojiKey(option.emoji)}`;
  if (selfRemoved.has(tag)) {
    selfRemoved.delete(tag);
    return;
  }
  if (panel.clearReaction) return; /* con la pulizia automatica togliere la reazione non cambia niente */
  const held = new Set<string>([...member.roles.cache.keys()].map(String));
  if (T.rolePanelAccessError(panel, held)) return;
  const decision = T.decideRolePanel(panel, held, { type: "unclick", roleId: option.roleId });
  await applyWant(guild, member, panel, decision.want);
}

export = { onReactionAdd, onReactionRemove };
