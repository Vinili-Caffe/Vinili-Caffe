import type { ReactNode } from "react";
import { Sparkles } from "lucide-react";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { SiteShell } from "@/components/SiteShell";
import { EventoAccessGate } from "@/components/evento/EventoAccessGate";
import { EventoBootScroll } from "@/components/evento/EventoBootScroll";
import { EventoHero } from "@/components/evento/EventoHero";
import type { EventoPageId } from "@/lib/evento-starwars";

/** Shell `/evento/*`: navbar/footer sito con link evento + hero galassia. */
export function EventoPage({
  pageId,
  path,
  title,
  accent,
  text,
  children,
  icon,
}: {
  pageId: EventoPageId;
  path: string;
  title: string;
  /** Opzionale: parola in corsivo dopo il titolo. Non defaultare a “Star Wars”. */
  accent?: string;
  text?: string;
  children: ReactNode;
  icon?: ReactNode;
}) {
  return (
    <SiteShell chrome="evento">
      <EventoBootScroll />
      <DiscordComponentEmbed path={path} title={title} description={text || title} pageLabel="Apri l'evento" />
      {/* Hero fuori dal gate: LCP non aspetta auth/staff (speedRes1). */}
      <EventoHero icon={icon ?? <Sparkles />} title={title} accent={accent} text={text} />
      <EventoAccessGate pageId={pageId}>
        <div className="-mt-6 pb-16 sm:-mt-10">{children}</div>
      </EventoAccessGate>
    </SiteShell>
  );
}
