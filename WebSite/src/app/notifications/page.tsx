import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { Bell } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";
import { BoardSkeleton } from "@/components/ui/EmptyState";

const NotificationsBoard = dynamic(() => import("@/components/notifications/NotificationsBoard").then((m) => m.NotificationsBoard), { loading: () => <BoardSkeleton className="mx-auto max-w-3xl px-6" />,
});

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/notifications/", title: "Notifiche", description: "Le tue notifiche del sito Vinili & Caffè: ticket, voti, esiti e aggiornamenti della community." }),
  robots: { index: false },
};

export default function NotificationsPage() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/notifications/"
        title="Notifiche"
        description="Le tue notifiche del sito Vinili & Caffè: ticket, voti, esiti e aggiornamenti della community."
      />
      <PageHero
        icon={<Bell />}
        kicker="Notifiche"
        title="Le notifiche di"
        accent="Vinili & Caffè"
        text="Qui trovi gli avvisi del sito: voti, ticket, risposte e aggiornamenti sul tuo account."
      />
      <NotificationsBoard />
    </SiteShell>
  );
}
