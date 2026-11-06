/**
 * Quiz smistamento Star Wars — epoca Clone Wars (Repubblica / Separatisti).
 * Pesi → fazione; una sola risposta per domanda.
 */
"use strict";

const FACTIONS = Object.freeze(["repubblica", "separatisti"]);

const FACTION_META = Object.freeze({
  repubblica: {
    id: "repubblica",
    label: "Repubblica",
    motto: "Ordine, senato e flotta della Repubblica Galattica.",
    primary: "#2f6fed",
    accent: "#f0e6c8",
  },
  separatisti: {
    id: "separatisti",
    label: "Separatisti",
    motto: "Indipendenza dei sistemi e potenza dei droidi.",
    primary: "#8b1a1a",
    accent: "#c9a227",
  },
});

const QUESTIONS = [
  {
    id: "q01",
    text: "Come dovrebbe essere il governo galattico ideale secondo te?",
    choices: [
      { id: "a", text: "Autoritario che garantisce ordine e unità", weights: { repubblica: 4, separatisti: 0 } },
      { id: "b", text: "Centrale ma con autonomie locali", weights: { repubblica: 3, separatisti: 1 } },
      { id: "c", text: "Sistemi autonomi che collaborano in caso di necessità", weights: { repubblica: 1, separatisti: 3 } },
      { id: "d", text: "Basato sul controllo di tutto ciò che è necessario per tenere ordine", weights: { repubblica: 0, separatisti: 4 } },
    ],
  },
  {
    id: "q02",
    text: "Davanti a una legge ingiusta, come agisci?",
    choices: [
      { id: "a", text: "La rispetto ma cerco di cambiarla seguendo la burocrazia", weights: { repubblica: 4, separatisti: 0 } },
      { id: "b", text: "La contesto pubblicamente ma la seguo comunque", weights: { repubblica: 4, separatisti: 0 } },
      { id: "c", text: "L'aggiro se serve a proteggere chi voglio", weights: { repubblica: 0, separatisti: 4 } },
      { id: "d", text: "La ignoro completamente perché la lealtà del mio elettorato viene prima", weights: { repubblica: 0, separatisti: 4 } },
    ],
  },
  {
    id: "q03",
    text: "In un conflitto, la tua prima mossa è:",
    choices: [
      { id: "a", text: "Negoziazione e mediazione per entrambe le parti", weights: { repubblica: 4, separatisti: 0 } },
      { id: "b", text: "Cercare un compromesso a mio favore", weights: { repubblica: 3, separatisti: 1 } },
      { id: "c", text: "Stabilisco le mie regole", weights: { repubblica: 1, separatisti: 3 } },
      { id: "d", text: "Attacco diretto", weights: { repubblica: 0, separatisti: 4 } },
    ],
  },
  {
    id: "q04",
    text: "A chi devi la tua lealtà?",
    choices: [
      { id: "a", text: "Alla comunità interplanetaria", weights: { repubblica: 4, separatisti: 0 } },
      { id: "b", text: "Al mio sistema", weights: { repubblica: 3, separatisti: 1 } },
      { id: "c", text: "Al mio pianeta", weights: { repubblica: 1, separatisti: 3 } },
      { id: "d", text: "Alla mia gente", weights: { repubblica: 0, separatisti: 4 } },
    ],
  },
  {
    id: "q05",
    text: "Cosa conta di più per l'identità di un popolo?",
    choices: [
      { id: "a", text: "Far parte di una grande comunità", weights: { repubblica: 4, separatisti: 0 } },
      { id: "b", text: "Appartenenza a un sistema", weights: { repubblica: 3, separatisti: 1 } },
      { id: "c", text: "La propria cultura e tradizione", weights: { repubblica: 1, separatisti: 3 } },
      { id: "d", text: "Indipendenza assoluta", weights: { repubblica: 0, separatisti: 4 } },
    ],
  },
  {
    id: "q06",
    text: "In battaglia, la tua priorità è:",
    choices: [
      { id: "a", text: "Proteggere i civili anche a costo della sconfitta", weights: { repubblica: 4, separatisti: 0 } },
      { id: "b", text: "Mantenere la formazione e le linee di rifornimento", weights: { repubblica: 3, separatisti: 1 } },
      { id: "c", text: "Schiacciare il nemico in fretta", weights: { repubblica: 1, separatisti: 3 } },
      { id: "d", text: "Concentrare tutto il fuoco possibile fin da subito", weights: { repubblica: 0, separatisti: 4 } },
    ],
  },
  {
    id: "q07",
    text: "Cos'è la libertà per te?",
    choices: [
      { id: "a", text: "Leggi comuni che proteggono tutti", weights: { repubblica: 4, separatisti: 0 } },
      { id: "b", text: "Scelte personali che seguono regole prestabilite", weights: { repubblica: 3, separatisti: 1 } },
      { id: "c", text: "Poter decidere autonomamente", weights: { repubblica: 1, separatisti: 3 } },
      { id: "d", text: "Un governo che concede tutto", weights: { repubblica: 0, separatisti: 4 } },
    ],
  },
  {
    id: "q08",
    text: "Al termine di una guerra, costruiresti per prima:",
    choices: [
      { id: "a", text: "Un Senato più forte e unito", weights: { repubblica: 4, separatisti: 0 } },
      { id: "b", text: "Una rete di sistemi", weights: { repubblica: 3, separatisti: 1 } },
      { id: "c", text: "Accademie e flotte militari", weights: { repubblica: 0, separatisti: 4 } },
      { id: "d", text: "Fabbriche", weights: { repubblica: 1, separatisti: 3 } },
    ],
  },
];

const questionById = new Map(QUESTIONS.map((q?) => [q.id, q]));

function getPublicQuestions() {
  return QUESTIONS.map((q?) => ({
    id: q.id,
    text: q.text,
    choices: q.choices.map((c?) => ({ id: c.id, text: c.text })),
  }));
}

function normalizeAnswers(raw?) {
  if (!Array.isArray(raw)) return null;
  const out = [];
  const seen = new Set();
  for (const row of raw) {
    if (!row || typeof row !== "object") continue;
    const qid = String(row.questionId || row.id || "").trim();
    const cid = String(row.choiceId || row.choice || "").trim();
    if (!qid || !cid || seen.has(qid)) continue;
    const q = questionById.get(qid);
    if (!q) continue;
    if (!q.choices.some((c?) => c.id === cid)) continue;
    seen.add(qid);
    out.push({ questionId: qid, choiceId: cid });
  }
  return out.length ? out : null;
}

function computeFactionFromAnswers(answerRows?) {
  const scores = { repubblica: 0, separatisti: 0 };
  const seen = new Set();
  for (const row of answerRows || []) {
    const q = questionById.get(row.questionId);
    if (!q || seen.has(q.id)) continue;
    const choice = q.choices.find((c?) => c.id === row.choiceId);
    if (!choice) continue;
    seen.add(q.id);
    for (const f of FACTIONS) scores[f] += Number(choice.weights?.[f] || 0);
  }
  if (seen.size !== QUESTIONS.length) {
    return { ok: false, error: "incomplete_answers", expected: QUESTIONS.length, got: seen.size };
  }
  let best = FACTIONS[0];
  let bestScore = -1;
  for (const f of FACTIONS) {
    if (scores[f] > bestScore) {
      bestScore = scores[f];
      best = f;
    }
  }
  /* Pareggio: lieve bias Repubblica (ordine / stabilità). */
  if (scores.repubblica === scores.separatisti) best = "repubblica";
  return { ok: true, factionId: best, scores };
}

function getFactionMeta(id?) {
  return FACTION_META[String(id || "").trim()] || null;
}

export = {
  FACTIONS,
  FACTION_META,
  QUESTIONS,
  getPublicQuestions,
  normalizeAnswers,
  computeFactionFromAnswers,
  getFactionMeta,
};
