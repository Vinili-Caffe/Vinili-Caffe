import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { pageSocialMeta } from "@/lib/og";
import { Shield } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";

const ModQueue = dynamic(
  () => import("@/components/bacheca/ModQueue").then((m) => m.ModQueue),
  { loading: () => null },
);

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/bacheca/mod/", title: "Mod Bacheca", description: "Coda moderazione Bacheca." }),
};

export default function Page() {
  return (
    <SiteShell>
      <PageHero
        icon={<Shield />}
        kicker="Staff"
        title="Coda"
        accent="moderazione"
        text="Approva o rifiuta le schede in revisione."
      />
      <ModQueue />
    </SiteShell>
  );
}