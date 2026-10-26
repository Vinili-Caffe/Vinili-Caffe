import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { pageSocialMeta } from "@/lib/og";
import { Server } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";

const BoardsBrowse = dynamic(
  () => import("@/components/bacheca/BoardsBrowse").then((m) => m.BoardsBrowse),
  { loading: () => null },
);

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/bacheca/server/", title: "Bacheca · Server", description: "Server Discord in Bacheca Vinili & Caffè." }),
};

export default function Page() {
  return (
    <SiteShell>
      <PageHero
        icon={<Server />}
        kicker="Bacheca"
        title="Scaffale"
        accent="server"
        text="I server in vetrina: cerca, filtra e apri la scheda."
      />
      <BoardsBrowse initialKind="server" />
    </SiteShell>
  );
}