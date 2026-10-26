import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { Ticket } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";
import { BoardSkeleton } from "@/components/ui/EmptyState";

const TicketsApp = dynamic(() => import("@/components/tickets/TicketsApp").then((m) => m.TicketsApp), { loading: () => <BoardSkeleton className="mx-auto max-w-5xl px-3 sm:px-6" />,
});

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/tickets/", title: "Tickets", description: "Assistenza live con lo staff di Vinili & Caffè: apri un ticket con un click e parla in tempo reale." }),
  robots: { index: false },
};

export default function TicketsPage() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/tickets/"
        title="Tickets"
        description="Assistenza live con lo staff di Vinili & Caffè: apri un ticket con un click e parla in tempo reale."
      />
      <PageHero
        kicker="Assistenza"
        title="Tickets"
        accent="live"
        text="Apri un ticket e parla in tempo reale con lo staff."
        icon={<Ticket />}
      />
      <div className="px-3 pb-8 sm:px-6 sm:pb-10">
        <TicketsApp />
      </div>
    </SiteShell>
  );
}
