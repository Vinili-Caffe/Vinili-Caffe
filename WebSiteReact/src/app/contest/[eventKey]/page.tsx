import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { Ghost } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";
import { BoardSkeleton } from "@/components/ui/EmptyState";
import { pageSocialMeta } from "@/lib/og";

const ContestBoard = dynamic(
  () => import("@/components/contest/ContestBoard").then((m) => m.ContestBoard),
  { loading: () => <BoardSkeleton className="mx-auto max-w-lg px-6" /> },
);

const KNOWN = {
  "sfondi-halloween": {
    title: "Contest sfondi Halloween",
    text: "Invia uno sfondo a tema e vota gli altri in stile swipe. Pagina non in menu — solo link diretto.",
  },
  "outfit-halloween": {
    title: "Contest outfit Halloween",
    text: "Invia il tuo outfit e vota con uno swipe. Pagina non in menu — solo link diretto.",
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
      <PageHero icon={<Ghost />} kicker="Halloween" title={meta.title} accent="contest" text={meta.text} />
      <ContestBoard eventKey={eventKey} />
    </SiteShell>
  );
}
