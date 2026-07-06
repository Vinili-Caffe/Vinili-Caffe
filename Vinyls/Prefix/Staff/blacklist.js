const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const IDs = require("../../Utils/Config/ids");
const { listPartnershipBlacklistGuilds } = require("../../Services/Partner/partnershipBlacklistService");
const { resolvePartnershipBlacklistEntryDisplay } = require("../../Utils/Partner/partnershipBlacklistDisplay");
const {
  partnersChatPartnerCommandDeniedReplyContent,
  sendPartnersChatDeniedPrefixCleanup,
} = require("../../Utils/Partner/partnersChatChannelUtils");

const PANEL_PREFIX = "blacklist_ui";

function hasBlacklistManageRole(member) {
  const roles = member?.roles?.cache;
  if (!roles) return false;
  const highStaffRoleId = IDs?.roles?.HighStaff;
  return Boolean(highStaffRoleId && roles.has(highStaffRoleId));
}

function hasBlacklistViewRole(member) {
  const roles = member?.roles?.cache;
  if (!roles) return false;
  const staffRoleId = IDs?.roles?.Staff;
  const highStaffRoleId = IDs?.roles?.HighStaff;
  const partnerManagerRoleId = IDs?.roles?.PartnerManager;
  return Boolean(
    (staffRoleId && roles.has(staffRoleId)) ||
      (highStaffRoleId && roles.has(highStaffRoleId)) ||
      (partnerManagerRoleId && roles.has(partnerManagerRoleId)),
  );
}

function normalizePageIndex(pageIndex, total) {
  if (!total) return 0;
  const raw = Number(pageIndex);
  if (!Number.isFinite(raw)) return 0;
  return ((Math.floor(raw) % total) + total) % total;
}

function formatAddedAt(value) {
  const ms = new Date(value || 0).getTime();
  if (!Number.isFinite(ms) || ms <= 0) return "—";
  return `<t:${Math.floor(ms / 1000)}:d>`;
}

async function buildBlacklistEntryEmbed(client, entry, pageIndex, total) {
  const display = await resolvePartnershipBlacklistEntryDisplay(client, entry);
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle(`<a:VC_Verified:1482532479637127188> ${display.guildName}`)
    .setDescription(
      display.note
        ? `<:VC_Info:1482526956703580372> **Motivo**\n${display.note.slice(0, 3500)}`
        : "<:VC_Info:1482526956703580372> Nessun motivo registrato.",
    )
    .addFields(
      { name: "Guild ID", value: `\`${display.guildId}\``, inline: true },
      {
        name: "Invito",
        value: display.invite ? `[Apri invito](${display.invite})` : "—",
        inline: true,
      },
      { name: "Aggiunto il", value: formatAddedAt(display.addedAt), inline: true },
    )
    .setFooter({ text: `Server ${pageIndex + 1} di ${total}` });
  if (display.iconUrl) embed.setThumbnail(display.iconUrl);
  return embed;
}

function buildBlacklistPanelComponents(ownerId, canManage, pageIndex, total) {
  const components = [];
  if (total > 0) {
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${PANEL_PREFIX}:prev:${ownerId}:${pageIndex}`)
          .setEmoji("<a:vegaleftarrow:1462914743416131816>")
          .setStyle(ButtonStyle.Secondary)
          .setDisabled(total <= 1),
        new ButtonBuilder()
          .setCustomId(`${PANEL_PREFIX}:next:${ownerId}:${pageIndex}`)
          .setEmoji("<a:vegarightarrow:1443673039156936837>")
          .setStyle(ButtonStyle.Primary)
          .setDisabled(total <= 1),
      ),
    );
  }
  if (canManage) {
    components.push(
      new ActionRowBuilder().addComponents(
        new ButtonBuilder()
          .setCustomId(`${PANEL_PREFIX}:add:${ownerId}`)
          .setLabel("Aggiungi")
          .setEmoji("<a:VC_Verified:1482532479637127188>")
          .setStyle(ButtonStyle.Success),
        new ButtonBuilder()
          .setCustomId(`${PANEL_PREFIX}:remove:${ownerId}`)
          .setLabel("Rimuovi")
          .setEmoji("<a:VC_Cross:1482532424570376253>")
          .setStyle(ButtonStyle.Danger),
      ),
    );
  }
  return components;
}

async function buildBlacklistPanelPayload(client, ownerId, canView, canManage, rows = [], pageIndex = 0) {
  if (!canView) {
    return {
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setTitle("Server in blacklist partnership")
          .setDescription("<:vegax:1443934876440068179> Non hai i ruoli necessari per gestire la blacklist."),
      ],
      components: [],
    };
  }
  if (!rows.length) {
    return {
      embeds: [
        new EmbedBuilder()
          .setColor("#6f4e37")
          .setTitle("<a:VC_Verified:1482532479637127188> Server in blacklist partnership")
          .setDescription("<a:VC_Cross:1482532424570376253> Nessun server in blacklist partnership."),
      ],
      components: buildBlacklistPanelComponents(ownerId, canManage, 0, 0),
    };
  }
  const safeIndex = normalizePageIndex(pageIndex, rows.length);
  const embed = await buildBlacklistEntryEmbed(client, rows[safeIndex], safeIndex, rows.length);
  return {
    embeds: [embed],
    components: buildBlacklistPanelComponents(ownerId, canManage, safeIndex, rows.length),
  };
}

module.exports = {
  name: "blacklist",
  allowEmptyArgs: true,
  buildBlacklistPanelPayload,
  hasBlacklistManageRole,
  hasBlacklistViewRole,
  normalizePageIndex,
  async execute(message, args) {
    const denied = await partnersChatPartnerCommandDeniedReplyContent(message.channel);
    if (denied) {
      return sendPartnersChatDeniedPrefixCleanup(message, denied);
    }
    const canView = hasBlacklistViewRole(message.member);
    const canManage = hasBlacklistManageRole(message.member);
    const rows = canView ? await listPartnershipBlacklistGuilds(200).catch(() => []) : [];
    const payload = await buildBlacklistPanelPayload(message.client, message.author.id, canView, canManage, rows, 0);
    return safeMessageReply(message, {
      ...payload,
      allowedMentions: { repliedUser: false },
    });
  },
};