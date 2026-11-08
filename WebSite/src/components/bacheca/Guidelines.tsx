"use client";

import { Reveal } from "../Reveal";

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

/** Regole recensioni — stessa sostanza, cornice da vetrina. */
export function Guidelines() {
  return (
    <section className="mx-auto max-w-3xl px-6 pb-28 sm:px-10">
      <p className="max-w-xl text-crema/55 leading-relaxed">
        Se aiuta chi sceglie, resta. Se è rumore, offesa o trucco, via.
      </p>
      <ol className="mt-12 space-y-0 border-t border-crema/[0.1]">
        {SECTIONS.map((s, i) => (
          <Reveal key={s.title} delay={Math.min(i, 8) * 0.03}>
            <li className="grid gap-3 border-b border-crema/[0.1] py-7 sm:grid-cols-[4rem_1fr] sm:gap-8">
              <span className="font-mono text-sm tracking-widest text-caramel/80">
                {String(i + 1).padStart(2, "0")}
              </span>
              <div>
                <h2 className="font-display text-2xl font-semibold tracking-[-0.02em] text-crema">{s.title}</h2>
                <p className="mt-3 text-sm leading-relaxed text-crema/60 sm:text-base">{s.body}</p>
              </div>
            </li>
          </Reveal>
        ))}
      </ol>
    </section>
  );
}
