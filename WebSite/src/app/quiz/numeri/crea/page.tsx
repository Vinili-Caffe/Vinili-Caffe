import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { PencilLine } from "lucide-react";
import { PageHero } from "@/components/PageHero";
import { SiteShell } from "@/components/SiteShell";
import { pageSocialMeta } from "@/lib/og";

const NumberQuizCreate = dynamic(() => import("@/components/number-quiz/NumberQuizCreate").then((m) => m.NumberQuizCreate));

export const metadata: Metadata = {
  ...pageSocialMeta({
    path: "/quiz/numeri/crea/",
    title: "Crea una categoria",
    description: "Crea la tua categoria del Number Quiz e falla giocare a tutti.",
  }),
  robots: { index: false, follow: false },
};

export default function NumberQuizCreatePage() {
  return (
    <SiteShell>
      <PageHero compact icon={<PencilLine />} kicker="Number Quiz" title="Crea una" accent="categoria" text="Scrivi almeno 6 voci, ognuna con il suo numero." />
      <NumberQuizCreate />
    </SiteShell>
  );
}
