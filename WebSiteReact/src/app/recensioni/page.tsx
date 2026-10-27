import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { NotebookPen } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";
import { loadReviews } from "@/lib/reviews";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { SITE_ORIGIN } from "@/lib/site";
import { BoardSkeleton } from "@/components/ui/EmptyState";

const ReviewsBrowser = dynamic(
  () => import("@/components/reviews/ReviewsBrowser").then((m) => m.ReviewsBrowser),
  { loading: () => <BoardSkeleton className="mx-auto max-w-5xl px-6" /> },
);

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/recensioni/", title: "Recensioni", description: "Cosa dicono di Vinili & Caffè: recensioni del server e dello staff." }),
};

export default async function RecensioniPage() {
  const initial = await loadReviews("server", null, SITE_ORIGIN);
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/recensioni/"
        title="Recensioni"
        description="Cosa dicono di Vinili & Caffè: recensioni del server e dello staff."
      />
      <PageHero
        icon={<NotebookPen />}
        kicker="Recensioni"
        title="Le recensioni del"
        accent="server"
        text="Cosa pensano i membri del server e dello staff. Lascia anche la tua recensione."
      />
      <ReviewsBrowser initial={initial} />
    </SiteShell>
  );
}
