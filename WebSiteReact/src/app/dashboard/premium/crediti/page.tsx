import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/DashboardShell";

export const metadata: Metadata = { title: "Crediti · Dashboard", robots: { index: false } };

export default function Page() {
  return (
    <DashboardShell title="Crediti" lead="Saldo e movimenti. Acquisti solo via sandbox in fase di test.">
      <p className="rounded-2xl bg-gradient-to-b from-caramel/[0.08] via-roast/80 to-roast p-6 text-sm text-crema/65 ring-1 ring-sand/12">
        Il saldo crediti arriva da <code className="text-sand">/webhooks/site-dashboard/credits</code>. La UI completa di acquisto (PayPal sandbox) arriverà nel passaggio successivo del pannello.
      </p>
    </DashboardShell>
  );
}