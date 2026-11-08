import type { Metadata } from "next";
import { CreditCard } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Panel, dashSecondaryBtn } from "@/components/dashboard/guild/bits";
import { SmartLink } from "@/components/SmartLink";
import { page } from "@/lib/site";

export const metadata: Metadata = { title: "Abbonamento · Dashboard", robots: { index: false } };

export default function Page() {
  return (
    <DashboardShell title="Abbonamento" crumb="Abbonamento" lead="Stato del piano premium.">
      <Panel icon={<CreditCard />} title="Piano attuale" description="Nessun pagamento reale durante la beta.">
        <p className="text-sm text-crema/60">Il dettaglio del tuo abbonamento comparirà qui quando i piani premium saranno attivi.</p>
        <SmartLink href={page("/dashboard/premium/")} className={`${dashSecondaryBtn} mt-4`}>
          Scopri Premium
        </SmartLink>
      </Panel>
    </DashboardShell>
  );
}
