const TOP_LEVEL_SECTION_META = [
  { id: "regolamento", label: "Regolamento server", description: "Regole e sanzioni utenti", emoji: "<:rules:1443307208543703131>" },
  { id: "regole_staff", label: "Regole staff", description: "Regole di comportamento dello staff", emoji: "<:discordstaff:1443651872258003005>" },
  { id: "limiti", label: "Limiti settimanali", description: "Obiettivi di attività settimanale", emoji: "<:reportmessage:1443670575376765130>" },
  { id: "compiti_fissi", label: "Compiti settimanali", description: "Fasce, set mensile e provvigioni", emoji: "<:VC_Quest:1482534879257165865>" },
  { id: "pause", label: "Pause staff", description: "Giorno intero e mezza giornata", emoji: "<:Clock:1330530065133338685>" },
  { id: "lineeguida", label: "Linee guida", description: "Comportamento e buone pratiche", emoji: "<:VC_PinkQuestionMark:1471892611026391306>" },
  { id: "comandi", label: "Comandi staff", description: "Comandi utili per lo staff", emoji: "<:VC_Bot:1482526555174604964>" },
  { id: "valutazioni", label: "Valutazioni staff", description: "Positive, negative e automatiche", emoji: "<a:loading:1443934440614264924>" },
  { id: "pex", label: "Pex staff", description: "Promozioni e requisiti", emoji: "<a:VC_LevelUp:1482527020641419415>" },
  { id: "warnstaff", label: "Warn staff", description: "Come funzionano i warn staff", emoji: "<:banhammer:1443651875441217639>" },
  { id: "guidapartners", label: "Guida partner manager", description: "Guida Partner Manager", emoji: "<:VC_PartnerManager:1494286911286808576>" },
  { id: "guidamiddle", label: "Guida senior mod & director", description: "Guida Senior Mod & Director", emoji: "<:VC_Staff:1494286904089247754>" },
];

const NESTED_SECTION_META = [
  {
    id: "generalimoderazione",
    label: "Generali",
    description: "Sanzioni regole generali",
    parent: "regolamento",
    emoji: "<:appdirectoryallwhite:1443308556995788840>",
  },
  {
    id: "testualimoderazione",
    label: "Testuali",
    description: "Sanzioni regole testuali",
    parent: "regolamento",
    emoji: "<:discordchannelwhite:1443308552536985810>",
  },
  {
    id: "vocalimoderazione",
    label: "Vocali",
    description: "Sanzioni regole vocali",
    parent: "regolamento",
    emoji: "<:microphone:1443307206824169573>",
  },
  {
    id: "middle_ticket",
    label: "Gestione Ticket",
    description: "Ticket sul sito ",
    parent: "guidamiddle",
    emoji: "<:VC_Ticket:1482535175283019888>",
  },
  {
    id: "middle_selfie",
    label: "Verifica Selfie",
    description: "Verifica selfie e ruoli",
    parent: "guidamiddle",
    emoji: "<a:VC_Verified:1482532479637127188>",
  },
];

const SECTION_CHILDREN = {
  regolamento: ["generalimoderazione", "testualimoderazione", "vocalimoderazione"],
  moderazione_staff: ["generalimoderazione", "testualimoderazione", "vocalimoderazione"],
  /* middle_follower / middle_partnership disattivate (guideMdMiddleTrim1) */
  guidamiddle: ["middle_ticket", "middle_selfie"],
};

function listStaffGuideSectionMeta() {
  const top = TOP_LEVEL_SECTION_META.map((section?) => ({
    id: section.id,
    label: section.label,
    description: section.description,
    emoji: section.emoji,
  }));
  const nested = NESTED_SECTION_META.map((section?) => ({
    id: section.id,
    label: section.label,
    description: section.description,
    parent: section.parent,
    emoji: section.emoji,
  }));
  return [...top, ...nested];
}

function getStaffGuideSectionMeta(sectionId?) {
  const id = String(sectionId || "").trim();
  return listStaffGuideSectionMeta().find((s?) => s.id === id) || null;
}

function getStaffGuideChildSectionIds(sectionId?) {
  return SECTION_CHILDREN[String(sectionId || "").trim()] || [];
}

export = {
  TOP_LEVEL_SECTION_META,
  NESTED_SECTION_META,
  SECTION_CHILDREN,
  listStaffGuideSectionMeta,
  getStaffGuideSectionMeta,
  getStaffGuideChildSectionIds,
};
