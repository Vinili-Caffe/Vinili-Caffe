import type { Metadata } from "next";
import { SiteShell } from "@/components/SiteShell";
import { pageSocialMeta } from "@/lib/og";

export const metadata: Metadata = {
  ...pageSocialMeta({
    path: "/contest/",
    title: "Contest",
    description: "Contest Vinili & Caffè",
  }),
  robots: { index: false, follow: false },
};

/** Nessun contest in calendario (sfondi-halloween archiviato). */
export default function ContestIndexPage() {
  return (
    <SiteShell>
      <p className="px-6 py-20 text-center text-crema/60">Nessun contest attivo.</p>
    </SiteShell>
  );
}
