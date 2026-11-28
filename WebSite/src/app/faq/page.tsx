import type { Metadata } from "next";
import { BookOpen, LifeBuoy, MessagesSquare } from "lucide-react";
import { DiscordButton } from "@/components/DiscordButton";
import { SiteFaq } from "@/components/faq/SiteFaq";
import { PageHero } from "@/components/PageHero";
import { Reveal } from "@/components/Reveal";
import { SiteShell } from "@/components/SiteShell";
import { SmartLink } from "@/components/SmartLink";
import { page } from "@/lib/site";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";

export const metadata: Metadata = {
  ...pageSocialMeta({
    path: "/faq/",
    title: "FAQ",
    description: "Domande su livelli, musica, giochi, eventi, staff, sito e Vetrina di Vinili & Caffè.",
  }),
};

export default function FaqPage() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/faq/"
        title="FAQ"
        description="Domande su livelli, musica, giochi, eventi, staff, sito e Vetrina."
      />
      <PageHero
        icon={<BookOpen />}
        kicker="Supporto"
        title="Domande"
        accent="frequenti"
        text="Quello che ci chiedono più spesso. Se manca la risposta, apri un ticket."
      />

      <SiteFaq />

      {/* non hai trovato risposta */}
      <section className="mx-auto max-w-4xl px-6 pb-10">
        <Reveal>
          <div className="relative overflow-hidden rounded-3xl bg-gradient-to-br from-mocha to-roast p-8 ring-1 ring-sand/15 sm:p-10"><h2 className="relative font-display text-3xl font-semibold sm:text-4xl">Non hai trovato risposta?</h2>
            <p className="relative mt-3 max-w-xl text-crema/70">
              Chiedi in chat alla community oppure apri un ticket: lo staff ti risponde il prima possibile.
            </p>
            <div className="relative mt-7 flex flex-wrap gap-3">
              <DiscordButton label="Chiedi su Discord" />
              <SmartLink
                href={page("/tickets/")}
                className="inline-flex items-center gap-2 rounded-full px-6 py-3.5 font-medium text-crema/85 ring-1 ring-crema/20 transition-colors hover:bg-crema/8 hover:text-crema"
              >
                <LifeBuoy className="size-4" /> Apri un ticket
              </SmartLink>
              <SmartLink
                href={page("/wiki/")}
                className="inline-flex items-center gap-2 rounded-full px-6 py-3.5 font-medium text-crema/85 ring-1 ring-crema/20 transition-colors hover:bg-crema/8 hover:text-crema"
              >
                <MessagesSquare className="size-4" /> Comandi dei bot
              </SmartLink>
            </div>
          </div>
        </Reveal>
      </section>
    </SiteShell>
  );
}
