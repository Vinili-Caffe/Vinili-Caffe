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
    body: "La Bacheca punta a contenuti sicuri e adatti alla community. Non includere né collegare materiale sessualmente esplicito nelle recensioni.",
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

/** Carta delle regole sulle recensioni in bacheca (testi dal sito vecchio). */
export function Guidelines() {
  return (
    <section className="mx-auto max-w-3xl px-6 pb-24">
      <p className="text-crema/65 leading-relaxed">
        Le recensioni aiutano chi sceglie un server o un bot. Queste regole valgono per ogni testo pubblicato sulle schede della Bacheca.
      </p>
      <div className="mt-10 space-y-5">
        {SECTIONS.map((s, i) => (
          <Reveal key={s.title} delay={Math.min(i, 8) * 0.04}>
            <article className="rounded-3xl bg-roast/70 p-6 ring-1 ring-sand/12">
              <h2 className="font-display text-2xl font-semibold text-crema">{s.title}</h2>
              <p className="mt-3 text-sm leading-relaxed text-crema/70 sm:text-base">{s.body}</p>
            </article>
          </Reveal>
        ))}
      </div>
    </section>
  );
}
