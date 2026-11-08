"use client";

import {
  Compass,
  Crown,
  Database,
  Handshake,
  LayoutDashboard,
  LifeBuoy,
  MessageSquarePlus,
  SlidersHorizontal,
  Terminal,
  Users,
  type LucideIcon,
} from "lucide-react";
import { FaqBrowser } from "@/components/faq/FaqBrowser";
import { SmartLink } from "@/components/SmartLink";
import { BOT_FAQ_CATEGORIES, BOT_FAQ_ITEMS } from "@/lib/bot-faq";
import { page } from "@/lib/site";
import { dashPrimaryBtn } from "./guild/bits";

const BOT_FAQ_ICONS: Record<string, LucideIcon> = {
  faq_start: Compass,
  faq_dashboard: LayoutDashboard,
  faq_settings: SlidersHorizontal,
  faq_commands: Terminal,
  faq_partnership: Handshake,
  faq_team: Users,
  faq_premium: Crown,
  faq_data: Database,
  faq_help: LifeBuoy,
};

/** FAQ del bot: stessa pagina delle FAQ del sito (ricerca, categorie, domande a fisarmonica). */
export function BotFaqBrowser() {
  return (
    <div className="space-y-6">
      <FaqBrowser
        items={BOT_FAQ_ITEMS}
        categories={BOT_FAQ_CATEGORIES}
        icons={BOT_FAQ_ICONS}
        placeholder="Cerca: prefisso, comandi, partnership…"
        className="pb-2"
      />
      <section className="relative overflow-hidden rounded-2xl bg-gradient-to-br from-mocha to-roast p-6 ring-1 ring-sand/12 sm:p-8">
        <div className="absolute -right-16 -top-16 size-56 rounded-full bg-caramel/15 blur-3xl" aria-hidden />
        <h2 className="relative font-display text-2xl font-semibold sm:text-3xl">Non hai trovato risposta?</h2>
        <p className="relative mt-2 max-w-xl text-sm text-crema/65">
          Scrivilo nei feedback del bot: se è un problema lo sistemiamo, se è un&apos;idea la valutiamo.
        </p>
        <SmartLink href={page("/dashboard/feedback/")} className={`${dashPrimaryBtn} relative mt-5`}>
          <MessageSquarePlus className="size-4" aria-hidden /> Vai ai feedback
        </SmartLink>
      </section>
    </div>
  );
}
