const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const IDs = require("../../Utils/Config/ids");
const { listPartnershipBlacklistGuilds } = require("../../Services/Partner/partnershipBlacklistService");
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
  const highStaffRoleId = IDs?.roles?.HighStaff;
  const partnerManagerRoleId = IDs?.roles?.PartnerManager;
  return Boolean(
    (highStaffRoleId && roles.has(highStaffRoleId)) ||
      (partnerManagerRoleId && roles.has(partnerManagerRoleId)),
  );
}

function buildBlacklistPanelPayload(ownerId, canView, canManage, rows = []) {
  const lines = rows.map((r) => `\`${r.guildId}\`${r.note ? ` — ${String(r.note).slice(0, 80)}` : ""}`);
  const embeds = [new EmbedBuilder().setColor("#6f4e37").setTitle("Server in blacklist partnership")];
  if (!canView) {
    embeds[0].setColor("Red").setDescription(
      "<:vegax:1443934876440068179> Non hai i ruoli necessari per gestire la blacklist.",
    );
    return { embeds, components: [] };
  }
  embeds[0].setDescription(lines.length ? lines.join("\n").slice(0, 3900) : "Nessun server in blacklist partnership.");

  const buttons = [];
  if (canManage) {
    buttons.push(
      new ButtonBuilder()
        .setCustomId(`${PANEL_PREFIX}:add:${ownerId}`)
        .setLabel("Aggiungi")
        .setStyle(ButtonStyle.Success),
      new ButtonBuilder()
        .setCustomId(`${PANEL_PREFIX}:remove:${ownerId}`)
        .setLabel("Rimuovi")
        .setStyle(ButtonStyle.Danger),
    );
  }
  if (!buttons.length) return { embeds, components: [] };
  const row = new ActionRowBuilder().addComponents(...buttons);
  return { embeds, components: [row] };
}

module.exports = {
  name: "blacklist",
  allowEmptyArgs: true,
  buildBlacklistPanelPayload,
  hasBlacklistManageRole,
  hasBlacklistViewRole,
  async execute(message, args) {
    const denied = await partnersChatPartnerCommandDeniedReplyContent(message.channel);
    if (denied) {
      return sendPartnersChatDeniedPrefixCleanup(message, denied);
    }
    const canView = hasBlacklistViewRole(message.member);
    const canManage = hasBlacklistManageRole(message.member);
    const rows = canView ? await listPartnershipBlacklistGuilds(200).catch(() => []) : [];
    const payload = buildBlacklistPanelPayload(message.author.id, canView, canManage, rows);
    return safeMessageReply(message, {
      ...payload,
      allowedMentions: { repliedUser: false },
    });
  },
};