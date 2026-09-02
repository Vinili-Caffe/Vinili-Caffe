const {
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  PermissionFlagsBits,
} = require("discord.js");
const { getTicketSettingsSync } = require("../../MultiGuild/core/tenantTicketSettings");
const {
  findGuildPanelById,
  getGuildPanelsSync,
} = require("../../MultiGuild/core/tenantTicketPanels");

function getOptions(guildId) {
  return getTicketSettingsSync(guildId);
}

function resolveNullableBool(overrideVal, globalVal) {
  if (overrideVal === true || overrideVal === false) return overrideVal;
  return globalVal === true;
}

function resolveTicketPanel(guildId, ticketOrPanelId) {
  const gid = String(guildId || "").trim();
  if (!gid) return null;
  if (ticketOrPanelId && typeof ticketOrPanelId === "object") {
    const byId = String(ticketOrPanelId.panelId || "").trim();
    if (byId) {
      const hit = findGuildPanelById(gid, byId);
      if (hit) return hit;
    }
    const type = String(ticketOrPanelId.ticketType || "").trim().toLowerCase();
    if (!type) return null;
    const matches = (getGuildPanelsSync(gid).singles || []).filter(
      (p) => String(p.ticketType || "").toLowerCase() === type && p.disabled !== true,
    );
    return matches.length === 1 ? matches[0] : null;
  }
  const panelId = String(ticketOrPanelId || "").trim();
  return panelId ? findGuildPanelById(gid, panelId) : null;
}

function resolveTranscriptLogChannelId(guildId, ticket, fallbackIds = {}) {
  const s = getOptions(guildId) || {};
  const panel = resolveTicketPanel(guildId, ticket);
  return (
    String(panel?.transcriptChannelId || "").trim() ||
    String(s.transcriptChannelId || "").trim() ||
    String(fallbackIds.logChannelId || s.logChannelId || "").trim() ||
    String(fallbackIds.ticketLogs || "").trim() ||
    null
  );
}

function buildTicketControlButtons(guildId, overrides = null) {
  const s = getOptions(guildId);
  const o = overrides && typeof overrides === "object" ? overrides : {};
  const hideClose = resolveNullableBool(o.hideCloseButton, s.hideCloseButton);
  const hideCloseReason = resolveNullableBool(o.hideCloseReasonButton, s.hideCloseReasonButton);
  const hideClaim = resolveNullableBool(o.hideClaimButton, s.hideClaimButton);
  const buttons = [];
  if (!hideClose) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId("close_ticket")
        .setEmoji("🔒")
        .setLabel("Chiudi")
        .setStyle(ButtonStyle.Danger),
    );
  }
  if (!hideCloseReason) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId("close_ticket_motivo")
        .setEmoji("🔒")
        .setLabel("Chiudi Con Motivo")
        .setStyle(ButtonStyle.Danger),
    );
  }
  if (!hideClaim) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId("claim_ticket")
        .setEmoji("🙋‍♂️")
        .setLabel("Claim")
        .setStyle(ButtonStyle.Success),
    );
  }
  if (!buttons.length) return null;
  return new ActionRowBuilder().addComponents(...buttons.slice(0, 5));
}

function buildClaimedControlButtons(guildId, overrides = null) {
  const s = getOptions(guildId);
  const o = overrides && typeof overrides === "object" ? overrides : {};
  const hideClose = resolveNullableBool(o.hideCloseButton, s.hideCloseButton);
  const hideCloseReason = resolveNullableBool(o.hideCloseReasonButton, s.hideCloseReasonButton);
  const buttons = [];
  if (!hideClose) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId("close_ticket")
        .setEmoji("🔒")
        .setLabel("Chiudi")
        .setStyle(ButtonStyle.Danger),
    );
  }
  if (!hideCloseReason) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId("close_ticket_motivo")
        .setEmoji("🔒")
        .setLabel("Chiudi Con Motivo")
        .setStyle(ButtonStyle.Danger),
    );
  }
  buttons.push(
    new ButtonBuilder()
      .setCustomId("unclaim")
      .setEmoji("<a:VC_Unlock:1482532082466029608>")
      .setLabel("Unclaim")
      .setStyle(ButtonStyle.Secondary),
  );
  return new ActionRowBuilder().addComponents(...buttons.slice(0, 5));
}

function openerAllowBitsToMemberOverwrite(allowBits) {
  const bits = Array.isArray(allowBits) ? allowBits : [];
  const has = (flag) => bits.some((b) => b === flag);
  const map = {
    ViewChannel: true,
    SendMessages: true,
    ReadMessageHistory: true,
    EmbedLinks: has(PermissionFlagsBits.EmbedLinks),
    AttachFiles: has(PermissionFlagsBits.AttachFiles),
    AddReactions: has(PermissionFlagsBits.AddReactions),
    SendTTSMessages: has(PermissionFlagsBits.SendTTSMessages),
    UseExternalEmojis: has(PermissionFlagsBits.UseExternalEmojis),
    UseExternalStickers: has(PermissionFlagsBits.UseExternalStickers),
  };
  if (PermissionFlagsBits.SendVoiceMessages) {
    map.SendVoiceMessages = has(PermissionFlagsBits.SendVoiceMessages);
  }
  return map;
}

async function syncOpenTicketOpenerPermissions(client, guildId) {
  const gid = String(guildId || "").trim();
  if (!gid || !client) return { updated: 0, checked: 0 };
  const Ticket = require("../../Schemas/Ticket/ticketSchema");
  const { editTicketMemberOverwrite } = require("./ticketHighStaffOverwrites");
  const { getGuildChannelCached } = require("./ticketInteractionRuntime");
  const guild =
    client.guilds?.cache?.get(gid) ||
    (await client.guilds?.fetch?.(gid).catch(() => null));
  if (!guild) return { updated: 0, checked: 0 };

  const openTickets = await Ticket.find({ guildId: gid, open: true })
    .limit(200)
    .lean()
    .catch(() => []);
  let updated = 0;
  for (const ticket of openTickets || []) {
    const channelId = String(ticket.channelId || "").trim();
    const userId = String(ticket.userId || "").trim();
    if (!channelId || !userId) continue;
    const channel = await getGuildChannelCached(guild, channelId).catch(() => null);
    if (!channel?.permissionOverwrites?.edit) continue;
    if (channel.isThread?.()) continue;
    const panel = resolveTicketPanel(gid, ticket);
    const allowBits = buildOpenerPermissionList(gid, panel?.ticketPerms);
    const overwrite = openerAllowBitsToMemberOverwrite(allowBits);
    const ok = await editTicketMemberOverwrite(channel, userId, overwrite);
    if (ok) updated += 1;
  }
  return { updated, checked: (openTickets || []).length };
}

function buildOpenerPermissionList(guildId, permsOverride = null) {
  const s = getOptions(guildId);
  const g = s.ticketPerms || {};
  const e = permsOverride && typeof permsOverride === "object" ? permsOverride : null;
  const replace = Boolean(e && (e.replace === true || e.__replace === true));
  const resolve = (key, defaultOn) => {
    const gOn = defaultOn ? g[key] !== false : g[key] === true;
    if (!e) return gOn;
    if (replace) return e[key] === true;
        return gOn || e[key] === true;
  };
  const p = {
    embedLinks: resolve("embedLinks", true),
    attachFiles: resolve("attachFiles", true),
    addReactions: resolve("addReactions", true),
    sendTtsMessages: resolve("sendTtsMessages", false),
    useExternalEmojis: resolve("useExternalEmojis", true),
    useExternalStickers: resolve("useExternalStickers", true),
    sendVoiceMessages: resolve("sendVoiceMessages", false),
  };
  const list = [PermissionFlagsBits.ViewChannel, PermissionFlagsBits.SendMessages, PermissionFlagsBits.ReadMessageHistory];
  if (p.embedLinks) list.push(PermissionFlagsBits.EmbedLinks);
  if (p.attachFiles) list.push(PermissionFlagsBits.AttachFiles);
  if (p.addReactions) list.push(PermissionFlagsBits.AddReactions);
  if (p.sendTtsMessages) list.push(PermissionFlagsBits.SendTTSMessages);
  if (p.useExternalEmojis) list.push(PermissionFlagsBits.UseExternalEmojis);
  if (p.useExternalStickers) list.push(PermissionFlagsBits.UseExternalStickers);
  if (p.sendVoiceMessages && PermissionFlagsBits.SendVoiceMessages) {
    list.push(PermissionFlagsBits.SendVoiceMessages);
  }
  return list;
}

function buildStaffSpectateOverwrite(guildId) {
  const s = getOptions(guildId);
  const p = s.ticketPerms || {};
  if (s.claimedStaffCanView === false) {
    return { ViewChannel: false };
  }
  return {
    ViewChannel: true,
    SendMessages: s.claimedStaffCanType === true,
    ReadMessageHistory: true,
    EmbedLinks: p.embedLinks !== false,
    AttachFiles: p.attachFiles !== false,
    AddReactions: p.addReactions !== false,
  };
}

function getTicketEmbedColor() {
  return "#6f4e37";
}

module.exports = {
  getOptions,
  resolveTicketPanel,
  resolveTranscriptLogChannelId,
  buildTicketControlButtons,
  buildClaimedControlButtons,
  buildOpenerPermissionList,
  buildStaffSpectateOverwrite,
  openerAllowBitsToMemberOverwrite,
  syncOpenTicketOpenerPermissions,
  getTicketEmbedColor,
};
