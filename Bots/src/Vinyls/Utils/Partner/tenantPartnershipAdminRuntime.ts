const { t } = require("./tenantPartnershipI18n") as typeof import("./tenantPartnershipI18n");

function formatPingsSummary(pings?, lang = "it") {
  if (!pings?.configured) return t(lang, "pings_false");
  const lines = [];
  if (pings.hereMembers !== null) lines.push(t(lang, "pings_here", { n: pings.hereMembers }));
  if (pings.everyoneMembers !== null) lines.push(t(lang, "pings_everyone", { n: pings.everyoneMembers }));
  if (pings.customRoleId && pings.customRoleMembers !== null) {
    lines.push(t(lang, "pings_customRole", { roleId: pings.customRoleId, n: pings.customRoleMembers }));
  }
  return lines.length ? lines.join("\n") : t(lang, "pings_false");
}

function formatLeaveAction(value?, lang = "it") {
  const action = String(value || "")
    .trim()
    .toLowerCase();
  if (action === "delete" || action === "delete_5m" || action === "deleter") return t(lang, "leave_delete");
  if (action === "warn" || action === "warning") return t(lang, "leave_warn");
  return t(lang, "leave_null");
}

function channelLine(channelId?, guild?, viewer = null) {
  if (!channelId) return "—";
  if (viewer) {
    const { formatVisibleChannelMention } = require("../Discord/visibleChannelMentions") as typeof import("../Discord/visibleChannelMentions");
    const mention = formatVisibleChannelMention(channelId, viewer, "");
    if (!mention) return "—";
    return mention;
  }
  const ch = guild?.channels?.cache?.get(channelId);
  return ch ? `<#${channelId}>` : `\`${channelId}\``;
}

function roleLine(roleId?, guild?) {
  if (!roleId) return "—";
  const role = guild?.roles?.cache?.get(roleId);
  return role ? `<@&${roleId}>` : `\`${roleId}\``;
}

function categoryLine(categoryId?, guild?) {
  if (!categoryId) return "—";
  const cat = guild?.channels?.cache?.get(categoryId);
  const name = cat?.name ? String(cat.name).trim() : null;
  return name ? `\`${name}\` (\`${categoryId}\`)` : `\`${categoryId}\``;
}

function formatPmCommandsZone(guild?, config?, lang = "it") {
  const channelId = config?.pmCommandsChannelId || null;
  const categoryIds = Array.isArray(config?.pmCommandsCategoryIds) ? config.pmCommandsCategoryIds : [];
  if (!channelId && !categoryIds.length) return t(lang, "common_everywhereUnlimited");
  const parts = [];
  if (channelId) parts.push(channelLine(channelId, guild));
  for (const categoryId of categoryIds) parts.push(categoryLine(categoryId, guild));
  return parts.join(" · ");
}

export = {
  formatPingsSummary,
  formatLeaveAction,
  channelLine,
  roleLine,
  categoryLine,
  formatPmCommandsZone,
};
