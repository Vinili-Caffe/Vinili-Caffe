import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { TranscriptViewer } from "@/components/dashboard/TranscriptViewer";

export const metadata: Metadata = { title: "Transcript · Dashboard", robots: { index: false } };

export default function Page() {
  return (
    <DashboardShell title="Transcript" lead="Apri un transcript dal link del ticket (?t=…)." bare>
      <TranscriptViewer />
    </DashboardShell>
  );
}