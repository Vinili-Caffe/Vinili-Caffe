"use client";

import { motion } from "motion/react";
import { Ban, Copy, EyeOff, Flag, HeartHandshake, PenLine, Scale, Users, VenetianMask, type LucideIcon } from "lucide-react";
import { page } from "@/lib/site";
import { SmartLink } from "../SmartLink";

const ICONS: LucideIcon[] = [HeartHandshake, Ban, Copy, EyeOff, Flag, Users, Scale, VenetianMask];

const SECTIONS: { title: string; body: string }[] = [
  {
    title: "Perché queste linee guida",
    body: "Le recensioni aiutano la community a scegliere server e bot. Devono essere utili, oneste e rispettose. Lo staff di Vinili & Caffè può moderare, nascondere o rimuovere le recensioni che non rispettano queste regole. Vale anche quanto previsto dai Termini di Servizio e dalle regole della community.",
  },
  {
    title: "Niente spam, offese o contenuti non correlati",
    body: "La recensione deve essere utile a chi consulta la scheda. Non sono ammessi copypasta, malware, pubblicità, insulti, messaggi fuori tema, suggerimenti o domande spacciate per recensioni, né contenuti non legati alle funzioni attuali del server/bot.",
  },
  {
    title: "Non abusare del sistema di recensioni",
    body: "Vogliamo feedback genuini. È vietato usare account alternativi per recensire in massa, bombardare utenti con pubblicità non richiesta o manipolare voti/rating in modo artificiale.",
  },
  {
    title: "Niente contenuti sessualmente espliciti",
    body: "La Vetrina punta a contenuti sicuri e adatti alla community. Non includere né collegare materiale sessualmente esplicito nelle recensioni.",
  },
  {
    title: "Non usare le recensioni per segnalare violazioni",
    body: "Per le segnalazioni usa il pulsante Segnala sulla scheda o i canali ufficiali (Discord/ticket). Le recensioni non sostituiscono una gestione dedicata delle violazioni.",
  },
  {
    title: "Niente molestie verso persone o gruppi",
    body: "Vinili & Caffè è inclusiva. Evita attacchi basati su origine, religione, etnia, sesso, genere, orientamento, appartenenza o disabilità. È vietato condividere dati personali identificabili (nome, indirizzo, email, telefono, IP, ecc.).",
  },
  {
    title: "Niente promozione di illegali o violazioni",
    body: "Non promuovere, discutere o incoraggiare attività illegali o in violazione delle nostre linee guida: violenza, frodi, sostanze illegali, abuso su minori o animali, e simili.",
  },
  {
    title: "Niente impersonificazione",
    body: "Non fingerti un altro utente, lo staff, un brand o un servizio. Le recensioni devono riflettere la tua esperienza reale.",
  },
];

/** Regole delle recensioni in vetrina: indice a sinistra, regole numerate a destra. */
export function Guidelines() {
  return (
    <section className="mx-auto max-w-6xl px-4 pb-28 sm:px-6">
      <div className="grid grid-cols-1 gap-8 lg:grid-cols-[17rem_minmax(0,1fr)]">
        <aside className="lg:sticky lg:top-24 lg:self-start">
          <div className="rounded-3xl bg-roast/80 p-5 ring-1 ring-sand/12">
            <p className="mb-3 text-xs font-semibold uppercase tracking-[0.2em] text-crema/45">In breve</p>
            <ol className="space-y-1">
              {SECTIONS.map((s, i) => (
                <li key={s.title}>
                  <a href={`#regola-${i + 1}`} className="flex gap-2.5 rounded-xl px-2 py-1.5 text-sm text-crema/65 transition-colors hover:bg-crema/5 hover:text-crema">
                    <span className="w-5 shrink-0 text-right font-display font-bold tabular-nums text-ember">{i + 1}</span>
                    <span className="leading-snug">{s.title}</span>
                  </a>
                </li>
              ))}
            </ol>
          </div>
        </aside>

        <div className="min-w-0 space-y-4">
          <div className="rounded-3xl bg-gradient-to-br from-caramel/20 to-transparent p-6 ring-1 ring-caramel/25 sm:p-7">
            <p className="font-script text-2xl text-ember">Prima di scrivere</p>
            <p className="mt-2 text-lg leading-relaxed text-crema/80">
              Le recensioni aiutano chi sta scegliendo un server o un bot. Racconta la tua esperienza vera, con rispetto: queste regole valgono per ogni testo pubblicato sulle schede della Vetrina.
            </p>
          </div>

          {SECTIONS.map((s, i) => {
            const Icon = ICONS[i] || Scale;
            return (
              <motion.article
                key={s.title}
                id={`regola-${i + 1}`}
                initial={{ opacity: 0, y: 14 }}
                animate={{ opacity: 1, y: 0 }}
                transition={{ delay: Math.min(i, 8) * 0.04, duration: 0.45 }}
                className="scroll-mt-24 rounded-3xl bg-roast/80 p-6 ring-1 ring-sand/12 sm:p-7"
              >
                <div className="flex items-start gap-4">
                  <span className="relative flex size-12 shrink-0 items-center justify-center rounded-2xl bg-caramel/15 text-ember ring-1 ring-caramel/30">
                    <Icon className="size-5" />
                    <span className="absolute -right-1.5 -top-1.5 flex size-5 items-center justify-center rounded-full bg-ember font-display text-[0.7rem] font-bold text-ink">{i + 1}</span>
                  </span>
                  <div className="min-w-0">
                    <h2 className="font-display text-2xl font-semibold text-crema">{s.title}</h2>
                    <p className="mt-2 leading-relaxed text-crema/70">{s.body}</p>
                  </div>
                </div>
              </motion.article>
            );
          })}

          <div className="flex flex-col items-center gap-3 rounded-3xl border border-dashed border-sand/20 p-8 text-center">
            <PenLine className="size-8 text-ember" />
            <p className="font-display text-2xl">Tutto chiaro?</p>
            <p className="max-w-md text-crema/55">Scegli una scheda dalla vetrina e lascia la tua recensione: bastano qualche riga e le stelle.</p>
            <SmartLink href={page("/vetrina/")} className="mt-1 rounded-full bg-gradient-to-r from-caramel to-ember px-5 py-2.5 font-bold text-ink">
              Vai alla vetrina
            </SmartLink>
          </div>
        </div>
      </div>
    </section>
  );
}
