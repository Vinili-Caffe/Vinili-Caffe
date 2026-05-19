const HOUSES = Object.freeze(["gryffindor", "ravenclaw", "hufflepuff", "slytherin"]);
const HOUSE_META = Object.freeze({
  gryffindor: {
    id: "gryffindor",
    label: "Grifondoro",
    motto: "Coraggio, audacia e cuore.",
    primary: "#740001",
    accent: "#D3A625",
    crestFile: "gryffindor.png",
  },
  ravenclaw: {
    id: "ravenclaw",
    label: "Corvonero",
    motto: "Saggezza, creatività e mente lucida.",
    primary: "#0E1A40",
    accent: "#946B2D",
    crestFile: "ravenclaw.png",
  },
  hufflepuff: {
    id: "hufflepuff",
    label: "Tassorosso",
    motto: "Lealtà, pazienza e fatica onesta.",
    primary: "#ECB939",
    accent: "#372E29",
    crestFile: "hufflepuff.png",
  },
  slytherin: {
    id: "slytherin",
    label: "Serpeverde",
    motto: "Ambizione, astuzia e determinazione.",
    primary: "#1A472A",
    accent: "#AAAAAA",
    crestFile: "slytherin.png",
  },
});

/** @type {{ id: string, text: string, choices: { id: string, text: string, weights: Record<string, number> }[] }[]} */
const QUESTIONS = [
  {
    id: "q01",
    text: "Un oggetto magico ti offre un solo potere. Quale scegli?",
    choices: [
      { id: "a", text: "Il coraggio di affrontare ciò che tutti evitano", weights: { gryffindor: 4, ravenclaw: 0, hufflepuff: 1, slytherin: 1 } },
      { id: "b", text: "La conoscenza di un segreto di cui nessuno è al corrente", weights: { gryffindor: 0, ravenclaw: 4, hufflepuff: 1, slytherin: 2 } },
      { id: "c", text: "Un legame che non si spezza mai", weights: { gryffindor: 1, ravenclaw: 0, hufflepuff: 4, slytherin: 0 } },
      { id: "d", text: "Il potere di cambiare le regole a tuo favore", weights: { gryffindor: 1, ravenclaw: 1, hufflepuff: 0, slytherin: 4 } },
    ],
  },
  {
    id: "q02",
    text: "È notte e senti un rumore nei corridoi proibiti del castello.",
    choices: [
      { id: "a", text: "Vai subito a controllare perché qualcuno potrebbe aver bisogno di aiuto", weights: { gryffindor: 4, ravenclaw: 0, hufflepuff: 2, slytherin: 0 } },
      { id: "b", text: "Osservi da lontano e cerchi di capire la situazione", weights: { gryffindor: 0, ravenclaw: 4, hufflepuff: 1, slytherin: 2 } },
      { id: "c", text: "Avvisi un altro compagno e resti con lui per non lasciarlo solo", weights: { gryffindor: 1, ravenclaw: 0, hufflepuff: 4, slytherin: 0 } },
      { id: "d", text: "Approfitti del momento per ottenere qualcosa in cambio", weights: { gryffindor: 0, ravenclaw: 1, hufflepuff: 0, slytherin: 4 } },
    ],
  },
  {
    id: "q03",
    text: "Quale materia ti entusiasma di più?",
    choices: [
      { id: "a", text: "Difesa contro le Arti Oscure", weights: { gryffindor: 4, ravenclaw: 1, hufflepuff: 1, slytherin: 2 } },
      { id: "b", text: "Incantesimi e teoria avanzata", weights: { gryffindor: 0, ravenclaw: 4, hufflepuff: 1, slytherin: 1 } },
      { id: "c", text: "Erbologia e cura delle creature", weights: { gryffindor: 1, ravenclaw: 1, hufflepuff: 4, slytherin: 0 } },
      { id: "d", text: "Pozioni: precisione, effetto, controllo", weights: { gryffindor: 0, ravenclaw: 2, hufflepuff: 1, slytherin: 4 } },
    ],
  },
  {
    id: "q04",
    text: "Un amico è in difficoltà prima di un esame importante.",
    choices: [
      { id: "a", text: "Lo sproni a credere in sé stesso e lo accompagni", weights: { gryffindor: 4, ravenclaw: 0, hufflepuff: 2, slytherin: 0 } },
      { id: "b", text: "Gli prepari un piano di studio su misura per aiutarlo", weights: { gryffindor: 0, ravenclaw: 4, hufflepuff: 2, slytherin: 1 } },
      { id: "c", text: "Resti con lui finché non si sente pronto ad affrontarlo", weights: { gryffindor: 1, ravenclaw: 0, hufflepuff: 4, slytherin: 0 } },
      { id: "d", text: "Gli passi le domande che fa il professore per studiare solo l'essenziale", weights: { gryffindor: 1, ravenclaw: 1, hufflepuff: 0, slytherin: 4 } },
    ],
  },
  {
    id: "q05",
    text: "Come affronteresti il tuo primo lavoro?",
    choices: [
      { id: "a", text: "In prima fila anche se rischi di sbagliare", weights: { gryffindor: 4, ravenclaw: 1, hufflepuff: 1, slytherin: 1 } },
      { id: "b", text: "Da solo finché non hai capito ogni dettaglio", weights: { gryffindor: 0, ravenclaw: 4, hufflepuff: 1, slytherin: 2 } },
      { id: "c", text: "In squadra per dividere compiti e responsabilità", weights: { gryffindor: 1, ravenclaw: 1, hufflepuff: 4, slytherin: 0 } },
      { id: "d", text: "Solo se sai che il risultato ti porterà un vantaggio futuro", weights: { gryffindor: 1, ravenclaw: 0, hufflepuff: 0, slytherin: 4 } },
    ],
  },
  {
    id: "q06",
    text: "Cosa ti spaventa di più?",
    choices: [
      { id: "a", text: "Non essere coraggioso", weights: { gryffindor: 4, ravenclaw: 1, hufflepuff: 2, slytherin: 0 } },
      { id: "b", text: "Rimanere ignorante", weights: { gryffindor: 0, ravenclaw: 4, hufflepuff: 1, slytherin: 1 } },
      { id: "c", text: "Deludere le persone", weights: { gryffindor: 1, ravenclaw: 0, hufflepuff: 4, slytherin: 0 } },
      { id: "d", text: "Non controllare quello che voglio", weights: { gryffindor: 0, ravenclaw: 1, hufflepuff: 0, slytherin: 4 } },
    ],
  },
  {
    id: "q07",
    text: "Al Quidditch, il ruolo che ti rappresenta di più qual è?",
    choices: [
      { id: "a", text: "Cercatore", weights: { gryffindor: 4, ravenclaw: 1, hufflepuff: 1, slytherin: 2 } },
      { id: "b", text: "Battitore", weights: { gryffindor: 2, ravenclaw: 3, hufflepuff: 2, slytherin: 1 } },
      { id: "c", text: "Tifoso", weights: { gryffindor: 1, ravenclaw: 0, hufflepuff: 4, slytherin: 0 } },
      { id: "d", text: "Capitano", weights: { gryffindor: 2, ravenclaw: 0, hufflepuff: 0, slytherin: 4 } },
    ],
  },
  {
    id: "q08",
    text: "Cosa ammiri di più in una persona?",
    choices: [
      { id: "a", text: "Onestà e lealtà", weights: { gryffindor: 4, ravenclaw: 0, hufflepuff: 2, slytherin: 0 } },
      { id: "b", text: "Curiosità e capacità di risolvere problemi", weights: { gryffindor: 0, ravenclaw: 4, hufflepuff: 1, slytherin: 1 } },
      { id: "c", text: "Gentilezza e costanza", weights: { gryffindor: 1, ravenclaw: 0, hufflepuff: 4, slytherin: 0 } },
      { id: "d", text: "Determinazione", weights: { gryffindor: 0, ravenclaw: 1, hufflepuff: 0, slytherin: 4 } },
    ],
  },
  {
    id: "q09",
    text: "Trovi una bacchetta spezzata nel bosco proibito, cosa fai?",
    choices: [
      { id: "a", text: "La porti a un professore perché potrebbe essere pericolosa", weights: { gryffindor: 3, ravenclaw: 1, hufflepuff: 3, slytherin: 0 } },
      { id: "b", text: "La analizzi per capire chi l'ha usata e in quale maniera", weights: { gryffindor: 0, ravenclaw: 4, hufflepuff: 1, slytherin: 2 } },
      { id: "c", text: "La lasci dove sta dato che non è affare tuo", weights: { gryffindor: 0, ravenclaw: 2, hufflepuff: 3, slytherin: 2 } },
      { id: "d", text: "La tieni perché potrebbe servirti", weights: { gryffindor: 1, ravenclaw: 0, hufflepuff: 0, slytherin: 4 } },
    ],
  },
  {
    id: "q10",
    text: "Un'ampolla cade a terra e l'effetto della pozione ha un effetto imprevisto su tutta la classe.",
    choices: [
      { id: "a", text: "Prendi la bacchetta e fai un incantesimo per proteggere i compagni", weights: { gryffindor: 4, ravenclaw: 0, hufflepuff: 3, slytherin: 0 } },
      { id: "b", text: "Annoti ogni sintomo per trovare l'antidoto con un'altra pozione", weights: { gryffindor: 0, ravenclaw: 4, hufflepuff: 2, slytherin: 1 } },
      { id: "c", text: "Aiuti un compagno alla volta e chi è più fragile", weights: { gryffindor: 1, ravenclaw: 0, hufflepuff: 4, slytherin: 0 } },
      { id: "d", text: "Usi il caos per rubare il libro dell'insegnante", weights: { gryffindor: 0, ravenclaw: 1, hufflepuff: 0, slytherin: 4 } },
    ],
  },
  {
    id: "q11",
    text: "In una competizione tra case, la tua priorità qual è?",
    choices: [
      { id: "a", text: "Vincere onestamente, anche a costo di faticare", weights: { gryffindor: 4, ravenclaw: 1, hufflepuff: 2, slytherin: 1 } },
      { id: "b", text: "Battere gli altri con astuzia", weights: { gryffindor: 1, ravenclaw: 4, hufflepuff: 1, slytherin: 2 } },
      { id: "c", text: "Che tutti si sentano parte della gara", weights: { gryffindor: 1, ravenclaw: 0, hufflepuff: 4, slytherin: 0 } },
      { id: "d", text: "Fare un punteggio alto a qualsiasi prezzo", weights: { gryffindor: 0, ravenclaw: 0, hufflepuff: 0, slytherin: 4 } },
    ],
  },
  {
    id: "q12",
    text: "Il Cappello Parlante ti chiede: «Cosa desideri davvero?». Cosa rispondi?",
    choices: [
      { id: "a", text: "Essere ricordato per aver fatto la cosa giusta", weights: { gryffindor: 4, ravenclaw: 1, hufflepuff: 2, slytherin: 0 } },
      { id: "b", text: "Capire il mondo meglio di chiunque altro", weights: { gryffindor: 0, ravenclaw: 4, hufflepuff: 1, slytherin: 1 } },
      { id: "c", text: "Avere persone fidate accanto per tutta la vita", weights: { gryffindor: 1, ravenclaw: 0, hufflepuff: 4, slytherin: 0 } },
      { id: "d", text: "Lasciare un segno che nessuno dimenticherà", weights: { gryffindor: 1, ravenclaw: 1, hufflepuff: 0, slytherin: 4 } },
    ],
  },
];

const questionById = new Map(QUESTIONS.map((q) => [q.id, q]));

function getPublicQuestions() {
  return QUESTIONS.map((q) => ({
    id: q.id,
    text: q.text,
    choices: q.choices.map((c) => ({ id: c.id, text: c.text })),
  }));
}

function normalizeAnswers(raw) {
  if (!Array.isArray(raw)) return null;
  const out = [];
  for (const row of raw) {
    if (!row || typeof row !== "object") return null;
    const questionId = String(row.questionId || row.q || "").trim();
    const choiceId = String(row.choiceId || row.c || "").trim();
    if (!questionId || !choiceId) return null;
    out.push({ questionId, choiceId });
  }
  return out;
}

function computeHouseFromAnswers(answerRows) {
  const totals = { gryffindor: 0, ravenclaw: 0, hufflepuff: 0, slytherin: 0 };
  const decisive = { gryffindor: 0, ravenclaw: 0, hufflepuff: 0, slytherin: 0 };
  const seen = new Set();

  for (const row of answerRows) {
    const q = questionById.get(row.questionId);
    if (!q) return { ok: false, error: "invalid_question", questionId: row.questionId };
    if (seen.has(row.questionId)) return { ok: false, error: "duplicate_question", questionId: row.questionId };
    seen.add(row.questionId);
    const choice = q.choices.find((c) => c.id === row.choiceId);
    if (!choice) return { ok: false, error: "invalid_choice", questionId: row.questionId, choiceId: row.choiceId };
    let maxW = -1;
    for (const h of HOUSES) {
      const w = Number(choice.weights[h] || 0);
      if (w > maxW) maxW = w;
    }
    for (const h of HOUSES) {
      const w = Number(choice.weights[h] || 0);
      totals[h] += w;
      if (w === maxW && maxW > 0) decisive[h] += 1;
    }
  }

  if (seen.size !== QUESTIONS.length) {
    return { ok: false, error: "incomplete_answers", expected: QUESTIONS.length, got: seen.size };
  }

  let bestScore = -1;
  let winners = [];
  for (const h of HOUSES) {
    if (totals[h] > bestScore) {
      bestScore = totals[h];
      winners = [h];
    } else if (totals[h] === bestScore) {
      winners.push(h);
    }
  }

  let house = winners[0];
  if (winners.length > 1) {
    let bestDec = -1;
    let decWinners = [];
    for (const h of winners) {
      if (decisive[h] > bestDec) {
        bestDec = decisive[h];
        decWinners = [h];
      } else if (decisive[h] === bestDec) {
        decWinners.push(h);
      }
    }
    if (decWinners.length === 1) house = decWinners[0];
    else house = decWinners[Math.floor(Math.random() * decWinners.length)];
  }

  return { ok: true, house, totals, decisive };
}

function getHouseMeta(houseId, crestUrlOverride) {
  const base = HOUSE_META[String(houseId || "").trim()];
  if (!base) return null;
  const crestUrl = String(crestUrlOverride || "").trim();
  return crestUrl ? { ...base, crestUrl } : { ...base };
}

module.exports = { HOUSES, HOUSE_META, QUESTIONS, getPublicQuestions, normalizeAnswers, computeHouseFromAnswers, getHouseMeta };