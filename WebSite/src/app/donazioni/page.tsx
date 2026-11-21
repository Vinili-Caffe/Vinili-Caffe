import type { Metadata } from "next";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { Heart } from "lucide-react";
import { DonateBoard } from "@/components/donate/DonateBoard";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/donazioni/", title: "Donazioni", description: "Sostieni Vinili & Caffè con una donazione su PayPal: aiuta a tenere accesi i bot e a organizzare gli eventi. In cambio ricevi il ruolo Donator, VIP o VIP+." }),
};

export default function DonazioniPage() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/donazioni/"
        title="Donazioni"
        description="Sostieni Vinili & Caffè con una donazione su PayPal: aiuta a tenere accesi i bot e a organizzare gli eventi. In cambio ricevi il ruolo Donator, VIP o VIP+."
      />
      <PageHero
        icon={<Heart />}
        kicker="Donazioni"
        title="Supporta"
        accent="il server"
        text="Le donazioni coprono quello che serve per tenere in piedi il server: i bot, il sito, i premi degli eventi. Anche pochi euro fanno la loro parte, e finiscono tutti lì."
      />
      <DonateBoard />
    </SiteShell>
  );
}
