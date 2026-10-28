"use client";

import type { ReactNode } from "react";
import { PageHero } from "@/components/PageHero";
import { EVENTO_KICKER } from "@/lib/evento-starwars";

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
      imageSrc="/images/star-wars-italia-galaxy.webp"
      imageSrcMobile="/images/star-wars-italia-galaxy-mobile.webp"
    />
  );
}
