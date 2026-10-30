const FORBIDDEN_SPELL_LIST_PAIRS = Object.freeze([
  {
    titleA: "Lista I — Incantesimi oscuri",
    titleB: "Lista II — Magia proibita",
    spellsA: ["Sectumsempra", "Imperio", "Cruciatus", "Fiendfyre", "Morsmordre"],
    spellsB: ["Avada Kedavra", "Legilimens", "Oppugno", "Confringo", "Reducto"],
  },
  {
    titleA: "Lista I — Tomo della Sezione Proibita",
    titleB: "Lista II — Pergamena nera",
    spellsA: ["Morgifolium", "Flagello di Fuoco", "Lacrimosa", "Antonius", "Dimenticante"],
    spellsB: ["Pietrificus Totalus", "Expulso", "Bombarda", "Diffindo", "Serpensortia"],
  },
  {
    titleA: "Lista I — Formula vietata",
    titleB: "Lista II — Scriptum arcane",
    spellsA: ["Locomotor Mortis", "Everte Statum", "Langlock", "Levicorpus", "Tarantallegra"],
    spellsB: ["Fulgur", "Incendio", "Aguamenti", "Ventus", "Glacius"],
  },
  {
    titleA: "Lista I — Rotolo sigillato",
    titleB: "Lista II — Cartiglio proibito",
    spellsA: ["Protego Diabolica", "Fianto Doloris", "Crepitus", "Flagello", "Obscuro"],
    spellsB: ["Reparo", "Accio", "Lumos", "Nox", "Alohomora"],
  },
  {
    titleA: "Lista I — Manoscritto maledetto",
    titleB: "Lista II — Indice proibito",
    spellsA: ["Ascendio", "Deprimo", "Engorgio", "Reducio", "Rictusempra"],
    spellsB: ["Confundo", "Impedimenta", "Silencio", "Ventus Duo", "Waddiwasi"],
  },
  {
    titleA: "Lista I — Tomo VII ristretto",
    titleB: "Lista II — Tomo IX ristretto",
    spellsA: ["Expelliarmus", "Stupefy", "Petrificus Totalus", "Riddikulus", "Expecto Patronum"],
    spellsB: ["Lumos Maxima", "Protego", "Revelio", "Specialis Revelio", "Homenum Revelio"],
  },
  {
    titleA: "Lista I — Pagine bruciate",
    titleB: "Lista II — Pagine strappate",
    spellsA: ["Fiendfyre", "Sectumsempra", "Morsmordre", "Imperio", "Cruciatus"],
    spellsB: ["Avada Kedavra", "Legilimens", "Oppugno", "Confringo", "Morgifolium"],
  },
  {
    titleA: "Lista I — Catalogo nero",
    titleB: "Lista II — Repertorio proibito",
    spellsA: ["Bombarda Maxima", "Confringo", "Reducto", "Diffindo", "Depulso"],
    spellsB: ["Accio", "Wingardium Leviosa", "Alohomora", "Reparo", "Aguamenti"],
  },
]);

function pickSpellListPair(index?) {
  const list = FORBIDDEN_SPELL_LIST_PAIRS;
  if (!list.length) return null;
  const i = Math.abs(Math.floor(Number(index) || 0)) % list.length;
  return list[i];
}

function formatSpellListBody(spells?) {
  const rows = (Array.isArray(spells) ? spells : [])
    .map((name?) => String(name || "").trim())
    .filter(Boolean)
    .map((name?) => `• **${name}**`);
  return rows.length ? rows.join("\n") : "—";
}

export = { FORBIDDEN_SPELL_LIST_PAIRS, pickSpellListPair, formatSpellListBody };