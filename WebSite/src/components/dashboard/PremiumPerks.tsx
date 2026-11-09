"use client";

import { BellRing, Check, Diamond, Handshake, ImageIcon, Quote, RotateCcw, Sparkles } from "lucide-react";
import { motion } from "motion/react";
import { SmartLink } from "@/components/SmartLink";
import { cn } from "@/lib/cn";
import { PREMIUM_PLANS, monthsLabel, planPerMonth, planSaving } from "@/lib/dashboard-premium";
import { page } from "@/lib/site";
import { DashboardShell } from "./DashboardShell";
import { HowToGetCredits } from "./PremiumBoard";
import { dashPrimaryBtn, dashSecondaryBtn } from "./guild/bits";

/* Solo ciò che il bot sblocca davvero (controlli isTenantPremiumActiveSync nel bot). */
const PERKS = [
  {
    icon: ImageIcon,
    title: "Il bot con la faccia del tuo server",
    body: "Nickname, avatar e banner di Vinili diversi solo nel tuo server, senza toccare gli altri.",
    where: "Impostazioni → Il bot in questo server",
  },
  {
    icon: Quote,
    title: "Quote con il tuo stile",
    body: "Colori, sfondo e impaginazione delle quote della Bacheca scelti da te, invece dello stile base.",
    where: "Bacheca",
  },
  {
    icon: Handshake,
    title: "Ringraziamento nelle partnership",
    body: "Un messaggio di grazie personalizzato che il bot manda a ogni partnership conclusa.",
    where: "Partnership → Ringraziamento",
  },
] as const;

const EXTRAS = [
  { icon: BellRing, text: "Promemoria in DM 7, 3 e 1 giorno prima che scada." },
  { icon: RotateCcw, text: "Se scade, le personalizzazioni si mettono in pausa e tornano appena rinnovi." },
  { icon: Diamond, text: "Si attiva per server: puoi averlo su uno o su tutti quelli che gestisci." },
] as const;

const FREE = ["Ticket, pannelli e transcript", "Bacheca con stile base", "Partnership", "Tutti i comandi del bot"] as const;

export function PremiumPerks() {
  const best = PREMIUM_PLANS.reduce((a, b) => (planSaving(b) > planSaving(a) ? b : a));
  return (
    <DashboardShell title="Vantaggi Premium" crumb="Vantaggi" lead="Cosa aggiunge Premium al tuo server e quanto costa. Tutto il resto del bot è gratis.">
      <div className="space-y-8">
        <section aria-labelledby="perks-title">
          <h2 id="perks-title" className="mb-3 text-sm font-semibold text-crema">
            Cosa sblocca
          </h2>
          <div className="grid gap-3 md:grid-cols-3">
            {PERKS.map((p, i) => (
              <motion.article
                key={p.title}
                initial={{ opacity: 0.4, y: 6 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ duration: 0.3, delay: i * 0.06 }}
                className="flex flex-col rounded-2xl bg-roast/80 p-5 ring-1 ring-sand/10"
              >
                <span className="flex size-10 items-center justify-center rounded-xl bg-caramel/12 text-ember ring-1 ring-caramel/20">
                  <p.icon className="size-5" aria-hidden />
                </span>
                <h3 className="mt-4 text-[0.95rem] font-semibold text-crema">{p.title}</h3>
                <p className="mt-1.5 flex-1 text-sm leading-relaxed text-crema/65">{p.body}</p>
                <p className="mt-4 text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-crema/60">Dove: {p.where}</p>
              </motion.article>
            ))}
          </div>
          <ul className="mt-3 grid gap-2 sm:grid-cols-3">
            {EXTRAS.map((e) => (
              <li key={e.text} className="flex items-start gap-2.5 rounded-xl bg-espresso/45 px-3.5 py-3 text-xs leading-relaxed text-crema/70 ring-1 ring-sand/10">
                <e.icon className="mt-px size-4 shrink-0 text-ember" aria-hidden />
                {e.text}
              </li>
            ))}
          </ul>
        </section>

        <section aria-labelledby="plans-title">
          <div className="mb-3 flex flex-wrap items-baseline justify-between gap-2">
            <h2 id="plans-title" className="text-sm font-semibold text-crema">
              Piani
            </h2>
            <p className="text-xs text-crema/60">Si pagano in crediti. Più è lungo, meno costa al mese.</p>
          </div>
          <div className="grid gap-3 sm:grid-cols-2 xl:grid-cols-4">
            {PREMIUM_PLANS.map((p) => {
              const highlight = p.months === best.months;
              const saving = planSaving(p);
              return (
                <article
                  key={p.months}
                  className={cn(
                    "relative flex flex-col rounded-2xl p-5 ring-1",
                    highlight ? "bg-caramel/[0.09] ring-caramel/40" : "bg-roast/80 ring-sand/10",
                  )}
                >
                  {highlight ? (
                    <span className="absolute -top-2.5 left-5 rounded-full bg-caramel px-2.5 py-0.5 text-[0.65rem] font-bold uppercase tracking-wider text-espresso">
                      Conviene di più
                    </span>
                  ) : null}
                  <h3 className="text-sm font-semibold text-crema">{monthsLabel(p.months)}</h3>
                  <p className="mt-2 flex items-baseline gap-1.5">
                    <span className="font-display text-4xl font-semibold tabular-nums text-crema">{p.credits}</span>
                    <span className="text-sm text-crema/60">crediti</span>
                  </p>
                  <p className="mt-1 text-xs text-crema/60">
                    {planPerMonth(p)} al mese · {p.days} giorni
                  </p>
                  <p className={cn("mt-3 text-xs font-semibold", saving > 0 ? "text-[#9fd0a8] light:text-[#2f6b3f]" : "text-crema/60")}>
                    {saving > 0 ? `Risparmi il ${saving}% rispetto al mensile` : "Prezzo pieno"}
                  </p>
                </article>
              );
            })}
          </div>
          <div className="mt-4 flex flex-wrap gap-2">
            <SmartLink href={page("/dashboard/premium/")} className={dashPrimaryBtn}>
              <Sparkles className="size-4" aria-hidden /> Attiva Premium
            </SmartLink>
            <SmartLink href={page("/dashboard/premium/crediti/")} className={dashSecondaryBtn}>
              I miei crediti
            </SmartLink>
          </div>
        </section>

        <div className="grid gap-5 lg:grid-cols-2">
          <section className="rounded-2xl bg-roast/80 p-5 ring-1 ring-sand/10" aria-labelledby="free-title">
            <h2 id="free-title" className="text-[0.95rem] font-semibold text-crema">
              Gratis per tutti
            </h2>
            <p className="mt-0.5 text-xs text-crema/60">Premium non toglie niente a chi non ce l&apos;ha.</p>
            <ul className="mt-4 space-y-2">
              {FREE.map((f) => (
                <li key={f} className="flex items-center gap-2.5 text-sm text-crema/80">
                  <Check className="size-4 shrink-0 text-[#9fd0a8] light:text-[#2f6b3f]" aria-hidden />
                  {f}
                </li>
              ))}
            </ul>
          </section>
          <HowToGetCredits />
        </div>
      </div>
    </DashboardShell>
  );
}
