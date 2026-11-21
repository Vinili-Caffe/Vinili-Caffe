import type { Metadata } from "next";
import { Suspense } from "react";
import { pageSocialMeta } from "@/lib/og";
import { EmbedWidget } from "@/components/vetrina/EmbedWidget";

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/vetrina/embed/", title: "Embed Vetrina", description: "Il riquadro di una scheda della Vetrina da inserire in altri siti." }),
  robots: { index: false, follow: false },
};

export default function Page() {
  return (
    <main className="min-h-[140px] bg-transparent p-0">
      <Suspense fallback={<div className="h-[140px] animate-pulse rounded-2xl bg-[#1a110c]/80" />}>
        <EmbedWidget />
      </Suspense>
    </main>
  );
}
