import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { SiteShell } from "@/components/SiteShell";
import { EventoAccessGate } from "@/components/evento/EventoAccessGate";
import { EventoHero } from "@/components/evento/EventoHero";
import { EVENTO_BRAND, type EventoPageId } from "@/lib/evento-starwars";

/** Shell comune `/evento/*`: bypass chrome sito → tema Star Wars. */
export function EventoPage({
  pageId,
  path,
  title,
  accent = EVENTO_BRAND,
  text,
  children,
  icon,
}: {
  pageId: EventoPageId;
  path: string;
  title: string;
  accent?: string;
  text: string;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <SiteShell chrome="evento">
      <DiscordComponentEmbed path={path} title={title} description={text} pageLabel="Apri l’evento" />
      <EventoAccessGate pageId={pageId}>
        <EventoHero icon={icon ?? <Sparkles />} title={title} accent={accent} text={text} />
        <div className="pb-16">{children}</div>
      </EventoAccessGate>
    </SiteShell>
  );
}
