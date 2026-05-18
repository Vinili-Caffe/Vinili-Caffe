const HOGWARTS_POTIONS_CATALOG = Object.freeze([
  { id: "amortentia", name: "Amortentia", effect: "Filtro d'amore potentissimo, riconoscibile dal profumo diverso per ogni persona.", difficulty: 1, flavor: "Profuma di cio che desideri di piu." },
  { id: "felix-felicis", name: "Felix Felicis", effect: "Dona fortuna temporanea a chi la beve, se preparata alla perfezione.", difficulty: 2, flavor: "Oro liquido, rarissimo e capriccioso." },
  { id: "ossofast", name: "Ossofast", effect: "Fa ricrescere le ossa mancanti, con un dolore memorabile.", difficulty: 1, flavor: "Sapore pessimo, risultato utile." },
  { id: "erbicida", name: "Erbicida", effect: "Elimina piante infestanti e vegetazione magica indesiderata.", difficulty: 1, flavor: "Da maneggiare lontano dalle serre migliori." },
  { id: "polisucco", name: "Pozione Polisucco", effect: "Permette di assumere temporaneamente l'aspetto di un'altra persona.", difficulty: 3, flavor: "Richiede un ingrediente personale e molta pazienza." },
  { id: "distillato-morte-vivente", name: "Distillato della Morte Vivente", effect: "Induce un sonno profondissimo, quasi indistinguibile dalla morte.", difficulty: 3, flavor: "Una goccia di troppo e il dormitorio aspetta." },
  { id: "veritaserum", name: "Veritaserum", effect: "Costringe chi la beve a dire la verita.", difficulty: 3, flavor: "Tre gocce possono bastare." },
  { id: "pozione-peperina", name: "Pozione Peperina", effect: "Cura raffreddore e influenza, causando fumo dalle orecchie.", difficulty: 1, flavor: "Scalda piu di una coperta invernale." },
  { id: "pozione-rigenerante", name: "Pozione Rigenerante", effect: "Aiuta a recuperare energie dopo fatica, incantesimi o piccoli incidenti.", difficulty: 2, flavor: "Molto richiesta dopo allenamenti di Quidditch." },
  { id: "pozione-oblio", name: "Pozione dell'Oblio", effect: "Indebolisce o confonde temporaneamente i ricordi.", difficulty: 2, flavor: "Meglio etichettarla bene." },
  { id: "elisir-euforia", name: "Elisir per Indurre Euforia", effect: "Genera buonumore intenso e risate difficili da trattenere.", difficulty: 2, flavor: "Un pizzico di menta evita effetti imbarazzanti." },
  { id: "antidoto-veleni-comuni", name: "Antidoto ai Veleni Comuni", effect: "Contrasta gli effetti dei veleni non magici o poco complessi.", difficulty: 1, flavor: "Da tenere sempre in infermeria." },
  { id: "pozione-invisibilita", name: "Pozione dell'Invisibilita", effect: "Rende il bevitore difficilmente visibile per un breve periodo.", difficulty: 3, flavor: "Non silenzia i passi." },
  { id: "distillato-confusione", name: "Distillato della Confusione", effect: "Crea disorientamento e indecisione in chi lo assume.", difficulty: 2, flavor: "Sconsigliata prima degli esami." },
  { id: "pozione-aguzza-ingegno", name: "Pozione Aguzza-Ingegno", effect: "Rende la mente piu pronta e aiuta a risolvere enigmi complessi.", difficulty: 2, flavor: "Amata dai Corvonero sotto pressione." },
  { id: "pozione-sbadiglio", name: "Pozione Sbadigliante", effect: "Provoca sonnolenza e sbadigli incontrollabili.", difficulty: 1, flavor: "Perfetta per saltare una lezione noiosa, ma non dirlo a nessuno." },
  { id: "pozione-calmante", name: "Pozione Calmante", effect: "Riduce agitazione, panico e nervosismo per poco tempo.", difficulty: 1, flavor: "Odora di lavanda e biblioteca." },
  { id: "pozione-forza", name: "Pozione della Forza", effect: "Aumenta temporaneamente la forza fisica del bevitore.", difficulty: 2, flavor: "Non sostituisce l'allenamento." },
  { id: "filtro-pace", name: "Filtro della Pace", effect: "Calma ansia e agitazione, ma un dosaggio errato causa sonno profondo.", difficulty: 3, flavor: "Serenita in bottiglia, se dosata bene." },
  { id: "pozione-sgonfiante", name: "Pozione Sgonfiante", effect: "Riduce gonfiori causati da incantesimi o pozioni mal riuscite.", difficulty: 1, flavor: "Indispensabile dopo certi scherzi." },
]);

function normalizePotionId(value) {
  return String(value || "").trim().toLowerCase();
}

function listPotionsCatalog() {
  return HOGWARTS_POTIONS_CATALOG.map((item) => ({ ...item }));
}

function getPotionById(id) {
  const key = normalizePotionId(id);
  return HOGWARTS_POTIONS_CATALOG.find((item) => item.id === key) || null;
}

function hashSeed(value) {
  const input = String(value || "");
  let hash = 2166136261;
  for (let i = 0; i < input.length; i += 1) {
    hash ^= input.charCodeAt(i);
    hash = Math.imul(hash, 16777619);
  }
  return hash >>> 0;
}

function seededRandom(seed) {
  let t = Number(seed) >>> 0;
  return function next() {
    t += 0x6D2B79F5;
    let r = Math.imul(t ^ (t >>> 15), 1 | t);
    r ^= r + Math.imul(r ^ (r >>> 7), 61 | r);
    return ((r ^ (r >>> 14)) >>> 0) / 4294967296;
  };
}

function shuffleWithSeed(items, seed) {
  const out = Array.isArray(items) ? items.slice() : [];
  const rnd = seededRandom(hashSeed(seed));
  for (let i = out.length - 1; i > 0; i -= 1) {
    const j = Math.floor(rnd() * (i + 1));
    [out[i], out[j]] = [out[j], out[i]];
  }
  return out;
}

function buildPotionsRound(seed, roundSize = 4) {
  const size = Math.max(2, Math.min(8, Math.floor(Number(roundSize) || 4)));
  const picked = shuffleWithSeed(HOGWARTS_POTIONS_CATALOG, `${seed}:pick`).slice(0, size);
  const effects = shuffleWithSeed(picked, `${seed}:effects`).map((item) => ({
    potionId: item.id,
    effect: item.effect,
  }));
  return {
    seed: String(seed || ""),
    potions: picked.map((item) => ({
      id: item.id,
      name: item.name,
      difficulty: item.difficulty,
      flavor: item.flavor,
    })),
    effects,
  };
}

module.exports = {
  HOGWARTS_POTIONS_CATALOG,
  buildPotionsRound,
  getPotionById,
  listPotionsCatalog,
  normalizePotionId,
};