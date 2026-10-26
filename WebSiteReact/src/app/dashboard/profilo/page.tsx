import type { Metadata } from "next";
import { DashboardShell } from "@/components/dashboard/DashboardShell";
import { SmartLink } from "@/components/SmartLink";
import { page } from "@/lib/site";

export const metadata: Metadata = { title: "Profilo · Dashboard", robots: { index: false } };

export default function Page() {
  return (
    <DashboardShell title="Profilo dashboard" lead="Account collegato al pannello bot.">
      <div className="rounded-2xl bg-roast/70 p-6 ring-1 ring-sand/12">
        <p className="text-sm text-crema/65">Dati account da <code className="text-sand">/webhooks/site-dashboard/profile</code> e <code className="text-sand">/account</code>.</p>
        <SmartLink href={page("/dashboard/profilo/abbonamento/")} className="mt-4 inline-flex rounded-full bg-crema/10 px-4 py-2 text-sm font-semibold ring-1 ring-sand/25">
          Abbonamento
        </SmartLink>
      </div>
    </DashboardShell>
  );
}