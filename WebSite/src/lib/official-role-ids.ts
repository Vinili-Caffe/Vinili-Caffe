/**
 * ID ruoli main guild (allineati a Bots/src/shared/ids/officialGuildIds.ts).
 * Usati per risolvere menzioni statiche → nomi Discord live.
 */
export const OFFICIAL_ROLE_IDS = {
  ServerBooster: "1329497467481493607",
  DoubleBooster: "1544830850552823849",
  Promoter: "1544830824300417094",
  Propulsor: "1544830827026849872",
  Catalyst: "1544830828331270282",
  Voter: "1544830805455544360",
  Fan: "1544830816482361434",
  Follower: "1544830814825480192",
  SocialSupporter: "1544830818420002898",
  Patron: "1544830830688342016",
  Royale: "1544830788179071087",
  TopWeeklyVoc: "1544830836686200992",
  TopWeeklyText: "1544830834849087630",
  MVP: "1544830832227782699",
  TopMonthlyMember: "1544830838443741194",
  Verificato: "1544830808303468564",
  Verificata: "1544830810358685728",
  VerifiedNeo: "1544830813135315014",
  OG: "1544830802859393045",
  Veterano: "1573000176057061406",
  Stammgast: "1544830800984412275",
  Guilded: "1544830820181745704",
  Level10: "1544830753815134320",
  Level20: "1544830755518156951",
  Level30: "1544830757263118507",
  Level50: "1544830759741825145",
  Level70: "1544830762308739302",
  Level100: "1544830764825321493",
  Level120: "1544830766528073838",
  Level150: "1544830768205791394",
  Level200: "1544830769908678656",
  HogwartsEventParticipant: "1507000390493798511",
  HogwartsFinaleWinnerBonus: "1544830792168116234",
  StarWarsEventParticipant: "1572319166638194779",
  WrappedViewer: "1572319349501595728",
  AlberoOrnament: "1572318958277894336",
  VIP: "1544830866616754257",
  VIPplus: "1544830868575625276",
  Donator: "1544830864565735515",
  Founder: "1442568886988963923",
  Manager: "1521562607339704442",
  Director: "1502322782602530977",
  HighStaff: "1544831228690046976",
  Staff: "1442568910070349985",
  PartnerManager: "1544831242510270464",
  StaffDelMese: "1544831233404575835",
  StafferSettimana: "1550462300291604551",
  Famous: "1555633369688178780",
} as const;

/** Etichette storiche nei testi del sito → id Discord (per risolvere dopo un rename). */
export const ROLE_LABEL_ALIASES: Record<string, string> = {
  "༄ booster¹": OFFICIAL_ROLE_IDS.ServerBooster,
  "༄ booster1": OFFICIAL_ROLE_IDS.ServerBooster,
  "༄ booster²": OFFICIAL_ROLE_IDS.DoubleBooster,
  "༄ booster2": OFFICIAL_ROLE_IDS.DoubleBooster,
  "༄ verified ʰᵉᐟʰⁱᵐ": OFFICIAL_ROLE_IDS.Verificato,
  "༄ verified ˢʰᵉᐟʰᵉʳ": OFFICIAL_ROLE_IDS.Verificata,
  "༄ verified ⁿ^ᐟꜝ": OFFICIAL_ROLE_IDS.VerifiedNeo,
  "༄ supporter": OFFICIAL_ROLE_IDS.SocialSupporter,
  "༄ fan": OFFICIAL_ROLE_IDS.Fan,
  "༄ follower": OFFICIAL_ROLE_IDS.Follower,
  "༄ promoter⁵⁺": OFFICIAL_ROLE_IDS.Promoter,
  "༄ promoter5⁺": OFFICIAL_ROLE_IDS.Promoter,
  "༄ propulsor²⁵⁺": OFFICIAL_ROLE_IDS.Propulsor,
  "༄ catalyst¹⁰⁰⁺": OFFICIAL_ROLE_IDS.Catalyst,
  "༄ guilded": OFFICIAL_ROLE_IDS.Guilded,
  "༄ voter": OFFICIAL_ROLE_IDS.Voter,
  "༄ famous": OFFICIAL_ROLE_IDS.Famous,
  "༄ patron": OFFICIAL_ROLE_IDS.Patron,
  "༄ royale": OFFICIAL_ROLE_IDS.Royale,
  "༄ mvp": OFFICIAL_ROLE_IDS.MVP,
  "༄ og": OFFICIAL_ROLE_IDS.OG,
  "༄ veterano": OFFICIAL_ROLE_IDS.Veterano,
  "༄ stammgast": OFFICIAL_ROLE_IDS.Stammgast,
  "༄ top monthly member": OFFICIAL_ROLE_IDS.TopMonthlyMember,
  "༄ top weekly text & voc": OFFICIAL_ROLE_IDS.TopWeeklyText,
  "༄ pop¹⁰⁺": OFFICIAL_ROLE_IDS.Level10,
  "༄ jazz²⁰⁺": OFFICIAL_ROLE_IDS.Level20,
  "༄ rap³⁰⁺": OFFICIAL_ROLE_IDS.Level30,
  "༄ reggae⁵⁰⁺": OFFICIAL_ROLE_IDS.Level50,
  "༄ metal⁷⁰⁺": OFFICIAL_ROLE_IDS.Level70,
  "༄ rock¹⁰⁰⁺": OFFICIAL_ROLE_IDS.Level100,
  "༄ funk¹²⁵⁺": OFFICIAL_ROLE_IDS.Level120,
  "༄ blues¹⁵⁰⁺": OFFICIAL_ROLE_IDS.Level150,
  "༄ indie²⁰⁰⁺": OFFICIAL_ROLE_IDS.Level200,
  "༄ commemorativo hogwarts": OFFICIAL_ROLE_IDS.HogwartsEventParticipant,
  "༄ 1° posto evento hogwarts": OFFICIAL_ROLE_IDS.HogwartsFinaleWinnerBonus,
  "༄ commemorativo star wars": OFFICIAL_ROLE_IDS.StarWarsEventParticipant,
  "༄ commemorativo natale": OFFICIAL_ROLE_IDS.AlberoOrnament,
  "༄ commemorativo 1° anniversario": OFFICIAL_ROLE_IDS.WrappedViewer,
};

export function normalizeRoleLabelKey(label: string): string {
  return String(label || "")
    .replace(/^@+/, "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

export function roleIdFromLabel(label: string): string | null {
  const key = normalizeRoleLabelKey(label);
  if (!key) return null;
  if (/^\d{16,22}$/.test(key)) return key;
  return ROLE_LABEL_ALIASES[key] || null;
}
