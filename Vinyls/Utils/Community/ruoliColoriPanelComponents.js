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
  "hobby",
  "gaming",
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
        { label: "༄ he/him", value: "1544830743296081960", emoji: "<:hehim:1470534612198494258>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ she/her", value: "1544830740624183336", emoji: "<:sheher:1470534614023143485>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ they/them", value: "1544830738556256256", emoji: "<:theythem:1470534615818178782>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ ask me", value: "1544830736434069559", emoji: "<:askme:1470534617458151424>", description: "Clicca qui per ottenere il ruolo" },
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
        { label: "༄ 14", value: "1544830751931899965", emoji: "<:ageadultids:1470541163219128444>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ 15-16", value: "1544830749268639744", emoji: "<:ageadultids:1470541163219128444>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ 17-18", value: "1544830746533957717", emoji: "<:ageids:1470541159351976066>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ 19+", value: "1544830744914821181", emoji: "<:ageids:1470541159351976066>", description: "Clicca qui per ottenere il ruolo" },
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
        { label: "༄ Nord", value: "1544830651033976872", emoji: "<a:peepoitaly:1470537719225520341>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Centro", value: "1544830648131395604", emoji: "<a:peepoitaly:1470537719225520341>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Sud", value: "1544830644516036611", emoji: "<a:peepoitaly:1470537719225520341>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Estero", value: "1544830642616012813", emoji: "<:wplace:1470537717426294886>", description: "Clicca qui per ottenere il ruolo" },
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
        { label: "༄ DMs Opened", value: "1544830708340756621", emoji: "<:opendm:1470536793504878664>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ DMs Closed", value: "1544830706482413589", emoji: "<:nodm:1470536791764373608>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Ask to DM", value: "1544830704477540393", emoji: "<:ask2dm:1470536789637726345>", description: "Clicca qui per ottenere il ruolo" },
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
        { label: "༄ Fidanzato/a", value: "1544830640971579462", emoji: "<:stitchinlove:1470538823103414373>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Single", value: "1544830638983614524", emoji: "<:stitchlove:1470538821656641761>", description: "Clicca qui per ottenere il ruolo" },
      ),
  );
}

function buildMentionsRow() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("personality_mentions")
      .setPlaceholder("🔔 Seleziona le notifiche da ricevere")
      .setMinValues(1)
      .setMaxValues(8)
      .addOptions(
        { label: "Rimuovi tutti i ping", value: "remove", emoji: "<:vegax:1443934876440068179>", description: "Rimuovi ruoli dal tuo profilo" },
        { label: "༄ Revive Server", value: IDs.roles.ReviveServer || IDs.roles.ReviveChat, emoji: "<a:pepedeadchat:1470541176284381226>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Partnership", value: IDs.roles.Partnership, emoji: "<:VC_Collab:1482534540089098260>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Events", value: IDs.roles.Events, emoji: "<a:announce:1470541173507751957>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ News", value: IDs.roles.News, emoji: "<:newspaper:1470541170353377290>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Bump", value: IDs.roles.Bump, emoji: "<:bumpstab:1470541167429947607>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Minigames", value: IDs.roles.Minigames, emoji: "<:health:1470541164363911313>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Notturno", value: IDs.roles.Notturno, emoji: "<:moon:1470064812615667827>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Live", value: IDs.roles.Live, emoji: "<a:VC_Ping:1482694298687246377>", description: "Clicca qui per ottenere il ruolo" },
      ),
  );
}

function buildHobbyRow() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("personality_hobby")
      .setPlaceholder("🎯 Seleziona i tuoi hobby")
      .setMinValues(1)
      .setMaxValues(10)
      .addOptions(
        { label: "Rimuovi tutti gli hobby", value: "remove", emoji: "<:vegax:1443934876440068179>", description: "Rimuovi ruoli dal tuo profilo" },
        { label: "༄ Anime & Manga", value: IDs.roles.HobbyAnimeManga, emoji: "🎌", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Lettura", value: IDs.roles.HobbyLettura, emoji: "📚", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Scrittura", value: IDs.roles.HobbyScrittura, emoji: "✍️", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Film & Serie TV", value: IDs.roles.HobbyFilmSerieTV, emoji: "🎬", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Sport", value: IDs.roles.HobbySport, emoji: "⚽", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Musica", value: IDs.roles.HobbyMusica, emoji: "🎵", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Gaming", value: IDs.roles.HobbyGaming, emoji: "🎮", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Disegno", value: IDs.roles.HobbyDisegno, emoji: "🖌️", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Cucina", value: IDs.roles.HobbyCucina, emoji: "🍳", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Fotografia", value: IDs.roles.HobbyFotografia, emoji: "📷", description: "Clicca qui per ottenere il ruolo" },
      ),
  );
}

function buildGamingRow() {
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId("personality_gaming")
      .setPlaceholder("🎮 Seleziona i tuoi giochi")
      .setMinValues(1)
      .setMaxValues(15)
      .addOptions(
        { label: "Rimuovi tutti i giochi", value: "remove", emoji: "<:vegax:1443934876440068179>", description: "Rimuovi ruoli dal tuo profilo" },
        { label: "༄ Minecraft", value: IDs.roles.GameMinecraft, emoji: "⛏️", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ League of Legends", value: IDs.roles.GameLeagueOfLegends, emoji: "⚔️", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Fortnite", value: IDs.roles.GameFortnite, emoji: "🪂", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Roblox", value: IDs.roles.GameRoblox, emoji: "🧱", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Grand Theft Auto", value: IDs.roles.GameGrandTheftAuto, emoji: "🚗", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Call of Duty", value: IDs.roles.GameCallOfDuty, emoji: "🔫", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Rocket League", value: IDs.roles.GameRocketLeague, emoji: "⚽", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Among Us", value: IDs.roles.GameAmongUs, emoji: "🕵️", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ OSU!", value: IDs.roles.GameOsu, emoji: "🎯", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ The Sims", value: IDs.roles.GameTheSims, emoji: "🏠", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Valorant", value: IDs.roles.GameValorant, emoji: "🔫", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ FIFA", value: IDs.roles.GameFifa, emoji: "⚽", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Brawl Stars", value: IDs.roles.GameBrawlStars, emoji: "⭐", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Brawlhalla", value: IDs.roles.GameBrawlhalla, emoji: "⚔️", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Genshin Impact", value: IDs.roles.GameGenshinImpact, emoji: "💠", description: "Clicca qui per ottenere il ruolo" },
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
        { label: "༄ Red", value: "1544842977384341694", emoji: "<:67241redmidnightheart:1470543833325633638>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Orange", value: "1544842979716374588", emoji: "<:76708orangemidnightheart:1470543838392352940>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Yellow", value: "1544842981536956502", emoji: "<:59095yellowmidnightheart:1470543825704321107>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Green", value: "1544831002076254238", emoji: "<:56389greenmidnightheart:1470543822491619562>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Aqua", value: "1544831000268509246", emoji: "<:16576lightbluemidnightheart:1470543819958386862>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Blue", value: "1544830998087475374", emoji: "<:69616midnightheart:1470543834856554722>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Purple", value: "1544830995990061076", emoji: "<:79202purplemidnightheart:1470543839973605397>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Pink", value: "1544830992928219340", emoji: "<:66893pinkmidnightheart:1495723265467875388>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Black", value: "1544830990806163542", emoji: "<:63324blackmidnightheart:1470543828569034757>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ Grey", value: "1544830982702628946", emoji: "<:63324blackmidnightheart:1470543828569034757>", description: "Clicca qui per ottenere il ruolo" },
        { label: "༄ White", value: "1544830980265873448", emoji: "<:70505whitemidnightheart:1470543836836135067>", description: "Clicca qui per ottenere il ruolo" },
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
        { label: "༄ Brown Gradientᵖˡᵘˢ", value: IDs.roles.brownPlus, emoji: { id: "1482534921472835895", name: "VC_Vip" }, description: "Clicca qui per ottenere il ruolo" },
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
    case "hobby":
      return buildHobbyRow();
    case "gaming":
      return buildGamingRow();
    case "colors1":
      return buildColors1Row();
    default:
      return buildPronounsRow();
  }
}

function buildRolePanelCategoryPickerRow(ownerId, selectedKey, viewerId = null) {
  const sel = String(selectedKey || ROLE_PANEL_DEFAULT_CATEGORY).trim();
  const o = String(ownerId || "");
  const v = String(viewerId || "").trim();
  const idCore = /^\d{16,20}$/.test(v) && /^\d{16,20}$/.test(o) ? `${v}:${o}` : o;
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`${PANEL_PREFIX}:rsub:${idCore}`)
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
        { label: "Hobby", value: "hobby", emoji: "🎯", default: sel === "hobby" },
        { label: "Gaming", value: "gaming", emoji: "🎮", default: sel === "gaming" },
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
  buildHobbyRow,
  buildGamingRow,
  buildColors1Row,
  buildColorsPlusRow,
  buildRuoliColoriPersonalityMenuRow,
  buildRolePanelCategoryPickerRow,
  normalizeRolePanelCategory,
};