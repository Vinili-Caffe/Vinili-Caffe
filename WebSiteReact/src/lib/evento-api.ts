/** Client API evento Star Wars → `/webhooks/site-evento*`. */
import { apiUrl } from "./api";

export type EventoCrateId =
  | "omega"
  | "alpha"
  | "beta"
  | "avvento"
  | "militare"
  | "militare_plus"
  | "militare_op"
  | "casuale";

export type EventoWallet = {
  eventKey: string;
  factionId: string | null;
  epoch: string | null;
  pgLevel: number;
  exp: number;
  credits: number;
  pei: number;
  crates: Record<string, number>;
  items: Record<string, unknown>;
  deckPG: unknown[];
  deckReliquie: unknown[];
  advent: { claimed: Record<string, string> };
  updatedAt: string | null;
};

export type EventoStatus = {
  ok: boolean;
  eventKey?: string;
  enabled?: boolean;
  publicEnabled?: boolean;
  publicOpen?: boolean;
  live?: boolean;
  highStaff?: boolean;
  canPreview?: boolean;
  canParticipate?: boolean;
  romeDate?: string;
  todayAdvent?: number | null;
  features?: {
    date: string;
    epoch: string;
    economyPhase: number | null;
    economyOn: boolean;
    features: string[];
  };
  wallet?: EventoWallet | null;
  crateLabels?: Record<string, string>;
  error?: string;
  message?: string;
};

export type EventoAdventDayRow = {
  day: number;
  label: string;
  rewards: Array<
    | { type: "crate"; crateId: EventoCrateId; qty: number }
    | { type: "premium_credits"; amount: number }
  >;
  claimed: boolean;
  claimedAt: string | null;
  canClaim: boolean;
  unlocked: boolean;
};

export type EventoAvventoState = {
  ok: boolean;
  eventKey?: string;
  todayAdvent?: number | null;
  highStaff?: boolean;
  days?: EventoAdventDayRow[];
  wallet?: EventoWallet | null;
  crateLabels?: Record<string, string>;
  error?: string;
  message?: string;
};

function authHeaders(token?: string | null): HeadersInit {
  const h: Record<string, string> = { Accept: "application/json" };
  if (token) h.Authorization = `Bearer ${token}`;
  return h;
}

export async function fetchEventoStatus(token?: string | null): Promise<EventoStatus> {
  try {
    const r = await fetch(apiUrl("/webhooks/site-evento"), {
      headers: authHeaders(token),
      cache: "no-store",
    });
    const j = (await r.json().catch(() => null)) as EventoStatus | null;
    if (!j || typeof j !== "object") return { ok: false, error: "bad_json" };
    return j;
  } catch {
    return { ok: false, error: "network" };
  }
}

export async function fetchEventoAvvento(token?: string | null): Promise<EventoAvventoState> {
  try {
    const r = await fetch(apiUrl("/webhooks/site-evento/avvento"), {
      headers: authHeaders(token),
      cache: "no-store",
    });
    const j = (await r.json().catch(() => null)) as EventoAvventoState | null;
    if (!j || typeof j !== "object") return { ok: false, error: "bad_json" };
    return j;
  } catch {
    return { ok: false, error: "network" };
  }
}

export async function claimEventoAvventoDay(
  token: string,
  day: number,
): Promise<EventoAvventoState & { granted?: unknown[]; day?: number; label?: string }> {
  try {
    const r = await fetch(apiUrl("/webhooks/site-evento/avvento/claim"), {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ day }),
      cache: "no-store",
    });
    const j = (await r.json().catch(() => null)) as EventoAvventoState & {
      granted?: unknown[];
      day?: number;
      label?: string;
    };
    if (!j || typeof j !== "object") return { ok: false, error: "bad_json" };
    return j;
  } catch {
    return { ok: false, error: "network" };
  }
}

export type EventoSortingQuestion = {
  id: string;
  text: string;
  choices: Array<{ id: string; text: string }>;
};

export type EventoFactionMeta = {
  id: string;
  label: string;
  motto: string;
  primary?: string;
  accent?: string;
};

export type EventoSmistamentoState = {
  ok: boolean;
  factions?: EventoFactionMeta[];
  questions?: EventoSortingQuestion[];
  alreadySorted?: boolean;
  factionId?: string | null;
  factionMeta?: EventoFactionMeta | null;
  canSort?: boolean;
  wallet?: EventoWallet | null;
  error?: string;
  message?: string;
};

export async function fetchEventoSmistamento(token?: string | null): Promise<EventoSmistamentoState> {
  try {
    const r = await fetch(apiUrl("/webhooks/site-evento/smistamento"), {
      headers: authHeaders(token),
      cache: "no-store",
    });
    const j = (await r.json().catch(() => null)) as EventoSmistamentoState | null;
    if (!j || typeof j !== "object") return { ok: false, error: "bad_json" };
    return j;
  } catch {
    return { ok: false, error: "network" };
  }
}

export async function submitEventoSmistamento(
  token: string,
  answers: Array<{ questionId: string; choiceId: string }>,
): Promise<EventoSmistamentoState & { scores?: Record<string, number> }> {
  try {
    const r = await fetch(apiUrl("/webhooks/site-evento/smistamento"), {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ answers }),
      cache: "no-store",
    });
    const j = (await r.json().catch(() => null)) as EventoSmistamentoState & {
      scores?: Record<string, number>;
    };
    if (!j || typeof j !== "object") return { ok: false, error: "bad_json" };
    return j;
  } catch {
    return { ok: false, error: "network" };
  }
}

export async function fetchEventoMinigames(token?: string | null) {
  try {
    const r = await fetch(apiUrl("/webhooks/site-evento/minigames"), {
      headers: authHeaders(token),
      cache: "no-store",
    });
    return (await r.json().catch(() => null)) as {
      ok: boolean;
      items?: Array<{ id: string; label: string; active: boolean; implemented: boolean; teaser: string; kind: string }>;
      epoch?: string | null;
      economyOn?: boolean;
    } | null;
  } catch {
    return null;
  }
}

export async function fetchEventoShop(token?: string | null) {
  try {
    const r = await fetch(apiUrl("/webhooks/site-evento/shop"), {
      headers: authHeaders(token),
      cache: "no-store",
    });
    return (await r.json().catch(() => null)) as {
      ok: boolean;
      buyEnabled?: boolean;
      attackEnabled?: boolean;
      economyOn?: boolean;
      epoch?: string;
      shop?: { units: Array<{ id: string; label: string; cost: number; power: number; tier: number }> };
      wallet?: EventoWallet | null;
      error?: string;
      message?: string;
    } | null;
  } catch {
    return null;
  }
}

export async function buyEventoUnit(token: string, unitId: string, qty = 1) {
  try {
    const r = await fetch(apiUrl("/webhooks/site-evento/shop/buy"), {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ unitId, qty }),
      cache: "no-store",
    });
    return (await r.json().catch(() => null)) as { ok: boolean; message?: string; wallet?: EventoWallet } | null;
  } catch {
    return null;
  }
}

export async function attackEventoFaction(token: string, defend = false) {
  try {
    const r = await fetch(apiUrl("/webhooks/site-evento/shop/attack"), {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ defend }),
      cache: "no-store",
    });
    return (await r.json().catch(() => null)) as { ok: boolean; message?: string; winner?: string } | null;
  } catch {
    return null;
  }
}

export async function fetchEventoAccademia(token?: string | null) {
  try {
    const r = await fetch(apiUrl("/webhooks/site-evento/accademia"), {
      headers: authHeaders(token),
      cache: "no-store",
    });
    return (await r.json().catch(() => null)) as {
      ok: boolean;
      playable?: boolean;
      targets?: Array<{ id: string; x: number; y: number; r: number; points: number }>;
      played?: boolean;
      lastScore?: number | null;
      durationSec?: number;
      message?: string;
    } | null;
  } catch {
    return null;
  }
}

export async function submitEventoAccademia(token: string, hits: Array<{ id: string }>) {
  try {
    const r = await fetch(apiUrl("/webhooks/site-evento/accademia"), {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ hits }),
      cache: "no-store",
    });
    return (await r.json().catch(() => null)) as { ok: boolean; score?: number; message?: string } | null;
  } catch {
    return null;
  }
}

export async function fetchEventoGara(token?: string | null) {
  try {
    const r = await fetch(apiUrl("/webhooks/site-evento/gara"), {
      headers: authHeaders(token),
      cache: "no-store",
    });
    return (await r.json().catch(() => null)) as {
      ok: boolean;
      playable?: boolean;
      pods?: Array<{ id: string; label: string }>;
      pick?: string | null;
      result?: { place: number; won: boolean } | null;
      canPick?: boolean;
      message?: string;
    } | null;
  } catch {
    return null;
  }
}

export async function pickEventoGara(token: string, podId: string) {
  try {
    const r = await fetch(apiUrl("/webhooks/site-evento/gara"), {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ podId }),
      cache: "no-store",
    });
    return (await r.json().catch(() => null)) as {
      ok: boolean;
      result?: { place: number; won: boolean };
      message?: string;
    } | null;
  } catch {
    return null;
  }
}

export async function fetchEventoMiniera(token?: string | null) {
  try {
    const r = await fetch(apiUrl("/webhooks/site-evento/miniera"), {
      headers: authHeaders(token),
      cache: "no-store",
    });
    return (await r.json().catch(() => null)) as {
      ok: boolean;
      playable?: boolean;
      remaining?: number;
      canDig?: boolean;
      finds?: Array<{ color: string; rare: boolean }>;
      message?: string;
    } | null;
  } catch {
    return null;
  }
}

export async function digEventoMiniera(token: string) {
  try {
    const r = await fetch(apiUrl("/webhooks/site-evento/miniera"), {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: "{}",
      cache: "no-store",
    });
    return (await r.json().catch(() => null)) as {
      ok: boolean;
      find?: { color: string; rare: boolean };
      remaining?: number;
      message?: string;
    } | null;
  } catch {
    return null;
  }
}
