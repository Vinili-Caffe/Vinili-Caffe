import type { Metadata } from "next";
import { Suspense } from "react";
import dynamic from "next/dynamic";
import { SiteShell } from "@/components/SiteShell";
import { pageSocialMeta } from "@/lib/og";

const NumberQuizPlay = dynamic(() => import("@/components/number-quiz/NumberQuizPlay").then((m) => m.NumberQuizPlay));

export const metadata: Metadata = {
  ...pageSocialMeta({
    path: "/quiz/numeri/gioca/",
    title: "Number Quiz",
    description: "Più o meno? Indovina quale numero è più alto e allunga la serie.",
  }),
  robots: { index: false, follow: true },
};

export default function NumberQuizPlayPage() {
  return (
    <SiteShell>
      <Suspense fallback={null}>
        <NumberQuizPlay />
      </Suspense>
    </SiteShell>
  );
}
