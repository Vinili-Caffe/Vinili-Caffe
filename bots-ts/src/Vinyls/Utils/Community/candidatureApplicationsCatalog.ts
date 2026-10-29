const HELPER_QUESTIONS = [
  { id: "id_discord", text: "1. ID Discord", modalLabel: "1. ID Discord", placeholder: "Copia e incolla il tuo ID di Discord", kind: "short" },
  { id: "eta", text: "2. Età", modalLabel: "2. Età", placeholder: "Scrivi la tua età", kind: "short" },
  { id: "tos_linee_guida", text: "3. Cosa sono i ToS e le Linee Guida di Discord?", modalLabel: "3. ToS e Linee Guida di Discord", placeholder: "", kind: "paragraph" },
  {
    id: "motivo_candidatura",
    text: "4. Seleziona una o più opzioni che sei disposto a intraprendere per sostenere il server",
    modalLabel: "4. Opzioni di supporto",
    placeholder: "Indica le opzioni scelte (es. attività vocale, scrivere nei canali, …)",
    kind: "multi_choice",
    hint: "Puoi selezionare più di un'opzione.",
    options: [
      { value: "Facendo attività vocale", label: "Facendo attività vocale" },
      { value: "Scrivendo nei canali", label: "Scrivendo nei canali" },
      { value: "Pensando a eventi per il server", label: "Pensando a eventi per il server" },
      { value: "Giveaway di nitro, decorazioni o altro", label: "Giveaway di nitro, decorazioni o altro" },
      { value: "Boostando il server", label: "Boostando il server" },
      { value: "Aiutando economicamente il server", label: "Aiutando economicamente il server" },
    ],
  },
  { id: "gestione_community", text: "5. Se hai già gestito delle community Discord, su quale tema si basavano (esempio: anime, giochi, musica, sport, ecc.)?", modalLabel: "5. Gestione community", placeholder: "", kind: "paragraph" },
  { id: "staff_altri_server", text: "6. Attualmente ricopri qualche carica da staffer in altri server? Se si, indica quali", modalLabel: "6. Staff in altri server", placeholder: "", kind: "paragraph" },
  { id: "comandi_dyno", text: "7. Elenca i comandi di moderazioni più importanti", modalLabel: "7. Comandi Dyno", placeholder: "", kind: "paragraph" },
  { id: "gestione_discussione", text: "8. Che comportamento assumi nel caso due utenti discutessero in un canale testuale o vocale?", modalLabel: "8. Gestione discussione", placeholder: "", kind: "paragraph" },
  {
    id: "vocale",
    text: "9. Potrai stare in vocale? In caso di risposta positiva, potrai parlare?",
    modalLabel: "9. Disponibilità in vocale",
    placeholder: "Sì / No",
    kind: "choice",
    options: [{ value: "Sì", label: "Sì" }, { value: "No", label: "No" }],
  },
  { id: "definizione_caps_wall_of_text", text: "10. Definisci 'caps' e 'wall of text'.", modalLabel: "10. Definizione 'caps' e 'wall of text'", placeholder: "", kind: "paragraph" },
  { id: "definizione_flood_spam", text: "11. Definisci e scrivi la differenza sostanziale tra flood e spam.", modalLabel: "11. Definizione flood e spam", placeholder: "", kind: "paragraph" },
  { id: "compito_staffer", text: "12. Secondo te, qual è il compito di uno Staffer?", modalLabel: "12. Compito di uno Staffer", placeholder: "", kind: "paragraph" },
  { id: "caratteristiche_vinili_caffe", text: "13. Su cosa si basa Vinili & Caffè e quali sono le sue caratteristiche principali e punti di forza?", modalLabel: "13. Caratteristiche di Vinili & Caffè", placeholder: "", kind: "paragraph" },
  {
    id: "valutazione_abilita_staffer",
    text: "14. Quanto valuti le tue abilità da Staffer?",
    modalLabel: "14. Valutazione abilità da Staffer",
    placeholder: "Pessime / Scarse / Buone / Eccellenti",
    kind: "choice",
    options: [
      { value: "Pessime", label: "Pessime" },
      { value: "Scarse", label: "Scarse" },
      { value: "Buone", label: "Buone" },
      { value: "Eccellenti", label: "Eccellenti" },
    ],
  },
  { id: "motivi_candidatura", text: "15. Perchè dovremmo scegliere te? Indica due motivi per il quale la tua candidatura dovrebbe essere presa in considerazione più delle altre.", modalLabel: "15. Punti di forza", placeholder: "", kind: "paragraph" },
  {
    id: "fascia_oraria_disponibilita",
    text: "16. In quale fascia oraria sei solitamente disponibile su discord?",
    modalLabel: "16. Fascia oraria disponibile",
    placeholder: "Indica le fasce (es. Mattino, Sera, …)",
    kind: "multi_choice",
    hint: "Puoi selezionare più di un'opzione.",
    options: [
      { value: "Mattino (07:00 - 12:30)", label: "Mattino (07:00 - 12:30)" },
      { value: "Pomeriggio (12:30 - 18:30)", label: "Pomeriggio (12:30 - 18:30)" },
      { value: "Sera (18:30 - 00:00)", label: "Sera (18:30 - 00:00)" },
      { value: "Notte (00:00 - 07:00)", label: "Notte (00:00 - 07:00)" },
    ],
  },
  {
    id: "tempo_dedicato_server",
    text: "17. Quanto tempo riesci a dedicare giornalmente al server?",
    modalLabel: "17. Tempo dedicato al server",
    placeholder: "Da 1 a 3 ore / Da 3 a 5 ore / …",
    kind: "choice",
    options: [
      { value: "Da 1 a 3 ore", label: "Da 1 a 3 ore" },
      { value: "Da 3 a 5 ore", label: "Da 3 a 5 ore" },
      { value: "Da 5 a 8 ore", label: "Da 5 a 8 ore" },
      { value: "8+ ore", label: "8+ ore" },
    ],
  },
];

const PARTNER_MANAGER_QUESTIONS = [
  { id: "id_discord", text: "1. ID Discord", modalLabel: "1. ID Discord", placeholder: "Dal profilo OAuth", kind: "short" },
  {
    id: "partnership_tra_server",
    text: "2. Descrivi brevemente come si effettua una partnership tra server",
    modalLabel: "2. Partnership tra server",
    placeholder: "Descrivi brevemente come si effettua una partnership tra server",
    kind: "paragraph",
  },
  {
    id: "partner_giorno",
    text: "3. Quante partner fai al giorno?",
    modalLabel: "3. Partner al giorno",
    placeholder: "15- / 15+",
    kind: "choice",
    options: [{ value: "-15", label: "15-" }, { value: "15+", label: "15+" }],
  },
  {
    id: "staff_altri_server",
    text: "4. Attualmente ricopri questo ruolo anche in altri server? Se si, indica quali",
    modalLabel: "4. Staff in altri server",
    placeholder: "Indica quali server",
    kind: "paragraph",
  }
];

function choicePlaceholder(q?) {
  if (!Array.isArray(q.options) || !q.options.length) return String(q.placeholder || "Rispondi qui");
  return `Opzioni: ${q.options.map((o?) => o.label || o.value).join(" / ")}`;
}

function findQuestionLabel(type?, fieldId?) {
  const list = type === "partnermanager" ? PARTNER_MANAGER_QUESTIONS : HELPER_QUESTIONS;
  const row = list.find((q?) => q.id === fieldId);
  return row ? String(row.text || row.modalLabel || fieldId) : fieldId;
}

export = { HELPER_QUESTIONS, PARTNER_MANAGER_QUESTIONS, choicePlaceholder, findQuestionLabel };