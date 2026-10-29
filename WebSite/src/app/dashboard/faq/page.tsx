import type { Metadata } from "next";
import { BotFaqBrowser } from "@/components/dashboard/BotFaqBrowser";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

export const metadata: Metadata = { title: "FAQ bot · Dashboard", robots: { index: false } };

export default function Page() {
  return (
    <DashboardShell title="FAQ del bot" lead="Domande frequenti su Vinili e le funzioni dashboard.">
      <BotFaqBrowser />
    </DashboardShell>
  );
}