"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion } from "motion/react";
import { Check, Eye, Globe, Hash, Info, Minus, MousePointerClick, Percent, Plus, Radio, Ticket, Users, Wallet } from "lucide-react";
import { Reveal } from "@/components/Reveal";
import { RichText } from "@/components/RichText";
import { SmartLink } from "@/components/SmartLink";
import { CHANNEL, EVENTS, EXTRA_PING, REQUIREMENTS, SPONSOR_PAYPAL, WEBSITE, eur } from "@/lib/sponsor";
import { loadSiteAnalytics, type SiteAnalytics } from "@/lib/siteAnalytics";
import { page } from "@/lib/site";
import { cn } from "@/lib/cn";
import { Disclosure } from "@/components/ui/Disclosure";
import { PromoBanner, PromoInline } from "@/components/promo/Promo";
import { promoPrice, usePromo } from "@/lib/promo";

type Kind = "channel" | "website" | "events";

const KINDS: { id: Kind; title: string; short: string; badge: string; text: string; icon: React.ReactNode }[] = [
  { id: "channel", title: CHANNEL.title, short: "Canale privato", badge: CHANNEL.badge, text: CHANNEL.text, icon: <Hash /> },
  { id: "website", title: WEBSITE.title, short: WEBSITE.title, badge: WEBSITE.badge, text: WEBSITE.text, icon: <Globe /> },
  { id: "events", title: EVENTS.title, short: EVENTS.title, badge: EVENTS.badge, text: EVENTS.text, icon: <Radio /> },
];

function Chip({ active, onClick, children }: { active: boolean; onClick: () => void; children: React.ReactNode }) {
  return (
    <button
      type="button"
      onClick={onClick}
      aria-pressed={active}
      className={cn("rounded-full px-4 py-2 text-sm font-semibold lining-nums transition-colors", active ? "bg-caramel text-ink" : "bg-crema/6 text-crema/70 ring-1 ring-sand/20 hover:bg-crema/10 hover:text-crema")}
    >
      {children}
    </button>
  );
}

function Stepper({ value, set, min = 0, max = 5 }: { value: number; set: (n: number) => void; min?: number; max?: number }) {
  return (
    <div className="inline-flex items-center rounded-full bg-crema/6 ring-1 ring-sand/20">
      <button type="button" aria-label="Uno in meno" disabled={value <= min} onClick={() => set(value - 1)} className="flex size-9 items-center justify-center text-crema/70 hover:text-crema disabled:opacity-30">
        <Minus className="size-4" />
      </button>
      <span className="w-6 text-center font-semibold lining-nums">{value}</span>
      <button type="button" aria-label="Uno in più" disabled={value >= max} onClick={() => set(value + 1)} className="flex size-9 items-center justify-center text-crema/70 hover:text-crema disabled:opacity-30">
        <Plus className="size-4" />
      </button>
    </div>
  );
}

const fmt = (n: number) => n.toLocaleString("it-IT");

/** Il preventivo: scegli formato, durata e ping, il totale si aggiorna come uno scontrino. */
export function SponsorBoard() {
  const [kind, setKind] = useState<Kind>("channel");
  const [days, setDays] = useState(7);
  const [pings, setPings] = useState<1 | 2>(1);
  const [extra, setExtra] = useState(0);
  const [passes, setPasses] = useState(1);
  const [analytics, setAnalytics] = useState<SiteAnalytics | null>(null);
  const promo = usePromo();

  useEffect(() => {
    let alive = true;
    loadSiteAnalytics().then((a) => alive && setAnalytics(a));
    return () => {
      alive = false;
    };
  }, []);

  const lines: { label: string; price: number }[] = [];
  if (kind === "channel") {
    const d = CHANNEL.durations.find((x) => x.days === days)!;
    lines.push({ label: `Canale privato · ${days} giorni · ${pings} ping @everyone`, price: pings === 1 ? d.ping1 : d.ping2 });
  } else if (kind === "website") {
    const d = WEBSITE.durations.find((x) => x.days === days)!;
    lines.push({ label: `Vetrina sul sito + annuncio · ${days} giorni`, price: d.price });
  } else {
    lines.push({ label: `Passaggio promozionale ×${passes}`, price: EVENTS.price * passes });
  }
  if (kind !== "events" && extra > 0) lines.push({ label: `Ping @everyone aggiuntivi ×${extra}`, price: EXTRA_PING * extra });
  const subtotal = lines.reduce((s, l) => s + l.price, 0);
  const total = promoPrice(subtotal, promo);

  const pps = analytics?.pagesPerSession ?? (analytics ? analytics.pageViews / Math.max(1, analytics.sessions) : 0);
  const audience = [
    { icon: <Eye />, label: "Pagine viste", value: analytics ? fmt(analytics.pageViews) : "—" },
    { icon: <Users />, label: "Utenti", value: analytics ? fmt(analytics.users) : "—" },
    { icon: <MousePointerClick />, label: "Sessioni", value: analytics ? fmt(analytics.sessions) : "—" },
  ];

  return (
    <div className="mx-auto max-w-6xl space-y-20 px-6 pb-20">
      <Reveal>
        <PromoBanner />
      </Reveal>

      {/* intro + requisiti */}
      <Reveal>
        <div className="grid gap-4 md:grid-cols-[1.4fr_1fr]">
          <div className="rounded-3xl bg-gradient-to-br from-mocha/70 to-roast p-7 ring-1 ring-sand/15">
            <p className="font-display text-2xl font-semibold leading-snug">Le sponsor sono collaborazioni a pagamento per mettere in mostra il tuo server davanti alla nostra community.</p>
            <p className="mt-3 text-crema/60">Tre vetrine: un canale tutto tuo, il sito e gli eventi dal vivo.</p>
          </div>
          <div className="rounded-3xl bg-gradient-to-b from-caramel/[0.12] via-roast/90 to-roast p-7 ring-1 ring-sand/15">
            <p className="text-xs font-semibold uppercase tracking-[0.3em] text-caramel">Requisiti</p>
            <ul className="mt-4 space-y-3">
              {REQUIREMENTS.map((r) => (
                <li key={r} className="flex gap-2.5 text-crema/75">
                  <Check className="mt-1 size-4 shrink-0 text-caramel" />
                  <span>
                    <RichText text={r} />
                  </span>
                </li>
              ))}
            </ul>
          </div>
        </div>
      </Reveal>

      {/* configuratore */}
      <section>
        <Reveal className="mb-10 text-center">
          <p className="font-script text-4xl text-caramel">Il listino</p>
          <h2 className="mt-1 font-display text-4xl font-semibold sm:text-5xl">Componi la tua sponsor</h2>
        </Reveal>

        <div className="grid gap-6 lg:grid-cols-[1.5fr_1fr]">
          <div className="space-y-6">
            <div role="radiogroup" aria-label="Formato" className="grid grid-cols-3 gap-2 sm:gap-3">
              {KINDS.map((k) => {
                const on = k.id === kind;
                return (
                  <button
                    key={k.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => (setKind(k.id), setExtra(0))}
                    className={cn(
                      "relative flex flex-col rounded-2xl p-3 text-left ring-1 transition-[transform,background-color,box-shadow,opacity] duration-200 ease-out sm:rounded-3xl sm:p-5",
                      on ? "bg-gradient-to-b from-caramel/15 to-roast shadow-[0_20px_50px_-25px_rgba(212,145,80,0.6)] ring-caramel/60" : "bg-roast/70 ring-sand/12 hover:ring-sand/30",
                    )}
                  >
                    <span className="flex items-center justify-between">
                      <span className={cn("flex size-10 items-center justify-center rounded-xl ring-1 [&>svg]:size-5", on ? "bg-caramel text-ink ring-caramel" : "bg-crema/6 text-sand ring-sand/20")}>{k.icon}</span>
                      <span className="hidden rounded-full bg-crema/8 px-2.5 py-0.5 text-[0.6rem] font-bold uppercase tracking-[0.15em] text-sand sm:inline">{k.badge}</span>
                    </span>
                    <span className="mt-3 font-display text-base font-semibold leading-tight sm:mt-4 sm:text-xl">
                      <span className="sm:hidden">{k.short}</span>
                      <span className="hidden sm:inline">{k.title}</span>
                    </span>
                    <span className="mt-1 hidden text-sm leading-relaxed text-crema/55 sm:block">{k.text}</span>
                  </button>
                );
              })}
            </div>

            <AnimatePresence mode="wait" initial={false}>
              <motion.div
                key={kind}
                initial={{ opacity: 0, y: 10 }}
                animate={{ opacity: 1, y: 0 }}
                exit={{ opacity: 0, y: -10 }}
                transition={{ duration: 0.25 }}
                className="space-y-5 rounded-3xl bg-gradient-to-b from-caramel/[0.1] via-roast/85 to-roast p-6 ring-1 ring-sand/12"
              >
                <p className="text-sm leading-relaxed text-crema/60 sm:hidden">{KINDS.find((k) => k.id === kind)!.text}</p>
                {kind !== "events" ? (
                  <>
                    <div>
                      <p className="mb-2.5 text-sm font-semibold text-crema/60">Durata</p>
                      <div className="flex flex-wrap gap-2">
                        {[7, 14, 30].map((d) => (
                          <Chip key={d} active={days === d} onClick={() => setDays(d)}>
                            {d} giorni
                          </Chip>
                        ))}
                      </div>
                    </div>
                    {kind === "channel" && (
                      <div>
                        <p className="mb-2.5 text-sm font-semibold text-crema/60">Ping @everyone inclusi</p>
                        <div className="flex flex-wrap gap-2">
                          {([1, 2] as const).map((n) => (
                            <Chip key={n} active={pings === n} onClick={() => setPings(n)}>
                              ×{n} ping
                            </Chip>
                          ))}
                        </div>
                      </div>
                    )}
                    <div className="flex flex-wrap items-center justify-between gap-3">
                      <p className="text-sm font-semibold text-crema/60">
                        Ping @everyone aggiuntivi <span className="font-normal text-crema/40">· <PromoInline value={EXTRA_PING} /> l&apos;uno</span>
                      </p>
                      <Stepper value={extra} set={setExtra} />
                    </div>
                  </>
                ) : (
                  <div className="flex flex-wrap items-center justify-between gap-3">
                    <p className="text-sm font-semibold text-crema/60">
                      Passaggi promozionali <span className="font-normal text-crema/40">· <PromoInline value={EVENTS.price} /> l&apos;uno</span>
                    </p>
                    <Stepper value={passes} set={(n) => setPasses(Math.max(1, n))} min={1} />
                  </div>
                )}
              </motion.div>
            </AnimatePresence>

            {/* listino completo: card impilate, prezzi in tabella (niente 3 colonne storte) */}
            <Disclosure
              className="rounded-3xl bg-crema/[0.03] ring-1 ring-sand/10"
              titleClassName="px-5 py-4 text-crema/70 hover:text-crema sm:px-6"
              title="Vedi tutto il listino"
            >
              <div className="space-y-3 px-1 pb-2 sm:px-2">
                <div className="overflow-hidden rounded-2xl bg-espresso/40 ring-1 ring-sand/10">
                  <div className="flex items-center gap-2 border-b border-sand/10 px-4 py-3">
                    <Hash className="size-4 text-caramel" />
                    <p className="text-sm font-semibold text-crema">{CHANNEL.title}</p>
                  </div>
                  <div className="px-4 py-1 text-sm lining-nums">
                    <div className="grid grid-cols-[1fr_6.5rem_6.5rem] gap-x-2 py-1.5 text-[0.65rem] font-semibold uppercase tracking-[0.14em] text-crema/35">
                      <span>Durata</span>
                      <span className="text-right">×1 ping</span>
                      <span className="text-right">×2 ping</span>
                    </div>
                    {CHANNEL.durations.map((d) => (
                      <div key={d.days} className="grid grid-cols-[1fr_6.5rem_6.5rem] gap-x-2 border-t border-sand/8 py-2.5">
                        <span className="text-crema/75">{d.days} giorni</span>
                        <span className="text-right"><PromoInline value={d.ping1} className="font-semibold text-sand" /></span>
                        <span className="text-right"><PromoInline value={d.ping2} className="font-semibold text-sand" /></span>
                      </div>
                    ))}
                  </div>
                </div>

                <div className="overflow-hidden rounded-2xl bg-espresso/40 ring-1 ring-sand/10">
                  <div className="flex items-center gap-2 border-b border-sand/10 px-4 py-3">
                    <Globe className="size-4 text-caramel" />
                    <p className="text-sm font-semibold text-crema">{WEBSITE.title}</p>
                  </div>
                  <ul className="divide-y divide-sand/8 px-4 text-sm lining-nums">
                    {WEBSITE.durations.map((d) => (
                      <li key={d.days} className="flex items-center justify-between gap-4 py-2.5">
                        <span className="text-crema/75">{d.days} giorni</span>
                        <PromoInline value={d.price} className="font-semibold text-sand" />
                      </li>
                    ))}
                  </ul>
                </div>

                <div className="overflow-hidden rounded-2xl bg-espresso/40 ring-1 ring-sand/10">
                  <div className="flex items-center gap-2 border-b border-sand/10 px-4 py-3">
                    <Radio className="size-4 text-caramel" />
                    <p className="text-sm font-semibold text-crema">{EVENTS.title}</p>
                  </div>
                  <ul className="divide-y divide-sand/8 px-4 text-sm lining-nums">
                    <li className="flex items-center justify-between gap-4 py-2.5">
                      <span className="text-crema/75">Passaggio promozionale</span>
                      <PromoInline value={EVENTS.price} className="font-semibold text-sand" />
                    </li>
                    <li className="flex items-center justify-between gap-4 py-2.5">
                      <span className="text-crema/75">Ping @everyone aggiuntivo</span>
                      <PromoInline value={EXTRA_PING} className="font-semibold text-sand" />
                    </li>
                  </ul>
                </div>
              </div>
            </Disclosure>
          </div>

          {/* lo scontrino: carta e inchiostro fissi, uguale nei due temi */}
          <div className="lg:sticky lg:top-28 lg:self-start">
            <div className="relative rounded-t-3xl bg-paper px-7 pb-8 pt-7 font-mono text-ink shadow-[0_30px_60px_-30px_rgba(0,0,0,0.9)]">
              {promo && (
                <motion.span
                  aria-hidden
                  initial={{ scale: 2, opacity: 0, rotate: 0 }}
                  whileInView={{ scale: 1, opacity: 1, rotate: 14 }}
                  viewport={{ once: true }}
                  transition={{ type: "spring", stiffness: 500, damping: 20, delay: 0.4 }}
                  className="absolute -right-2 top-16 rounded-lg border-[3px] border-[#b5502a] px-2.5 py-1 font-display text-sm font-black uppercase tracking-widest text-[#b5502a] opacity-80 mix-blend-multiply"
                >
                  {promo.name} -{promo.percent}%
                </motion.span>
              )}
              <p className="text-center font-display text-2xl font-bold uppercase tracking-[0.04em]">VINILI & CAFFÈ</p>
              <p className="text-center text-[0.7rem] uppercase tracking-[0.3em] text-ink/50">preventivo sponsor</p>
              <div className="my-5 border-t-2 border-dashed border-ink/20" />
              <ul className="space-y-3 text-sm">
                <AnimatePresence initial={false}>
                  {lines.map((l) => (
                    <motion.li key={l.label} layout initial={{ opacity: 0, x: -8 }} animate={{ opacity: 1, x: 0 }} exit={{ opacity: 0 }} className="flex justify-between gap-4">
                      <span className="text-ink/75">{l.label}</span>
                      <span className="shrink-0 font-semibold lining-nums">{eur(l.price)}</span>
                    </motion.li>
                  ))}
                </AnimatePresence>
              </ul>
              {promo && (
                <div className="mt-3 flex justify-between gap-4 text-sm font-semibold text-[#b5502a]">
                  <span>Sconto {promo.name} -{promo.percent}%</span>
                  <span className="shrink-0 lining-nums">-{eur(subtotal - total)}</span>
                </div>
              )}
              <div className="my-5 border-t-2 border-dashed border-ink/20" />
              {promo && <p className="-mb-1 text-right text-sm text-ink/45 line-through decoration-[#b5502a] decoration-2 lining-nums">{eur(subtotal)}</p>}
              <div className="flex items-end justify-between">
                <span className="text-sm font-bold uppercase tracking-widest">Totale</span>
                <motion.span key={total} initial={{ scale: 1.15 }} animate={{ scale: 1 }} className="font-display text-4xl font-bold lining-nums">
                  {eur(total)}
                </motion.span>
              </div>
              <p className="mt-4 text-[0.7rem] leading-relaxed text-ink/50">Prima di pagare apri un ticket High Staff: lì concordi tipologia, date e dettagli.</p>
            </div>
            {/* bordo strappato */}
            <div className="h-3 bg-[linear-gradient(135deg,var(--color-paper)_33%,transparent_33%),linear-gradient(225deg,var(--color-paper)_33%,transparent_33%)] bg-[length:16px_12px] bg-repeat-x" />

            <div className="mt-6 grid gap-3">
              <SmartLink
                href={page("/tickets/")}
                className="inline-flex items-center justify-center gap-2 rounded-full bg-gradient-to-r from-caramel to-ember px-6 py-3.5 font-semibold text-ink shadow-[0_12px_30px_-10px_rgba(232,160,90,0.7)] transition-[transform,filter,box-shadow] duration-200 ease-out hover:-translate-y-0.5 hover:brightness-110 active:scale-[0.97]"
              >
                <Ticket className="size-4" /> Apri un ticket High Staff
              </SmartLink>
              <a href={SPONSOR_PAYPAL} target="_blank" rel="noopener" className="inline-flex items-center justify-center gap-2 rounded-full bg-crema/8 px-6 py-3.5 font-semibold text-crema ring-1 ring-sand/25 transition-colors hover:bg-crema/12">
                <Wallet className="size-4" /> Paga con PayPal
              </a>
            </div>
          </div>
        </div>
      </section>

      {/* traffico vero del sito (GA4 o log nginx), per la vetrina "Sito web" */}
      <section>
        <Reveal className="mb-8">
          <p className="text-xs font-semibold uppercase tracking-[0.3em] text-caramel">Vetrina sul sito · {(analytics?.label || "periodo recente").toLowerCase()}</p>
          <h2 className="mt-2 font-display text-4xl font-semibold sm:text-5xl">Quanta gente ti vede</h2>
        </Reveal>
        <div className="grid gap-4 sm:grid-cols-3">
          {audience.map((s, i) => (
            <Reveal key={s.label} delay={i * 0.08}>
              <div className="rounded-3xl bg-gradient-to-b from-caramel/[0.1] via-roast/85 to-roast p-6 ring-1 ring-sand/12">
                <span className="flex size-10 items-center justify-center rounded-xl bg-caramel/15 text-ember ring-1 ring-caramel/25 [&>svg]:size-5">{s.icon}</span>
                <p className="mt-4 font-display text-5xl font-semibold lining-nums">{s.value}</p>
                <p className="mt-1 text-sm text-crema/55">{s.label}</p>
              </div>
            </Reveal>
          ))}
        </div>
        {analytics && (
          <p className="mt-4 flex items-center gap-2 text-sm text-crema/45">
            <Percent className="size-3.5 shrink-0 text-caramel" />
            In media {pps.toLocaleString("it-IT", { maximumFractionDigits: 2 })} pagine per visita · {analytics.source === "ga4" ? "dati Google Analytics" : "dati dal traffico del sito"}
          </p>
        )}
      </section>

      <Reveal>
        <div className="flex gap-3 rounded-3xl bg-caramel/10 p-7 text-sm leading-relaxed text-crema/80 ring-1 ring-caramel/25">
          <Info className="mt-0.5 size-5 shrink-0 text-caramel" />
          <p>
            <strong className="text-crema">Importante:</strong> i pagamenti per le sponsor <strong className="text-crema">non sono rimborsabili</strong>. Se esci dal server principale, la sponsor
            viene rimossa e <strong className="text-crema">non verrà rimessa</strong>.
          </p>
        </div>
      </Reveal>
    </div>
  );
}
