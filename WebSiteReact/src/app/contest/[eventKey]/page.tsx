import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { SiteShell } from "@/components/SiteShell";
import { BoardSkeleton } from "@/components/ui/EmptyState";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";

const ContestBoard = dynamic(
  () => import("@/components/contest/ContestBoard").then((m) => m.ContestBoard),
  { loading: () => <BoardSkeleton className="mx-auto max-w-lg px-6" /> },
);

const KNOWN = {
  "sfondi-halloween": {
    title: "Contest sfondi Halloween",
    text: "Manda uno sfondo PC o telefono, vota gli altri con uno swipe e segui la classifica live.",
  },
  "outfit-halloween": {
    title: "Contest outfit Halloween",
    text: "Mostra il tuo outfit, vota gli altri con uno swipe e segui la classifica live.",
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
