const { ActionRowBuilder, StringSelectMenuBuilder } = require("discord.js");
const IDs = require("../Config/ids");
const PANEL_PREFIX = "profile_panel";
const ROLE_PANEL_DEFAULT_CATEGORY = "pronouns";
const ROLE_PANEL_CATEGORY_KEYS = [
  "pronouns",
  "age",
  "region",
  "zodiac",
  "dm",
  "relationship",
  "mentions",
  "colors1",
  "colors_level",
  "colors_plus",
];

function buildPronounsRow() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("personality_pronouns")
      .setPlaceholder("⭐ Seleziona i tuoi pronomi")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        { label: "Rimuovi i ruoli di sesso", description: "Rimuovi ruoli dal tuo profilo", value: "remove", emoji: "<:vegax:1443934876440068179>" },
        { label: "༄ he/him", value: "1442568997848743997", emoji: "<:hehim:1470534612198494258>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ she/her", value: "1442568999043989565", emoji: "<:sheher:1470534614023143485>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ they/them", value: "1442569000063074498", emoji: "<:theythem:1470534615818178782>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ ask me", value: "1442569001367769210", emoji: "<:askme:1470534617458151424>", description: "Clicca qui per ottenere il ruolo" },
      ),
  );
}

function buildAgeRow() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("personality_age")
      .setPlaceholder("🎂 Seleziona la tua età")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        { label: "Rimuovi i ruoli di età", value: "remove", description: "Rimuovi ruoli dal tuo profilo", emoji: "<:vegax:1443934876440068179>" },
        { label: "༄ 14", value: "1442568993197265021", emoji: "<:ageadultids:1470541163219128444>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ 15-16", value: "1442568994581381170", emoji: "<:ageadultids:1470541163219128444>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ 17-18", value: "1442568995348807691", emoji: "<:ageids:1470541159351976066>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ 19+", value: "1442568996774871194", emoji: "<:ageids:1470541159351976066>", description: "Clicca qui per ottenere il ruolo" },
      ),
  );
}

function buildRegionRow() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("personality_region")
      .setPlaceholder("🌍 Seleziona la tua provenienza")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        { label: "Rimuovi i ruoli di provenienza", value: "remove", description: "Rimuovi ruoli dal tuo profilo", emoji: "<:vegax:1443934876440068179>" },
        { label: "༄ Nord", value: "1442569021861007443", emoji: "<a:peepoitaly:1470537719225520341>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Centro", value: "1442569023303974922", emoji: "<a:peepoitaly:1470537719225520341>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Sud", value: "1442569024486506498", emoji: "<a:peepoitaly:1470537719225520341>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Estero", value: "1442569025790939167", emoji: "<:wplace:1470537717426294886>", description: "Clicca qui per ottenere il ruolo" },
      ),
  );
}

function buildZodiacRow() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("personality_zodiac")
      .setPlaceholder("💫 Seleziona il tuo segno zodiacale")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        { label: "Rimuovi segno zodiacale", value: "remove", description: "Rimuovi ruolo dal tuo profilo", emoji: "<:vegax:1443934876440068179>" },
        { label: "༄ Aries", value: IDs.roles.zodiacAries, emoji: { id: "1495124414168039684", name: "VC_ares" }, description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Taurus", value: IDs.roles.zodiacTaurus, emoji: { id: "1495124440143499334", name: "VC_taurus" }, description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Gemini", value: IDs.roles.zodiacGemini, emoji: { id: "1495124428298916001", name: "VC_gemini" }, description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Cancer", value: IDs.roles.zodiacCancer, emoji: { id: "1495124417091735753", name: "VC_cancer" }, description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Leo", value: IDs.roles.zodiacLeo, emoji: { id: "1495124442362282095", name: "VC_leo" }, description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Virgo", value: IDs.roles.zodiacVirgo, emoji: { id: "1495124433105326211", name: "VC_virgo" }, description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Libra", value: IDs.roles.zodiacLibra, emoji: { id: "1495124430177833143", name: "VC_libra" }, description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Scorpio", value: IDs.roles.zodiacScorpio, emoji: { id: "1495124445688369253", name: "VC_scorpio" }, description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Sagittarius", value: IDs.roles.zodiacSagittarius, emoji: { id: "1495124448250957996", name: "VC_sagittarius" }, description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Capricorn", value: IDs.roles.zodiacCapricorn, emoji: { id: "1495124425648111768", name: "VC_capricorn" }, description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Aquarius", value: IDs.roles.zodiacAquarius, emoji: { id: "1495124437421392124", name: "VC_aquarius" }, description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Pisces", value: IDs.roles.zodiacPisces, emoji: { id: "1495124421449355466", name: "VC_pisces" }, description: "Clicca qui per ottenere il ruolo" },
      ),
  );
}

function buildDmRow() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("personality_dm")
      .setPlaceholder("💬 Seleziona il tuo stato DM")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        { label: "Rimuovi i ruoli DM", value: "remove", description: "Rimuovi ruoli dal tuo profilo", emoji: "<:vegax:1443934876440068179>" },
        { label: "༄ DMs Opened", value: "1442569004215697438", emoji: "<:opendm:1470536793504878664>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ DMs Closed", value: "1442569005071077417", emoji: "<:nodm:1470536791764373608>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Ask to DM", value: "1442569006543274126", emoji: "<:ask2dm:1470536789637726345>", description: "Clicca qui per ottenere il ruolo" },
      ),
  );
}

function buildRelationshipRow() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("personality_relationship")
      .setPlaceholder("💘 Seleziona il tuo stato sentimentale")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        { label: "Rimuovi i ruoli sentimentali", value: "remove", description: "Rimuovi ruoli dal tuo profilo", emoji: "<:vegax:1443934876440068179>" },
        { label: "༄ Fidanzato/a", value: "1442569028173299732", emoji: "<:stitchinlove:1470538823103414373>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Single", value: "1442569029263818906", emoji: "<:stitchlove:1470538821656641761>", description: "Clicca qui per ottenere il ruolo" },
      ),
  );
}

function buildMentionsRow() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("personality_mentions")
      .setPlaceholder("🔔 Seleziona le notifiche da ricevere")
      .setMinValues(1)
      .setMaxValues(7)
      .addOptions(
        { label: "Rimuovi tutti i ping", value: "remove", emoji: "<:vegax:1443934876440068179>", description: "Rimuovi ruoli dal tuo profilo" },
        { label: "༄ Revive Chat", value: IDs.roles.ReviveChat, emoji: "<a:pepedeadchat:1470541176284381226>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Revive Vocale", value: IDs.roles.ReviveVoc, emoji: "<a:VC_MicUp:1448687353332760808>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Serata Film", value: IDs.roles.SerataFilm, emoji: "<:VC_PandaPopCorn:1331591724367216672>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Partnership", value: IDs.roles.Partnership, emoji: "<:VC_Collab:1482534540089098260>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Events", value: IDs.roles.Events, emoji: "<a:announce:1470541173507751957>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ News", value: IDs.roles.News, emoji: "<:newspaper:1470541170353377290>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Polls", value: IDs.roles.Polls, emoji: "<:polls:1470541168860201072>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Bump", value: IDs.roles.Bump, emoji: "<:bumpstab:1470541167429947607>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Minigames", value: IDs.roles.Minigames, emoji: "<:health:1470541164363911313>", description: "Clicca qui per ottenere il ruolo" },
      ),
  );
}

function buildColors1Row() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("personality_colors_1")
      .setPlaceholder("🎨 Scegli un colore per il tuo profilo")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        { label: "Rimuovi colore", value: "remove", emoji: "<:vegax:1443934876440068179>", description: "Rimuovi i colori normali dal profilo" },
        { label: "༄ Red", value: "1442568956832645212", emoji: "<:67241redmidnightheart:1470543833325633638>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Orange", value: "1442568967045648412", emoji: "<:76708orangemidnightheart:1470543838392352940>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Yellow", value: "1442568969528541225", emoji: "<:59095yellowmidnightheart:1470543825704321107>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Green", value: "1442568976944201828", emoji: "<:56389greenmidnightheart:1470543822491619562>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Aqua", value: "1442568977896439960", emoji: "<:16576lightbluemidnightheart:1470543819958386862>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Blue", value: "1442568980626673685", emoji: "<:69616midnightheart:1470543834856554722>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Purple", value: "1442568983898357954", emoji: "<:79202purplemidnightheart:1470543839973605397>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Pink", value: "1442568985278156971", emoji: "<:66893pinkmidnightheart:1495723265467875388>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Black", value: "1442568987887276133", emoji: "<:63324blackmidnightheart:1470543828569034757>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Grey", value: "1442568989866725468", emoji: "<:63324blackmidnightheart:1470543828569034757>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ White", value: "1442568991150309578", emoji: "<:70505whitemidnightheart:1470543836836135067>", description: "Clicca qui per ottenere il ruolo" },
      ),
  );
}

function buildColorsPlusRow() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("personality_colors_plus")
      .setPlaceholder("🎨 Seleziona un colore per il tuo profilo")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        { label: "Rimuovi colore", value: "remove", emoji: "<:vegax:1443934876440068179>", description: "Rimuovi i colori normali dal profilo" },
        { label: "༄ Red Gradientᵖˡᵘˢ", value: IDs.roles.redPlus, emoji: { id: "1482534921472835895", name: "VC_Vip" }, description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Orange Gradientᵖˡᵘˢ", value: IDs.roles.orangePlus, emoji: { id: "1482534921472835895", name: "VC_Vip" }, description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Yellow Gradientᵖˡᵘˢ", value: IDs.roles.yellowPlus, emoji: { id: "1482534921472835895", name: "VC_Vip" }, description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Green Gradientᵖˡᵘˢ", value: IDs.roles.greenPlus, emoji: { id: "1482534921472835895", name: "VC_Vip" }, description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Blue Gradientᵖˡᵘˢ", value: IDs.roles.bluePlus, emoji: { id: "1482534921472835895", name: "VC_Vip" }, description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Purple Gradientᵖˡᵘˢ", value: IDs.roles.purplePlus, emoji: { id: "1482534921472835895", name: "VC_Vip" }, description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Pink Gradientᵖˡᵘˢ", value: IDs.roles.pinkPlus, emoji: { id: "1482534921472835895", name: "VC_Vip" }, description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Black Gradientᵖˡᵘˢ", value: IDs.roles.blackPlus, emoji: { id: "1482534921472835895", name: "VC_Vip" }, description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Gray Gradientᵖˡᵘˢ", value: IDs.roles.grayPlus, emoji: { id: "1482534921472835895", name: "VC_Vip" }, description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ White Gradientᵖˡᵘˢ", value: IDs.roles.whitePlus, emoji: { id: "1482534921472835895", name: "VC_Vip" }, description: "Clicca qui per ottenere il ruolo" },
        ),
  );
}

function buildRuoliColoriPersonalityMenuRow(categoryKey) {
  const k = String(categoryKey || "").trim();
  switch (k) {
    case "pronouns":
      return buildPronounsRow();
    case "age":
      return buildAgeRow();
    case "region":
      return buildRegionRow();
    case "zodiac":
      return buildZodiacRow();
    case "dm":
      return buildDmRow();
    case "relationship":
      return buildRelationshipRow();
    case "mentions":
      return buildMentionsRow();
    case "colors1":
      return buildColors1Row();
    default:
      return buildPronounsRow();
  }
}

function buildRolePanelCategoryPickerRow(ownerId, selectedKey) {
  const sel = String(selectedKey || ROLE_PANEL_DEFAULT_CATEGORY).trim();
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`${PANEL_PREFIX}:rsub:${ownerId}`)
      .setPlaceholder("Scegli il pannello ruoli")
      .setMinValues(1)
      .setMaxValues(1)
      .addOptions(
        { label: "Pronomi", value: "pronouns", emoji: "⭐", default: sel === "pronouns" },
        { label: "Età", value: "age", emoji: "🎂", default: sel === "age" },
        { label: "Segno zodiacale", value: "zodiac", emoji: "💫", default: sel === "zodiac" },
        { label: "Provenienza", value: "region", emoji: "🌍", default: sel === "region" },
        { label: "Stato DM", value: "dm", emoji: "💬", default: sel === "dm" },
        { label: "Stato sentimentale", value: "relationship", emoji: "💘", default: sel === "relationship" },
        { label: "Ping", value: "mentions", emoji: "🔔", default: sel === "mentions" },
        { label: "Colori Base", value: "colors1", emoji: "🎨", default: sel === "colors1" },
        { label: "Colori Livelli", value: "colors_level", emoji: "<:VC_EXP:1482534670896730143>", default: sel === "colors_level" },
        { label: "Colori Plus", value: "colors_plus", emoji: "<:VC_Vip:1482534921472835895>", default: sel === "colors_plus" },
      ),
  );
  return row;
}

function normalizeRolePanelCategory(raw) {
  const s = String(raw || "").trim();
  if (ROLE_PANEL_CATEGORY_KEYS.includes(s)) return s;
  return ROLE_PANEL_DEFAULT_CATEGORY;
}

module.exports = {
  ROLE_PANEL_DEFAULT_CATEGORY,
  ROLE_PANEL_CATEGORY_KEYS,
  buildPronounsRow,
  buildAgeRow,
  buildRegionRow,
  buildZodiacRow,
  buildDmRow,
  buildRelationshipRow,
  buildMentionsRow,
  buildColors1Row,
  buildColorsPlusRow,
  buildRuoliColoriPersonalityMenuRow,
  buildRolePanelCategoryPickerRow,
  normalizeRolePanelCategory,
};