const { PermissionFlagsBits } = require("discord.js") as typeof import("discord.js");

function normalizeChannelId(channelId?) {
  const id = String(channelId || "").trim();
  return /^\d{5,30}$/.test(id) ? id : "";
}

function resolveGuild(memberOrGuild?) {
  if (!memberOrGuild) return null;
  if (memberOrGuild.channels?.cache) return memberOrGuild;
  return memberOrGuild.guild || null;
}

function resolveMember(memberOrGuild?) {
  if (!memberOrGuild) return null;
  if (typeof memberOrGuild.permissionsFor === "function" && memberOrGuild.guild) return memberOrGuild;
  if (memberOrGuild.roles?.cache && memberOrGuild.guild) return memberOrGuild;
  return null;
}

function resolveChannel(guild?, channelId?) {
  const id = normalizeChannelId(channelId);
  if (!guild || !id) return null;
  return guild.channels?.cache?.get(id) || null;
}

function memberCanViewChannel(memberOrGuild?, channelId?) {
  const id = normalizeChannelId(channelId);
  if (!id) return false;
  const guild = resolveGuild(memberOrGuild);
  const member = resolveMember(memberOrGuild);
  const channel = resolveChannel(guild, id);
  if (!channel) return false;
  if (!member) return true;
  try {
    const perms = channel.permissionsFor(member);
    return Boolean(perms?.has?.(PermissionFlagsBits.ViewChannel));
  } catch {
    return false;
  }
}

function formatVisibleChannelMention(channelId?, memberOrGuild?, fallback = "") {
  const id = normalizeChannelId(channelId);
  if (!id) return fallback;
  if (!memberCanViewChannel(memberOrGuild, id)) return fallback;
  return `<#${id}>`;
}

function filterVisibleChannelIds(channelIds?, memberOrGuild?) {
  const list = Array.isArray(channelIds) ? channelIds : [];
  const out = [];
  const seen = new Set();
  for (const raw of list) {
    const s = String(raw || "").trim();
    if (!s || s.startsWith("__zone:")) continue;
    const id = normalizeChannelId(s);
    if (!id || seen.has(id)) continue;
    if (!memberCanViewChannel(memberOrGuild, id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function formatVisibleChannelMentionsList(channelIds?, memberOrGuild?, { sep = ", ", emptyFallback = "" } = {}) {
  const visible = filterVisibleChannelIds(channelIds, memberOrGuild);
  if (!visible.length) return emptyFallback;
  return visible.map((id?) => `<#${id}>`).join(sep);
}

function scrubInvisibleChannelMentionsInText(text?, memberOrGuild?) {
  const raw = String(text || "");
  if (!raw.includes("<#")) return raw;
  let out = raw.replace(/<#(\d{5,30})>/g, (full?, id?) => {
    return memberCanViewChannel(memberOrGuild, id) ? full : "";
  });
  out = out
    .replace(/\(\s*\)/g, "")
    .replace(/\s{2,}/g, " ")
    .replace(/\s+([.,;:!?])/g, "$1")
    .replace(/\s+$/g, "")
    .trim();
  return out;
}

export = {
  memberCanViewChannel,
  formatVisibleChannelMention,
  filterVisibleChannelIds,
  formatVisibleChannelMentionsList,
  scrubInvisibleChannelMentionsInText,
  normalizeChannelId,
};
