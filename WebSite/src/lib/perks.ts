// Contenuto della pagina Perks (da WebSite/perks/index.html, con i caratteri speciali riparati:
// sul sito attuale "ᵖˡᵘˢ", "ʟᴜɴᴀ"… apparivano come "áµ–Ë¡áµ˜Ë¢" per un problema di codifica).
// Markup nei testi: **grassetto**, [[etichetta|/percorso/]] = link, <<༄ Ruolo>> = menzione di ruolo.

export type Perk = { text: string; isNew?: boolean };
export type Tier = { level: number; genre: string; role: string; isNew?: boolean; perks: Perk[] };
export type Badge = { role: string; how: string; desc?: string; isNew?: boolean; perks: Perk[] };

const P = "[[Personalizza|/personalizza/]]";
const T = "[[Tickets|/tickets/]]";

export const BOOST: { title: string; role: string; isNew?: boolean; perks: Perk[] }[] = [
  {
    title: "Con un boost attivo",
    role: "<<༄ Booster¹>>",
    perks: [
      { text: "Ruolo <<༄ Booster¹>> con badge speciale" },
      { text: "Permesso di cambiare il nickname" },
      { text: "Permesso di allegare immagini e link in chat" },
      { text: "Permesso di mandare emoji e adesivi di altri server" },
      { text: "Permesso di usare le Soundboard del server" },
      { text: `Un ruolo **custom** con colore **GRADIENTE**, scelto da te, tramite ${P}`, isNew: true },
      { text: `Sblocchi i colori **PLUS** in ${P}`, isNew: true },
      { text: `Reazioni automatiche quando ti @menzionano in chat (max. 3) tramite ${P}`, isNew: true },
      { text: "Cooldown dei comandi del bot ridotto da 30 a **15 secondi**", isNew: true },
      { text: "Sblocchi i comandi +quote, +repost e +myrepost" },
      { text: "**X2** EXP Boost" },
    ],
  },
  {
    title: "Con due boost attivi",
    role: "<<༄ Booster²>>",
    isNew: true,
    perks: [
      { text: "Ruolo <<༄ Booster²>> con badge speciale", isNew: true },
      { text: "Tutti i perks del primo boost" },
      { text: "Permesso di usare le Soundboard esterne", isNew: true },
      { text: "Sfondo personalizzato per la tua card del comando +rank", isNew: true },
      { text: "Possibilità di aggiungere reazioni ai messaggi in chat", isNew: true },
      { text: `Un secondo ruolo **custom** con colore **GRADIENTE** tramite ${P}`, isNew: true },
      { text: `Una vocale privata per te e i tuoi amici tramite ${P}`, isNew: true },
      { text: `Reazioni automatiche quando ti @menzionano in chat (max. 5) tramite ${P}`, isNew: true },
      { text: "Cooldown dei comandi del bot ridotto da 30 a **5 secondi**", isNew: true },
      { text: "Bypass dei requisiti dei giveaway", isNew: true },
      { text: "Ripristina il counting (max **1 volta al giorno**) con il pulsante", isNew: true },
      { text: "**X3** EXP Boost", isNew: true },
    ],
  },
];

const gradient = (name: string) => ({ text: `Nuovo colore gradiente in ${P}: **༄ ${name} & Blackᵖˡᵘˢ**`, isNew: true });
const PREV = { text: "Tutte le ricompense precedenti" };

export const TIERS: Tier[] = [
  {
    level: 10,
    genre: "Pop",
    role: "༄ Pop¹⁰⁺",
    perks: [
      { text: "Permesso di cambiare nickname" },
      { text: "Permesso di allegare link e immagini in chat" },
      { text: "Permesso di inviare messaggi vocali in chat" },
      { text: "Sblocchi i comandi +quote, +repost e +myrepost" },
      gradient("Yellow"),
    ],
  },
  { level: 20, genre: "Jazz", role: "༄ Jazz²⁰⁺", perks: [PREV, { text: "Possibilità di aggiungere reazioni ai messaggi in chat" }, gradient("Blue")] },
  {
    level: 30,
    genre: "Rap",
    role: "༄ Rap³⁰⁺",
    perks: [PREV, { text: "Permesso di usare le Soundboard di altri server" }, { text: "Cooldown dei comandi del bot ridotto da 30 a **15 secondi**" }, gradient("Red")],
  },
  {
    level: 50,
    genre: "Reggae",
    role: "༄ Reggae⁵⁰⁺",
    perks: [
      PREV,
      { text: `Un ruolo **custom** e un canale **vocale privato custom** (${P})` },
      { text: "Cooldown dei comandi del bot ridotto da 30 a **5 secondi**" },
      gradient("White"),
    ],
  },
  {
    level: 70,
    genre: "Metal",
    role: "༄ Metal⁷⁰⁺",
    perks: [PREV, { text: "Permesso di mandare sticker ed emoji di altri server" }, { text: "Reazioni automatiche quando ti @menzionano in chat (max. 3)" }, gradient("Pink")],
  },
  {
    level: 100,
    genre: "Rock",
    role: "༄ Rock¹⁰⁰⁺",
    perks: [
      PREV,
      { text: "Cooldown dei comandi del bot ridotto da 30 a **1 secondo**" },
      { text: "Bypass dei requisiti delle candidature" },
      { text: "Bonus EXP permanente **+15%**" },
      gradient("Purple"),
    ],
  },
  {
    level: 125,
    genre: "Funk",
    role: "༄ Funk¹²⁵⁺",
    isNew: true,
    perks: [
      PREV,
      { text: "Bypass dei requisiti dei giveaway" },
      { text: "Bonus EXP permanente **+20%**" },
      { text: `Un secondo ruolo **custom** tramite ${P}` },
      gradient("Orange"),
    ],
  },
  {
    level: 150,
    genre: "Blues",
    role: "༄ Blues¹⁵⁰⁺",
    isNew: true,
    perks: [PREV, { text: "Bonus EXP permanente **+25%**" }, gradient("Green"), { text: `Decorazione a scelta, riscattabile tramite ${T} HIGH STAFF` }],
  },
  {
    level: 200,
    genre: "Indie",
    role: "༄ Indie²⁰⁰⁺",
    isNew: true,
    perks: [PREV, gradient("Aqua"), { text: `**Nitro Boost** mensile, riscattabile tramite ${T} HIGH STAFF` }],
  },
];

export const SELFIE = {
  steps: [
    `Apri un ticket su ${T} e scegli la categoria **PERKS**.`,
    "Manda una foto in cui si vede bene il viso: con il tuo nickname scritto su un foglio, oppure con il telefono sulla schermata del tuo profilo Discord.",
    "In alternativa, una breve videochiamata privata con uno staffer.",
  ],
  perks: [
    { text: "Ruolo <<༄ Verified ʰᵉᐟʰⁱᵐ>>, <<༄ Verified ˢʰᵉᐟʰᵉʳ>> o <<༄ Verified ⁿ^ᐟꜝ>> con badge speciale" },
    { text: "Permesso di allegare immagini e link in chat" },
    { text: "Permesso di cambiare il nickname" },
  ] as Perk[],
};

const LINK_NICK: Perk[] = [{ text: "Permesso di allegare link e immagini in chat" }, { text: "Permesso di cambiare nickname" }];

export const BADGES: Badge[] = [
  {
    role: "༄ Top Monthly Member",
    how: "Classifica mensile",
    isNew: true,
    desc: "Arrivi primo per EXP nei messaggi e in vocale nella classifica mensile.",
    perks: [
      { text: "Ruolo esclusivo per **1 mese**" },
      { text: `**Nitro Boost** mensile, riscattabile tramite ${T} · HIGH STAFF` },
    ],
  },
  {
    role: "༄ Top Weekly Text & Voc",
    how: "Classifica settimanale",
    desc: "Arrivi primo per EXP nei messaggi o in vocale nella classifica settimanale.",
    perks: [{ text: "Ruolo esclusivo per **7 giorni**" }, { text: "Permesso di usare soundboard esterne" }],
  },
  {
    role: "༄ MVP",
    how: "Minigames della settimana",
    isNew: true,
    desc: "Arrivi primo per punteggio dei minigames nella classifica settimanale.",
    perks: [{ text: "Ruolo esclusivo per **7 giorni**" }, { text: "Permesso di usare soundboard esterne" }],
  },
  {
    role: "༄ Royale",
    how: "Top minigames totali",
    isNew: true,
    desc: "Va in automatico a chi ha il punteggio totale più alto nei minigames, senza scadenza.",
    perks: [{ text: "Ruolo esclusivo finché resti in vetta alla classifica totale" }],
  },
  {
    role: "༄ Patron",
    how: "Supporter + Fan + Promoter⁵⁺",
    isNew: true,
    desc: "Hai insieme i ruoli <<༄ Supporter>>, <<༄ Fan>> e <<༄ Promoter⁵⁺>>.",
    perks: [{ text: "Possibilità di scrivere in gigante" }],
  },
  { role: "༄ Promoter⁵⁺", how: "5+ inviti", desc: "Inviti 5 persone nel server.", perks: LINK_NICK },
  {
    role: "༄ Propulsor²⁵⁺",
    how: "25+ inviti",
    desc: "Inviti 25 persone nel server.",
    perks: [PREV, { text: "Permesso di mandare sticker ed emoji di altri server" }, { text: "Permesso di aggiungere reazioni ai messaggi" }],
  },
  { role: "༄ Catalyst¹⁰⁰⁺", how: "100+ inviti", desc: "Inviti 100 persone nel server.", perks: [PREV, { text: "Permesso di usare soundboard esterne" }] },
  {
    role: "༄ Supporter",
    how: "Bio del profilo",
    isNew: true,
    desc: `Metti ".gg/viniliecaffe", "discord.gg/viniliecaffe" o "viniliecaffe.it" nella bio del tuo profilo Discord, poi riscattalo da ${T} PERKS.`,
    perks: LINK_NICK,
  },
  {
    role: "༄ Fan",
    how: "Status del profilo",
    isNew: true,
    desc: `Metti ".gg/viniliecaffe", "discord.gg/viniliecaffe" o "viniliecaffe.it" nello status del tuo profilo Discord.`,
    perks: LINK_NICK,
  },
  {
    role: "༄ Follower",
    how: "Social del server",
    isNew: true,
    desc: `Segui il server su [[Instagram|https://instagram.com/viniliecaffe]] e [[TikTok|https://tiktok.com/@viniliecaffe]], poi riscattalo da ${T} PERKS.`,
    perks: LINK_NICK,
  },
  {
    role: "༄ Guilded",
    how: "Guild tag",
    isNew: true,
    desc:
      "Usi una delle nostre guild tag: " +
      [
        ["༄🌙 ʟᴜɴᴀ", "E6vrm5zE6B"],
        ["༄🔥 ꜰɪʀᴇ", "QnTN5P578g"],
        ["༄🔞 ᴘღʀɴ", "WMuZ4EMAkc"],
        ["༄🌟 ꜱᴛᴀʀ", "uqUNS9f5m5"],
        ["༄🍃 ᴡᴇᴇᴅ", "SzBwnxHXNv"],
        ["༄💗 ꜰɪɢᴀ", "z3EXtJwvQH"],
      ]
        .map(([n, c]) => `[[${n}|https://discord.gg/${c}]]`)
        .join(", ") +
      ".",
    perks: LINK_NICK,
  },
  {
    role: "༄ Voter",
    how: "Voti giornalieri",
    isNew: true,
    desc: "Voti il server su [[Discadia o Top.gg|/vote/]].",
    perks: [{ text: "Bonus EXP casuale tra **100** e **250**" }, { text: "Ruolo temporaneo per **12–24 ore**" }],
  },
  { role: "༄ Famous", how: "Memoria del server", isNew: true, desc: "Per utenti ed ex staffer che hanno lasciato il segno nella storia del server.", perks: [{ text: "Esclusività del ruolo" }] },
  { role: "༄ OG", how: "1 anno nel server", desc: "Sei nel server da almeno un anno.", perks: [{ text: "Esclusività del ruolo" }] },
  { role: "༄ Veterano", how: "1 mese nel server", desc: "Sei nel server da almeno un mese.", perks: [{ text: "Esclusività del ruolo" }] },
];

/** Fascia raggiunta per un livello (null se sotto il 10). */
export const tierFor = (level: number) => [...TIERS].reverse().find((t) => level >= t.level) ?? null;
export const nextTier = (level: number) => TIERS.find((t) => level < t.level) ?? null;
