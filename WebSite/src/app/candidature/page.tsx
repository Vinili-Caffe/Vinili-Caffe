import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { Coffee } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";
import { BoardSkeleton } from "@/components/ui/EmptyState";

const CandidatureBoard = dynamic(
  () => import("@/components/candidature/CandidatureBoard").then((m) => m.CandidatureBoard),
  { loading: () => <BoardSkeleton className="mx-auto max-w-5xl px-6" /> },
);

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/candidature/", title: "Candidature", description: "Candidati allo staff di Vinili & Caffè come Helper o Partner Manager: cosa fa ciascun ruolo e come si invia la domanda." }),
};

export default function CandidaturePage() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/candidature/"
        title="Candidature"
        description="Candidati allo staff di Vinili & Caffè come Helper o Partner Manager: cosa fa ciascun ruolo e come si invia la domanda."
      />
      <PageHero
        icon={<Coffee />}
        kicker="Candidature"
        title="Candidatura"
        accent="staff"
        text="Cerchiamo due figure. Gli Helper aiutano i membri e tengono d'occhio le chat; i Partner Manager si occupano delle partnership con altri server. Scegli quella che ti somiglia di più e compila il modulo."
      />
      <CandidatureBoard />
    </SiteShell>
  );
}
