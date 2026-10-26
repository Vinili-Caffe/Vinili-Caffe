import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { pageSocialMeta } from "@/lib/og";
import { Album } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";

const ListingDetail = dynamic(
  () => import("@/components/bacheca/ListingDetail").then((m) => m.ListingDetail),
  { loading: () => null },
);

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/bacheca/scheda/", title: "Bacheca · Scheda", description: "Scheda dettaglio bot o server in Bacheca." }),
};

export default function Page() {
  return (
    <SiteShell>
      <PageHero
        icon={<Album />}
        kicker="Bacheca"
        title="Dettaglio"
        accent="scheda"
        text="Dettaglio della scheda: descrizione, link e azioni."
      />
      <ListingDetail />
    </SiteShell>
  );
}