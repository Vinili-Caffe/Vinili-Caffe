import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";
import { EventoAccessGate } from "@/components/evento/EventoAccessGate";
import { EventoNav } from "@/components/evento/EventoNav";
import { EVENTO_BRAND, EVENTO_KICKER, type EventoPageId } from "@/lib/evento-starwars";

/** Shell comune pagine `/evento/*` (+ gate: non pubblici → redirect home). */
export function EventoPage({
  pageId,
  path,
  title,
  accent = EVENTO_BRAND,
  text,
  children,
}: {
  pageId: EventoPageId;
  path: string;
  title: string;
  accent?: string;
  text: string;
  children: ReactNode;
}) {
  return (
    <SiteShell>
      <DiscordComponentEmbed path={path} title={title} description={text} pageLabel="Apri l’evento" />
      <EventoAccessGate pageId={pageId}>
        <PageHero icon={<Sparkles />} kicker={EVENTO_KICKER} title={title} accent={accent} text={text} />
        <div className="-mt-10 mb-10 sm:-mt-14">
          <EventoNav />
        </div>
        {children}
      </EventoAccessGate>
    </SiteShell>
  );
}
