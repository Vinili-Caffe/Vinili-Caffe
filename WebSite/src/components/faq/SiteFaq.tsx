"use client";

import { Bot } from "lucide-react";
import { botFaqFor } from "@/lib/bot-faq";
import { FAQ_CATEGORIES, FAQ_ITEMS } from "@/lib/faq";
import { useI18n } from "@/lib/i18n";
import { FAQ_ICONS, FaqBrowser } from "./FaqBrowser";

/**
 * FAQ del sito: quelle del server più quelle del bot Vinili, nella stessa ricerca.
 * Le domande sul bot stanno tutte nella categoria "Il bot Vinili" (/faq/#bot la apre).
 */
export function SiteFaq() {
  const { locale } = useI18n();
  const bot = botFaqFor(locale);
  const items = [...FAQ_ITEMS, ...bot.items.map((it) => ({ id: it.id, category: "bot", title: it.title, body: it.body }))];
  return (
    <FaqBrowser
      items={items}
      categories={[...FAQ_CATEGORIES, { id: "bot", label: "Il bot Vinili" }]}
      icons={{ ...FAQ_ICONS, bot: Bot }}
      placeholder="Cerca: EXP, eventi, prefisso, partnership…"
    />
  );
}
