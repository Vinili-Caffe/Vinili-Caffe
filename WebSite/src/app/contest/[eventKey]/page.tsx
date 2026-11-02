import type { Metadata } from "next";
import { SiteShell } from "@/components/SiteShell";
import { pageSocialMeta } from "@/lib/og";

/**
 * Contest React — calendario live vuoto (sfondi-halloween in archivio/contest-sfondi).
 * generateStaticParams vuoto: nessuna pagina contest esportata finché non si rimette un evento.
 */
const KNOWN = {} as const;

export function generateStaticParams() {
  return Object.keys(KNOWN).map((eventKey) => ({ eventKey }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ eventKey: string }>;
}): Promise<Metadata> {
  const { eventKey } = await params;
  return {
    ...pageSocialMeta({
      path: `/contest/${eventKey}/`,
      title: "Contest",
      description: "Contest Vinili & Caffè",
    }),
    robots: { index: false, follow: false },
  };
}

export default async function ContestPage({
  params,
}: {
  params: Promise<{ eventKey: string }>;
}) {
  await params;
  return (
    <SiteShell>
      <p className="px-6 py-20 text-center text-crema/60">Contest non trovato.</p>
    </SiteShell>
  );
}
