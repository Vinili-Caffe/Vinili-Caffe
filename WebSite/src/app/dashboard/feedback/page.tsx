import type { Metadata } from "next";
import dynamic from "next/dynamic";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

const BotFeedbackBoard = dynamic(
  () => import("@/components/dashboard/BotFeedbackBoard").then((m) => m.BotFeedbackBoard),
  { loading: () => null },
);

export const metadata: Metadata = { title: "Feedback bot · Dashboard", robots: { index: false } };

export default function Page() {
  return (
    <DashboardShell title="Feedback sul bot" lead="Idee e problemi sul bot Vinili.">
      <BotFeedbackBoard />
    </DashboardShell>
  );
}