"use client";

import { Coffee, Disc3, Globe } from "lucide-react";
import { Reveal } from "./Reveal";

const BLOCKS = [
  {
    icon: Coffee,
    kicker: "La community",
    title: "Un server Discord italiano",
    paragraphs: [
      "Vinili & Caffè è un server Discord per chi cerca un posto tranquillo dove parlare di musica, giochi, serie o di com’è andata la giornata. Non c’è un argomento obbligato e nessuno ti chiede di essere sempre attivo.",
      "Molti entrano per un evento o per una partita e restano perché, dopo qualche settimana, in chat riconoscono i nomi. Se non sei ancora dentro, il pulsante Discord in alto ti porta al server.",
    ],
  },
  {
    icon: Disc3,
    kicker: "Sul server",
    title: "Vocali, chat ed eventi",
    paragraphs: [
      "Gran parte della vita del server passa nelle stanze vocali: c’è chi ascolta musica con gli altri, chi gioca, chi resta collegato mentre studia per avere un po’ di compagnia. Le chat testuali sono divise per argomento, con canali per i giochi, per la musica e per chiacchierare.",
      "Ci sono livelli, ruoli da sbloccare ed eventi a tema durante l’anno, ma partecipare è una scelta: chi preferisce leggere e basta è il benvenuto lo stesso. Le regole sono poche, e per ogni dubbio c’è lo staff.",
    ],
  },
  {
    icon: Globe,
    kicker: "Sul sito",
    title: "Cosa trovi qui",
    paragraphs: [
      "Le regole, le risposte alle domande più comuni, la guida ai comandi dei bot, le classifiche e le recensioni dei membri. C’è anche la Vetrina, dove altri server e bot Discord hanno una scheda con voti e recensioni.",
      "Per votare, lasciare una recensione o aprire un ticket basta entrare con il tuo account Discord: non devi registrarti e non hai un’altra password da ricordare.",
    ],
  },
] as const;

/** Prosa editoriale in home: community, vita sul server, cosa trovi sul sito. */
export function HomeEditorial() {
  return (
    <section aria-labelledby="home-editorial-heading" className="mx-auto max-w-6xl px-6 py-16 sm:py-20">
      <Reveal className="mb-12 max-w-2xl">
        <p id="home-editorial-heading" className="text-xs font-semibold text-caramel">
          La community
        </p>
        <h2 className="mt-3 font-display text-3xl font-semibold leading-tight text-balance sm:text-4xl">
          Com’è fatto Vinili & Caffè
        </h2>
        <p className="mt-4 text-lg leading-relaxed text-crema/65">
          Tre cose da sapere se è la prima volta che passi di qui.
        </p>
      </Reveal>

      <div className="grid gap-6 lg:grid-cols-3 lg:gap-5">
        {BLOCKS.map((b, i) => {
          const Icon = b.icon;
          return (
            <Reveal key={b.kicker} delay={i * 0.08}>
              <article className="h-full rounded-3xl bg-roast p-7 ring-1 ring-sand/15">
                <span className="inline-flex size-11 items-center justify-center rounded-2xl bg-caramel/15 text-ember ring-1 ring-caramel/30">
                  <Icon className="size-5" aria-hidden />
                </span>
                <p className="mt-5 text-xs font-semibold text-caramel/85">{b.kicker}</p>
                <h3 className="mt-2 font-display text-2xl font-semibold text-crema">{b.title}</h3>
                <div className="mt-4 space-y-3">
                  {b.paragraphs.map((p) => (
                    <p key={p.slice(0, 40)} className="leading-relaxed text-crema/70">
                      {p}
                    </p>
                  ))}
                </div>
              </article>
            </Reveal>
          );
        })}
      </div>
    </section>
  );
}
