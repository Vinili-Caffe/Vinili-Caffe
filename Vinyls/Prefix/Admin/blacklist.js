const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const IDs = require("../../Utils/Config/ids");

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

function buildBlacklistPanelPayload(ownerId, canView, canManage) {
  const embeds = [
    new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("Partnership blacklist (server)")
      .setDescription(
        [
          "Gestisci blacklist partnership da questo pannello.",
          "",
          "Azioni disponibili:",
          "• Aggiungi server",
          "• Rimuovi server",
          "• Mostra elenco",
        ].join("\n"),
      ),
  ];
  if (!canView) {
    embeds[0].setColor("Red").setDescription(
      "<:vegax:1443934876440068179> Non hai i ruoli necessari per gestire la blacklist.",
    );
    return { embeds, components: [] };
  }
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
  buttons.push(
    new ButtonBuilder()
      .setCustomId(`${PANEL_PREFIX}:list:${ownerId}`)
      .setLabel("Elenco")
      .setStyle(ButtonStyle.Secondary),
  );
  const row = new ActionRowBuilder().addComponents(...buttons);
  return { embeds, components: [row] };
}

module.exports = {
  name: "blacklist",
  category: "admin",
  usage: "`+blacklist` — apre pannello gestione blacklist partnership",
  examples: ["+blacklist"],
  buildBlacklistPanelPayload,
  hasBlacklistManageRole,
  hasBlacklistViewRole,
  async execute(message, args) {
    const canView = hasBlacklistViewRole(message.member);
    const canManage = hasBlacklistManageRole(message.member);
    const payload = buildBlacklistPanelPayload(message.author.id, canView, canManage);
    return safeMessageReply(message, {
      ...payload,
      allowedMentions: { repliedUser: false },
    });
  },
};