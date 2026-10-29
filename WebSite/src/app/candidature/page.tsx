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
  ...pageSocialMeta({ path: "/candidature/", title: "Candidature", description: "Candidati allo staff di Vinili & Caffè come Helper o Partner Manager." }),
};

export default function CandidaturePage() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/candidature/"
        title="Candidature"
        description="Candidati allo staff di Vinili & Caffè come Helper o Partner Manager."
      />
      <PageHero
        icon={<Coffee />}
        kicker="Candidature"
        title="Candidatura"
        accent="staff"
        text="Su Vinili & Caffè puoi candidarti a due ruoli: Helper e Partner Manager."
      />
      <CandidatureBoard />
    </SiteShell>
  );
}
