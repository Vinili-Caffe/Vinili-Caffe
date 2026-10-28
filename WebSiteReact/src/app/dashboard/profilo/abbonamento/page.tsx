import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

export const metadata: Metadata = { title: "Abbonamento · Dashboard", robots: { index: false } };

export default function Page() {
  return (
    <DashboardShell title="Abbonamento" lead="Stato del piano premium del tenant.">
      <p className="rounded-2xl bg-gradient-to-b from-caramel/[0.08] via-roast/80 to-roast p-6 text-sm text-crema/65 ring-1 ring-sand/12">
        Dettaglio abbonamento dal profilo dashboard (API account/profile). Nessun pagamento live in beta.
      </p>
    </DashboardShell>
  );
}