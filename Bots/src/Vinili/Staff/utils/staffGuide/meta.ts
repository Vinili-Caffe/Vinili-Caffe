const { E } = require("../../../../shared/emojis/emojiCatalog") as typeof import("../../../../shared/emojis/emojiCatalog");
const TOP_LEVEL_SECTION_META = [
  { id: "regolamento", label: "Regolamento server", description: "Regole e sanzioni utenti", emoji: E.rules },
  { id: "regole_staff", label: "Regole staff", description: "Regole di comportamento dello staff", emoji: E.discordstaff },
  { id: "limiti", label: "Limiti settimanali", description: "Obiettivi di attività settimanale", emoji: E.reportmessage },
  { id: "compiti_fissi", label: "Compiti settimanali", description: "Fasce, set mensile e provvigioni", emoji: E.VC_Quest },
  { id: "pause", label: "Pause staff", description: "Giorno intero e mezza giornata", emoji: E.Clock },
  { id: "lineeguida", label: "Linee guida", description: "Comportamento e buone pratiche", emoji: E.VC_PinkQuestionMark },
  { id: "comandi", label: "Comandi staff", description: "Comandi utili per lo staff", emoji: E.VC_Bot },
  { id: "valutazioni", label: "Valutazioni staff", description: "Positive, negative e automatiche", emoji: E.loading },
  { id: "pex", label: "Pex staff", description: "Promozioni e requisiti", emoji: E.VC_LevelUp },
  { id: "warnstaff", label: "Warn staff", description: "Come funzionano i warn staff", emoji: E.banhammer },
  { id: "guidapartners", label: "Guida partner manager", description: "Guida Partner Manager", emoji: E.VC_PartnerManager },
  { id: "guidamiddle", label: "Guida senior mod & director", description: "Guida Senior Mod & Director", emoji: E.VC_Staff },
];

const NESTED_SECTION_META = [
  {
    id: "generalimoderazione",
    label: "Generali",
    description: "Sanzioni regole generali",
    parent: "regolamento",
    emoji: E.appdirectoryallwhite,
  },
  {
    id: "testualimoderazione",
    label: "Testuali",
    description: "Sanzioni regole testuali",
    parent: "regolamento",
    emoji: E.discordchannelwhite,
  },
  {
    id: "vocalimoderazione",
    label: "Vocali",
    description: "Sanzioni regole vocali",
    parent: "regolamento",
    emoji: E.microphone,
  },
  {
    id: "middle_ticket",
    label: "Gestione Ticket",
    description: "Ticket sul sito ",
    parent: "guidamiddle",
    emoji: E.VC_Ticket,
  },
  {
    id: "middle_selfie",
    label: "Verifica Selfie",
    description: "Verifica selfie e ruoli",
    parent: "guidamiddle",
    emoji: E.VC_Verified,
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
