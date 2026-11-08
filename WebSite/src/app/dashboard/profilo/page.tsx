import type { Metadata } from "next";
import { CreditCard, UserRound } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Panel, dashSecondaryBtn } from "@/components/dashboard/guild/bits";
import { SmartLink } from "@/components/SmartLink";
import { page } from "@/lib/site";

export const metadata: Metadata = { title: "Profilo · Dashboard", robots: { index: false } };

export default function Page() {
  return (
    <DashboardShell title="Profilo" lead="Account Discord collegato alla dashboard del bot.">
      <div className="grid gap-4 md:grid-cols-2">
        <Panel icon={<UserRound />} title="Account" description="Entri con Discord: i server che vedi sono quelli in cui puoi gestire Vinili.">
          <p className="text-sm text-crema/60">Se un server non compare, controlla di avere il permesso &quot;Gestisci server&quot; e accedi di nuovo.</p>
        </Panel>
        <Panel icon={<CreditCard />} title="Abbonamento" description="Stato del piano premium.">
          <SmartLink href={page("/dashboard/profilo/abbonamento/")} className={dashSecondaryBtn}>
            Apri abbonamento
          </SmartLink>
        </Panel>
      </div>
    </DashboardShell>
  );
}
