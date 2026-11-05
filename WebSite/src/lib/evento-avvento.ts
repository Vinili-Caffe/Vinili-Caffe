/** Calendario avvento Star Wars — 25 giorni (1→25 dicembre).
 *  Catalogo premi (claim/API casse: da collegare al bot).
 */

export type AdventCrateId =
  | "omega"
  | "alpha"
  | "beta"
  | "avvento"
  | "militare"
  | "militare_plus"
  | "militare_op"
  | "casuale"
  | "lunare"
  | "solare"
  | "planetario"
  | "nebulare"
  | "galattico";

export type AdventRewardPart =
  | { type: "crate"; crateId: AdventCrateId; qty: number }
  | { type: "credits"; amount: number };

export type AdventDay = {
  day: number;
  /** Etichetta staff (come inviata) */
  label: string;
  rewards: AdventRewardPart[];
};

export const ADVENT_CRATE_LABELS: Record<AdventCrateId, string> = {
  omega: "Cassa Omega",
  alpha: "Cassa Alpha",
  beta: "Cassa Beta",
  avvento: "Cassa Avvento",
  militare: "Cassa Militare",
  militare_plus: "Cassa Militare+",
  militare_op: "Cassa Militare OP",
  casuale: "Cassa Casuale",
  lunare: "Cassa Lunare",
  solare: "Cassa Solare",
  planetario: "Cassa Planetario",
  nebulare: "Cassa Nebulare",
  galattico: "Cassa Galattico",
};

function crate(crateId: AdventCrateId, qty = 1): AdventRewardPart {
  return { type: "crate", crateId, qty };
}

function credits(amount: number): AdventRewardPart {
  return { type: "credits", amount };
}

function labelFrom(rewards: AdventRewardPart[]): string {
  return rewards
    .map((r) => {
      if (r.type === "credits") {
        return `${r.amount.toLocaleString("it-IT")} crediti`;
      }
      const name = ADVENT_CRATE_LABELS[r.crateId];
      if (r.crateId === "casuale" && r.qty > 1) return `Casuale ${r.qty}`;
      if (r.qty > 1) return `${name} ×${r.qty}`;
      if (r.crateId === "casuale") return "Casuale";
      if (r.crateId === "militare") return "Militare";
      if (r.crateId === "militare_plus") return "Militare+";
      if (r.crateId === "militare_op") return "Militare OP";
      return name;
    })
    .join(" + ");
}

function day(n: number, rewards: AdventRewardPart[], label?: string): AdventDay {
  return { day: n, label: label || labelFrom(rewards), rewards };
}

/** Premi in ordine (giorno 1 … 25), come da staff. */
export const ADVENT_DAYS: readonly AdventDay[] = Object.freeze([
  day(1, [crate("omega")], "Cassa Omega"),
  day(2, [crate("casuale")], "Casuale"),
  day(3, [crate("avvento")], "Cassa Avvento"),
  day(4, [crate("beta")], "Cassa Beta"),
  day(5, [crate("casuale", 2), crate("avvento")], "Casuale 2 + Cassa Avvento"),
  day(6, [crate("casuale")], "Casuale"),
  day(7, [crate("alpha")], "Cassa Alpha"),
  day(8, [crate("casuale", 2), crate("omega")], "Casuale 2 + Cassa Omega"),
  day(9, [crate("avvento")], "Cassa Avvento"),
  day(10, [crate("beta")], "Cassa Beta"),
  day(11, [crate("casuale")], "Casuale"),
  day(12, [crate("avvento"), crate("alpha")], "Cassa Avvento + Cassa Alpha"),
  day(13, [crate("casuale", 2)], "Casuale 2"),
  day(14, [crate("militare")], "Militare"),
  day(15, [crate("avvento"), crate("militare_plus")], "Cassa Avvento + Cassa Militare+"),
  day(16, [crate("militare_op")], "Militare OP"),
  day(17, [crate("beta")], "Cassa Beta"),
  day(18, [crate("avvento")], "Cassa Avvento"),
  day(19, [crate("militare")], "Militare"),
  day(20, [crate("casuale", 2)], "Casuale 2"),
  day(21, [crate("avvento")], "Cassa Avvento"),
  day(22, [crate("militare_plus")], "Militare+"),
  day(23, [crate("casuale", 2)], "Casuale 2"),
  day(24, [crate("militare_op")], "Militare OP"),
  day(25, [crate("militare_op"), credits(1000)], "Cassa Militare OP + 1.000 crediti"),
]);

export function getAdventDay(dayNum: number): AdventDay | null {
  const d = Math.floor(Number(dayNum));
  if (!Number.isFinite(d) || d < 1 || d > 25) return null;
  return ADVENT_DAYS[d - 1] || null;
}

/** Giorno calendario Rome (1–31) nel mese dicembre 2026 → slot avvento, altrimenti null. */
export function adventSlotForRomeDate(now = new Date()): number | null {
  const parts = Object.fromEntries(
    new Intl.DateTimeFormat("en-GB", {
      timeZone: "Europe/Rome",
      year: "numeric",
      month: "2-digit",
      day: "2-digit",
    })
      .formatToParts(now)
      .filter((p) => p.type !== "literal")
      .map((p) => [p.type, p.value]),
  ) as Record<string, string>;
  if (Number(parts.year) !== 2026 || Number(parts.month) !== 12) return null;
  const d = Number(parts.day);
  if (d < 1 || d > 25) return null;
  return d;
}
