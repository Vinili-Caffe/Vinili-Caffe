import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { NotebookPen } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";
import { BOT_KINDS, KINDS, loadReviews } from "@/lib/reviews";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { SITE_ORIGIN } from "@/lib/site";
import { BoardSkeleton } from "@/components/ui/EmptyState";

const ReviewsBrowser = dynamic(
  () => import("@/components/reviews/ReviewsBrowser").then((m) => m.ReviewsBrowser),
  { loading: () => <BoardSkeleton className="mx-auto max-w-5xl px-6" /> },
);

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/recensioni/", title: "Recensioni", description: "Le recensioni dei membri di Vinili & Caffè sul server, sullo staff e sul bot Vinili." }),
};

export default async function RecensioniPage() {
  const initial = await loadReviews("server", null, SITE_ORIGIN);
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/recensioni/"
        title="Recensioni"
        description="Le recensioni dei membri di Vinili & Caffè sul server, sullo staff e sul bot Vinili."
      />
      <PageHero
        icon={<NotebookPen />}
        kicker="Recensioni"
        title="Le recensioni di"
        accent="Vinili & Caffè"
        text="Qui i membri raccontano come si sono trovati sul server, con lo staff e con il bot Vinili. Se ci passi anche tu, lascia due righe: servono a chi deve ancora entrare."
      />
      <ReviewsBrowser initial={initial} kinds={[...KINDS, ...BOT_KINDS]} />
    </SiteShell>
  );
}
