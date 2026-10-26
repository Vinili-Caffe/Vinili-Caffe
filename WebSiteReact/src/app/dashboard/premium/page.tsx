import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { SmartLink } from "@/components/SmartLink";
import { page } from "@/lib/site";

export const metadata: Metadata = { title: "Premium · Dashboard", robots: { index: false } };

export default function Page() {
  return (
    <DashboardShell title="Premium" lead="Piani e crediti del bot. I pagamenti in test usano solo la sandbox PayPal.">
      <div className="rounded-2xl bg-roast/70 p-6 ring-1 ring-sand/12">
        <p className="text-crema/70">Gestisci i crediti e i piani premium del tuo server.</p>
        <SmartLink href={page("/dashboard/premium/crediti/")} className="mt-4 inline-flex rounded-full bg-gradient-to-r from-caramel to-ember px-4 py-2 text-sm font-semibold text-ink">
          Vai ai crediti
        </SmartLink>
      </div>
    </DashboardShell>
  );
}