// Domande frequenti (da WebSite/js/faq-page.js). Nei testi, [[Etichetta|/percorso/]] diventa un link.

export type FaqCategory = { id: string; label: string };
export type FaqItem = { id: string; category: string; title: string; body: string };

export const FAQ_CATEGORIES: FaqCategory[] = [
  { id: "livelli", label: "Livelli" },
  { id: "voce", label: "Musica" },
  { id: "giochi", label: "Giochi" },
  { id: "eventi", label: "Eventi" },
  { id: "staff", label: "Staff" },
];

export const FAQ_ITEMS: FaqItem[] = [
  {
    id: "exp",
    category: "livelli",
    title: "Come posso accumulare punti EXP?",
    body: "Ogni messaggio in chat e il tempo passato nelle vocali fanno salire l'EXP (in vocale l'esperienza guadagnata è il doppio). Su [[Perks|/perks/]] trovi cosa si sblocca con i vari livelli, mentre le [[classifiche|/classifiche/]] mostrano chi è in testa.",
  },
  {
    id: "minigames",
    category: "livelli",
    title: "Come posso partecipare ai minigames?",
    body: "Ogni 15 minuti, dalle 8 di mattina fino alle 23:59, il nostro bot invia in chat dei piccoli giochi. Non sono obbligatori, ma se vuoi divertirti in compagnia sfidando gli altri utenti e guadagnare EXP aggiuntiva, sono quello che fa per te!",
  },
  {
    id: "musica",
    category: "voce",
    title: "È possibile ascoltare musica insieme agli altri?",
    body: "Certamente! Nelle stanze vocali puoi ascoltare o condividere quello che ti piace con i nostri bot ufficiali, rispettando volume e regolamento (niente earrape, niente cose che disturbino). Tutti i comandi sono nella [[Wiki|/wiki/]].",
  },
  {
    id: "giochi",
    category: "giochi",
    title: "Quali giochi sono disponibili?",
    body: "Ci sono molti canali come Pokétwo, Counting e Ship, oltre ai minigames in chat col bot. Non tutti i giochi sono per tutti i gusti: se uno non ti piace, passa oltre.",
  },
  {
    id: "season",
    category: "eventi",
    title: "Come funzionano gli eventi stagionali?",
    body: "Durante la tua permanenza nel server potrai partecipare a delle vere e proprie SEASON di circa 3 mesi. Ognuna ha un tema principale attorno al quale si tengono eventi, contest e sfide così belli da tenerti incollato allo schermo!",
  },
  {
    id: "vincere",
    category: "eventi",
    title: "Come posso avere più possibilità di vincere gli eventi?",
    body: "Segui alla lettera le istruzioni dell'evento: lì trovi tutti i modi per avvantaggiarti. In generale, essere attivi in vocale e in testuale aiuta molto. Per i bonus, [[votando il server|/vote/]] e boostandolo ricevi i vantaggi elencati nei [[Perks|/perks/]]. Non esiste una scorciatoia: i premi vanno a chi partecipa con costanza ed entusiasmo!",
  },
  {
    id: "staff-pagato",
    category: "staff",
    title: "Cosa significa \"staff pagato\"?",
    body: "Ogni mese il migliore di tutto lo staff viene premiato con un mese di Nitro Boost. I Partner Manager, invece, ricevono Nitro Boost e premi in denaro in base al proprio operato.",
  },
  {
    id: "candidatura",
    category: "staff",
    title: "Posso diventare un membro dello staff?",
    body: "Ovviamente! Siamo sempre alla ricerca di nuove figure. Dopo aver letto bene le [[regole|/regole/]], invia la tua candidatura dalla pagina [[Candidature|/candidature/]]. Serietà e costanza sono fondamentali, e se hai esperienza fallo presente! Dopo l'invio non taggare lo staff e non aprire ticket per chiedere l'esito.",
  },
];
