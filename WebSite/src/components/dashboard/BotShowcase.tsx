"use client";

import { useEffect, useState } from "react";
import { AnimatePresence, motion, useReducedMotion } from "motion/react";
import {
  ArrowRight,
  BarChart3,
  Diamond,
  Disc3,
  Gamepad2,
  HeartPulse,
  History,
  LayoutGrid,
  LogIn,
  MessageCircleQuestion,
  Mic,
  Music,
  Sparkles,
  Star,
  Terminal,
  Lightbulb,
  Wrench,
  type LucideIcon,
} from "lucide-react";
import { SmartLink } from "@/components/SmartLink";
import { Reveal } from "@/components/Reveal";
import { useAuth } from "@/lib/auth";
import { cn } from "@/lib/cn";
import { readGuildsCache, readLastGuildId, guildPageHref, selectGuild } from "@/lib/dashboard";
import { cdnUrl, page } from "@/lib/site";
import { DashboardShell } from "./DashboardShell";
import { dashPrimaryBtn, dashSecondaryBtn, discordBtn } from "./guild/bits";
import {
  ANNUNCI_MODULE_TABS,
  GUILD_MODULE_SECTIONS,
  LIVE_MODULE_TABS,
  MODERATION_MODULE_TABS,
  PARTNERSHIP_MODULE_TABS,
  TICKET_MODULE_TABS,
  type GuildSectionId,
} from "./guildSections";

const SERVERS_HREF = "/dashboard/server/";
const BOT_AVATAR = "/webhooks/site-bot-avatar?size=256";
const LOGO = cdnUrl("/images/logo-disco.png");

type Track = { id: GuildSectionId; label: string; icon: LucideIcon; text: string; tags?: string[] };

const labels = (tabs: readonly { label: string }[]) => tabs.map((t) => t.label);
const mod = (id: GuildSectionId) => GUILD_MODULE_SECTIONS.find((s) => s.id === id)!;
const track = (id: GuildSectionId, text: string, tags?: string[]): Track => ({ id, label: mod(id).label, icon: mod(id).icon, text, tags });

/** Lato A: tenere in ordine il server. */
const SIDE_A: Track[] = [
  track("tickets", "Ogni richiesta ha il suo posto: pannelli, form, team dedicati e risposte pronte, con archivio e transcript.", labels(TICKET_MODULE_TABS).filter((l) => l !== "Panoramica")),
  track("moderation", "Casi, punizioni automatiche e ricorsi, con il log del server sempre a portata di mano.", labels(MODERATION_MODULE_TABS).filter((l) => l !== "Panoramica")),
  track("partnership", "Partner manager, filtri, blacklist e cronologia: le partnership girano da sole. E puoi importare da altri bot.", labels(PARTNERSHIP_MODULE_TABS)),
  track("risposte", "Il bot risponde al posto tuo alle domande che arrivano sempre uguali."),
  track("ruoli", "Ruoli assegnati in automatico, senza rincorrere nessuno."),
  { id: "commands", label: "Comandi", icon: Terminal, text: "Accendi, spegni e regola ogni comando, categoria per categoria." },
  { id: "registro", label: "Registro modifiche", icon: History, text: "Chi ha cambiato cosa e quando: niente più sorprese nelle impostazioni." },
];

/** Lato B: farlo vivere. */
const SIDE_B: Track[] = [
  track("benvenuto", "Benvenuti, addii, boost e traguardi annunciati con embed curati.", labels(ANNUNCI_MODULE_TABS)),
  track("live", "Avvisi appena parte una live o esce un contenuto nuovo.", labels(LIVE_MODULE_TABS)),
  track("compleanni", "Auguri il giorno giusto, a tutto il server o solo a chi vuoi."),
  track("giveaway", "Premi, durata e vincitori estratti dal bot."),
  track("sondaggi", "Domande alla community, risultati in tempo reale."),
  track("voti", "Chi vota il server si prende il suo grazie."),
  track("bacheca", "I messaggi migliori finiscono in bacheca, scelti dalla community."),
  track("contatori", "Canali che contano membri e numeri del server da soli."),
  track("bump", "Ti ricorda quando è ora di spingere il server."),
  track("comandipers", "I comandi che mancano, li crei tu."),
  track("messaggi", "Messaggi ed embed pronti da mandare quando serve."),
];

const ORBIT: { icon: LucideIcon; label: string; cls: string; delay: number }[] = [
  { icon: mod("tickets").icon, label: "Ticket", cls: "left-0 top-[12%]", delay: 0 },
  { icon: mod("live").icon, label: "Live", cls: "right-0 top-[6%]", delay: 0.6 },
  { icon: mod("giveaway").icon, label: "Giveaway", cls: "-right-2 bottom-[22%]", delay: 1.2 },
  { icon: mod("moderation").icon, label: "Moderazione", cls: "-left-3 bottom-[14%]", delay: 1.8 },
  { icon: Music, label: "Musica", cls: "left-1/2 -bottom-3 -translate-x-1/2", delay: 2.4 },
];

const EXTRAS: { icon: LucideIcon; label: string }[] = [
  { icon: Music, label: "Musica" },
  { icon: Mic, label: "TTS in vocale" },
  { icon: Gamepad2, label: "Minigiochi" },
  { icon: Wrench, label: "Utility" },
];

function BotAvatar({ className }: { className?: string }) {
  const [src, setSrc] = useState(BOT_AVATAR);
  return (
    // eslint-disable-next-line @next/next/no-img-element -- avatar del bot servito dall'API
    <img src={src} alt="" onError={() => setSrc(LOGO)} className={cn("rounded-full object-cover", className)} />
  );
}

/** Il disco che gira, con l'avatar di Vinili sull'etichetta e le funzioni che ci girano intorno. */
function SpinningRecord() {
  const still = useReducedMotion();
  return (
    <div className="relative mx-auto aspect-square w-full max-w-[22rem]">
      <div className="absolute inset-6 rounded-full bg-caramel/20 blur-3xl" aria-hidden />
      <motion.div
        className="absolute inset-6 rounded-full shadow-[0_40px_80px_-30px_rgba(0,0,0,0.9)]"
        animate={still ? undefined : { rotate: 360 }}
        transition={{ duration: 14, ease: "linear", repeat: Infinity }}
        aria-hidden
      >
        <div className="size-full rounded-full bg-[repeating-radial-gradient(circle_at_center,#141010_0px,#141010_2px,#221a16_3px,#141010_4px)] ring-1 ring-black/60" />
        <div className="absolute inset-0 rounded-full bg-[conic-gradient(from_40deg,transparent_0deg,rgba(255,236,210,0.12)_30deg,transparent_70deg,transparent_180deg,rgba(255,236,210,0.08)_215deg,transparent_250deg)]" />
        <div className="absolute inset-[32%] overflow-hidden rounded-full bg-gradient-to-br from-caramel to-ember p-1.5 ring-4 ring-black/40">
          <BotAvatar className="size-full" />
        </div>
        <div className="absolute left-1/2 top-1/2 size-2 -translate-x-1/2 -translate-y-1/2 rounded-full bg-espresso ring-1 ring-black/60" />
      </motion.div>
      {ORBIT.map(({ icon: Icon, label, cls, delay }) => (
        <motion.span
          key={label}
          className={cn("absolute inline-flex items-center gap-1.5 rounded-full bg-roast/90 px-3 py-1.5 text-xs font-semibold text-crema/85 shadow-[0_12px_30px_-14px_rgba(0,0,0,0.9)] ring-1 ring-sand/20 backdrop-blur", cls)}
          initial={{ opacity: 0, scale: 0.8 }}
          animate={still ? { opacity: 1, scale: 1 } : { opacity: 1, scale: 1, y: [0, -7, 0] }}
          transition={{ opacity: { delay: 0.3 + delay / 4 }, scale: { delay: 0.3 + delay / 4 }, y: { duration: 4.5, repeat: Infinity, ease: "easeInOut", delay } }}
        >
          <Icon className="size-3.5 text-ember" aria-hidden /> {label}
        </motion.span>
      ))}
    </div>
  );
}

/** Nastro che scorre con tutte le funzioni. */
function Ticker() {
  const still = useReducedMotion();
  const all = [...SIDE_A, ...SIDE_B];
  const row = (hidden?: boolean) => (
    <div className="flex shrink-0 items-center gap-8 pr-8" aria-hidden={hidden || undefined}>
      {all.map(({ id, label, icon: Icon }) => (
        <span key={id} className="inline-flex items-center gap-2 whitespace-nowrap text-sm font-semibold text-crema/55">
          <Icon className="size-4 text-caramel" aria-hidden /> {label}
        </span>
      ))}
    </div>
  );
  return (
    <div className="relative overflow-hidden py-4 [mask-image:linear-gradient(90deg,transparent,#000_10%,#000_90%,transparent)]">
      <motion.div className="flex w-max" animate={still ? undefined : { x: ["0%", "-50%"] }} transition={{ duration: 45, ease: "linear", repeat: Infinity }}>
        {row()}
        {row(true)}
      </motion.div>
    </div>
  );
}

/** Le funzioni come la scaletta di un vinile: Lato A e Lato B, scegli una traccia e la vedi. */
function Tracklist() {
  const [side, setSide] = useState<"A" | "B">("A");
  const tracks = side === "A" ? SIDE_A : SIDE_B;
  const [pick, setPick] = useState<GuildSectionId>(SIDE_A[0].id);
  const cur = tracks.find((t) => t.id === pick) || tracks[0];
  const flip = (s: "A" | "B") => {
    if (s === side) return;
    setSide(s);
    setPick((s === "A" ? SIDE_A : SIDE_B)[0].id);
  };

  return (
    <div className="overflow-hidden rounded-3xl bg-roast/70 ring-1 ring-sand/12">
      <div className="flex flex-wrap items-center justify-between gap-3 border-b border-sand/10 px-5 py-4 sm:px-6">
        <div>
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.24em] text-caramel">Scaletta</p>
          <p className="mt-0.5 font-display text-xl font-semibold text-crema">{side === "A" ? "Lato A · Tieni tutto in ordine" : "Lato B · Fai vivere il server"}</p>
        </div>
        <div className="inline-flex rounded-full bg-black/30 p-1 ring-1 ring-crema/10" role="tablist" aria-label="Lato del disco">
          {(["A", "B"] as const).map((s) => (
            <button
              key={s}
              type="button"
              role="tab"
              aria-selected={side === s}
              onClick={() => flip(s)}
              className={cn("rounded-full px-4 py-1.5 text-sm font-semibold transition-colors", side === s ? "bg-crema text-espresso" : "text-crema/60 hover:text-crema")}
            >
              Lato {s}
            </button>
          ))}
        </div>
      </div>

      <div className="grid lg:grid-cols-[minmax(0,1fr)_minmax(0,1.15fr)]">
        <ol className="space-y-0.5 p-3 sm:p-4">
          {tracks.map((t, i) => {
            const on = t.id === cur.id;
            return (
              <li key={t.id}>
                <button
                  type="button"
                  onClick={() => setPick(t.id)}
                  onMouseEnter={() => setPick(t.id)}
                  aria-current={on || undefined}
                  className={cn("group flex w-full items-center gap-3 rounded-xl px-3 py-2.5 text-left transition", on ? "bg-caramel/12 ring-1 ring-caramel/25" : "hover:bg-crema/[0.04]")}
                >
                  <span className={cn("w-7 shrink-0 font-mono text-xs lining-nums", on ? "text-ember" : "text-crema/35")}>
                    {side}
                    {i + 1}
                  </span>
                  <t.icon className={cn("size-4 shrink-0", on ? "text-ember" : "text-crema/45 group-hover:text-crema/70")} aria-hidden />
                  <span className={cn("min-w-0 flex-1 truncate text-sm font-semibold", on ? "text-crema" : "text-crema/70")}>{t.label}</span>
                  {on ? (
                    <span className="flex h-3 items-end gap-0.5" aria-hidden>
                      {[0, 1, 2].map((b) => (
                        <motion.span key={b} className="w-0.5 rounded-full bg-ember" animate={{ height: ["30%", "100%", "45%", "80%", "30%"] }} transition={{ duration: 1.1, repeat: Infinity, delay: b * 0.18 }} />
                      ))}
                    </span>
                  ) : null}
                </button>
              </li>
            );
          })}
        </ol>

        <div className="relative border-t border-sand/10 p-5 sm:p-7 lg:border-l lg:border-t-0">
          <AnimatePresence mode="wait">
            <motion.div key={cur.id} initial={{ opacity: 0, y: 10 }} animate={{ opacity: 1, y: 0 }} exit={{ opacity: 0, y: -6 }} transition={{ duration: 0.22 }} className="flex h-full flex-col">
              <span className="flex size-12 items-center justify-center rounded-2xl bg-gradient-to-br from-caramel/25 to-ember/10 text-ember ring-1 ring-caramel/30">
                <cur.icon className="size-6" aria-hidden />
              </span>
              <h3 className="mt-4 font-display text-2xl font-semibold text-crema">{cur.label}</h3>
              <p className="mt-2 max-w-md text-sm leading-relaxed text-crema/65">{cur.text}</p>
              {cur.tags?.length ? (
                <ul className="mt-5 flex flex-wrap gap-1.5">
                  {cur.tags.map((tag) => (
                    <li key={tag} className="rounded-full bg-crema/[0.05] px-2.5 py-1 text-xs font-medium text-crema/70 ring-1 ring-sand/15">
                      {tag}
                    </li>
                  ))}
                </ul>
              ) : null}
              <div className="mt-auto pt-6">
                <SmartLink href={page(SERVERS_HREF)} className="inline-flex items-center gap-1.5 text-sm font-semibold text-ember underline-offset-4 hover:underline">
                  Configuralo nel tuo server <ArrowRight className="size-4" aria-hidden />
                </SmartLink>
              </div>
            </motion.div>
          </AnimatePresence>
        </div>
      </div>
    </div>
  );
}

function LinkCard({ href, icon: Icon, title, text, accent }: { href: string; icon: LucideIcon; title: string; text: string; accent?: boolean }) {
  return (
    <SmartLink
      href={page(href)}
      className={cn(
        "group relative flex flex-col overflow-hidden rounded-2xl p-5 ring-1 transition duration-200 hover:-translate-y-0.5",
        accent ? "bg-gradient-to-br from-caramel/20 via-roast/80 to-roast/80 ring-caramel/30 hover:ring-caramel/50" : "bg-roast/70 ring-sand/12 hover:ring-sand/30",
      )}
    >
      <Icon className={cn("size-5", accent ? "text-ember" : "text-caramel")} aria-hidden />
      <span className="mt-3 font-semibold text-crema">{title}</span>
      <span className="mt-1 text-sm text-crema/55">{text}</span>
      <ArrowRight className="absolute right-4 top-5 size-4 text-crema/30 transition group-hover:translate-x-0.5 group-hover:text-crema/70" aria-hidden />
    </SmartLink>
  );
}

/** Pagina d'ingresso della dashboard: cosa sa fare Vinili, poi i tuoi server. */
export function BotShowcase() {
  const { user, ready, login } = useAuth();
  const [resume, setResume] = useState<{ id: string; name: string } | null>(null);

  useEffect(() => {
    const t = window.setTimeout(() => {
      const id = readLastGuildId();
      const g = id ? readGuildsCache()?.find((x) => x.id === id) : null;
      if (g?.botPresent) setResume({ id: g.id, name: g.name.length > 22 ? `${g.name.slice(0, 21)}…` : g.name });
    }, 0);
    return () => window.clearTimeout(t);
  }, []);

  return (
    <DashboardShell title="Dashboard" noCrumb bare>
      {/* intro */}
      <section className="relative grid items-center gap-10 pb-6 pt-2 lg:grid-cols-[minmax(0,1.1fr)_minmax(0,0.9fr)] lg:pt-6">
        <div>
          <motion.p initial={{ opacity: 0, y: 8 }} animate={{ opacity: 1, y: 0 }} className="inline-flex items-center gap-2 rounded-full bg-caramel/10 px-3 py-1 text-xs font-semibold text-ember ring-1 ring-caramel/25">
            <Disc3 className="size-3.5" aria-hidden /> Il bot di Vinili &amp; Caffè
          </motion.p>
          <motion.h1
            initial={{ opacity: 0, y: 14 }}
            animate={{ opacity: 1, y: 0 }}
            transition={{ delay: 0.05, duration: 0.6, ease: [0.22, 1, 0.36, 1] }}
            className="mt-5 font-display text-[2.6rem] font-semibold leading-[1.02] text-crema sm:text-6xl"
          >
            Il tuo server,{" "}
            <span className="bg-gradient-to-r from-caramel via-ember to-caramel bg-clip-text text-transparent">a tutto volume.</span>
          </motion.h1>
          <motion.p initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.12, duration: 0.6 }} className="mt-5 max-w-xl text-base leading-relaxed text-crema/65 sm:text-lg">
            Ticket, moderazione, partnership, annunci, live, compleanni, giveaway e molto altro. Un solo bot, tutto configurabile da qui, senza ricordarti un comando.
          </motion.p>
          <motion.div initial={{ opacity: 0, y: 14 }} animate={{ opacity: 1, y: 0 }} transition={{ delay: 0.2, duration: 0.6 }} className="mt-8 flex flex-wrap gap-2.5">
            {ready && !user ? (
              <button type="button" onClick={login} className={cn(discordBtn, "px-5 py-2.5")}>
                <LogIn className="size-4" aria-hidden /> Accedi con Discord
              </button>
            ) : (
              <SmartLink href={page(SERVERS_HREF)} className={cn(dashPrimaryBtn, "px-5 py-2.5")}>
                <LayoutGrid className="size-4" aria-hidden /> I miei server
              </SmartLink>
            )}
            {resume ? (
              <SmartLink href={guildPageHref(resume.id)} onClick={() => selectGuild(resume.id)} className={cn(dashSecondaryBtn, "px-5 py-2.5")}>
                Riprendi da {resume.name} <ArrowRight className="size-4" aria-hidden />
              </SmartLink>
            ) : (
              <SmartLink href={page("/dashboard/premium/")} className={cn(dashSecondaryBtn, "px-5 py-2.5")}>
                <Diamond className="size-4" aria-hidden /> Scopri Premium
              </SmartLink>
            )}
          </motion.div>
        </div>
        <motion.div initial={{ opacity: 0, scale: 0.92 }} animate={{ opacity: 1, scale: 1 }} transition={{ duration: 0.8, ease: [0.22, 1, 0.36, 1] }} className="px-4 sm:px-8">
          <SpinningRecord />
        </motion.div>
      </section>

      <Ticker />

      {/* funzioni */}
      <section className="mt-10">
        <Reveal>
          <h2 className="font-display text-3xl font-semibold text-crema sm:text-4xl">Cosa suona Vinili</h2>
          <p className="mt-2 max-w-2xl text-crema/55">Due lati, un disco: scegli una traccia per vedere cosa fa. Ogni modulo si accende e si spegne quando vuoi.</p>
        </Reveal>
        <Reveal delay={0.08} className="mt-6">
          <Tracklist />
        </Reveal>
      </section>

      {/* extra */}
      <section className="mt-10 grid gap-3 lg:grid-cols-3">
        <Reveal className="rounded-3xl bg-roast/70 p-6 ring-1 ring-sand/12 lg:col-span-2">
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.24em] text-caramel">Bonus track</p>
          <h3 className="mt-1 font-display text-2xl font-semibold text-crema">Non solo gestione</h3>
          <p className="mt-2 max-w-lg text-sm text-crema/60">Comandi per passare il tempo in compagnia, direttamente su Discord.</p>
          <div className="mt-5 grid grid-cols-2 gap-2 sm:grid-cols-4">
            {EXTRAS.map(({ icon: Icon, label }, i) => (
              <motion.div
                key={label}
                initial={{ opacity: 0, y: 10 }}
                whileInView={{ opacity: 1, y: 0 }}
                viewport={{ once: true }}
                transition={{ delay: 0.06 * i }}
                className="flex flex-col items-start gap-3 rounded-2xl bg-crema/[0.04] p-4 ring-1 ring-sand/10"
              >
                <Icon className="size-5 text-ember" aria-hidden />
                <span className="text-sm font-semibold text-crema/85">{label}</span>
              </motion.div>
            ))}
          </div>
        </Reveal>
        <Reveal delay={0.08} className="flex flex-col rounded-3xl bg-roast/70 p-6 ring-1 ring-sand/12">
          <p className="text-[0.65rem] font-bold uppercase tracking-[0.24em] text-caramel">Sotto controllo</p>
          <h3 className="mt-1 font-display text-2xl font-semibold text-crema">Vedi tutto</h3>
          <ul className="mt-4 space-y-3 text-sm text-crema/70">
            <li className="flex items-center gap-2.5">
              <BarChart3 className="size-4 text-caramel" aria-hidden /> Statistiche del server
            </li>
            <li className="flex items-center gap-2.5">
              <HeartPulse className="size-4 text-caramel" aria-hidden /> Salute del bot e permessi
            </li>
            <li className="flex items-center gap-2.5">
              <History className="size-4 text-caramel" aria-hidden /> Registro di ogni modifica
            </li>
          </ul>
        </Reveal>
      </section>

      {/* premium + aiuto */}
      <section className="mt-10 grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
        <LinkCard accent href="/dashboard/premium/" icon={Diamond} title="Vinili Premium" text="Più funzioni e limiti più alti per il tuo server." />
        <LinkCard href="/faq/#bot" icon={MessageCircleQuestion} title="FAQ del bot" text="Le risposte alle domande più comuni." />
        <LinkCard href="/feedback/#bot" icon={Lightbulb} title="Idee e feedback" text="Proponi una funzione o segnala un problema." />
        <LinkCard href="/recensioni/#bot" icon={Star} title="Recensioni" text="Cosa ne pensa chi lo usa già." />
      </section>

      {/* chiusura */}
      <Reveal className="relative mt-10 overflow-hidden rounded-3xl bg-gradient-to-r from-caramel/25 via-roast to-roast p-8 ring-1 ring-caramel/25 sm:p-10">
        <Sparkles className="absolute -right-4 -top-4 size-32 text-caramel/10" aria-hidden />
        <h2 className="max-w-lg font-display text-3xl font-semibold text-crema">Metti il disco sul piatto.</h2>
        <p className="mt-2 max-w-lg text-crema/60">Scegli un server, aggiungi Vinili e accendi i moduli che ti servono.</p>
        <div className="mt-6">
          {ready && !user ? (
            <button type="button" onClick={login} className={cn(discordBtn, "px-5 py-2.5")}>
              <LogIn className="size-4" aria-hidden /> Accedi con Discord
            </button>
          ) : (
            <SmartLink href={page(SERVERS_HREF)} className={cn(dashPrimaryBtn, "px-5 py-2.5")}>
              Scegli un server <ArrowRight className="size-4" aria-hidden />
            </SmartLink>
          )}
        </div>
      </Reveal>
    </DashboardShell>
  );
}
