import { Heart, Info, Server, Bot, PartyPopper } from "lucide-react";
import { PerkList } from "@/components/perks/PerkList";
import { Reveal } from "@/components/Reveal";
import { RichText } from "@/components/RichText";
import { PAYPAL, TIERS, WHERE } from "@/lib/donate";
import { cn } from "@/lib/cn";
import { page } from "@/lib/site";
import { PromoBanner, PromoPrice, PromoSticker } from "@/components/promo/Promo";
import { SmartLink } from "@/components/SmartLink";

const WHERE_ICONS = [<Server key="s" />, <Bot key="b" />, <PartyPopper key="p" />];

const CTA: Record<string, string> = {
  donator: "Diventa Donator",
  vip: "Diventa VIP",
  vipplus: "Diventa VIP+",
};

/** Tre tier di supporto: ruolo + prezzo + perks, senza metafora caffè. */
export function DonateBoard() {
  return (
    <div className="mx-auto max-w-6xl space-y-20 px-6 pb-20">
      <Reveal>
        <PromoBanner />
      </Reveal>

      <Reveal>
        <div className="grid gap-3 md:grid-cols-3">
          {WHERE.map((w, i) => (
            <div key={w.title} className="flex gap-4 rounded-2xl bg-crema/[0.04] p-5 ring-1 ring-sand/10">
              <span className="flex size-10 shrink-0 items-center justify-center rounded-xl bg-caramel/15 text-ember ring-1 ring-caramel/25 [&>svg]:size-5">{WHERE_ICONS[i]}</span>
              <div>
                <p className="font-display text-xl font-semibold">{w.title}</p>
                <p className="mt-0.5 text-sm leading-relaxed text-crema/60">{w.text}</p>
              </div>
            </div>
          ))}
        </div>
      </Reveal>

      <section>
        <Reveal className="mb-10 text-center">
          <p className="font-script text-4xl text-caramel">Supportaci</p>
          <h2 className="mt-1 font-display text-4xl font-semibold sm:text-5xl">Scegli un ruolo</h2>
          <p className="mx-auto mt-3 max-w-xl text-crema/60">Ogni donazione sblocca un ruolo sul server, con i suoi vantaggi. Il resto va a VPS, bot ed eventi.</p>
        </Reveal>

        <div className="grid items-stretch gap-5 lg:grid-cols-3">
          {TIERS.map((t, i) => {
            const star = t.id === "vip";
            return (
              <Reveal key={t.id} delay={i * 0.1} className="h-full">
                <article
                  className={cn(
                    "relative flex h-full flex-col overflow-hidden rounded-[2rem] p-7 ring-1",
                    star
                      ? "bg-gradient-to-b from-caramel/15 via-roast to-roast shadow-[0_30px_80px_-30px_rgba(212,145,80,0.45)] ring-caramel/50 lg:-translate-y-4"
                      : "bg-gradient-to-b from-caramel/[0.1] via-roast/85 to-roast ring-sand/15",
                  )}
                >
                  {star && <div className="absolute -top-24 left-1/2 size-56 -translate-x-1/2 rounded-full bg-caramel/20 blur-3xl" />}
                  <PromoSticker className="absolute left-4 top-4 z-10" />
                  {t.badge && (
                    <span
                      className={cn(
                        "absolute right-5 top-5 rounded-full px-3 py-1 text-[0.65rem] font-bold uppercase tracking-[0.18em]",
                        star ? "bg-caramel text-ink" : "bg-crema/8 text-sand ring-1 ring-sand/20",
                      )}
                    >
                      {t.badge}
                    </span>
                  )}

                  <div className="relative mt-2 text-center">
                    <h3 className="font-display text-4xl font-semibold">{t.role}</h3>
                    <p className="mt-3">
                      <PromoPrice
                        value={t.amount}
                        prefix={t.from ? "da " : undefined}
                        className="font-display text-5xl font-bold text-crema"
                        oldClassName="mb-1 font-display text-2xl font-semibold"
                      />
                    </p>
                  </div>

                  <PerkList perks={t.perks} className="relative mt-7 flex-1 border-t border-sand/10 pt-6" />

                  <a
                    href={PAYPAL}
                    target="_blank"
                    rel="noopener"
                    className={cn(
                      "relative mt-8 inline-flex items-center justify-center gap-2 rounded-full px-6 py-3.5 font-semibold transition-[transform,filter,box-shadow] duration-200 ease-out hover:-translate-y-0.5 active:scale-[0.97]",
                      star
                        ? "bg-gradient-to-r from-caramel to-ember text-ink shadow-[0_12px_30px_-10px_rgba(232,160,90,0.7)] hover:brightness-110"
                        : "bg-crema/8 text-crema ring-1 ring-sand/25 hover:bg-crema/12",
                    )}
                  >
                    <Heart className="size-4" /> {CTA[t.id] ?? t.cta}
                  </a>
                  <p className="relative mt-2 text-center text-xs text-crema/40">Pagamento con PayPal · donazione una tantum, senza rinnovo automatico</p>
                  <p className="relative mt-1 text-center text-xs leading-snug text-crema/35">
                    Il ruolo viene assegnato dallo staff dopo la conferma del pagamento su PayPal. Pagando accetti i{" "}
                    <SmartLink href={page("/terms/")} className="font-semibold text-ember underline-offset-2 hover:underline">
                      Termini di Servizio
                    </SmartLink>
                    ; le donazioni non sono rimborsabili.
                  </p>
                </article>
              </Reveal>
            );
          })}
        </div>
      </section>

      <Reveal>
        <div className="grid gap-4 md:grid-cols-[1.3fr_1fr]">
          <div className="rounded-3xl bg-gradient-to-br from-mocha/70 to-roast p-7 ring-1 ring-sand/15">
            <p className="font-display text-2xl font-semibold">Hai dubbi su una donazione?</p>
            <p className="mt-3 leading-relaxed text-crema/70">
              <RichText text="Scrivici dai [[Tickets|/tickets/]]: lo staff ti risponde lì. Per vedere tutti gli altri ruoli ottenibili gratis, passa dai [[Perks|/perks/]]." />
            </p>
          </div>
          <div className="flex gap-3 rounded-3xl bg-caramel/10 p-7 text-sm leading-relaxed text-crema/80 ring-1 ring-caramel/25">
            <Info className="mt-0.5 size-5 shrink-0 text-caramel" />
            <p>
              <strong className="text-crema">Importante:</strong> le donazioni tramite PayPal <strong className="text-crema">non sono rimborsabili</strong>. Se esci dal
              server principale, i ruoli vengono rimossi e <strong className="text-crema">non saranno riassegnati automaticamente</strong>.
            </p>
          </div>
        </div>
      </Reveal>
    </div>
  );
}
