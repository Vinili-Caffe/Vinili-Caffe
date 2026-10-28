import type { Metadata } from "next";
import { BadgeCheck, Camera, Gem, Info, Medal, Music2, Zap } from "lucide-react";
import { NewTag, PerkList } from "@/components/perks/PerkList";
import { GenreTimeline } from "@/components/perks/GenreTimeline";
import { PageHero } from "@/components/PageHero";
import { Reveal } from "@/components/Reveal";
import { RichText } from "@/components/RichText";
import { SiteShell } from "@/components/SiteShell";
import { BorderBeam } from "@/components/ui/border-beam";
import { BADGES, BOOST, SELFIE } from "@/lib/perks";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { pageSocialMeta } from "@/lib/og";

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/perks/", title: "Perks", description: "Tutti i ruoli ottenibili su Vinili & Caffè e i loro vantaggi: Nitro Boost, livelli, verifica e badge." }),
};

function SectionTitle({ icon, kicker, title, text }: { icon: React.ReactNode; kicker: string; title: string; text?: string }) {
  return (
    <Reveal className="mb-8">
      <p className="flex items-center gap-2 text-xs font-semibold uppercase tracking-[0.3em] text-caramel [&>svg]:size-4">
        {icon} {kicker}
      </p>
      <h2 className="mt-2 font-display text-4xl font-semibold sm:text-5xl">{title}</h2>
      {text && <p className="mt-3 max-w-2xl text-crema/60">{text}</p>}
    </Reveal>
  );
}

export default function PerksPage() {
  return (
    <SiteShell>
      <DiscordComponentEmbed
        path="/perks/"
        title="Perks"
        description="Tutti i ruoli ottenibili su Vinili & Caffè e i loro vantaggi: Nitro Boost, livelli, verifica e badge."
      />
      <PageHero
        icon={<Gem />}
        kicker="Vantaggi"
        title="I perks del"
        accent="server"
        text="Tutti i ruoli che puoi ottenere e cosa sbloccano: boost, livelli, verifica e badge speciali."
      />

      <div className="mx-auto max-w-5xl space-y-24 px-6 pb-16">
        {/* avvisi */}
        <Reveal>
          <div className="grid gap-3 sm:grid-cols-[1.4fr_1fr]">
            <div className="flex gap-3 rounded-2xl bg-caramel/10 p-5 text-sm leading-relaxed text-crema/80 ring-1 ring-caramel/25">
              <Info className="mt-0.5 size-4 shrink-0 text-caramel" />
              <p>
                <strong className="text-crema">Importante:</strong> se esci dal server principale i ruoli vengono rimossi e{" "}
                <strong className="text-crema">non saranno riassegnati automaticamente</strong>.
              </p>
            </div>
            <div className="rounded-2xl bg-crema/[0.04] p-5 text-sm leading-relaxed text-crema/70 ring-1 ring-sand/10">
              Usa <code className="rounded bg-espresso px-1.5 py-0.5 font-mono text-ember">+rank</code> per vedere il tuo livello e{" "}
              <RichText text="[[Personalizza|/personalizza/]]" /> per gestire il tuo profilo.
            </div>
          </div>
        </Reveal>

        {/* Nitro Boost */}
        <section>
          <SectionTitle icon={<Zap />} kicker="Nitro Boost" title="Chi boosta, suona più forte" text="Ogni boost al server sblocca un pacchetto di vantaggi. Con due boost arrivano quelli migliori." />
          <div className="grid gap-4 md:grid-cols-2">
            {BOOST.map((b, i) => (
              <Reveal key={b.title} delay={i * 0.1} className="h-full">
                <article className="scheme-dark relative h-full overflow-hidden rounded-3xl bg-gradient-to-br from-[#2a1530] via-roast to-roast p-6 ring-1 ring-[#ff73fa]/25 sm:p-7">
                  <div className="absolute -right-10 -top-10 size-40 rounded-full bg-[#ff73fa]/15 blur-3xl" />
                  <div className="relative flex flex-wrap items-start gap-3">
                    <span className="flex size-11 shrink-0 items-center justify-center rounded-2xl bg-[#ff73fa]/15 font-display text-xl font-bold text-[#ffb3fc] ring-1 ring-[#ff73fa]/30">
                      {i + 1}×
                    </span>
                    <div className="min-w-0 flex-1">
                      <h3 className="font-display text-2xl font-semibold">{b.title}</h3>
                      <p className="text-sm text-crema/55">
                        <RichText text={`Ruolo ${b.role}`} />
                      </p>
                    </div>
                    {b.isNew ? <NewTag /> : null}
                  </div>
                  <PerkList perks={b.perks} className="relative mt-6" />
                  {/* il pacchetto migliore: scia di luce lungo il bordo (Border Beam) */}
                  {i === BOOST.length - 1 ? <BorderBeam size={110} duration={8} /> : null}
                </article>
              </Reveal>
            ))}
          </div>
        </section>

        {/* livelli */}
        <section>
          <SectionTitle
            icon={<Music2 />}
            kicker="Fasce di livello"
            title="Ogni livello, un genere"
            text="Più scrivi e stai in vocale, più sali: ogni fascia ha il suo genere musicale, il suo ruolo e nuovi vantaggi. Tocca un genere per vederli."
          />
          <Reveal>
            <GenreTimeline />
          </Reveal>
        </section>

        {/* verifica selfie */}
        <section>
          <SectionTitle icon={<Camera />} kicker="Verifica selfie" title="Fatti riconoscere" text="Verifica il tuo profilo per ottenere il badge e qualche permesso in più." />
          <div className="grid gap-4 md:grid-cols-[1.2fr_1fr]">
            <Reveal>
              <ol className="space-y-3">
                {SELFIE.steps.map((s, i) => (
                  <li key={s} className="flex gap-4 rounded-2xl bg-gradient-to-b from-caramel/[0.08] via-roast/80 to-roast p-5 ring-1 ring-sand/12">
                    <span className="flex size-8 shrink-0 items-center justify-center rounded-full bg-caramel/20 font-display text-lg font-bold lining-nums text-ember">{i + 1}</span>
                    <p className="leading-relaxed text-crema/75">
                      <RichText text={s} />
                    </p>
                  </li>
                ))}
              </ol>
            </Reveal>
            <Reveal delay={0.1}>
              <div className="h-full rounded-3xl bg-gradient-to-br from-mocha/80 to-roast p-6 ring-1 ring-sand/15">
                <p className="flex items-center gap-2 font-display text-2xl font-semibold">
                  <BadgeCheck className="size-6 text-caramel" /> Cosa ottieni
                </p>
                <PerkList perks={SELFIE.perks} className="mt-4" />
              </div>
            </Reveal>
          </div>
        </section>

        {/* badge */}
        <section>
          <SectionTitle icon={<Medal />} kicker="Badge e altri ruoli" title="Una collezione da completare" text="Classifiche, inviti, social, voti e anzianità: ecco gli altri ruoli che puoi aggiungere al profilo." />
          <div className="grid gap-4 sm:grid-cols-2 lg:grid-cols-3">
            {BADGES.map((b, i) => (
              <Reveal key={b.role} delay={(i % 3) * 0.06} className="h-full">
                <article className="relative flex h-full flex-col rounded-3xl bg-gradient-to-b from-caramel/[0.1] via-roast/85 to-roast p-6 ring-1 ring-sand/12 transition-colors hover:ring-sand/30">
                  <div className="flex flex-wrap items-start gap-2">
                    <h3 className="min-w-0 max-w-full font-display text-xl font-semibold leading-snug [&>span]:max-w-full">
                      <RichText text={`<<${b.role}>>`} />
                    </h3>
                    {b.isNew ? <NewTag /> : null}
                  </div>
                  <p className="mt-1 text-xs font-semibold uppercase tracking-[0.2em] text-caramel">{b.how}</p>
                  {b.desc && (
                    <p className="mt-3 text-sm leading-relaxed text-crema/60">
                      <RichText text={b.desc} />
                    </p>
                  )}
                  <PerkList perks={b.perks} className="mt-4 border-t border-sand/10 pt-4" />
                </article>
              </Reveal>
            ))}
          </div>
        </section>
      </div>
    </SiteShell>
  );
}
