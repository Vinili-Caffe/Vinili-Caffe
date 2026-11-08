import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { PlusCircle } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";

const SubmitListing = dynamic(
  () => import("@/components/bacheca/SubmitListing").then((m) => m.SubmitListing),
  { loading: () => null },
);

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/vetrina/invia/", title: "Vetrina · Invia", description: "Invia una scheda bot o server alla Vetrina." }),
};

export default function Page() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/vetrina/invia/"
        title="Vetrina · Invia"
        description="Invia una scheda bot o server alla Vetrina."
      />
      <PageHero
        icon={<PlusCircle />}
        kicker="Vetrina"
        title="Invia"
        accent="una scheda"
        text="Compila la scheda del tuo server o bot e mandala in revisione."
      />
      <SubmitListing />
    </SiteShell>
  );
}