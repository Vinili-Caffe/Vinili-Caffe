import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { Sparkles } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";
import { BoardSkeleton } from "@/components/ui/EmptyState";

const PropositiBoard = dynamic(
  () => import("@/components/propositi/PropositiBoard").then((m) => m.PropositiBoard),
  { loading: () => <BoardSkeleton className="mx-auto max-w-5xl px-6" /> },
);

export const metadata: Metadata = {
  ...pageSocialMeta({
    path: "/propositi/",
    title: "Buoni propositi",
    description: "Capodanno: lascia un proposito anonimo o pubblico. A mezzanotte del 4 gennaio bruciano tutti.",
  }),
  robots: { index: false },
};

export default function PropositiPage() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/propositi/"
        title="Buoni propositi"
        description="Capodanno: lascia un proposito anonimo o pubblico. A mezzanotte del 4 gennaio bruciano tutti."
      />
      <PageHero
        icon={<Sparkles />}
        kicker="Capodanno"
        title="Buoni"
        accent="propositi"
        text="Dal 28 dicembre al 4 gennaio: scrivi un proposito in anonimo o col tuo nome Discord. A mezzanotte del 4 gennaio bruciano e spariscono."
      />
      <PropositiBoard />
    </SiteShell>
  );
}
