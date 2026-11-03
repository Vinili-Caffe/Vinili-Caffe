const { ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js") as typeof import("discord.js");
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { buildStaffGuideSectionMarkdown } = require("../../Staff/utils/staffGuideContent") as typeof import("../../Staff/utils/staffGuideContent");
const { buildVcPagePayload } = require("../../../shared/embeds/vcPageEmbedV2") as typeof import("../../../shared/embeds/vcPageEmbedV2");

const MOD_GUIDE_BUTTON_IDS = Object.freeze([
  "generalimoderazione",
  "testualimoderazione",
  "vocalimoderazione",
]);

function buildModerationGuideDescription() {
  const base =
    buildStaffGuideSectionMarkdown("moderazione_staff") ||
    `<a:VC_Alarm:1482706641618079816> Per **applicare** le __sanzioni__, è necessario __attenersi__ alle **indicazioni** riportate di seguito.`;

  const ch = String(IDs.channels?.sanzioniUtenti || "1442569245878648924").trim();
  const botId = String(IDs.bots?.ViniliCaffeBot || "1329118940110127204").trim();

  return base
    .replace(
      /consultare\*\* le procedure disponibili nelle sottosezioni\./,
      "consultare** le procedure disponibili __cliccando__ sui **bottoni** alla fine del messaggio.",
    )
    .replace(
      /<#1442569245878648924>/g,
      ch ? `<#${ch}>` : "#sanzioni-utenti",
    )
    .replace(
      /<@1329118940110127204>/g,
      botId ? `<@${botId}>` : "<@Vinili>",
    );
}

function moderationGuideEmbedColor() {
  const { resolveEmbedColorForGuild } = require("../../MultiGuild/utils/tenantEmbedBranding") as typeof import("../../MultiGuild/utils/tenantEmbedBranding");
  return resolveEmbedColorForGuild(String(IDs.guilds?.main || "")) || "#826bc2";
}

function buildModerationGuideButtonRow() {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId("generalimoderazione")
      .setLabel("︲GENERALI")
      .setEmoji("<:appdirectoryallwhite:1443308556995788840>")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("testualimoderazione")
      .setLabel("︲TESTUALI")
      .setEmoji("<:discordchannelwhite:1443308552536985810>")
      .setStyle(ButtonStyle.Secondary),
    new ButtonBuilder()
      .setCustomId("vocalimoderazione")
      .setLabel("︲VOCALI")
      .setEmoji("<:microphone:1443307206824169573>")
      .setStyle(ButtonStyle.Secondary),
  );
}

function buildModerationGuideStickyPayload() {
  return buildVcPagePayload({
    guildId: String(IDs.guilds?.main || ""),
    accentColor: moderationGuideEmbedColor(),
    title: "Guida sanzioni",
    body: buildModerationGuideDescription(),
    footer: "Clicca un bottone per aprire la sezione.",
    rows: [buildModerationGuideButtonRow()],
  });
}

export = {
  MOD_GUIDE_BUTTON_IDS,
  moderationGuideEmbedColor,
  buildModerationGuideStickyPayload,
};
