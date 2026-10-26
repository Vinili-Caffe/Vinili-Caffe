import type { Metadata } from "next";
import { pageSocialMeta } from "@/lib/og";
import { Suspense } from "react";
import { Disc3 } from "lucide-react";
import { PersonalizzaBoard } from "@/components/personalizza/PersonalizzaBoard";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/personalizza/", title: "Personalizza", description: "Personalizza rank card, ruoli custom, vocale privata, colori PLUS e reazioni dal pannello web Vinili & Caffè." }),
};

export default function PersonalizzaPage() {
  return (
    <SiteShell>
      <PageHero
        icon={<Disc3 />}
        kicker="Profilo"
        title="Personalizza"
        accent="il profilo"
        text="Rank card, ruoli, privacy e impostazioni del profilo Discord."
      />
      <Suspense
        fallback={
          <div className="mx-auto max-w-5xl px-6 pb-20">
            <div className="h-40 animate-pulse rounded-3xl bg-roast/50 ring-1 ring-sand/10" />
          </div>
        }
      >
        <PersonalizzaBoard />
      </Suspense>
    </SiteShell>
  );
}
