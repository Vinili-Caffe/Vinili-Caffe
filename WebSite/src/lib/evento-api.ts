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
  | "stellare"
  | "cosmica"
  | "lunare"
  | "solare"
  | "planetario"
  | "nebulare"
  | "galattico";

export type EventoUtilityItemId =
  | "bacta"
  | "festival_ancestors"
  | "riciclaggio_hutt"
  | "sconto_mercato_nero";

export type EventoBuff = {
  active: boolean;
  activatedAt?: string | null;
  expiresAt: string;
  label?: string;
  blurb?: string;
};

export type EventoLevelProgress = {
  level: number;
  title: string;
  exp: number;
  expToNext: number;
  nextLevel: number | null;
  nextReq: number | null;
  progressPct: number;
  maxLevel: number;
};

export type EventoFactionRank = {
  tier: number;
  maxTier: number;
  label: string;
  factionId?: string | null;
  epoch?: string | null;
  canBuyTroops?: boolean;
  canWar?: boolean;
  canManageRanks?: boolean;
  permissions?: {
    buyTroops?: boolean;
    war?: boolean;
    manageRanks?: boolean;
  };
};

export type EventoWallet = {
  eventKey: string;
  factionId: string | null;
  epoch: string | null;
  factionRankTier?: number | null;
  factionRank?: EventoFactionRank | null;
  pgLevel: number;
  exp: number;
  credits: number;
  pei: number;
  creditsVolume?: number;
  factionBankGiven?: number;
  votes?: number;
  quizCorrectTotal?: number;
  crates: Record<string, number>;
  items: Record<string, unknown>;
  army?: Record<string, number>;
  pendingTroops?: Record<string, number>;
  buffs?: Record<string, EventoBuff>;
  level?: EventoLevelProgress;
  deckPG: unknown[];
  deckReliquie: unknown[];
  advent: { claimed: Record<string, string> };
  updatedAt: string | null;
};

export type EventoStanding = {
  peiRank: number | null;
  factionRank: number | null;
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
  needsSort?: boolean;
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
  utilityItems?: Array<{ id: string; label: string; blurb: string; kind: string }>;
  utilityLabels?: Record<string, string>;
  unitLabels?: Record<string, string>;
  armyPower?: number;
  factionLabel?: string | null;
  standing?: EventoStanding | null;
  error?: string;
  message?: string;
};

export type EventoAdventActivity = {
  date: string;
  at?: string | null;
  note?: string | null;
  film?: string | null;
  economyPhase?: number | null;
  features?: Array<{
    id: string;
    feature?: string;
    label: string;
    href?: string | null;
    kind?: string;
  }>;
};

export type EventoAdventDayRow = {
  day: number;
  label: string;
  rewards: Array<
    | { type: "crate"; crateId: EventoCrateId; qty: number }
    | { type: "credits"; amount: number }
    | { type: "premium_credits"; amount: number }
  >;
  claimed: boolean;
  claimedAt: string | null;
  canClaim: boolean;
  unlocked: boolean;
  /** Giorno passato non ritirato → premio perso. */
  missed?: boolean;
  /** Attività dal calendario evento (stesso giorno). */
  activity?: EventoAdventActivity | null;
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

export type EventoCollectionItem = {
  id: string;
  name: string;
  imageUrl?: string;
  thumbUrl?: string;
  silhouetteUrl?: string;
  owned: boolean;
  hasImage?: boolean;
};

export type EventoCollectionDeck = {
  unlocked: boolean;
  active: boolean;
  kind: "pg" | "reliquie" | string;
  title: string;
  ownedCount: number;
  total: number;
  items: EventoCollectionItem[];
};

export type EventoCollezioniState = {
  ok: boolean;
  visible?: boolean;
  highStaff?: boolean;
  pg?: EventoCollectionDeck | null;
  reliquie?: EventoCollectionDeck | null;
  error?: string;
  message?: string;
};

export async function fetchEventoCollezioni(token?: string | null): Promise<EventoCollezioniState> {
  try {
    const r = await fetch(apiUrl("/webhooks/site-evento/collezioni"), {
      headers: authHeaders(token),
      cache: "no-store",
    });
    const j = (await r.json().catch(() => null)) as EventoCollezioniState | null;
    if (!j || typeof j !== "object") return { ok: false, error: "bad_json" };
    return j;
  } catch {
    return { ok: false, error: "network" };
  }
}

export type EventoCalendarDayRow = {
  date: string;
  at?: string;
  advent?: number;
  note?: string;
  film?: string;
  on?: string[];
  off?: string[];
  economyPhase?: number | null;
  epoch?: string;
};

export async function fetchEventoCalendar(token?: string | null): Promise<{
  ok: boolean;
  days?: EventoCalendarDayRow[];
  featuresNow?: { date?: string; epoch?: string | null; economyOn?: boolean };
  error?: string;
}> {
  try {
    const r = await fetch(apiUrl("/webhooks/site-evento/calendar"), {
      headers: authHeaders(token),
      cache: "no-store",
    });
    const j = (await r.json().catch(() => null)) as {
      ok?: boolean;
      days?: EventoCalendarDayRow[];
      featuresNow?: { date?: string; epoch?: string | null; economyOn?: boolean };
      error?: string;
    } | null;
    if (!j || typeof j !== "object") return { ok: false, error: "bad_json" };
    return { ok: Boolean(j.ok), days: j.days || [], featuresNow: j.featuresNow, error: j.error };
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
      items?: Array<{
        id: string;
        label: string;
        active: boolean;
        implemented: boolean;
        teaser: string;
        kind: string;
        href?: string | null;
        unlockDate?: string | null;
        adventDay?: number | null;
        unlockNote?: string | null;
      }>;
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
      canBuyTroops?: boolean;
      canWar?: boolean;
      economyOn?: boolean;
      epoch?: string;
      shop?: { units: Array<{ id: string; label: string; cost: number; power: number; tier: number }> };
      wallet?: EventoWallet | null;
      bankCredits?: number;
      error?: string;
      message?: string;
    } | null;
  } catch {
    return null;
  }
}

export type EventoFactionHub = {
  ok: boolean;
  status?: number;
  eventKey?: string;
  epoch?: string | null;
  economyOn?: boolean;
  factionId?: string | null;
  factionLabel?: string | null;
  factionRank?: EventoFactionRank | null;
  canBuyTroops?: boolean;
  canWar?: boolean;
  canManageRanks?: boolean;
  buyEnabled?: boolean;
  attackEnabled?: boolean;
  shop?: { units: Array<{ id: string; label: string; cost: number; power: number; tier: number }> } | null;
  hourKey?: string;
  stance?: "attack" | "defend" | null;
  pendingStance?: boolean;
  bank?: {
    credits: number;
    units: Record<string, number>;
    items: Record<string, number>;
    buffs?: Record<string, EventoBuff>;
    power: number;
    unitCount: number;
    lastAttackAt?: string | null;
  };
  contribution?: {
    given: number;
    sharePct: number;
  };
  unitLabels?: Record<string, string>;
  utilityItems?: Array<{ id: string; label: string; blurb: string; kind: string }>;
  utilityLabels?: Record<string, string>;
  wallet?: EventoWallet | null;
  error?: string;
  message?: string;
};

export async function fetchEventoFaction(token?: string | null) {
  try {
    const r = await fetch(apiUrl("/webhooks/site-evento/faction"), {
      headers: authHeaders(token),
      cache: "no-store",
    });
    return (await r.json().catch(() => null)) as EventoFactionHub | null;
  } catch {
    return null;
  }
}

export type EventoFactionRankMember = {
  userId: string;
  displayName: string;
  avatarUrl?: string | null;
  tier: number;
  rank?: EventoFactionRank | null;
  isSelf?: boolean;
  isMarshal?: boolean;
};

export type EventoFactionRanksSnapshot = {
  ok: boolean;
  status?: number;
  factionId?: string | null;
  marshalUserId?: string | null;
  canManageRanks?: boolean;
  canClaimMarshal?: boolean;
  ranksCatalog?: EventoFactionRank[];
  members?: EventoFactionRankMember[];
  selfRank?: EventoFactionRank | null;
  error?: string;
  message?: string;
};

export async function fetchEventoFactionRanks(token?: string | null) {
  try {
    const r = await fetch(apiUrl("/webhooks/site-evento/faction/ranks"), {
      headers: authHeaders(token),
      cache: "no-store",
    });
    return (await r.json().catch(() => null)) as EventoFactionRanksSnapshot | null;
  } catch {
    return null;
  }
}

export async function postEventoFactionRankAction(
  token: string,
  action: "promote" | "demote" | "claim",
  userId?: string,
) {
  try {
    const r = await fetch(apiUrl("/webhooks/site-evento/faction/ranks"), {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ action, userId }),
      cache: "no-store",
    });
    return (await r.json().catch(() => null)) as {
      ok: boolean;
      message?: string;
      error?: string;
      rank?: EventoFactionRank | null;
    } | null;
  } catch {
    return null;
  }
}

export type EventoWarUnitRow = {
  id: string;
  label: string;
  qty: number;
  powerEach?: number;
  power?: number;
  tier?: number;
  type?: string | null;
};

export type EventoWarSideBlock = {
  units?: Record<string, number>;
  count?: number;
  power?: number;
  rows?: EventoWarUnitRow[];
};

export type EventoWarSide = {
  factionId?: string | null;
  factionLabel?: string | null;
  stance?: "attack" | "defend" | null;
  deployed?: boolean;
  surviveFactor?: number;
  beforeCount?: number;
  deadCount?: number;
  survivorsCount?: number;
  before?: EventoWarSideBlock;
  survivors?: EventoWarSideBlock;
  dead?: EventoWarSideBlock;
  hangarAfter?: EventoWarSideBlock;
};

export type EventoWarSummary = {
  id: string;
  hourKey?: string;
  resolvedAt?: string | null;
  epoch?: string | null;
  mode?: string | null;
  modeLabel?: string | null;
  winner?: string | null;
  winnerLabel?: string | null;
  youWon?: boolean | null;
  message?: string | null;
  left?: EventoWarSide;
  right?: EventoWarSide;
};

export type EventoWarReport = EventoWarSummary & {
  eventKey?: string;
  totals?: {
    troopsDeployed?: number;
    troopsDead?: number;
    troopsSurvived?: number;
    powerDeployed?: number;
    powerLost?: number;
  };
};

export async function fetchEventoWars(token?: string | null, limit = 40) {
  try {
    const r = await fetch(apiUrl(`/webhooks/site-evento/wars?limit=${Math.max(1, Math.min(80, limit))}`), {
      headers: authHeaders(token),
      cache: "no-store",
    });
    return (await r.json().catch(() => null)) as {
      ok: boolean;
      wars?: EventoWarSummary[];
      count?: number;
      message?: string;
    } | null;
  } catch {
    return null;
  }
}

export async function fetchEventoWarReport(token: string, warId: string) {
  try {
    const r = await fetch(apiUrl(`/webhooks/site-evento/wars?id=${encodeURIComponent(warId)}`), {
      headers: authHeaders(token),
      cache: "no-store",
    });
    return (await r.json().catch(() => null)) as {
      ok: boolean;
      war?: EventoWarReport;
      message?: string;
      error?: string;
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

export async function attackEventoFaction(
  token: string,
  opts: {
    defend?: boolean;
    useBacta?: boolean;
    deploy?: Record<string, number>;
  } = {},
) {
  const defend = Boolean(opts.defend);
  try {
    const r = await fetch(apiUrl("/webhooks/site-evento/shop/attack"), {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({
        defend,
        useBacta: Boolean(opts.useBacta && !defend),
        deploy: opts.deploy && typeof opts.deploy === "object" ? opts.deploy : undefined,
      }),
      cache: "no-store",
    });
    return (await r.json().catch(() => null)) as {
      ok: boolean;
      message?: string;
      winner?: string;
      pending?: boolean;
      mode?: string;
      attackPower?: number;
      defendPower?: number;
      deploy?: Record<string, number>;
      deployCount?: number;
      deployPower?: number;
      bactaUsed?: boolean;
      bactaHealed?: Record<string, number> | null;
    } | null;
  } catch {
    return null;
  }
}

export async function openEventoCrate(token: string, crateId: string) {
  try {
    const r = await fetch(apiUrl("/webhooks/site-evento/crate/open"), {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ crateId }),
      cache: "no-store",
    });
    return (await r.json().catch(() => null)) as {
      ok: boolean;
      message?: string;
      crateId?: string;
      loot?: {
        credits?: number;
        exp?: number;
        troops?: Record<string, number> | null;
        items?: Record<string, number> | null;
        note?: string | null;
      };
      wallet?: EventoWallet;
    } | null;
  } catch {
    return null;
  }
}

export async function useEventoItem(token: string, itemId: string) {
  try {
    const r = await fetch(apiUrl("/webhooks/site-evento/items/use"), {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ itemId }),
      cache: "no-store",
    });
    return (await r.json().catch(() => null)) as {
      ok: boolean;
      message?: string;
      itemId?: string;
      label?: string;
      effect?: string;
      expiresAt?: string;
      totalHealed?: number;
      wallet?: EventoWallet;
    } | null;
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
      playToken?: string | null;
      durationSec?: number;
      message?: string;
    } | null;
  } catch {
    return null;
  }
}

export async function submitEventoAccademia(
  token: string,
  hits: Array<{ id: string }>,
  opts?: { playToken?: string | null; startedAt?: number | null },
) {
  try {
    const r = await fetch(apiUrl("/webhooks/site-evento/accademia"), {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({
        hits,
        playToken: opts?.playToken || undefined,
        startedAt: opts?.startedAt || undefined,
      }),
      cache: "no-store",
    });
    return (await r.json().catch(() => null)) as {
      ok: boolean;
      score?: number;
      hits?: number;
      elapsedMs?: number;
      elapsedSec?: number;
      crateId?: string;
      exp?: number;
      message?: string;
    } | null;
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
      result?: {
        place: number;
        won: boolean;
        finishOrder?: string[];
        reward?: { crateId?: string; crateQty?: number; exp?: number } | null;
      } | null;
      canPick?: boolean;
      cooldownHours?: number;
      rewardHint?: string;
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
      result?: {
        place: number;
        won: boolean;
        finishOrder?: string[];
        reward?: { crateId?: string; crateQty?: number; exp?: number } | null;
      };
      message?: string;
    } | null;
  } catch {
    return null;
  }
}

export type EventoMinieraStanding = {
  factionId: string;
  label: string;
  crystals: number;
  participants: number;
};

export type EventoMinieraStandings = {
  eventKey?: string | null;
  settled?: boolean;
  result?: unknown;
  factions?: EventoMinieraStanding[];
};

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
      colors?: string[];
      standings?: EventoMinieraStandings;
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
      standings?: EventoMinieraStandings;
      message?: string;
    } | null;
  } catch {
    return null;
  }
}

export type EventoPuzzleDifficultyRow = {
  id: string;
  label: string;
  order: number;
  cols: number;
  rows: number;
  pieces: number;
  timeLimitSec: number;
  cooldownMs: number;
  exp: number;
  crateOdds: Array<{ crateId: string; weight: number }>;
  imageUrl: string;
  lastClaimAt?: string | null;
  cooldownRemainingMs?: number;
  canStart?: boolean;
  canPlayGuest?: boolean;
  cdAdsUsed?: number;
  cdAdsLeft?: number;
  canCutCooldown?: boolean;
};

export async function fetchEventoPuzzle(token?: string | null) {
  try {
    const r = await fetch(apiUrl("/webhooks/site-evento/puzzle"), {
      headers: authHeaders(token),
      cache: "no-store",
    });
    return (await r.json().catch(() => null)) as {
      ok: boolean;
      playable?: boolean;
      difficulties?: EventoPuzzleDifficultyRow[];
      adBoosts?: {
        watchSec: number;
        cooldown: { max: number; cutPercent: number };
        time: { max: number; bonusSec: number };
        reward: { max: number; expMult: number; betterCrateBias: number };
      };
      serverNow?: string;
      message?: string;
    } | null;
  } catch {
    return null;
  }
}

export async function startEventoPuzzle(token: string, difficultyId: string) {
  try {
    const r = await fetch(apiUrl("/webhooks/site-evento/puzzle"), {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ action: "start", difficultyId }),
      cache: "no-store",
    });
    return (await r.json().catch(() => null)) as {
      ok: boolean;
      attemptId?: string;
      startedAt?: string;
      expiresAt?: string;
      difficulty?: EventoPuzzleDifficultyRow;
      cooldownRemainingMs?: number;
      message?: string;
      error?: string;
    } | null;
  } catch {
    return null;
  }
}

export async function completeEventoPuzzle(
  token: string,
  opts: { difficultyId: string; attemptId: string; elapsedMs: number },
) {
  try {
    const r = await fetch(apiUrl("/webhooks/site-evento/puzzle"), {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ action: "complete", ...opts }),
      cache: "no-store",
    });
    return (await r.json().catch(() => null)) as {
      ok: boolean;
      grant?: { exp?: number; crateId?: string | null; crateQty?: number };
      cooldownRemainingMs?: number;
      nextAvailableAt?: string;
      rewardBoosted?: boolean;
      message?: string;
      error?: string;
    } | null;
  } catch {
    return null;
  }
}

export type PuzzleAdKind = "cooldown" | "time" | "reward";

export async function startEventoPuzzleAd(
  token: string,
  opts: { kind: PuzzleAdKind; difficultyId: string; attemptId?: string | null },
) {
  try {
    const r = await fetch(apiUrl("/webhooks/site-evento/puzzle"), {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ad_start", ...opts }),
      cache: "no-store",
    });
    return (await r.json().catch(() => null)) as {
      ok: boolean;
      adSessionId?: string;
      watchSec?: number;
      kind?: PuzzleAdKind;
      message?: string;
      error?: string;
    } | null;
  } catch {
    return null;
  }
}

export async function finishEventoPuzzleAd(token: string, adSessionId: string) {
  try {
    const r = await fetch(apiUrl("/webhooks/site-evento/puzzle"), {
      method: "POST",
      headers: { ...authHeaders(token), "Content-Type": "application/json" },
      body: JSON.stringify({ action: "ad_finish", adSessionId }),
      cache: "no-store",
    });
    return (await r.json().catch(() => null)) as {
      ok: boolean;
      kind?: PuzzleAdKind;
      cooldownRemainingMs?: number;
      cutMs?: number;
      cdAdsLeft?: number;
      bonusSec?: number;
      expiresAt?: string;
      timeAdsLeft?: number;
      timeBonusSec?: number;
      expMult?: number;
      message?: string;
      error?: string;
    } | null;
  } catch {
    return null;
  }
}
