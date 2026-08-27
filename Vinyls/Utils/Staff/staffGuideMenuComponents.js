const {
  ActionRowBuilder,
  StringSelectMenuBuilder,
  StringSelectMenuOptionBuilder,
} = require("discord.js");

const STAFF_GUIDE_MENU_ID = "staff_guide_menu";

const STAFF_GUIDE_SECTIONS = [
  { id: "regolamento", label: "Regolamento", description: "Regole e sanzioni utenti", emoji: "<:rules:1443307208543703131>" },
  { id: "regole_staff", label: "Regole staff", description: "Regole di comportamento dello staff", emoji: "<:discordstaff:1443651872258003005>" },
  { id: "limiti", label: "Limiti settimanali", description: "Obiettivi di attività settimanale", emoji: "<:reportmessage:1443670575376765130>" },
  { id: "compiti_fissi", label: "Compiti fissi", description: "Compiti fissi da svolgere ogni settimana", emoji: "<:VC_Quest:1482534879257165865>" },
  { id: "pause", label: "Pause", description: "Come funzionano le pause staff", emoji: "<:Clock:1330530065133338685>" },
  { id: "lineeguida", label: "Linee guida", description: "Comportamento e buone pratiche", emoji: "<:VC_PinkQuestionMark:1471892611026391306>" },
  { id: "comandi", label: "Comandi", description: "Comandi utili per lo staff", emoji: "<:VC_Bot:1482526555174604964>" },
  { id: "valutazioni", label: "Valutazioni", description: "Positive, negative e automatiche", emoji: "<a:loading:1443934440614264924>" },
  { id: "pex", label: "Guida Pex", description: "Promozioni e requisiti", emoji: "<a:VC_LevelUp:1482527020641419415>" },
  { id: "warnstaff", label: "Warn staff", description: "Come funzionano i warn staff", emoji: "<:banhammer:1443651875441217639>" },
  { id: "guidapartners", label: "Guida Partners", description: "Guida Partner Manager", emoji: "<:VC_PartnerManager:1494286911286808576>" },
  { id: "guidamiddle", label: "Guida Middle", description: "Guida Senior Mod & Director", emoji: "<:VC_Staff:1494286904089247754>" },
];

const STAFF_GUIDE_SECTION_IDS = new Set(STAFF_GUIDE_SECTIONS.map((section) => section.id));

function buildStaffGuideMenuRow() {
  const menu = new StringSelectMenuBuilder()
    .setCustomId(STAFF_GUIDE_MENU_ID)
    .setPlaceholder("💬 Scegli una sezione della guida…")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      STAFF_GUIDE_SECTIONS.map((section) =>
        new StringSelectMenuOptionBuilder()
          .setLabel(section.label)
          .setValue(section.id)
          .setDescription(section.description)
          .setEmoji(section.emoji),
      ),
    );

  return new ActionRowBuilder().addComponents(menu);
}

module.exports = {
  STAFF_GUIDE_MENU_ID,
  STAFF_GUIDE_SECTIONS,
  STAFF_GUIDE_SECTION_IDS,
  buildStaffGuideMenuRow,
};
