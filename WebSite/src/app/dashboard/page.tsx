import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";

const BotShowcase = dynamic(
  () => import("@/components/dashboard/BotShowcase").then((m) => m.BotShowcase),
  { loading: () => null },
);

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/dashboard/", title: "Vinili · Dashboard", description: "Vinili, il bot di Vinili & Caffè: ticket, moderazione, partnership, annunci, live e molto altro, tutto configurabile dal sito." }),
  robots: { index: false },
};

export default function DashboardPage() {
  return (
    <>
      <DiscordComponentEmbed
        path="/dashboard/"
        title="Vinili"
        description="Vinili, il bot di Vinili & Caffè: ticket, moderazione, partnership, annunci, live e molto altro, tutto configurabile dal sito."
      />
      <BotShowcase />
    </>
  );
}
