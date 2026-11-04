/**
 * Trasformazioni testo per malus quiz SW (solo display; le risposte accettate restano normali).
 */
"use strict";

function shuffleInPlace(arr?) {
  const a = Array.isArray(arr) ? arr : [];
  for (let i = a.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    const tmp = a[i];
    a[i] = a[j];
    a[j] = tmp;
  }
  return a;
}

function shuffleWords(text?) {
  const parts = String(text || "").trim().split(/\s+/).filter(Boolean);
  if (parts.length < 2) return String(text || "");
  return shuffleInPlace(parts.slice()).join(" ");
}

/**
 * Spotchka: mescola FORTE lettere+spazi di tutta la frase.
 * La punteggiatura resta fissa; lettere e spazi saltano ovunque (confini parola spezzati).
 */
function scrambleLettersKeepingWords(text?) {
  const movable = [];
  const slots = [];
  for (const ch of String(text || "")) {
    if (/\p{L}|\p{N}/u.test(ch) || ch === " " || ch === "\t") {
      movable.push(ch === "\t" ? " " : ch);
      slots.push(null);
    } else {
      slots.push(ch);
    }
  }
  if (movable.length < 2) return String(text || "");
  const original = movable.join("");
  for (let attempt = 0; attempt < 16; attempt += 1) {
    shuffleInPlace(movable);
    if (movable.join("") !== original) break;
  }
  let mi = 0;
  return slots.map((s) => (s === null ? movable[mi++] : s)).join("");
}

/** Intera frase a specchio (caratteri da destra a sinistra, spazi inclusi). */
function reverseFullPhrase(text?) {
  return [...String(text || "")].reverse().join("");
}

/** Lessico IT → traduzioni (en / es / pt / la). */
const JARJAR_LEXICON: Record<string, string[]> = {
  quale: ["which", "cuál", "quem", "quis"],
  qual: ["which", "cuál", "quem", "quis"],
  chi: ["who", "quién", "quem", "quis"],
  che: ["that", "que", "quê", "quod"],
  cosa: ["thing", "cosa", "coisa", "res"],
  come: ["how", "cómo", "como", "quomodo"],
  dove: ["where", "dónde", "onde", "ubi"],
  quando: ["when", "cuándo", "quando", "quando"],
  perché: ["why", "porqué", "porque", "cur"],
  perche: ["why", "porqué", "porque", "cur"],
  arma: ["weapon", "arma", "arma", "telum"],
  spada: ["sword", "espada", "espada", "gladius"],
  laser: ["laser", "láser", "laser", "radius"],
  pianeta: ["planet", "planeta", "planeta", "planeta"],
  nero: ["black", "negro", "preto", "niger"],
  nera: ["black", "negra", "preta", "nigra"],
  verde: ["green", "verde", "verde", "viridis"],
  rosso: ["red", "rojo", "vermelho", "ruber"],
  rossa: ["red", "roja", "vermelha", "rubra"],
  blu: ["blue", "azul", "azul", "caeruleus"],
  giallo: ["yellow", "amarillo", "amarelo", "flavus"],
  gialla: ["yellow", "amarilla", "amarela", "flava"],
  viola: ["purple", "morado", "roxo", "purpureus"],
  famosa: ["famous", "famosa", "famosa", "clara"],
  famoso: ["famous", "famoso", "famoso", "clarus"],
  personaggio: ["character", "personaje", "personagem", "persona"],
  soldati: ["soldiers", "soldados", "soldados", "milites"],
  soldato: ["soldier", "soldado", "soldado", "miles"],
  ordine: ["order", "orden", "ordem", "ordo"],
  forza: ["force", "fuerza", "força", "vis"],
  maestro: ["master", "maestro", "mestre", "magister"],
  maestra: ["master", "maestra", "mestra", "magistra"],
  film: ["movie", "película", "filme", "pellicula"],
  anno: ["year", "año", "ano", "annus"],
  anni: ["years", "años", "anos", "anni"],
  uscita: ["release", "estreno", "lançamento", "exitus"],
  uscito: ["released", "estrenado", "lançado", "editus"],
  vero: ["true", "verdadero", "verdadeiro", "verum"],
  falso: ["false", "falso", "falso", "falsum"],
  è: ["is", "es", "é", "est"],
  e: ["and", "y", "e", "et"],
  o: ["or", "o", "ou", "aut"],
  di: ["of", "de", "de", "de"],
  del: ["of the", "del", "do", "de"],
  della: ["of the", "de la", "da", "de"],
  dello: ["of the", "del", "do", "de"],
  dei: ["of the", "de los", "dos", "de"],
  delle: ["of the", "de las", "das", "de"],
  un: ["a", "un", "um", "unus"],
  una: ["a", "una", "uma", "una"],
  uno: ["a", "uno", "um", "unus"],
  il: ["the", "el", "o", "ille"],
  lo: ["the", "el", "o", "ille"],
  la: ["the", "la", "a", "illa"],
  i: ["the", "los", "os", "ii"],
  gli: ["the", "los", "os", "illi"],
  le: ["the", "las", "as", "illae"],
  più: ["more", "más", "mais", "magis"],
  piu: ["more", "más", "mais", "magis"],
  meno: ["less", "menos", "menos", "minus"],
  ha: ["has", "tiene", "tem", "habet"],
  hanno: ["have", "tienen", "têm", "habent"],
  chiamato: ["called", "llamado", "chamado", "vocatus"],
  chiamata: ["called", "llamada", "chamada", "vocata"],
  chiamano: ["call", "llaman", "chamam", "vocant"],
  distrutta: ["destroyed", "destruida", "destruída", "deleta"],
  distrutto: ["destroyed", "destruido", "destruído", "deletus"],
  costruita: ["built", "construida", "construída", "aedificata"],
  costruito: ["built", "construido", "construído", "aedificatus"],
  colore: ["color", "color", "cor", "color"],
  colori: ["colors", "colores", "cores", "colores"],
  protagonista: ["protagonist", "protagonista", "protagonista", "heros"],
  cattivo: ["villain", "villano", "vilão", "malus"],
  cattiva: ["villain", "villana", "vilã", "mala"],
  maschera: ["mask", "máscara", "máscara", "persona"],
  nave: ["ship", "nave", "nave", "navis"],
  navicella: ["starship", "nave", "nave", "navis"],
  guerra: ["war", "guerra", "guerra", "bellum"],
  battaglia: ["battle", "batalla", "batalha", "pugna"],
  primo: ["first", "primero", "primeiro", "primus"],
  seconda: ["second", "segunda", "segunda", "secunda"],
  secondo: ["second", "segundo", "segundo", "secundus"],
  stagione: ["season", "temporada", "temporada", "tempestas"],
  serie: ["series", "serie", "série", "series"],
  creato: ["created", "creado", "criado", "creatus"],
  creatore: ["creator", "creador", "criador", "creator"],
  scritto: ["written", "escrito", "escrito", "scriptus"],
  scritta: ["written", "escrita", "escrita", "scripta"],
  indossa: ["wears", "lleva", "usa", "gerit"],
  usa: ["uses", "usa", "usa", "utitur"],
  particolare: ["particular", "particular", "particular", "peculiaris"],
  modo: ["way", "modo", "modo", "modus"],
  parlare: ["speak", "hablar", "falar", "loqui"],
  parla: ["speaks", "habla", "fala", "loquitur"],
  orecchie: ["ears", "orejas", "orelhas", "aures"],
  lunghe: ["long", "largas", "longas", "longae"],
  verdi: ["green", "verdes", "verdes", "virides"],
  bianchi: ["white", "blancos", "brancos", "albi"],
  impero: ["empire", "imperio", "império", "imperium"],
  repubblica: ["republic", "república", "república", "respublica"],
  jedi: ["Jedi", "Jedi", "Jedi", "Jedi"],
  sith: ["Sith", "Sith", "Sith", "Sith"],
  cloni: ["clones", "clones", "clones", "simiacra"],
  clone: ["clone", "clon", "clone", "simiacrum"],
  droide: ["droid", "androide", "androide", "automaton"],
  droidi: ["droids", "androides", "androides", "automata"],
  morte: ["death", "muerte", "morte", "mors"],
  stella: ["star", "estrella", "estrela", "stella"],
  stelle: ["stars", "estrellas", "estrelas", "stellae"],
  sole: ["sun", "sol", "sol", "sol"],
  soli: ["suns", "soles", "sóis", "soles"],
  luna: ["moon", "luna", "lua", "luna"],
  padre: ["father", "padre", "pai", "pater"],
  madre: ["mother", "madre", "mãe", "mater"],
  figlio: ["son", "hijo", "filho", "filius"],
  figlia: ["daughter", "hija", "filha", "filia"],
  amico: ["friend", "amigo", "amigo", "amicus"],
  nemico: ["enemy", "enemigo", "inimigo", "hostis"],
  vittoria: ["victory", "victoria", "vitória", "victoria"],
  sconfitta: ["defeat", "derrota", "derrota", "clades"],
  domanda: ["question", "pregunta", "pergunta", "quaestio"],
  risposta: ["answer", "respuesta", "resposta", "responsum"],
  corretto: ["correct", "correcto", "correto", "rectus"],
  corretta: ["correct", "correcta", "correta", "recta"],
  sbagliato: ["wrong", "equivocado", "errado", "erroneus"],
  sbagliata: ["wrong", "equivocada", "errada", "erronea"],
  dopo: ["after", "después", "depois", "post"],
  prima: ["before", "antes", "antes", "ante"],
  durante: ["during", "durante", "durante", "durante"],
  tra: ["between", "entre", "entre", "inter"],
  senza: ["without", "sin", "sem", "sine"],
  con: ["with", "con", "com", "cum"],
  per: ["for", "para", "para", "pro"],
  dalla: ["from the", "de la", "da", "ab"],
  dal: ["from the", "del", "do", "a"],
  nel: ["in the", "en el", "no", "in"],
  nella: ["in the", "en la", "na", "in"],
  sul: ["on the", "sobre el", "sobre o", "super"],
  sulla: ["on the", "sobre la", "sobre a", "super"],
  nome: ["name", "nombre", "nome", "nomen"],
  nomi: ["names", "nombres", "nomes", "nomina"],
  significato: ["meaning", "significado", "significado", "significatio"],
  significa: ["means", "significa", "significa", "significat"],
  porta: ["wears", "lleva", "usa", "gerit"],
  indossato: ["worn", "llevado", "usado", "gestus"],
  abitante: ["inhabitant", "habitante", "habitante", "incola"],
  abitanti: ["inhabitants", "habitantes", "habitantes", "incolae"],
  mondo: ["world", "mundo", "mundo", "mundus"],
  galassia: ["galaxy", "galaxia", "galáxia", "galaxia"],
  sistema: ["system", "sistema", "sistema", "systema"],
  imperatore: ["emperor", "emperador", "imperador", "imperator"],
  principessa: ["princess", "princesa", "princesa", "principissa"],
  principe: ["prince", "príncipe", "príncipe", "princeps"],
  generale: ["general", "general", "general", "dux"],
  ammiraglio: ["admiral", "almirante", "almirante", "praefectus"],
  cacciatore: ["hunter", "cazador", "caçador", "venator"],
  taglia: ["bounty", "recompensa", "recompensa", "praemium"],
  ricompensa: ["reward", "recompensa", "recompensa", "praemium"],
  misterioso: ["mysterious", "misterioso", "misterioso", "mysticus"],
  misteriosa: ["mysterious", "misteriosa", "misteriosa", "mystica"],
  antico: ["ancient", "antiguo", "antigo", "antiquus"],
  antica: ["ancient", "antigua", "antiga", "antiqua"],
  potente: ["powerful", "poderoso", "poderoso", "potens"],
  oscuro: ["dark", "oscuro", "escuro", "obscurus"],
  oscura: ["dark", "oscura", "escura", "obscura"],
  luminoso: ["bright", "luminoso", "luminoso", "lucidus"],
  luminosa: ["bright", "luminosa", "luminosa", "lucida"],
  grande: ["great", "grande", "grande", "magnus"],
  piccolo: ["small", "pequeño", "pequeno", "parvus"],
  piccola: ["small", "pequeña", "pequena", "parva"],
  giovane: ["young", "joven", "jovem", "iuvenis"],
  vecchio: ["old", "viejo", "velho", "senex"],
  vecchia: ["old", "vieja", "velha", "anus"],
  conosciuto: ["known", "conocido", "conhecido", "notus"],
  conosciuta: ["known", "conocida", "conhecida", "nota"],
  nasce: ["is born", "nace", "nasce", "nascitur"],
  nato: ["born", "nacido", "nascido", "natus"],
  nata: ["born", "nacida", "nascida", "nata"],
  muore: ["dies", "muere", "morre", "moritur"],
  morto: ["dead", "muerto", "morto", "mortuus"],
  morta: ["dead", "muerta", "morta", "mortua"],
  combatte: ["fights", "lucha", "luta", "pugnat"],
  combattere: ["to fight", "luchar", "lutar", "pugnare"],
  salva: ["saves", "salva", "salva", "servat"],
  salvare: ["to save", "salvar", "salvar", "servare"],
  tradisce: ["betrays", "traiciona", "trai", "prodit"],
  traditore: ["traitor", "traidor", "traidor", "proditor"],
  alleato: ["ally", "aliado", "aliado", "socius"],
  alleata: ["ally", "aliada", "aliada", "socia"],
  flotta: ["fleet", "flota", "frota", "classis"],
  base: ["base", "base", "base", "basis"],
  tempio: ["temple", "templo", "templo", "templum"],
  deserto: ["desert", "desierto", "deserto", "desertum"],
  ghiaccio: ["ice", "hielo", "gelo", "glacies"],
  foresta: ["forest", "bosque", "floresta", "silva"],
  citta: ["city", "ciudad", "cidade", "urbs"],
  capitale: ["capital", "capital", "capital", "caput"],
  cognome: ["surname", "apellido", "sobrenome", "cognomen"],
  titolo: ["title", "título", "título", "titulus"],
  ruolo: ["role", "rol", "papel", "munus"],
  specie: ["species", "especie", "espécie", "species"],
  razza: ["race", "raza", "raça", "gens"],
  armi: ["weapons", "armas", "armas", "tela"],
  scudo: ["shield", "escudo", "escudo", "scutum"],
  elmetto: ["helmet", "casco", "capacete", "galea"],
  armatura: ["armor", "armadura", "armadura", "lorica"],
  pilota: ["pilot", "piloto", "piloto", "gubernator"],
  comando: ["command", "comando", "comando", "imperium"],
  comanda: ["commands", "manda", "comanda", "imperat"],
  guida: ["leads", "guía", "guia", "ducit"],
  inventato: ["invented", "inventado", "inventado", "inventus"],
  inventata: ["invented", "inventada", "inventada", "inventa"],
  apparso: ["appeared", "aparecido", "aparecido", "apparuit"],
  apparsa: ["appeared", "aparecida", "aparecida", "apparuit"],
  episodio: ["episode", "episodio", "episódio", "episodium"],
  trilogia: ["trilogy", "trilogía", "trilogia", "trilogia"],
  prequel: ["prequel", "precuela", "prequela", "praecursor"],
  sequel: ["sequel", "secuela", "sequela", "sequela"],
  originale: ["original", "original", "original", "originalis"],
  nuovo: ["new", "nuevo", "novo", "novus"],
  nuova: ["new", "nueva", "nova", "nova"],
  ultimo: ["last", "último", "último", "ultimus"],
  ultima: ["last", "última", "última", "ultima"],
  solo: ["only", "solo", "só", "solum"],
  sola: ["only", "sola", "só", "sola"],
  sempre: ["always", "siempre", "sempre", "semper"],
  mai: ["never", "nunca", "nunca", "numquam"],
  quasi: ["almost", "casi", "quase", "fere"],
  molto: ["very", "muy", "muito", "valde"],
  tanto: ["so much", "tanto", "tanto", "tantum"],
  quanto: ["how much", "cuánto", "quanto", "quantum"],
  questo: ["this", "este", "este", "hic"],
  questa: ["this", "esta", "esta", "haec"],
  quello: ["that", "aquel", "aquele", "ille"],
  quella: ["that", "aquella", "aquela", "illa"],
  tutti: ["all", "todos", "todos", "omnes"],
  tutte: ["all", "todas", "todas", "omnes"],
  ogni: ["every", "cada", "cada", "omnis"],
  altro: ["other", "otro", "outro", "alius"],
  altra: ["other", "otra", "outra", "alia"],
  stesso: ["same", "mismo", "mesmo", "idem"],
  stessa: ["same", "misma", "mesma", "eadem"],
};

function normalizeLexKey(core?) {
  return String(core || "")
    .toLowerCase()
    .normalize("NFD")
    .replace(/[\u0300-\u036f]/g, "")
    .replace(/’/g, "'");
}

function jarJarTranslateWord(word?) {
  const raw = String(word || "");
  const m = /^([^\p{L}\p{N}]*)([\p{L}\p{N}'’]+)([^\p{L}\p{N}]*)$/u.exec(raw);
  if (!m) return raw;
  const [, pre, core, post] = m;
  const key = normalizeLexKey(core);
  const alts = JARJAR_LEXICON[key];
  if (!alts?.length) return raw;
  // ~72% probabilità di tradurre (en/es/pt/la misti nella stessa frase)
  if (Math.random() > 0.72) return raw;
  const pick = alts[Math.floor(Math.random() * alts.length)];
  const cased =
    core[0] && core[0] === core[0].toUpperCase()
      ? pick.charAt(0).toUpperCase() + pick.slice(1)
      : pick;
  return `${pre}${cased}${post}`;
}

/** Solo traduzioni multilanguage (niente anagrammi / shuffle parole). */
function jarJarTransform(text?) {
  const tokens = String(text || "").split(/(\s+)/);
  let translated = 0;
  const out = tokens.map((tok) => {
    if (!tok || /^\s+$/.test(tok)) return tok;
    const after = jarJarTranslateWord(tok);
    if (after !== tok) translated += 1;
    return after;
  });
  const target = Math.max(6, Math.ceil(tokens.filter((t) => t && !/^\s+$/.test(t)).length * 0.55));
  if (translated < target) {
    for (let i = 0; i < out.length; i += 1) {
      if (!out[i] || /^\s+$/.test(out[i])) continue;
      const bare = out[i].replace(/^[^\p{L}\p{N}]+|[^\p{L}\p{N}]+$/gu, "");
      const key = normalizeLexKey(bare);
      const alts = JARJAR_LEXICON[key];
      if (!alts?.length) continue;
      const pick = alts[Math.floor(Math.random() * alts.length)];
      const m = /^([^\p{L}\p{N}]*)([\p{L}\p{N}'’]+)([^\p{L}\p{N}]*)$/u.exec(out[i]);
      if (!m) continue;
      const cased =
        m[2][0] === m[2][0].toUpperCase() ? pick.charAt(0).toUpperCase() + pick.slice(1) : pick;
      out[i] = `${m[1]}${cased}${m[3]}`;
      translated += 1;
      if (translated >= target) break;
    }
  }
  return out.join("");
}

function applyMalusToDisplayText(malusId?, text?) {
  const id = String(malusId || "").toLowerCase();
  const src = String(text || "");
  if (!src) return src;
  if (id === "yoda") return shuffleWords(src);
  if (id === "spotchka") return scrambleLettersKeepingWords(src);
  if (id === "cortocircuito") return reverseFullPhrase(src);
  if (id === "jarjar") return jarJarTransform(src);
  return src;
}

function applyMalusToQuizDisplay(malusId?, question?, choices = []) {
  const id = String(malusId || "").toLowerCase();
  const q = applyMalusToDisplayText(id, question);
  const opts = Array.isArray(choices)
    ? choices.map((c) => {
        if (id === "spotchka" || id === "cortocircuito" || id === "jarjar") {
          return applyMalusToDisplayText(id, c);
        }
        return String(c || "");
      })
    : [];
  return { question: q, choices: opts };
}

export = {
  shuffleWords,
  scrambleLettersKeepingWords,
  reverseFullPhrase,
  jarJarTransform,
  applyMalusToDisplayText,
  applyMalusToQuizDisplay,
};
