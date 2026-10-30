import type { Perk } from "./perks";

// Donazioni (da WebSite/donazioni/index.html). Il perk "Ripristina il counting" del VIP+ è nascosto
// anche sul sito attuale (countingRestoreOff1), quindi qui non c'è.

export const PAYPAL = "https://www.paypal.com/paypalme/viniliecaffeit";
const P = "[[Personalizza|/personalizza/]]";

export type Tier = { id: string; role: string; cup: string; price: string; badge?: string; cta: string; size: number; perks: Perk[] };

export const TIERS: Tier[] = [
  {
    id: "donator",
    role: "Donator",
    cup: "Espresso",
    price: "da 3 €",
    badge: "Il più economico",
    cta: "Offri un espresso",
    size: 0.78,
    perks: [
      { text: "Allegare link e immagini in chat" },
      { text: "Usare le soundboard di altri server" },
      { text: "Mandare sticker ed emoji di altri server" },
      { text: "Bypass dei requisiti nei giveaway" },
      { text: "Cambiare il tuo nickname" },
      { text: `Sblocchi i colori **PLUS** in ${P}`, isNew: true },
      { text: "Sblocchi i comandi +quote e +repost" },
      { text: "**X4** EXP boost" },
    ],
  },
  {
    id: "vip",
    role: "VIP",
    cup: "Cappuccino",
    price: "10 €",
    badge: "Il più scelto",
    cta: "Offri un cappuccino",
    size: 0.92,
    perks: [
      { text: "Tutti i perks del **Donator**" },
      { text: "Aggiungere reazioni ai messaggi in chat" },
      { text: "Cooldown dei comandi del bot da 30 a **15 secondi**", isNew: true },
      { text: `Una vocale privata per te e i tuoi amici tramite ${P}`, isNew: true },
      { text: `Reazioni automatiche quando ti @menzionano (max. 3) tramite ${P}`, isNew: true },
      { text: `Un ruolo personalizzato con colore **GRADIENTE** tramite ${P}`, isNew: true },
      { text: "**X5** EXP boost" },
    ],
  },
  {
    id: "vipplus",
    role: "VIP+",
    cup: "La moka intera",
    price: "20 €",
    badge: "Novità",
    cta: "Offri la moka",
    size: 1,
    perks: [
      { text: "Tutti i perks del **VIP**" },
      { text: "Cooldown dei comandi del bot da 30 a **1 secondo**", isNew: true },
      { text: "Sfondo personalizzato per la tua card di +rank, direttamente dal sito", isNew: true },
      { text: `Un secondo ruolo personalizzato con colore **GRADIENTE** tramite ${P}`, isNew: true },
      { text: `Reazioni automatiche quando ti @menzionano (max. 5) tramite ${P}`, isNew: true },
      { text: "**X6** EXP boost", isNew: true },
    ],
  },
];

export const WHERE = [
  { title: "La VPS", text: "Il server che tiene acceso il sito e i bot, giorno e notte." },
  { title: "Bot & database", text: "Sviluppo, hosting e backup di tutto quello che ricordano i bot." },
  { title: "Eventi & giveaway", text: "Premi, Nitro e le serate che tengono vivo il server." },
];
