import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { Feather } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";
import { BoardSkeleton } from "@/components/ui/EmptyState";
import { ConfessionaleSeasonRedirect } from "@/components/confessionale/ConfessionaleSeasonRedirect";
import { NavActivitySeen } from "@/components/NavActivitySeen";

const ConfessionaleBoard = dynamic(() => import("@/components/confessionale/ConfessionaleBoard").then((m) => m.ConfessionaleBoard), { loading: () => <BoardSkeleton className="mx-auto max-w-5xl px-6" />,
});

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/confessionale/", title: "Confessionale", description: "Uno spazio della community per sfogarsi o segnalare qualcosa senza firmarsi." }),
  robots: { index: false },
};

export default function ConfessionalePage() {
  return (
    <SiteShell>
      <NavActivitySeen path="/confessionale" />
      <ConfessionaleSeasonRedirect />
      <DiscordComponentEmbed
        path="/confessionale/"
        title="Confessionale"
        description="Uno spazio della community per sfogarsi o segnalare qualcosa senza firmarsi."
      />
      <PageHero
        icon={<Feather />}
        kicker="Community"
        title="Il"
        accent="confessionale"
        text="Qui puoi sfogarti o segnalare qualcosa senza firmarti. Il messaggio compare senza nome e senza account Discord, e non teniamo traccia di chi l’ha scritto."
      />
      <ConfessionaleBoard />
    </SiteShell>
  );
}
