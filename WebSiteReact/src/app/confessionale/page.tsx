import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { pageSocialMeta } from "@/lib/og";
import { Feather } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";
import { BoardSkeleton } from "@/components/ui/EmptyState";

const ConfessionaleBoard = dynamic(() => import("@/components/confessionale/ConfessionaleBoard").then((m) => m.ConfessionaleBoard), { loading: () => <BoardSkeleton className="mx-auto max-w-5xl px-6" />,
});

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/confessionale/", title: "Confessionale", description: "Spazio aperto alla community: sfoga o segnala in totale anonimato." }),
  robots: { index: false },
};

export default function ConfessionalePage() {
  return (
    <SiteShell>
      <PageHero
        icon={<Feather />}
        kicker="Community"
        title="Il"
        accent="confessionale"
        text="Spazio aperto alla community: sfoga o segnala in totale anonimato. Nessun nome, nessun ID Discord, nessun log dell’autore."
      />
      <ConfessionaleBoard />
    </SiteShell>
  );
}
