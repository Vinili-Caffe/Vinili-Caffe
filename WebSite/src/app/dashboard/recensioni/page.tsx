import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

const BotReviewsBoard = dynamic(
  () => import("@/components/dashboard/BotReviewsBoard").then((m) => m.BotReviewsBoard),
  { loading: () => null },
);

export const metadata: Metadata = { title: "Recensioni bot · Dashboard", robots: { index: false } };

export default function Page() {
  return (
    <DashboardShell title="Recensioni del bot" lead="Cosa dicono gli utenti del bot Vinili.">
      <BotReviewsBoard />
    </DashboardShell>
  );
}