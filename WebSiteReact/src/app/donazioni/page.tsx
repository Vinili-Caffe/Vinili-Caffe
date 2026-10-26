import type { Metadata } from "next";
import { pageSocialMeta } from "@/lib/og";
import { Heart } from "lucide-react";
import { DonateBoard } from "@/components/donate/DonateBoard";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/donazioni/", title: "Donazioni", description: "Supporta Vinili & Caffè: ogni donazione va a VPS, bot ed eventi. Ruoli Donator, VIP e VIP+ con PayPal." }),
};

export default function DonazioniPage() {
  return (
    <SiteShell>
      <PageHero
        icon={<Heart />}
        kicker="Donazioni"
        title="Supporta"
        accent="il server"
        text="Anche il più piccolo contributo viene reinvestito interamente sul progetto."
      />
      <DonateBoard />
    </SiteShell>
  );
}
