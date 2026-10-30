"use client";

import type { ReactNode } from "react";
import { PageHero } from "@/components/PageHero";
import { EVENTO_KICKER } from "@/lib/evento-starwars";
import { cdnUrl } from "@/lib/site";

/** Hero come le pagine sito, con foto galassia Star Wars. */
export function EventoHero({
  title,
  text,
  accent,
  icon,
}: {
  title: string;
  text: string;
  accent?: string;
  icon?: ReactNode;
}) {
  return (
    <PageHero
      icon={icon}
      kicker={EVENTO_KICKER}
      title={title}
      accent={accent}
      text={text}
      tone="evento"
      imageSrc={cdnUrl("/images/starwars/star-wars-italia-galaxy.webp")}
      imageSrcMobile={cdnUrl("/images/starwars/star-wars-italia-galaxy-mobile.webp")}
      videoSrc={null}
      videoSrcMobile={null}
    />
  );
}
