/** Number Quiz («più o meno»): categorie già pronte + client per quelle create dagli utenti. */

export type NumberQuizItem = { name: string; value: number; sub?: string; image?: string };

export type NumberQuizPack = {
  slug: string;
  title: string;
  description: string;
  emoji: string;
  /** dopo il numero: «m», «minuti», «abitanti» */
  unit: string;
  /** testo dei due pulsanti */
  more: string;
  less: string;
  /** anni e simili: niente punto delle migliaia */
  plain?: boolean;
  plays?: number;
  itemCount?: number;
  authorName?: string;
  mine?: boolean;
  community?: boolean;
  items?: NumberQuizItem[];
};

const it = (name: string, value: number, sub?: string): NumberQuizItem => (sub ? { name, value, sub } : { name, value });

/* numeri arrotondati e noti; dove cambiano nel tempo la descrizione dice «circa» */
export const BUILTIN_NUMBER_QUIZ: NumberQuizPack[] = [
  {
    slug: "b-cantanti-italiani",
    title: "Anno di nascita dei cantanti italiani",
    description: "È nato prima o dopo? Da Mina a Blanco.",
    emoji: "🎤",
    unit: "",
    more: "Dopo",
    less: "Prima",
    plain: true,
    items: [
      it("Ornella Vanoni", 1934), it("Adriano Celentano", 1938), it("Mina", 1940), it("Fabrizio De André", 1940),
      it("Francesco Guccini", 1940), it("Lucio Dalla", 1943), it("Lucio Battisti", 1943), it("Gianni Morandi", 1944),
      it("Franco Battiato", 1945), it("Renato Zero", 1950), it("Rino Gaetano", 1950), it("Loredana Bertè", 1950),
      it("Vasco Rossi", 1952), it("Gianna Nannini", 1954), it("Fiorella Mannoia", 1954), it("Zucchero", 1955),
      it("Pino Daniele", 1955), it("Ligabue", 1960), it("Eros Ramazzotti", 1963), it("Jovanotti", 1966),
      it("Max Pezzali", 1967), it("Giorgia", 1971), it("Laura Pausini", 1974), it("Elisa", 1977),
      it("Tiziano Ferro", 1980), it("Cesare Cremonini", 1980), it("Annalisa", 1985), it("Marco Mengoni", 1988),
      it("Elodie", 1990), it("Mahmood", 1992), it("Sfera Ebbasta", 1992), it("Lazza", 1994), it("Tananai", 1995),
      it("Ultimo", 1996), it("Damiano David", 1999), it("Geolier", 2000), it("Angelina Mango", 2001), it("Blanco", 2003),
    ],
  },
  {
    slug: "b-album-anno",
    title: "In che anno è uscito l'album?",
    description: "Dischi che hanno fatto la storia: è uscito prima o dopo?",
    emoji: "💿",
    unit: "",
    more: "Dopo",
    less: "Prima",
    plain: true,
    items: [
      it("Pet Sounds", 1966, "The Beach Boys"), it("Sgt. Pepper's Lonely Hearts Club Band", 1967, "The Beatles"),
      it("Abbey Road", 1969, "The Beatles"), it("La buona novella", 1970, "Fabrizio De André"),
      it("Led Zeppelin IV", 1971, "Led Zeppelin"), it("The Dark Side of the Moon", 1973, "Pink Floyd"),
      it("Anima latina", 1974, "Lucio Battisti"), it("A Night at the Opera", 1975, "Queen"),
      it("Rumours", 1977, "Fleetwood Mac"), it("Com'è profondo il mare", 1977, "Lucio Dalla"),
      it("Back in Black", 1980, "AC/DC"), it("Thriller", 1982, "Michael Jackson"), it("Bollicine", 1983, "Vasco Rossi"),
      it("Purple Rain", 1984, "Prince"), it("Born in the U.S.A.", 1984, "Bruce Springsteen"),
      it("The Joshua Tree", 1987, "U2"), it("Appetite for Destruction", 1987, "Guns N' Roses"),
      it("Like a Prayer", 1989, "Madonna"), it("Nevermind", 1991, "Nirvana"), it("OK Computer", 1997, "Radiohead"),
      it("The Marshall Mathers LP", 2000, "Eminem"), it("Discovery", 2001, "Daft Punk"),
      it("Back to Black", 2006, "Amy Winehouse"), it("21", 2011, "Adele"),
      it("Random Access Memories", 2013, "Daft Punk"), it("Lemonade", 2016, "Beyoncé"),
      it("Future Nostalgia", 2020, "Dua Lipa"), it("Teatro d'ira - Vol. I", 2021, "Måneskin"),
    ],
  },
  {
    slug: "b-montagne",
    title: "Montagne più alte",
    description: "Dall'Everest al Vesuvio: quale è più alta?",
    emoji: "🏔️",
    unit: "m",
    more: "Più alta",
    less: "Più bassa",
    items: [
      it("Everest", 8849, "Himalaya"), it("K2", 8611, "Karakorum"), it("Kangchenjunga", 8586, "Himalaya"),
      it("Lhotse", 8516, "Himalaya"), it("Makalu", 8485, "Himalaya"), it("Cho Oyu", 8188, "Himalaya"),
      it("Dhaulagiri", 8167, "Himalaya"), it("Manaslu", 8163, "Himalaya"), it("Nanga Parbat", 8126, "Himalaya"),
      it("Annapurna", 8091, "Himalaya"), it("Aconcagua", 6961, "Ande"), it("Chimborazo", 6263, "Ande"),
      it("Denali", 6190, "Alaska"), it("Kilimangiaro", 5895, "Tanzania"), it("Elbrus", 5642, "Caucaso"),
      it("Massiccio Vinson", 4892, "Antartide"), it("Monte Bianco", 4806, "Alpi"), it("Monte Rosa", 4634, "Alpi"),
      it("Cervino", 4478, "Alpi"), it("Gran Paradiso", 4061, "Alpi"), it("Ortles", 3905, "Alpi"),
      it("Monte Fuji", 3776, "Giappone"), it("Marmolada", 3343, "Dolomiti"), it("Monte Olimpo", 2918, "Grecia"),
      it("Corno Grande", 2912, "Gran Sasso"), it("Monte Kosciuszko", 2228, "Australia"),
      it("Ben Nevis", 1345, "Scozia"), it("Vesuvio", 1281, "Campania"),
    ],
  },
  {
    slug: "b-paesi-popolazione",
    title: "Popolazione dei Paesi",
    description: "Quale Paese ha più abitanti? Numeri di circa il 2024.",
    emoji: "🌍",
    unit: "milioni di abitanti",
    more: "Di più",
    less: "Di meno",
    items: [
      it("India", 1441), it("Cina", 1410), it("Stati Uniti", 341), it("Indonesia", 281), it("Pakistan", 251),
      it("Nigeria", 228), it("Brasile", 212), it("Bangladesh", 174), it("Russia", 144), it("Messico", 130),
      it("Etiopia", 129), it("Giappone", 124), it("Filippine", 116), it("Egitto", 116), it("Vietnam", 101),
      it("Iran", 91), it("Turchia", 86), it("Germania", 84), it("Thailandia", 72), it("Regno Unito", 69),
      it("Francia", 68), it("Sudafrica", 63), it("Italia", 59), it("Colombia", 53), it("Corea del Sud", 52),
      it("Spagna", 48), it("Argentina", 46), it("Canada", 41), it("Marocco", 38), it("Polonia", 37),
      it("Australia", 27), it("Paesi Bassi", 18), it("Svezia", 10.5),
      it("Svizzera", 9), it("Irlanda", 5.3), it("Nuova Zelanda", 5.2), it("Islanda", 0.4),
    ],
  },
  {
    slug: "b-citta-italiane",
    title: "Città italiane più abitate",
    description: "Quale città ha più abitanti? Numeri arrotondati, di circa il 2024.",
    emoji: "🏙️",
    unit: "abitanti",
    more: "Di più",
    less: "Di meno",
    items: [
      it("Roma", 2750000), it("Milano", 1370000), it("Napoli", 910000), it("Torino", 850000), it("Palermo", 630000),
      it("Genova", 560000), it("Bologna", 390000), it("Firenze", 360000), it("Bari", 315000), it("Catania", 300000),
      it("Verona", 255000), it("Venezia", 250000), it("Messina", 220000), it("Padova", 207000), it("Trieste", 199000),
      it("Taranto", 188000), it("Modena", 185000), it("Reggio Calabria", 170000), it("Perugia", 162000),
      it("Cagliari", 148000), it("Salerno", 127000), it("Bergamo", 120000), it("Bolzano", 107000),
      it("Ancona", 99000), it("Lecce", 94000), it("Como", 83000), it("Matera", 59000), it("Siena", 53000),
      it("Aosta", 33000),
    ],
  },
  {
    slug: "b-fiumi-italiani",
    title: "Fiumi italiani più lunghi",
    description: "Quale fiume è più lungo?",
    emoji: "🌊",
    unit: "km",
    more: "Più lungo",
    less: "Più corto",
    items: [
      it("Po", 652), it("Adige", 410), it("Tevere", 405), it("Adda", 313), it("Oglio", 280), it("Tanaro", 276),
      it("Ticino", 248), it("Arno", 241), it("Piave", 220), it("Reno", 212), it("Tagliamento", 178),
      it("Volturno", 175), it("Brenta", 174), it("Isonzo", 136),
    ],
  },
  {
    slug: "b-durata-film",
    title: "Quanto dura il film?",
    description: "Dura di più o di meno? Durata in minuti.",
    emoji: "🎬",
    unit: "minuti",
    more: "Dura di più",
    less: "Dura di meno",
    items: [
      it("Via col vento", 238), it("Il ritorno del re", 201, "Il Signore degli Anelli"), it("Schindler's List", 195),
      it("Titanic", 194), it("Avengers: Endgame", 181), it("Oppenheimer", 180), it("Il padrino", 175),
      it("Interstellar", 169), it("Avatar", 162), it("Il gladiatore", 155), it("Pulp Fiction", 154),
      it("Il cavaliere oscuro", 152), it("Inception", 148), it("Forrest Gump", 142), it("Matrix", 136),
      it("Parasite", 132), it("Jurassic Park", 127), it("Lo squalo", 124), it("Joker", 122), it("Guerre stellari", 121, "1977"),
      it("La vita è bella", 116), it("Ritorno al futuro", 116), it("Barbie", 114), it("Coco", 105), it("Frozen", 102),
      it("Alla ricerca di Nemo", 100), it("Up", 96), it("Shrek", 90), it("Il re leone", 88, "1994"), it("Toy Story", 81),
    ],
  },
];

export function builtinNumberQuiz(slug: string) {
  return BUILTIN_NUMBER_QUIZ.find((p) => p.slug === slug) || null;
}

export function formatQuizNumber(value: number, plain?: boolean) {
  if (plain) return String(value);
  return new Intl.NumberFormat("it-IT", { maximumFractionDigits: 2 }).format(value);
}

type Res<T> = { ok: true; data: T } | { ok: false; message: string; status?: number };

async function api<T>(path: string, token?: string | null, init?: RequestInit): Promise<Res<T>> {
  try {
    const r = await fetch(`/webhooks/site-number-quiz${path}`, {
      ...init,
      headers: {
        Accept: "application/json",
        ...(token ? { Authorization: `Bearer ${token}` } : {}),
        ...(init?.body ? { "Content-Type": "application/json" } : {}),
      },
      cache: "no-store",
      credentials: "same-origin",
    });
    const data = (await r.json().catch(() => null)) as (T & { ok?: boolean; message?: string }) | null;
    if (!r.ok || !data?.ok) {
      return { ok: false, status: r.status, message: String(data?.message || (r.status === 404 ? "Non trovata." : "Qualcosa è andato storto, riprova.")) };
    }
    return { ok: true, data };
  } catch {
    return { ok: false, message: "Connessione assente, riprova." };
  }
}

export const listNumberQuiz = (token?: string | null) => api<{ packs: NumberQuizPack[] }>("/packs", token);
export const loadNumberQuiz = (slug: string, token?: string | null) =>
  api<{ pack: NumberQuizPack }>(`/pack/${encodeURIComponent(slug)}`, token);
export const countNumberQuizPlay = (slug: string) =>
  api<object>(`/pack/${encodeURIComponent(slug)}/play`, null, { method: "POST" });
export const createNumberQuiz = (token: string, body: Record<string, unknown>) =>
  api<{ pack: NumberQuizPack }>("/pack", token, { method: "POST", body: JSON.stringify(body) });
export const deleteNumberQuiz = (token: string, slug: string) =>
  api<object>(`/pack/${encodeURIComponent(slug)}`, token, { method: "DELETE" });
