import type { Metadata } from "next";
import { pageSocialMeta } from "@/lib/og";
import { LogIn } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";
import { SerataBoard } from "@/components/seratafilm/SerataBoard";

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/seratafilm/accesso-richiesto/", title: "Accesso richiesto ǀ Serata Film", description: "Accedi per entrare nella serata film." }),
};

export default function Page() {
  return (
    <SiteShell>
      <PageHero
        icon={<LogIn />}
        kicker="Serata film"
        title="Accesso"
        accent="richiesto"
        text="Serve il login Discord (High Staff) per la serata film."
      />
      <SerataBoard />
    </SiteShell>
  );
}