import type { Metadata } from "next";
import { Coins } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Panel, dashSecondaryBtn } from "@/components/dashboard/guild/bits";
import { SmartLink } from "@/components/SmartLink";
import { page } from "@/lib/site";

export const metadata: Metadata = { title: "Crediti · Dashboard", robots: { index: false } };

export default function Page() {
  return (
    <DashboardShell title="Crediti" crumb="Crediti" lead="Saldo e movimenti. Acquisti solo via sandbox in fase di test.">
      <Panel icon={<Coins />} title="Saldo crediti" description="Acquisto e storico dei movimenti arrivano a breve.">
        <p className="text-sm text-crema/60">Qui vedrai quanti crediti hai e dove li hai usati. L&apos;acquisto (sandbox PayPal) sarà disponibile nel prossimo aggiornamento del pannello.</p>
        <SmartLink href={page("/dashboard/premium/")} className={`${dashSecondaryBtn} mt-4`}>
          Torna a Premium
        </SmartLink>
      </Panel>
    </DashboardShell>
  );
}
