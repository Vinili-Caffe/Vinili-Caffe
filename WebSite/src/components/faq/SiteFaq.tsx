"use client";

import { useEffect, useState } from "react";
import { Bot, Coffee } from "lucide-react";
import { BOT_FAQ_ICONS } from "@/components/dashboard/BotFaqBrowser";
import { botFaqFor } from "@/lib/bot-faq";
import { cn } from "@/lib/cn";
import { useI18n } from "@/lib/i18n";
import { FaqBrowser } from "./FaqBrowser";

/**
 * FAQ del sito con due schede: il server Vinili & Caffè e il bot Vinili, ognuna con le sue categorie.
 * /faq/#bot apre direttamente quella del bot.
 */
export function SiteFaq() {
  const { locale } = useI18n();
  const [bot, setBot] = useState(false);

  useEffect(() => {
    const read = () => {
      if (location.hash === "#bot") setBot(true);
    };
    const t = window.setTimeout(read, 0);
    window.addEventListener("hashchange", read);
    return () => {
      window.clearTimeout(t);
      window.removeEventListener("hashchange", read);
    };
  }, []);

  const pick = (next: boolean) => {
    try {
      const url = new URL(window.location.href);
      url.hash = next ? "bot" : "";
      window.history.replaceState(window.history.state, "", url.toString());
    } catch {
      /* ignore */
    }
    setBot(next);
  };

  const botFaq = botFaqFor(locale);

  return (
    <>
      <div className="mx-auto mb-6 flex max-w-4xl justify-center px-6">
        <div role="tablist" aria-label="FAQ del server o del bot" className="inline-flex rounded-full bg-black/30 p-1 ring-1 ring-crema/10">
          {(
            [
              [false, "Server", <Coffee key="s" className="size-4" aria-hidden />],
              [true, "Il bot Vinili", <Bot key="b" className="size-4" aria-hidden />],
            ] as const
          ).map(([isBot, label, icon]) => (
            <button
              key={label}
              type="button"
              role="tab"
              aria-selected={bot === isBot}
              onClick={() => pick(isBot)}
              className={cn(
                "inline-flex items-center gap-2 rounded-full px-4 py-1.5 text-sm font-semibold transition-colors",
                bot === isBot ? "bg-crema text-espresso" : "text-crema/60 hover:text-crema",
              )}
            >
              {icon} {label}
            </button>
          ))}
        </div>
      </div>
      {bot ? (
        <FaqBrowser key="bot" items={botFaq.items} categories={botFaq.categories} icons={BOT_FAQ_ICONS} placeholder="Cerca: prefisso, comandi, partnership…" />
      ) : (
        <FaqBrowser key="server" />
      )}
    </>
  );
}
