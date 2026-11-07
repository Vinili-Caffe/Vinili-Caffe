import type { ReactNode } from "react";
import { Clapperboard } from "lucide-react";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";
import { EventoBootScroll } from "@/components/evento/EventoBootScroll";
import { EventoHero } from "@/components/evento/EventoHero";
import { isEventoImmersionActive } from "@/lib/evento-starwars";

/**
 * Shell `/seratafilm/*`: in immersione SW (1 dic → chiusura evento)
 * → chrome/hero/token galassia; fuori stagione resta il look sito.
 */
export function SerataFilmShell({
  path,
  title,
  description,
  heroTitle,
  heroAccent,
  heroText,
  heroIcon,
  heroKicker,
  children,
}: {
  path: string;
  title: string;
  description: string;
  heroTitle: string;
  heroAccent?: string;
  heroText?: string;
  heroIcon?: ReactNode;
  /** Solo fuori immersione SW (EventoHero usa EVENTO_KICKER). */
  heroKicker?: string;
  children: ReactNode;
}) {
  const sw = isEventoImmersionActive();
  const icon = heroIcon ?? <Clapperboard />;

  return (
    <SiteShell chrome={sw ? "evento" : "site"}>
      {sw ? <EventoBootScroll /> : null}
      <DiscordComponentEmbed path={path} title={title} description={description} />
      {sw ? (
        <EventoHero icon={icon} title={heroTitle} accent={heroAccent} text={heroText || ""} />
      ) : (
        <PageHero
          icon={icon}
          kicker={heroKicker ?? "Eventi"}
          title={heroTitle}
          accent={heroAccent}
          text={heroText}
        />
      )}
      {children}
    </SiteShell>
  );
}
