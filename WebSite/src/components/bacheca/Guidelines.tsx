"use client";

import { motion } from "motion/react";
import {
  Ban,
  Copy,
  EyeOff,
  Flag,
  HeartHandshake,
  LogIn,
  MessageSquareReply,
  PenLine,
  Scale,
  Store,
  Users,
  VenetianMask,
  type LucideIcon,
} from "lucide-react";
import { page } from "@/lib/site";
import { SmartLink } from "../SmartLink";

const ICONS: LucideIcon[] = [
  HeartHandshake,
  LogIn,
  Ban,
  Copy,
  EyeOff,
  Flag,
  Users,
  Scale,
  VenetianMask,
  Store,
  MessageSquareReply,
];

const SECTIONS: { title: string; body: string }[] = [
  {
    title: "Perché queste linee guida",
    body: "Una recensione serve a chi sta decidendo se entrare in un server o provare un bot. Scrivila con onestà e rispetto: lo staff può nascondere o togliere quelle che non seguono queste regole.",
  },
  {
    title: "Una recensione a testa",
    body: "Entri con Discord e lasci una sola recensione per scheda, con le stelle e un testo. Se cambi idea modifichi quella, senza scriverne un’altra con un secondo account.",
  },
  {
    title: "Niente spam o fuori tema",
    body: "Racconta com’è il progetto. Testi copiati, insulti, link truffa e messaggi fuori tema vengono tolti.",
  },
  {
    title: "Niente gonfiaggi",
    body: "Account multipli, scambi di stelle e ondate organizzate di voti negativi non sono ammessi. Chi ci prova rischia di perdere i voti o di essere escluso dalla Vetrina, insieme alla scheda.",
  },
  {
    title: "Niente contenuti espliciti",
    body: "Niente contenuti sessuali espliciti o violenti. Se devi segnalare un problema, descrivilo senza riportarlo nei dettagli.",
  },
  {
    title: "Segnalazioni e recensioni",
    body: "Per abusi, truffe o fatti gravi usa il pulsante Segnala o apri un ticket: lo staff può intervenire, una recensione no.",
  },
  {
    title: "Niente molestie",
    body: "Niente attacchi a persone o gruppi e niente dati personali di altri. Si critica il progetto, mai chi lo gestisce.",
  },
  {
    title: "Niente illegali",
    body: "Niente pubblicità ad attività illegali, truffe o raid, nemmeno travestita da recensione.",
  },
  {
    title: "Niente impersonificazione",
    body: "Scrivi a nome tuo e racconta la tua esperienza: fingersi un altro utente, lo staff o un marchio non è ammesso.",
  },
  {
    title: "Proprietari: niente auto-recensione",
    body: "Non puoi recensire una scheda tua. Puoi però rispondere alle recensioni degli altri, con calma e senza attacchi.",
  },
  {
    title: "Mi piace e risposte",
    body: "Il cuore e le risposte del proprietario servono a mettere in evidenza le recensioni utili. Se qualcuno li usa in modo scorretto, lo staff interviene.",
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
              Racconta com’è andata davvero, con rispetto. Queste regole valgono per ogni recensione della Vetrina.
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
            <p className="max-w-md text-crema/55">Scegli una scheda e lascia la tua: due righe e le stelle bastano.</p>
            <SmartLink href={page("/vetrina/")} className="mt-1 rounded-full bg-gradient-to-r from-caramel to-ember px-5 py-2.5 font-bold text-ink">
              Vai alla vetrina
            </SmartLink>
          </div>
        </div>
      </div>
    </section>
  );
}
