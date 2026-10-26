import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { pageSocialMeta } from "@/lib/og";
import { PlusCircle } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";

const SubmitListing = dynamic(
  () => import("@/components/bacheca/SubmitListing").then((m) => m.SubmitListing),
  { loading: () => null },
);

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/bacheca/invia/", title: "Bacheca · Invia", description: "Invia una scheda bot o server alla Bacheca." }),
};

export default function Page() {
  return (
    <SiteShell>
      <PageHero
        icon={<PlusCircle />}
        kicker="Bacheca"
        title="Invia"
        accent="una scheda"
        text="Compila la scheda del tuo server o bot e mandala in revisione."
      />
      <SubmitListing />
    </SiteShell>
  );
}