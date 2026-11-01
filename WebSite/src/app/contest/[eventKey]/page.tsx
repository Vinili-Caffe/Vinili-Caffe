import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { preload } from "react-dom";
import { SiteShell } from "@/components/SiteShell";
import { BoardSkeleton } from "@/components/ui/EmptyState";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";
import { cdnUrl } from "@/lib/site";

const ContestBoard = dynamic(
  () => import("@/components/contest/ContestBoard").then((m) => m.ContestBoard),
  { loading: () => <BoardSkeleton className="mx-auto max-w-lg px-6" /> },
);

const KNOWN = {
  "sfondi-halloween": {
    title: "Contest sfondi Halloween",
    text: "Manda uno sfondo PC o telefono, vota gli altri con uno swipe e segui la classifica live.",
  },
} as const;

export function generateStaticParams() {
  return Object.keys(KNOWN).map((eventKey) => ({ eventKey }));
}

export async function generateMetadata({
  params,
}: {
  params: Promise<{ eventKey: string }>;
}): Promise<Metadata> {
  const { eventKey } = await params;
  const meta = KNOWN[eventKey as keyof typeof KNOWN];
  return {
    ...pageSocialMeta({
      path: `/contest/${eventKey}/`,
      title: meta?.title || "Contest",
      description: meta?.text || "Contest Vinili & Caffè",
    }),
    robots: { index: false, follow: false },
  };
}

export default async function ContestPage({
  params,
}: {
  params: Promise<{ eventKey: string }>;
}) {
  const { eventKey } = await params;
  const meta = KNOWN[eventKey as keyof typeof KNOWN];
  if (!meta) {
    return (
      <SiteShell>
        <p className="px-6 py-20 text-center text-crema/60">Contest non trovato.</p>
      </SiteShell>
    );
  }
  /* l'intestazione sta nella tabella caricata a parte: senza questo l'immagine partiva 2–3 s dopo (LCP) */
  preload(cdnUrl("/images/hero-cafe-atmosphere-band.jpg"), { as: "image", fetchPriority: "high" });
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path={`/contest/${eventKey}/`}
        title={meta.title}
        description={meta.text}
        pageLabel="Apri il contest"
      />
      <ContestBoard eventKey={eventKey} heroTitle={meta.title} heroText={meta.text} />
    </SiteShell>
  );
}
