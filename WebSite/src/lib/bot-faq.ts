// FAQ della dashboard bot: dati statici da WebSite/js/vc-bot-faq-static.js (nessuna API).

import pack from "./bot-faq-data.json";

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

export const BOT_FAQ_CATEGORIES: BotFaqCategory[] = pack.categories.map((c) => ({
  id: c.id,
  label: c.label,
  description: c.description,
}));

export const BOT_FAQ_ITEMS: BotFaqItem[] = pack.items.map((it, i) => ({
  id: `bot-faq-${i}-${it.category}`,
  category: it.category,
  title: it.title,
  body: it.body,
}));
