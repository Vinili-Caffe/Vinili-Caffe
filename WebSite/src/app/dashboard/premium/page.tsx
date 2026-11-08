import type { Metadata } from "next";
import { Coins, CreditCard, Diamond } from "lucide-react";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { Panel, dashPrimaryBtn, dashSecondaryBtn } from "@/components/dashboard/guild/bits";
import { SmartLink } from "@/components/SmartLink";
import { page } from "@/lib/site";

export const metadata: Metadata = { title: "Premium · Dashboard", robots: { index: false } };

export default function Page() {
  return (
    <DashboardShell title="Premium" lead="Piani e crediti del bot. I pagamenti in test usano solo la sandbox PayPal.">
      <div className="grid gap-4 md:grid-cols-2">
        <Panel
          icon={<Diamond />}
          title="Vinili Premium"
          description="Funzioni in più per il tuo server, attive finché il piano è valido."
          aside={<span className="rounded-md bg-caramel/15 px-2 py-0.5 text-[0.65rem] font-semibold uppercase tracking-wider text-ember ring-1 ring-caramel/30">Beta</span>}
        >
          <p className="text-sm text-crema/60">Gestisci i crediti e i piani premium del tuo server.</p>
          <div className="mt-4 flex flex-wrap gap-2">
            <SmartLink href={page("/dashboard/premium/crediti/")} className={dashPrimaryBtn}>
              <Coins className="size-4" aria-hidden /> Vai ai crediti
            </SmartLink>
            <SmartLink href={page("/dashboard/profilo/abbonamento/")} className={dashSecondaryBtn}>
              <CreditCard className="size-4" aria-hidden /> Abbonamento
            </SmartLink>
          </div>
        </Panel>
        <Panel icon={<Coins />} title="Come funzionano i crediti" description="Si comprano una volta e si usano per attivare il premium sui server che gestisci.">
          <ul className="space-y-2 text-sm text-crema/60">
            <li className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-caramel" aria-hidden />Il saldo resta sul tuo account, non sul server.</li>
            <li className="flex gap-2"><span className="mt-2 size-1.5 shrink-0 rounded-full bg-caramel" aria-hidden />In questa fase di test non si paga niente di reale.</li>
          </ul>
        </Panel>
      </div>
    </DashboardShell>
  );
}
