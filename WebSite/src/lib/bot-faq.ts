// FAQ della dashboard bot: dati statici da WebSite/js/vc-bot-faq-static.js (nessuna API).
// Italiano in bot-faq-data.json, traduzioni curate in .en / .es (le altre lingue usano l'inglese).

import pack from "./bot-faq-data.json";
import packEn from "./bot-faq-data.en.json";
import packEs from "./bot-faq-data.es.json";
import type { Locale } from "./i18n";

export type BotFaqCategory = {
  id: string;
  label: string;
  description: string;
};

export type BotFaqItem = {
  id: string;
  category: string;
  title: string;
  body: string;
};

type Pack = typeof pack;

function build(p: Pack) {
  return {
    categories: p.categories.map((c) => ({ id: c.id, label: c.label, description: c.description })) as BotFaqCategory[],
    items: p.items.map((it, i) => ({ id: `bot-faq-${i}-${it.category}`, category: it.category, title: it.title, body: it.body })) as BotFaqItem[],
  };
}

const IT = build(pack);
const EN = build(packEn as Pack);
const ES = build(packEs as Pack);

export const BOT_FAQ_CATEGORIES: BotFaqCategory[] = IT.categories;
export const BOT_FAQ_ITEMS: BotFaqItem[] = IT.items;

/** FAQ nella lingua scelta (gli id restano gli stessi, così i link alle domande funzionano in tutte). */
export function botFaqFor(locale: Locale) {
  if (locale === "it") return IT;
  return locale === "es" ? ES : EN;
}
