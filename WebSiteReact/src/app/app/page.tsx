import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { Smartphone } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { BoardSkeleton } from "@/components/ui/EmptyState";

const InstallAppBoard = dynamic(
  () => import("@/components/install/InstallAppBoard").then((m) => m.InstallAppBoard),
  { loading: () => <BoardSkeleton className="mx-auto max-w-2xl px-6" /> },
);

export const metadata: Metadata = {
  ...pageSocialMeta({
    path: "/app/",
    title: "Installa l'app",
    description: "Installa Vinili & Caffè sul telefono o sul PC: apertura rapida e notifiche più affidabili.",
  }),
};

export default function InstallAppPage() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/app/"
        title="Installa l'app"
        description="Installa Vinili & Caffè sul telefono o sul PC: apertura rapida e notifiche più affidabili."
      />
      <PageHero
        icon={<Smartphone />}
        kicker="Web app"
        title="Portati"
        accent="Vinili & Caffè"
        text="Istruzioni per il tuo dispositivo: in pochi tocchi l'apri come un'app, con le notifiche più stabili."
      />
      <InstallAppBoard />
    </SiteShell>
  );
}
