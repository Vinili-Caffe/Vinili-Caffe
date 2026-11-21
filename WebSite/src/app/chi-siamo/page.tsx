import type { Metadata } from "next";
import { Users } from "lucide-react";
import { DiscordButton } from "@/components/DiscordButton";
import { DiscordComponentEmbed } from "@/components/DiscordComponentEmbed";
import { PageHero } from "@/components/PageHero";
import { Reveal } from "@/components/Reveal";
import { RichText } from "@/components/RichText";
import { SiteShell } from "@/components/SiteShell";
import { pageSocialMeta } from "@/lib/og";

const DESCRIPTION =
  "Chi siamo: Vinili & Caffè è una community italiana su Discord dove si parla di tutto, si ascolta musica in vocale e si partecipa agli eventi. Come funziona, chi la gestisce e come entrare.";

export const metadata: Metadata = {
  ...pageSocialMeta({ path: "/chi-siamo/", title: "Chi siamo", description: DESCRIPTION }),
};

/* Testo della pagina: [[Etichetta|/percorso/]] diventa un link. */
const SECTIONS: { title: string; paragraphs: string[] }[] = [
  {
    title: "Una community che esiste solo online",
    paragraphs: [
      "Vinili & Caffè è un server Discord italiano. Non c’è una sede né un posto dove andare: ci si incontra nelle chat e nelle stanze vocali, a qualsiasi ora, da qualsiasi parte d’Italia.",
      "Chi entra trova persone di età e interessi diversi. C’è chi passa la serata in vocale ad ascoltare musica con gli altri, chi gioca, chi studia con qualcuno collegato per sentirsi meno solo e chi preferisce leggere le chat senza scrivere troppo. Va bene tutto, purché si rispettino gli altri.",
    ],
  },
  {
    title: "Cosa si fa sul server",
    paragraphs: [
      "Le chat sono divise per argomento, con canali per la musica, per i giochi e per le chiacchiere libere. Nelle stanze vocali si ascolta musica insieme grazie ai nostri bot, e chiunque può mettere in coda un brano. Durante la giornata il bot propone piccoli giochi in chat, e chi risponde per primo guadagna un po’ di esperienza.",
      "Chi partecipa sale di livello e sblocca ruoli e vantaggi, spiegati uno per uno nella pagina dei [[Perks|/perks/]]. Durante l’anno organizziamo serate film, eventi a tema che durano qualche settimana e giveaway. Partecipare è sempre gratuito e non serve essere esperti di niente: basta leggere l’annuncio e presentarsi.",
    ],
  },
  {
    title: "I bot li scriviamo noi",
    paragraphs: [
      "Una parte del server gira su bot creati apposta per questa community. Vinili si occupa di livelli, ticket, moderazione, partnership e di molte piccole funzioni quotidiane; Caffè e Groove suonano la musica nelle stanze vocali e possono leggere ad alta voce i messaggi. Tutti i comandi, con una spiegazione per ciascuno, sono nella [[guida ai comandi|/wiki/]].",
      "Scriverli da noi ci permette di adattarli a come la community li usa davvero e di cambiarli quando i membri propongono qualcosa di meglio. Le idee per migliorarli si lasciano nella pagina dei [[feedback|/feedback/]]. Vinili si può anche aggiungere ad altri server e configurare dal sito, dalla [[dashboard|/dashboard/]].",
    ],
  },
  {
    title: "Regole e sicurezza",
    paragraphs: [
      "Le [[regole|/regole/]] sono poche e si possono riassumere così: rispetta le persone, non fare spam, non condividere contenuti illegali o pericolosi e non rovinare l’atmosfera delle stanze vocali. Per entrare servono almeno 13 anni, la stessa età minima richiesta da Discord.",
      "Lo staff è formato da membri della community che dedicano un po’ del loro tempo al server. Tengono d’occhio le chat, rispondono alle domande e intervengono quando qualcosa non va, aiutati da bot che bloccano spam e link truffa. Se qualcuno ti crea problemi puoi aprire un [[ticket|/tickets/]]: lo staff ti risponde in privato. Come trattiamo i dati personali è spiegato nell’[[informativa sulla privacy|/privacy/]].",
    ],
  },
  {
    title: "Cosa trovi su questo sito",
    paragraphs: [
      "Il sito raccoglie tutto quello che serve prima e dopo l’ingresso nel server: le [[regole|/regole/]], le [[domande frequenti|/faq/]], la guida ai comandi, le [[classifiche|/classifiche/]] dei membri più attivi e le [[recensioni|/recensioni/]] di chi c’è già passato. C’è anche il [[Wordle|/wordle/]] con una parola nuova ogni giorno.",
      "Nella [[Vetrina|/vetrina/]] altri server e bot Discord hanno una scheda pubblica, con voti e recensioni: serve a scoprire community nuove o a far conoscere la propria. Per votare, lasciare una recensione o aprire un ticket si entra con il proprio account Discord, senza creare un altro profilo.",
    ],
  },
  {
    title: "Come entrare e come darci una mano",
    paragraphs: [
      "Per entrare basta un account Discord e il pulsante qui sotto. Una volta dentro, leggi le regole, scegli i ruoli che ti interessano e presentati nel canale indicato. Se ti perdi, chiedi pure in chat.",
      "Se il server ti piace puoi aiutarlo a crescere [[votandolo|/vote/]] su Discadia e Top.gg, lasciando una [[recensione|/recensioni/]] o, se ne hai voglia, con una [[donazione|/donazioni/]] che copre i costi dei bot e degli eventi. Cerchiamo spesso anche persone per lo staff: le posizioni aperte sono nella pagina [[Candidature|/candidature/]].",
    ],
  },
  {
    title: "Contatti",
    paragraphs: [
      "Per qualsiasi domanda, segnalazione o richiesta, anche sui tuoi dati, il modo più rapido è aprire un [[ticket|/tickets/]] dal sito oppure scrivere allo staff sul server Discord. Ci trovi anche su [[Instagram|https://www.instagram.com/viniliecaffe/]] e [[TikTok|https://www.tiktok.com/@viniliecaffe]].",
    ],
  },
];

export default function ChiSiamoPage() {
  return (
    <SiteShell>
      <DiscordComponentEmbed path="/chi-siamo/" title="Chi siamo" description={DESCRIPTION} />
      <PageHero
        icon={<Users />}
        kicker="Vinili & Caffè"
        title="Chi"
        accent="siamo"
        text="Una community italiana su Discord, nata per parlare di tutto, ascoltare musica insieme e ritrovarsi agli eventi. Qui raccontiamo come funziona e chi la tiene in piedi."
      />

      <article className="mx-auto max-w-3xl px-6 pb-12">
        {SECTIONS.map((s, i) => (
          <Reveal key={s.title} delay={Math.min(i, 3) * 0.04}>
            <section className="border-t border-sand/10 py-9 first:border-t-0 first:pt-2">
              <h2 className="font-display text-3xl font-semibold leading-tight text-balance text-crema sm:text-4xl">{s.title}</h2>
              <div className="mt-4 space-y-4 text-lg leading-relaxed text-crema/72">
                {s.paragraphs.map((p) => (
                  <p key={p.slice(0, 48)}>
                    <RichText text={p} />
                  </p>
                ))}
              </div>
            </section>
          </Reveal>
        ))}

        <Reveal>
          <div className="mt-4 flex flex-wrap items-center gap-4 rounded-3xl bg-gradient-to-br from-mocha to-roast p-8 ring-1 ring-sand/15">
            <p className="min-w-0 flex-1 font-display text-2xl font-semibold text-crema">Ti va di passare?</p>
            <DiscordButton label="Entra su Discord" />
          </div>
        </Reveal>
      </article>
    </SiteShell>
  );
}
