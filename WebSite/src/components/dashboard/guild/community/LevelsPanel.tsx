"use client";

import { useEffect, useRef, useState } from "react";
import { ArrowRight, Ban, ChevronDown, HandHeart, Sunrise, CalendarClock, Check, Gamepad2, Gift, LineChart, Loader2, Megaphone, MessageSquare, Mic, Minus, Play, Plus, RefreshCw, RotateCcw, Search, Sparkles, Star, Target, Timer, Trash2, TrendingUp, Trophy, UserRound, X, type LucideIcon } from "lucide-react";
import { DateTimeField } from "@/components/ui/DateTimeField";
import { NumberField } from "@/components/ui/NumberField";
import { MultiSelect, Select } from "@/components/ui/Select";
import { cn } from "@/lib/cn";
import {
  communityApi,
  emptyDraft,
  type LevelsActivityWinners,
  type LevelsConfig,
  type LevelsEvent,
  type LevelsExpBonus,
  type LevelsLevelCurve,
  type LevelsMinigameScoring,
  type LevelsRoleMultiplier,
  type LevelsRoleReward,
  type LevelsScheduledEvent,
  type LevelsUser,
  type LevelsUserAction,
  type PickerChannel,
  type PickerRole,
} from "@/lib/dashboard-community";
import { searchTicketMembers, type MemberHit } from "@/lib/dashboard-guild-ops";
import { buildMinigamePreviewCardDataUrl } from "@/lib/minigame-preview-card";
import { ExpandableTextarea, Field, Notice, Pills, RowsSkeleton, StatusBadge, Toggle, TrackUnsaved, dangerBtn, dashPrimaryBtn, fieldClass, labelClass, miniBtn } from "../bits";
import { ChannelField, DiscordMessagePreview, DraftEditor, EditorWithPreview, roleOptions, useCommunity, useSampleVars, type PreviewRow } from "./shared";

const LEVEL_PLACEHOLDERS = [
  { token: "{user}", hint: "menzione di chi è salito di livello" },
  { token: "{username}", hint: "nome visualizzato" },
  { token: "{level}", hint: "numero del livello raggiunto" },
  { token: "{avatar}", hint: "foto profilo (campi immagine)" },
  { token: "{server}", hint: "nome del server" },
];

const PERKS_PLACEHOLDERS = [
  ...LEVEL_PLACEHOLDERS,
  { token: "{role}", hint: "menzione del ruolo premio" },
  { token: "{perklist}", hint: "i vantaggi di quel livello (scritti qui sotto)" },
  { token: "{perks}", hint: "canale dei vantaggi (menzione)" },
];

const MILESTONE_PLACEHOLDERS = [
  ...LEVEL_PLACEHOLDERS,
  { token: "{role}", hint: "menzione del ruolo premio" },
  { token: "{roleid}", hint: "id del ruolo premio" },
  { token: "{perks}", hint: "canale vantaggi (menzione)" },
];

const MINIGAME_PLACEHOLDERS = [
  { token: "{user}", hint: "menzione del vincitore" },
  { token: "{username}", hint: "nome visualizzato" },
  { token: "{avatar}", hint: "foto profilo" },
  { token: "{role}", hint: "ruolo premio minigiochi" },
  { token: "{exp}", hint: "soglia EXP del premio" },
  { token: "{next}", hint: "testo prossima ricompensa" },
  { token: "{server}", hint: "nome del server" },
];

const BONUS_PLACEHOLDERS = [
  { token: "{user}", hint: "menzione di chi prende il bonus" },
  { token: "{username}", hint: "nome visualizzato" },
  { token: "{amount}", hint: "EXP regalati" },
  { token: "{avatar}", hint: "foto profilo (campi immagine)" },
  { token: "{server}", hint: "nome del server" },
];

type BonusKind = "firstMessageDaily" | "welcomeGreeting";

const BONUS_META: Record<BonusKind, { title: string; text: string; channelsHint: string }> = {
  firstMessageDaily: {
    title: "Primo messaggio del giorno",
    text: "EXP a chi scrive per primo ogni giorno (ora italiana).",
    channelsHint: "Dove conta il primo messaggio. Vuoto = #chat.",
  },
  welcomeGreeting: {
    title: "Saluto di benvenuto",
    text: "EXP a chi dà il benvenuto a un nuovo membro.",
    channelsHint: "Dove conta il saluto. Vuoto = regole attuali del bot.",
  },
};

const DEFAULT_LEVEL_CURVE: LevelsLevelCurve = {
  firstThreshold: 100,
  roundTo: 50,
  minStepAdd: 110,
  segments: [
    { upTo: 10, base: 120, from: 1, perLevel: 25 },
    { upTo: 30, base: 380, from: 10, perLevel: 55 },
    { upTo: 60, base: 1600, from: 30, perLevel: 120 },
    { upTo: 10000, base: 5200, from: 60, perLevel: 210 },
  ],
};

const DEFAULT_COMMAND_COOLDOWN = {
  defaultSeconds: 30,
  tiers: [
    { minLevel: 100, seconds: 0 },
    { minLevel: 50, seconds: 5 },
    { minLevel: 30, seconds: 15 },
  ],
  roles: {
    staff: 0,
    vipPlus: 5,
    vip: 15,
    doubleBooster: 5,
    booster: 15,
  },
  customRoles: [] as { roleId: string; seconds: number }[],
};

const DEFAULT_MINIGAME_DURATION_MS: Record<string, number> = {
  hangman: 240_000,
  findBot: 300_000,
  findBotVoice: 300_000,
  halloweenFindGhost: 300_000,
  halloweenMissingEmoji: 180_000,
  halloweenCountBats: 180_000,
  halloweenTrickOrTreat: 900_000,
};

const DEFAULT_MINIGAME_ROWS: { type: string; rewardExp: number }[] = [
  { type: "guessNumber", rewardExp: 100 },
  { type: "guessWord", rewardExp: 150 },
  { type: "guessFlag", rewardExp: 150 },
  { type: "guessPlayer", rewardExp: 150 },
  { type: "guessSong", rewardExp: 150 },
  { type: "guessCapital", rewardExp: 150 },
  { type: "guessReverseCapital", rewardExp: 150 },
  { type: "guessRegionCapital", rewardExp: 150 },
  { type: "fastType", rewardExp: 200 },
  { type: "guessTeam", rewardExp: 150 },
  { type: "guessSinger", rewardExp: 150 },
  { type: "guessAlbum", rewardExp: 150 },
  { type: "hangman", rewardExp: 200 },
  { type: "italianGK", rewardExp: 150 },
  { type: "drivingQuiz", rewardExp: 150 },
  { type: "mathExpression", rewardExp: 200 },
  { type: "findBot", rewardExp: 200 },
  { type: "findBotVoice", rewardExp: 200 },
  { type: "memoryEmoji", rewardExp: 250 },
  { type: "guessYear", rewardExp: 150 },
  { type: "completeVerse", rewardExp: 150 },
  { type: "guessEmoji", rewardExp: 150 },
  { type: "quoteFilm", rewardExp: 150 },
  { type: "completeProverb", rewardExp: 120 },
  { type: "synonymAntonym", rewardExp: 150 },
  { type: "guessCity", rewardExp: 150 },
  { type: "treasureHunt", rewardExp: 150 },
  { type: "starWarsQuiz", rewardExp: 50 },
  { type: "starWarsGuessPlanet", rewardExp: 50 },
  { type: "halloweenQuiz", rewardExp: 150 },
  { type: "halloweenFindGhost", rewardExp: 200 },
  { type: "halloweenMissingEmoji", rewardExp: 150 },
  { type: "halloweenCountBats", rewardExp: 150 },
  { type: "halloweenTrickOrTreat", rewardExp: 100 },
  { type: "podrace", rewardExp: 100 },
  { type: "cacciatore", rewardExp: 100 },
  { type: "scova", rewardExp: 100 },
  { type: "ordine66", rewardExp: 100 },
  { type: "attacca_base", rewardExp: 100 },
  { type: "conquista", rewardExp: 100 },
  { type: "pg", rewardExp: 100 },
  { type: "reliquie", rewardExp: 100 },
  { type: "convoglio", rewardExp: 100 },
  { type: "ewok", rewardExp: 100 },
  { type: "olocron", rewardExp: 100 },
];

function defaultMinigameRow(type: string, rewardExp: number): NonNullable<LevelsMinigameScoring["rewardExpByType"]>[number] {
  return {
    type,
    rewardExp,
    enabled: true,
    durationMs: DEFAULT_MINIGAME_DURATION_MS[type] || 180_000,
  };
}

const DEFAULT_MINIGAME_SCORING: LevelsMinigameScoring = {
  fastGuess: { windowMs: 30_000, multiplier: 1.5 },
  streak: { bonusPercentPerWin: 10, maxBonusPercent: 50 },
  rewardExpByType: DEFAULT_MINIGAME_ROWS.map((r) => defaultMinigameRow(r.type, r.rewardExp)),
  startDraft: null,
  winDraft: null,
};

const MINIGAME_TYPE_LABELS: Record<string, string> = {
  guessNumber: "Indovina il numero",
  guessWord: "Indovina la parola",
  guessFlag: "Indovina la bandiera",
  guessPlayer: "Indovina il calciatore",
  guessSong: "Indovina la canzone",
  guessCapital: "Indovina la capitale",
  guessReverseCapital: "Capitale al contrario",
  guessRegionCapital: "Capitale di regione",
  fastType: "Scrivi veloce",
  guessTeam: "Indovina la squadra",
  guessSinger: "Indovina il cantante",
  guessAlbum: "Indovina l'album",
  hangman: "Impiccato",
  italianGK: "Quiz italiano",
  drivingQuiz: "Quiz della patente",
  mathExpression: "Espressioni matematiche",
  findBot: "Trova il bot",
  findBotVoice: "Trova il bot (vocale)",
  memoryEmoji: "Memory emoji",
  guessYear: "Indovina l'anno",
  completeVerse: "Completa il verso",
  guessEmoji: "Indovina l'emoji",
  quoteFilm: "Citazione film",
  completeProverb: "Completa il proverbio",
  synonymAntonym: "Sinonimo / contrario",
  guessCity: "Indovina la città",
  treasureHunt: "Caccia al tesoro",
  starWarsQuiz: "Quiz Star Wars",
  starWarsGuessPlanet: "Indovina il pianeta",
  halloweenQuiz: "Quiz Halloween",
  halloweenFindGhost: "Trova il fantasma",
  halloweenMissingEmoji: "Emoji mancante",
  halloweenCountBats: "Conta i pipistrelli",
  halloweenTrickOrTreat: "Dolcetto o scherzetto",
  podrace: "Podrace",
  cacciatore: "Cacciatore di taglie",
  scova: "Scova",
  ordine66: "Ordine 66",
  attacca_base: "Attacca la base",
  conquista: "Conquista",
  pg: "Colleziona PG",
  reliquie: "Reliquie",
  convoglio: "Proteggi il convoglio",
  ewok: "Caccia agli Ewok",
  olocron: "Olocron",
};

function minigameTypeLabel(type: string) {
  return MINIGAME_TYPE_LABELS[type] || type;
}

/** Unisce i tipi salvati con i default (tipi nuovi restano visibili). */
function mergeMinigameRewardExpByType(saved?: LevelsMinigameScoring["rewardExpByType"] | null) {
  const defaults = DEFAULT_MINIGAME_SCORING.rewardExpByType;
  if (!saved?.length) return defaults.map((d) => ({ ...d }));
  const byType = new Map(saved.map((r) => [r.type, r]));
  const out = defaults.map((d) => {
    const s = byType.get(d.type);
    if (!s) return { ...d };
    return {
      ...d,
      ...s,
      type: d.type,
      rewardExp: Math.max(1, Math.floor(Number(s.rewardExp) || d.rewardExp)),
      enabled: s.enabled !== false,
      durationMs: Math.max(15_000, Math.min(1_800_000, Math.floor(Number(s.durationMs) || d.durationMs || 180_000))),
    };
  });
  for (const row of saved) {
    if (!defaults.some((d) => d.type === row.type)) {
      out.push({
        ...defaultMinigameRow(row.type, Math.max(1, Math.floor(Number(row.rewardExp) || 100))),
        ...row,
        enabled: row.enabled !== false,
      });
    }
  }
  return out;
}

const MINIGAME_START_PLACEHOLDERS = [
  { token: "{minigame}", hint: "nome del minigioco (cambia per tipo)" },
  { token: "{prompt}", hint: "riga di gioco del bot (domanda, lettere…)" },
  { token: "{exp}", hint: "EXP del round" },
  { token: "{minutesLabel}", hint: "durata in italiano (**3 minuti**)" },
  { token: "{minutes}", hint: "minuti (numero)" },
  { token: "{duration}", hint: "durata in secondi" },
  { token: "{image}", hint: "immagine del round (bandiera, foto…)" },
  { token: "{server}", hint: "nome del server" },
];

type MinigamePreviewMeta = { prompt: string; /** foto/URL se il round usa un’immagine remota */ image?: string; /** righe sulla card canvas come sul bot */ cardLines?: string[] };

/** Prompt + immagine/card d’esempio per l’anteprima per-tipo (solo dashboard). */
const MINIGAME_PREVIEW: Record<string, MinigamePreviewMeta> = {
  guessNumber: { prompt: "Indovina un numero tra **1** e **100** per ottenere **{exp} exp**.", cardLines: ["Tra 1 e 100"] },
  guessWord: { prompt: "Indovina la parola da queste lettere: **A E L P P** per ottenere **{exp} exp**.", cardLines: ["A E L P P"] },
  guessFlag: {
    prompt: "Indovina la nazione da questa bandiera per ottenere **{exp} exp**.",
    image: "https://flagcdn.com/w320/it.png",
    cardLines: ["Quale nazione è?"],
  },
  guessPlayer: {
    prompt: "Indovina il calciatore più famoso per ottenere **{exp} exp**.",
    image:
      "https://upload.wikimedia.org/wikipedia/commons/thumb/b/b4/Lionel-Messi-Argentina-2022-FIFA-World-Cup_%28cropped%29.jpg/320px-Lionel-Messi-Argentina-2022-FIFA-World-Cup_%28cropped%29.jpg",
    cardLines: ["Chi è questo calciatore?"],
  },
  guessSong: {
    prompt: "Indovina la canzone per ottenere **{exp} exp**.",
    cardLines: ["Ascolta l'anteprima"],
  },
  guessCapital: {
    prompt: "Indovina la capitale di **Italia** per ottenere **{exp} exp**.",
    image: "https://flagcdn.com/w320/it.png",
    cardLines: ["Italia"],
  },
  guessReverseCapital: {
    prompt: "**Roma** è la capitale di quale Stato? Indovina per **{exp} exp**.",
    cardLines: ["Roma"],
  },
  guessRegionCapital: {
    prompt: "Indovina il capoluogo della regione **Lazio** per ottenere **{exp} exp**.",
    cardLines: ["Lazio"],
  },
  fastType: {
    prompt: "Il primo che scrive questa frase ottiene **{exp} exp**.\n",
    cardLines: ["Scrivi questa frase"],
  },
  guessTeam: {
    prompt: "Indovina la squadra di calcio dal logo per ottenere **{exp} exp**.",
    image: "https://upload.wikimedia.org/wikipedia/commons/thumb/0/05/FC_Internazionale_Milano_2021.svg/240px-FC_Internazionale_Milano_2021.svg.png",
    cardLines: ["Quale squadra è?"],
  },
  guessSinger: {
    prompt: "Indovina il cantante dalla foto per ottenere **{exp} exp**.",
    cardLines: ["Cantante"],
  },
  guessAlbum: {
    prompt: "Indovina l'album dalla copertina per ottenere **{exp} exp**.",
    image: "https://upload.wikimedia.org/wikipedia/en/4/42/Beatles_-_Abbey_Road.jpg",
    cardLines: ["Album"],
  },
  hangman: { prompt: "Scrivi una lettera o prova la parola intera per ottenere **{exp} exp**.\nParola: **_ _ _ _ _**", cardLines: ["_ _ _ _ _"] },
  italianGK: { prompt: "**Domanda:** Qual è il fiume più lungo d'Italia? per ottenere **{exp} exp**.", cardLines: ["Qual è il fiume più lungo d'Italia?"] },
  drivingQuiz: {
    prompt: "**Affermazione:** In curva il veicolo tende a sbandare.\nRispondi con `vero` o `falso`.\nRicompensa: **{exp} exp**",
    cardLines: ["In curva il veicolo tende a sbandare.", "Rispondi: Vero o Falso"],
  },
  mathExpression: { prompt: "Risolvi: **12 + 8 × 2** per ottenere **{exp} exp**.", cardLines: ["12 + 8 × 2"] },
  findBot: { prompt: "Trova il messaggio del bot tra i canali del server e reagisci per ottenere **{exp} exp**.", cardLines: ["Trova il bot"] },
  findBotVoice: { prompt: "Il bot si è nascosto in una **vocale vuota**: entra per ottenere **{exp} exp**.", cardLines: ["Trova il bot in vocale"] },
  memoryEmoji: { prompt: "Memorizza la sequenza e riscrivila per ottenere **{exp} exp**.", cardLines: ["⭐ 🎵 🎮 🔥"] },
  guessYear: {
    prompt: "In che anno è uscito **Inception**? Scrivi l'anno per **{exp} exp**.",
    cardLines: ["Inception"],
  },
  completeVerse: {
    prompt: "Completa: **Nel mezzo del cammin di nostra vita…** per **{exp} exp**.",
    cardLines: ["Nel mezzo del cammin di nostra vita…"],
  },
  guessEmoji: { prompt: "Cosa rappresenta **🦁👑**? Scrivi film, serie o canzone per **{exp} exp**.", cardLines: ["🦁👑"] },
  quoteFilm: {
    prompt: '*"Che la forza sia con te"* — Da quale film o serie? **{exp} exp**.',
    cardLines: ['"Che la forza sia con te"'],
  },
  completeProverb: { prompt: "**Chi dorme…** Completa il proverbio per **{exp} exp**.", cardLines: ["Chi dorme…"] },
  synonymAntonym: { prompt: "Scrivi un sinonimo o il contrario di **bello** per **{exp} exp**.", cardLines: ["bello"] },
  guessCity: {
    prompt: "In quale città si trova **il Colosseo**? **{exp} exp**.",
    cardLines: ["Il Colosseo"],
  },
  treasureHunt: {
    prompt: "Sui prossimi messaggi metterò una reaction: trovala e cliccaci sopra per **{exp} exp**.",
    cardLines: ["Trova la reaction nascosta", "nei prossimi messaggi"],
  },
  starWarsQuiz: {
    prompt: "Rispondi alla domanda sull'immagine per ottenere **{exp} exp**.",
    cardLines: ["Quiz Star Wars"],
  },
  starWarsGuessPlanet: {
    prompt: "Indovina il pianeta da questa immagine per ottenere **{exp} exp**.",
    cardLines: ["Pianeta"],
  },
  halloweenQuiz: { prompt: "**Domanda:** Qual è il mostro di Frankenstein? per ottenere **{exp} exp**.", cardLines: ["Quiz Halloween"] },
  halloweenFindGhost: { prompt: "Chi lo trova vince **{exp} exp**.", cardLines: ["Trova il fantasma"] },
  halloweenMissingEmoji: { prompt: "Sequenza: **🎃👻❓🦇** — Chi indovina vince **{exp} exp**.", cardLines: ["🎃👻❓🦇"] },
  halloweenCountBats: { prompt: "🦇🦇🎃🦇 — Quanti 🦇 ci sono? Scrivi il numero per **{exp} exp**.", cardLines: ["🦇🦇🎃🦇"] },
  halloweenTrickOrTreat: { prompt: "Partecipa per ottenere **{exp} exp**.", cardLines: ["Dolcetto o scherzetto"] },
  podrace: { prompt: "Minigioco speciale Star Wars. In palio **{exp} exp**.", cardLines: ["Podrace"] },
  cacciatore: { prompt: "Minigioco speciale Star Wars. In palio **{exp} exp**.", cardLines: ["Cacciatore di taglie"] },
  scova: { prompt: "Minigioco speciale Star Wars. In palio **{exp} exp**.", cardLines: ["Scova"] },
  ordine66: { prompt: "Minigioco speciale Star Wars. In palio **{exp} exp**.", cardLines: ["Ordine 66"] },
  attacca_base: { prompt: "Minigioco speciale Star Wars. In palio **{exp} exp**.", cardLines: ["Attacca la base"] },
  conquista: { prompt: "Minigioco speciale Star Wars. In palio **{exp} exp**.", cardLines: ["Conquista"] },
  pg: { prompt: "Minigioco speciale Star Wars. In palio **{exp} exp**.", cardLines: ["Colleziona PG"] },
  reliquie: { prompt: "Minigioco speciale Star Wars. In palio **{exp} exp**.", cardLines: ["Reliquie"] },
  convoglio: { prompt: "Minigioco speciale Star Wars. In palio **{exp} exp**.", cardLines: ["Proteggi il convoglio"] },
  ewok: { prompt: "Minigioco speciale Star Wars. In palio **{exp} exp**.", cardLines: ["Caccia agli Ewok"] },
  olocron: { prompt: "Minigioco speciale Star Wars. In palio **{exp} exp**.", cardLines: ["Olocron"] },
};

/** Immagine vera generata dal bot se arrivata; poi foto d'esempio; poi card canvas (solo dopo mount client). */
function resolveMinigamePreviewImage(type: string, cardReady: boolean, real?: Record<string, string>) {
  if (real?.[type]) return real[type];
  const meta = MINIGAME_PREVIEW[type];
  if (meta?.image) return meta.image;
  if (!cardReady) return "";
  const title = minigameTypeLabel(type);
  const lines = meta?.cardLines?.length ? meta.cardLines : [title];
  return buildMinigamePreviewCardDataUrl(title, lines) || "";
}

/** Extra UI del round che non sta nel draft (es. bottone canzone). La reaction della caccia sta sui messaggi successivi, non sull’intro. */
function minigamePreviewRows(type: string): PreviewRow[] {
  if (type === "guessSong") {
    return [{ kind: "buttons", items: [{ label: "Ascolta anteprima", style: 2 }] }];
  }
  return [];
}

/** Anteprima: mette sempre l’immagine del round come fa il bot (embed: immagine; V2: galleria in fondo, prima dei pulsanti). */
function minigamePreviewDraft(draft: ReturnType<typeof emptyDraft>, imageUrl?: string | null) {
  if (!imageUrl || !draft) return draft;
  if (draft.v2?.enabled) {
    const blocks = draft.v2.blocks || [];
    /* già messa a mano con {image} o con la stessa foto */
    const has = blocks.some(
      (b) =>
        (b.type === "media" && b.urls.some((u) => u.includes("{image}") || u === imageUrl)) ||
        (b.type === "section" && b.accessory === "thumbnail" && (b.thumbnailUrl.includes("{image}") || b.thumbnailUrl === imageUrl)),
    );
    if (has) return draft;
    let at = blocks.length;
    while (at > 0 && blocks[at - 1]?.type === "buttons") at -= 1;
    const media = { type: "media" as const, urls: [imageUrl] };
    return { ...draft, v2: { ...draft.v2, blocks: [...blocks.slice(0, at), media, ...blocks.slice(at)] } };
  }
  if (!draft.embed) return draft;
  return {
    ...draft,
    embed: { ...draft.embed, enabled: true, imageUrl },
  };
}

function minigameRowPreviewVars(
  row: { type: string; rewardExp: number; durationMs?: number },
  base: Record<string, string>,
  image: string,
) {
  const meta = MINIGAME_PREVIEW[row.type] || { prompt: "Partecipa per ottenere **{exp} exp**." };
  const minutes = Math.max(1, Math.round((row.durationMs || 180000) / 60000));
  const exp = String(row.rewardExp || 150);
  const prompt = meta.prompt.replace(/\{exp\}/g, exp);
  return {
    ...base,
    minigame: minigameTypeLabel(row.type),
    prompt,
    exp,
    duration: String(Math.round((row.durationMs || 180000) / 1000)),
    minutes: String(minutes),
    minutesLabel: minutes === 1 ? "**1 minuto**" : `**${minutes} minuti**`,
    image,
  };
}

const MINIGAME_WIN_PLACEHOLDERS = [
  { token: "{user}", hint: "menzione del vincitore" },
  { token: "{exp}", hint: "EXP guadagnati in questo round" },
  { token: "{total}", hint: "totale EXP minigiochi" },
  { token: "{streak}", hint: "serie di vittorie" },
  { token: "{server}", hint: "nome del server" },
];

type Tab = "exp" | "bonus" | "minigiochi" | "ruoli" | "annunci" | "utenti";

/* ───────────── pezzi grafici ───────────── */

/** Scheda con icona, titolo, testo e (a destra) un interruttore o altro. */
function Card({
  icon: Icon,
  title,
  text,
  aside,
  off,
  className,
  children,
}: {
  icon: LucideIcon;
  title: string;
  text?: string;
  aside?: React.ReactNode;
  off?: boolean;
  className?: string;
  children: React.ReactNode;
}) {
  return (
    <section className={cn("relative rounded-3xl bg-roast/70 p-4 ring-1 ring-sand/10 sm:p-5", className)}>
      <div className="flex items-start gap-3">
        <span className={cn("flex size-10 shrink-0 items-center justify-center rounded-2xl ring-1 transition", off ? "bg-crema/[0.04] text-crema/35 ring-sand/10" : "bg-[#826bc2]/15 text-[#b9a6f0] ring-[#826bc2]/30")}>
          <Icon className="size-[1.1rem]" aria-hidden />
        </span>
        <div className="min-w-0 flex-1">
          <h3 className={cn("font-semibold", off ? "text-crema/55" : "text-crema")}>{title}</h3>
          {text ? <p className="mt-0.5 text-xs leading-relaxed text-crema/55">{text}</p> : null}
        </div>
        {aside ? <div className="flex shrink-0 items-center">{aside}</div> : null}
      </div>
      <div className={cn("mt-4 transition-opacity", off && "pointer-events-none opacity-45")}>{children}</div>
    </section>
  );
}

/** Numero grande con la sua etichetta (EXP per messaggio, al minuto…). */
function BigNumber({
  label,
  value,
  onChange,
  min,
  max,
  step = 1,
  suffix,
  hint,
  disabled,
}: {
  label: string;
  value: number;
  onChange: (v: number) => void;
  min: number;
  max: number;
  step?: number;
  suffix?: string;
  hint?: string;
  disabled?: boolean;
}) {
  return (
    <div className="rounded-2xl bg-espresso/45 p-3.5 ring-1 ring-sand/10">
      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-crema/50">{label}</p>
      <div className="mt-2 flex items-center gap-2">
        <div className="w-36">
          <NumberField className="!mt-0" value={value} min={min} max={max} step={step} disabled={disabled} onChange={(v) => onChange(Number(v) || 0)} aria-label={label} />
        </div>
        {suffix ? <span className="self-center text-sm font-semibold text-crema/60">{suffix}</span> : null}
      </div>
      {hint ? <p className="mt-2 text-xs text-crema/50">{hint}</p> : null}
    </div>
  );
}

const roleColor = (roles: PickerRole[], id: string) => {
  const c = roles.find((r) => r.id === id)?.color;
  return c && c !== "#000000" ? c : "#99aab5";
};

/* ───────────── pannello ───────────── */

export function LevelsPanel({
  guildId,
  token,
  onToast,
  tab = "exp",
}: {
  guildId: string;
  token: string;
  onToast: (msg: string, err?: boolean) => void;
  /** scheda scelta nell'elenco laterale */
  tab?: Tab;
}) {
  const { data } = useCommunity(guildId, token);
  const baseVars = useSampleVars(data);
  const [cfg, setCfg] = useState<LevelsConfig | null>(null);
  const [saved, setSaved] = useState("");
  const [imported, setImported] = useState(false);
  const [loadError, setLoadError] = useState<string | null>(null);
  const [announce, setAnnounce] = useState<"level" | "milestone" | "perks">("level");
  /* livello scelto per scrivere i vantaggi (e per l'anteprima) */
  const [perksLevel, setPerksLevel] = useState<number | null>(null);
  const [gameEditType, setGameEditType] = useState<string | null>(null);
  const [gameDraftKind, setGameDraftKind] = useState<"start" | "win">("start");
  /** Card canvas generate solo a client (SSR non ha document). */
  const [previewCardsReady, setPreviewCardsReady] = useState(false);
  const [isMain, setIsMain] = useState(false);
  const [bonusKind, setBonusKind] = useState<BonusKind>("firstMessageDaily");
  const [event, setEvent] = useState<LevelsEvent | null>(null);
  const [scheduled, setScheduled] = useState<LevelsScheduledEvent[]>([]);

  useEffect(() => {
    setPreviewCardsReady(true);
  }, []);

  /* immagini vere dei round, generate dal bot: quella dell'esempio condiviso e quella del gioco aperto */
  const [realGameImgs, setRealGameImgs] = useState<Record<string, string>>({});
  /* perché l'immagine vera non c'è (fonte giù, canvas mancante, bot non aggiornato…) */
  const [realGameNotes, setRealGameNotes] = useState<Record<string, string>>({});
  const askedGameImgs = useRef(new Set<string>());
  useEffect(() => {
    if (tab !== "minigiochi" || !isMain) return;
    for (const type of ["guessNumber", gameEditType].filter(Boolean) as string[]) {
      if (askedGameImgs.current.has(type)) continue;
      askedGameImgs.current.add(type);
      void communityApi.getMinigamePreview(token, guildId, type).then((r) => {
        if (r.ok && r.data.image) setRealGameImgs((m) => ({ ...m, [type]: r.data.image }));
        else askedGameImgs.current.delete(type);
        const note = r.ok ? r.data.note || "" : r.message;
        setRealGameNotes((m) => ({ ...m, [type]: note }));
      });
    }
  }, [tab, isMain, gameEditType, token, guildId]);

  useEffect(() => {
    let alive = true;
    void communityApi.getLevels(token, guildId).then((r) => {
      if (!alive) return;
      if (!r.ok) return setLoadError(r.message);
      setCfg(r.data.config);
      setSaved(JSON.stringify(r.data.config));
      setImported(r.data.imported === true);
      setIsMain(r.data.isMainGuild === true);
      setEvent(r.data.event || null);
      setScheduled(r.data.scheduled || []);
    });
    return () => {
      alive = false;
    };
  }, [guildId, token]);

  /* {role}: premio livelli, oppure premio minigiochi nell'anteprima minigiochi */
  const sampleLevelRoleId = cfg?.roleRewards?.[0]?.roleId || data?.pickers.roles.find((r) => !r.managed && r.id !== guildId)?.id || "";
  const sampleMinigameRoleId = cfg?.minigameRewards?.[0]?.roleId || "";
  const sampleMinigameExp = cfg?.minigameRewards?.[0]?.exp || 500;
  const perksRewards = [...(cfg?.roleRewards || [])].sort((a, b) => a.level - b.level);
  const perksSel = perksRewards.find((r) => r.level === perksLevel) || perksRewards[0] || null;
  const perksSelLevel = String(perksSel?.level || 10);
  const perksSelText = perksSel?.perks?.trim() || "—";
  const perksChannelName = data?.pickers.textChannels.find((c) => c.id === cfg?.perksChannelId)?.name || "supporters";
  const sampleRoleId = announce === "perks" ? perksSel?.roleId || sampleLevelRoleId : sampleLevelRoleId;
  const sampleMinigameMention = sampleMinigameRoleId ? `<@&${sampleMinigameRoleId}>` : "@Rookie";
  /* niente useMemo: ci pensa il React Compiler */
  const vars = {
    ...baseVars,
    user: baseVars.user || "@Mario",
    username: baseVars.username || "Mario",
    level: "42",
    role: sampleRoleId ? `<@&${sampleRoleId}>` : "@Level 50",
    roleid: sampleRoleId || "100000000000000050",
    perks: "#supporters",
    exp: String(sampleMinigameExp),
    amount: "150",
    next: "Ti mancano **200** exp per la prossima ricompensa!",
    ...(announce === "perks"
      ? { level: perksSelLevel, perklist: perksSelText, perks: `#${perksChannelName}` }
      : {}),
  };
  const minigameVars = {
    ...baseVars,
    user: baseVars.user || "@Mario",
    username: baseVars.username || "Mario",
    role: sampleMinigameMention,
    roleid: sampleMinigameRoleId || "100000000000000500",
    exp: String(sampleMinigameExp),
    next: "Ti mancano **200** exp per la prossima ricompensa!",
  };

  if (loadError && !cfg) return <Notice error>{loadError}</Notice>;
  if (!cfg || !data) return <RowsSkeleton rows={8} />;

  const dirty = JSON.stringify(cfg) !== saved;
  const channels = data.pickers.textChannels;
  const pickerRoles = data.pickers.roles;
  const roles = roleOptions(pickerRoles, guildId);
  const set = (patch: Partial<LevelsConfig>) => setCfg({ ...cfg, ...patch });

  const save = async () => {
    const r = await communityApi.saveLevels(token, guildId, cfg);
    if (!r.ok) return onToast(r.message, true);
    setCfg(r.data.config);
    setSaved(JSON.stringify(r.data.config));
    setImported(false);
    onToast("Livelli e EXP salvati.");
  };
  const reset = () => {
    try {
      setCfg(JSON.parse(saved));
    } catch {
      /* ignore */
    }
  };

  const setReward = (i: number, patch: Partial<LevelsRoleReward>) => set({ roleRewards: cfg.roleRewards.map((row, idx) => (idx === i ? { ...row, ...patch } : row)) });
  const setMult = (i: number, patch: Partial<LevelsRoleMultiplier>) =>
    set({ roleMultipliers: cfg.roleMultipliers.map((row, idx) => (idx === i ? { ...row, ...patch } : row)) });

  /* premi in ordine di livello, ricordando la posizione originale per modificarli */
  const rewards = cfg.roleRewards.map((row, i) => ({ row, i })).sort((a, b) => a.row.level - b.row.level);
  const nextRewardLevel = (cfg.roleRewards.reduce((m, r) => Math.max(m, r.level), 0) || 0) + 10;
  const mults = cfg.roleMultipliers.map((row, i) => ({ row, i }));
  const voicePerHour = Math.round(cfg.voiceExpPerMinute * 60 * cfg.globalMultiplier);
  const games = (cfg.minigameRewards || []).map((row, i) => ({ row, i })).sort((a, b) => a.row.exp - b.row.exp);
  const setGame = (i: number, patch: Partial<{ exp: number; roleId: string }>) =>
    set({ minigameRewards: (cfg.minigameRewards || []).map((row, idx) => (idx === i ? { ...row, ...patch } : row)) });
  const nextGameExp = Math.max(500, ...(cfg.minigameRewards || []).map((r) => r.exp * 2));

  return (
    <div className="space-y-4">
      <TrackUnsaved dirty={dirty} onSave={save} onReset={reset} />
      {imported ? (
        <Notice>Ho importato tassi, moltiplicatori, canali bloccati e ruoli premio che il bot usa già su questo server. Puoi cambiarli liberamente da qui.</Notice>
      ) : null}

      {tab === "exp" ? (
        <div className="space-y-4">
          <div className="grid gap-4 lg:grid-cols-2">
            <Card
              icon={MessageSquare}
              title="Chat"
              text="EXP per ogni messaggio che conta."
              off={!cfg.messageEnabled}
              aside={<Toggle checked={cfg.messageEnabled} onChange={(messageEnabled) => set({ messageEnabled })} label="EXP dai messaggi" />}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <BigNumber label="EXP per messaggio" value={cfg.messageExp} min={0} max={500} onChange={(messageExp) => set({ messageExp })} suffix="EXP" />
                <BigNumber
                  label="Pausa tra un premio e l'altro"
                  value={cfg.messageCooldownSec}
                  min={0}
                  max={3600}
                  onChange={(messageCooldownSec) => set({ messageCooldownSec })}
                  suffix="sec"
                  hint={cfg.messageCooldownSec > 0 ? "Contro lo spam di messaggi brevi." : "0 = ogni messaggio dà EXP."}
                />
              </div>
            </Card>
            <Card
              icon={Mic}
              title="Vocale"
              text="EXP per ogni minuto passato in un canale vocale."
              off={!cfg.voiceEnabled}
              aside={<Toggle checked={cfg.voiceEnabled} onChange={(voiceEnabled) => set({ voiceEnabled })} label="EXP dal vocale" />}
            >
              <div className="grid gap-3 sm:grid-cols-2">
                <BigNumber label="EXP al minuto" value={cfg.voiceExpPerMinute} min={0} max={500} onChange={(voiceExpPerMinute) => set({ voiceExpPerMinute })} suffix="EXP" />
                <div className="rounded-2xl bg-[#826bc2]/10 p-3.5 ring-1 ring-[#826bc2]/20">
                  <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-crema/50">Un&apos;ora in vocale</p>
                  <p className="mt-2 flex h-10 items-center font-display text-2xl font-semibold text-crema lining-nums">≈ {voicePerHour.toLocaleString("it-IT")} EXP</p>
                  <p className="mt-2 text-xs text-crema/50">col moltiplicatore globale, senza bonus dei ruoli</p>
                </div>
              </div>
            </Card>
          </div>

          <Card icon={Sparkles} title="Moltiplicatori" text="Il globale vale per tutti; chi ha un ruolo con bonus prende il più alto dei suoi ruoli in più, fino al tetto.">
            <div className="grid gap-3 sm:grid-cols-2">
              <BigNumber
                label="Moltiplicatore globale"
                value={cfg.globalMultiplier}
                min={0.1}
                max={50}
                step={0.1}
                onChange={(v) => set({ globalMultiplier: Math.max(0.1, v || 1) })}
                suffix="×"
                hint="Gli eventi temporanei si aggiungono sopra."
              />
              <BigNumber
                label="Tetto massimo"
                value={cfg.maxCombinedMultiplier}
                min={1}
                max={50}
                step={0.1}
                onChange={(v) => set({ maxCombinedMultiplier: Math.max(1, v || 8) })}
                suffix="×"
                hint="Globale + bonus ruolo non vanno oltre."
              />
            </div>

            <div className="mt-5">
              <div className="mb-2 flex items-center justify-between gap-2">
                <p className={labelClass}>Bonus per ruolo</p>
                <StatusBadge>{cfg.roleMultipliers.length} ruoli</StatusBadge>
              </div>
              {mults.length ? (
                <ul className="grid gap-2 sm:grid-cols-2">
                  {mults.map(({ row, i }) => (
                    <li key={i} className="flex items-center gap-2 rounded-2xl bg-espresso/45 p-2 pl-3 ring-1 ring-sand/10">
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: roleColor(pickerRoles, row.roleId) }} aria-hidden />
                      <div className="min-w-0 flex-1">
                        <Select value={row.roleId} onChange={(roleId) => setMult(i, { roleId })} options={roles} className={cn(fieldClass, "!mt-0")} aria-label="Ruolo" />
                      </div>
                      <div className="w-36 shrink-0">
                        <NumberField className="!mt-0" value={row.multiplier} min={0.1} max={20} step={0.05} onChange={(v) => setMult(i, { multiplier: Math.max(0.1, Number(v) || 1) })} aria-label="Moltiplicatore del ruolo" />
                      </div>
                      <button type="button" className={cn(miniBtn, "!px-2")} onClick={() => set({ roleMultipliers: cfg.roleMultipliers.filter((_, j) => j !== i) })} aria-label="Togli il bonus">
                        <Trash2 className="size-3.5" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ul>
              ) : (
                <p className="rounded-2xl border border-dashed border-sand/15 px-4 py-5 text-center text-sm text-crema/50">Nessun ruolo con bonus: tutti guadagnano col solo moltiplicatore globale.</p>
              )}
              <button
                type="button"
                className={cn(miniBtn, "mt-2")}
                disabled={!roles.length}
                onClick={() => set({ roleMultipliers: [...cfg.roleMultipliers, { roleId: roles.find((r) => !cfg.roleMultipliers.some((m) => m.roleId === r.value))?.value || roles[0]?.value || "", multiplier: 1.5 }] })}
              >
                <Plus className="size-3.5" aria-hidden /> Aggiungi bonus
              </button>
            </div>
          </Card>

          <EventCard
            guildId={guildId}
            token={token}
            channels={channels}
            event={event}
            scheduled={scheduled}
            onChange={(e, list) => {
              setEvent(e);
              setScheduled(list);
            }}
            onToast={onToast}
          />

          <Card
            icon={LineChart}
            title="Curva livelli"
            text="Quanti EXP servono per salire di livello. Le modifiche valgono per i progressi nuovi; gli EXP già accumulati restano quelli che sono."
          >
            {(() => {
              const curve: LevelsLevelCurve = { ...DEFAULT_LEVEL_CURVE, ...cfg.levelCurve, segments: cfg.levelCurve?.segments?.length ? cfg.levelCurve.segments : DEFAULT_LEVEL_CURVE.segments };
              const setCurve = (patch: Partial<LevelsLevelCurve>) => set({ levelCurve: { ...curve, ...patch } });
              const setSeg = (i: number, patch: Partial<(typeof curve.segments)[0]>) =>
                setCurve({ segments: curve.segments.map((row, idx) => (idx === i ? { ...row, ...patch } : row)) });
              const segs = curve.segments.map((row, i) => ({ row, i }));
              return (
                <div className="space-y-4">
                  <div className="grid gap-3 sm:grid-cols-3">
                    <BigNumber
                      label="Prima soglia"
                      value={curve.firstThreshold}
                      min={1}
                      max={1_000_000}
                      onChange={(firstThreshold) => setCurve({ firstThreshold: Math.max(1, Math.floor(firstThreshold || 1)) })}
                      suffix="EXP"
                      hint="EXP per passare al livello 1."
                    />
                    <BigNumber
                      label="Arrotondamento"
                      value={curve.roundTo}
                      min={1}
                      max={1000}
                      onChange={(roundTo) => setCurve({ roundTo: Math.max(1, Math.floor(roundTo || 1)) })}
                      hint="Passo di arrotondamento delle soglie."
                    />
                    <BigNumber
                      label="Incremento minimo"
                      value={curve.minStepAdd}
                      min={0}
                      max={1_000_000}
                      onChange={(minStepAdd) => setCurve({ minStepAdd: Math.max(0, Math.floor(minStepAdd || 0)) })}
                      suffix="EXP"
                      hint="Salto minimo tra un livello e l'altro."
                    />
                  </div>
                  <div>
                    <div className="mb-2 flex items-center justify-between gap-2">
                      <p className={labelClass}>Segmenti</p>
                      <StatusBadge>{curve.segments.length} fasce</StatusBadge>
                    </div>
                    {segs.length ? (
                      <ul className="space-y-2">
                        {segs.map(({ row, i }) => (
                          <li key={i} className="flex flex-wrap items-center gap-2 rounded-2xl bg-espresso/45 p-2 pl-3 ring-1 ring-sand/10">
                            <span className="text-[0.7rem] font-bold uppercase tracking-wider text-crema/45">Fino al lv</span>
                            <div className="w-36 shrink-0 sm:w-40">
                              <NumberField className="!mt-0" size="sm" value={row.upTo} min={1} max={100000} onChange={(v) => setSeg(i, { upTo: Math.max(1, Math.floor(Number(v) || 1)) })} aria-label="Livello massimo del segmento" />
                            </div>
                            <span className="text-[0.7rem] font-bold uppercase tracking-wider text-crema/45">Base</span>
                            <div className="w-36 shrink-0 sm:w-40">
                              <NumberField className="!mt-0" size="sm" value={row.base} min={1} max={1_000_000} onChange={(v) => setSeg(i, { base: Math.max(1, Math.floor(Number(v) || 1)) })} aria-label="EXP base del segmento" />
                            </div>
                            <span className="text-[0.7rem] font-bold uppercase tracking-wider text-crema/45">Da lv</span>
                            <div className="w-32 shrink-0 sm:w-36">
                              <NumberField className="!mt-0" size="sm" value={row.from} min={0} max={100000} onChange={(v) => setSeg(i, { from: Math.max(0, Math.floor(Number(v) || 0)) })} aria-label="Livello iniziale del segmento" />
                            </div>
                            <span className="text-[0.7rem] font-bold uppercase tracking-wider text-crema/45">+ / lv</span>
                            <div className="w-36 shrink-0 sm:w-40">
                              <NumberField className="!mt-0" size="sm" value={row.perLevel} min={0} max={1_000_000} onChange={(v) => setSeg(i, { perLevel: Math.max(0, Math.floor(Number(v) || 0)) })} aria-label="EXP aggiuntivi per livello" />
                            </div>
                            <button
                              type="button"
                              className={cn(miniBtn, "!px-2")}
                              disabled={curve.segments.length <= 1}
                              onClick={() => setCurve({ segments: curve.segments.filter((_, j) => j !== i) })}
                              aria-label="Togli segmento"
                            >
                              <Trash2 className="size-3.5" aria-hidden />
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="rounded-2xl border border-dashed border-sand/15 px-4 py-5 text-center text-sm text-crema/50">Nessun segmento: serve almeno una fascia.</p>
                    )}
                    <button
                      type="button"
                      className={cn(miniBtn, "mt-2")}
                      onClick={() => {
                        const last = curve.segments[curve.segments.length - 1];
                        const upTo = (last?.upTo || 0) + 10;
                        setCurve({
                          segments: [
                            ...curve.segments,
                            { upTo, base: last?.base || 100, from: last?.upTo || 1, perLevel: last?.perLevel || 25 },
                          ],
                        });
                      }}
                    >
                      <Plus className="size-3.5" aria-hidden /> Aggiungi segmento
                    </button>
                  </div>
                </div>
              );
            })()}
          </Card>

          {isMain ? (
            <Card icon={Trophy} title="TOP attività" text="Canale degli annunci TOP, ruoli esclusi dal conteggio e ruoli assegnati ai vincitori. Il TOP minigiochi è nella scheda Minigiochi.">
              {(() => {
                const aw: LevelsActivityWinners = {
                  channelId: null,
                  excludedRoleIds: [],
                  weeklyTextRoleId: null,
                  weeklyVoiceRoleId: null,
                  weeklyMinigameRoleId: null,
                  monthlyMemberRoleId: null,
                  ...cfg.activityWinners,
                };
                const setAw = (patch: Partial<LevelsActivityWinners>) => set({ activityWinners: { ...aw, ...patch } });
                const roleSelect = (value: string | null, onChange: (v: string | null) => void, label: string) => (
                  <Select value={value || ""} onChange={(v) => onChange(v || null)} options={[{ value: "", label: "Nessuno" }, ...roles]} className={fieldClass} aria-label={label} />
                );
                return (
                  <div className="grid gap-3 sm:grid-cols-2">
                    <Field label="Canale annunci">
                      <Select
                        value={aw.channelId || ""}
                        onChange={(v) => setAw({ channelId: v || null })}
                        options={[{ value: "", label: "Predefinito" }, ...channels.map((c) => ({ value: c.id, label: `#${c.name}` }))]}
                        className={fieldClass}
                        aria-label="Canale TOP attività"
                      />
                    </Field>
                    <Field label="Ruoli esclusi" hint="Staff e simili non entrano nelle classifiche.">
                      <MultiSelect value={aw.excludedRoleIds} onChange={(excludedRoleIds) => setAw({ excludedRoleIds })} options={roles} className={fieldClass} placeholder="Nessuno" />
                    </Field>
                    <Field label="TOP chat settimanale">{roleSelect(aw.weeklyTextRoleId, (weeklyTextRoleId) => setAw({ weeklyTextRoleId }), "TOP chat settimanale")}</Field>
                    <Field label="TOP vocale settimanale">{roleSelect(aw.weeklyVoiceRoleId, (weeklyVoiceRoleId) => setAw({ weeklyVoiceRoleId }), "TOP vocale settimanale")}</Field>
                    <Field label="Membro del mese">{roleSelect(aw.monthlyMemberRoleId, (monthlyMemberRoleId) => setAw({ monthlyMemberRoleId }), "Membro del mese")}</Field>
                  </div>
                );
              })()}
            </Card>
          ) : null}

          <Card icon={Ban} title="Esclusioni" text="Dove e per chi l'EXP non conta.">
            <div className="grid gap-3 sm:grid-cols-2">
              <Field label="Canali senza EXP" hint="Messaggi e vocale qui non danno EXP.">
                <MultiSelect value={cfg.lockedChannelIds} onChange={(lockedChannelIds) => set({ lockedChannelIds })} options={channels.map((c) => ({ value: c.id, label: `#${c.name}` }))} className={fieldClass} placeholder="Nessuno" />
              </Field>
              <Field label="Ruoli senza EXP" hint="Chi ha uno di questi ruoli non guadagna EXP.">
                <MultiSelect value={cfg.ignoredRoleIds} onChange={(ignoredRoleIds) => set({ ignoredRoleIds })} options={roles} className={fieldClass} placeholder="Nessuno" />
              </Field>
            </div>
          </Card>

          <Card icon={Timer} title="Cooldown comandi" text="Secondi di attesa tra un comando e l’altro. Vale il minore tra livello e ruolo (Staff / VIP / Boost).">
            {(() => {
              const cd = {
                ...DEFAULT_COMMAND_COOLDOWN,
                ...(cfg.commandCooldown || {}),
                roles: { ...DEFAULT_COMMAND_COOLDOWN.roles, ...(cfg.commandCooldown?.roles || {}) },
                customRoles: [...(cfg.commandCooldown?.customRoles || DEFAULT_COMMAND_COOLDOWN.customRoles)],
              };
              const tiers = [...(cd.tiers || [])].sort((a, b) => b.minLevel - a.minLevel);
              const setCd = (patch: Partial<typeof cd>) => set({ commandCooldown: { ...cd, ...patch } });
              const setTier = (i: number, patch: Partial<(typeof tiers)[0]>) => {
                const next = tiers.map((row, idx) => (idx === i ? { ...row, ...patch } : row));
                setCd({ tiers: next });
              };
              const setRole = (key: keyof typeof cd.roles, seconds: number) =>
                setCd({ roles: { ...cd.roles, [key]: Math.max(0, Math.floor(seconds || 0)) } });
              const roleRows: { key: keyof typeof cd.roles; label: string }[] = [
                { key: "staff", label: "Staff" },
                { key: "vipPlus", label: "VIP+" },
                { key: "vip", label: "VIP" },
                { key: "doubleBooster", label: "Double Boost" },
                { key: "booster", label: "Booster" },
              ];
              return (
                <div className="space-y-3">
                  <div className="max-w-xs">
                    <BigNumber label="Cooldown di base" value={cd.defaultSeconds} min={0} max={3600} onChange={(v) => setCd({ defaultSeconds: Math.max(0, Math.floor(v || 0)) })} suffix="sec" hint="Senza soglia di livello." />
                  </div>
                  <div className="grid gap-2 sm:grid-cols-2 lg:grid-cols-3">
                    {roleRows.map(({ key, label }) => (
                      <div key={key} className="rounded-2xl bg-espresso/45 p-3 ring-1 ring-sand/10">
                        <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-crema/50">{label}</p>
                        <div className="mt-2 flex items-center gap-2">
                          <div className="w-28">
                            <NumberField className="!mt-0" value={cd.roles[key]} min={0} max={3600} onChange={(v) => setRole(key, Number(v) || 0)} aria-label={`Cooldown ${label}`} />
                          </div>
                          <span className="text-xs text-crema/50">sec</span>
                        </div>
                      </div>
                    ))}
                  </div>
                  <div className="mt-3">
                    <p className={cn(labelClass, "mb-2")}>Altri ruoli</p>
                    {cd.customRoles.length ? (
                      <ul className="space-y-2">
                        {cd.customRoles.map((row, i) => (
                          <li key={i} className="flex flex-wrap items-center gap-2 rounded-2xl bg-espresso/45 p-2 pl-3 ring-1 ring-sand/10">
                            <span className="size-2.5 shrink-0 rounded-full" style={{ background: roleColor(pickerRoles, row.roleId) }} aria-hidden />
                            <div className="min-w-[10rem] flex-1">
                              <Select
                                value={row.roleId}
                                onChange={(roleId) =>
                                  setCd({
                                    customRoles: cd.customRoles.map((r, idx) => (idx === i ? { ...r, roleId } : r)),
                                  })
                                }
                                options={roles}
                                className={cn(fieldClass, "!mt-0")}
                                aria-label="Ruolo cooldown"
                              />
                            </div>
                            <div className="w-28">
                              <NumberField
                                className="!mt-0"
                                value={row.seconds}
                                min={0}
                                max={3600}
                                onChange={(v) =>
                                  setCd({
                                    customRoles: cd.customRoles.map((r, idx) => (idx === i ? { ...r, seconds: Math.max(0, Math.floor(Number(v) || 0)) } : r)),
                                  })
                                }
                                aria-label="Secondi cooldown ruolo"
                              />
                            </div>
                            <span className="text-xs text-crema/50">sec</span>
                            <button
                              type="button"
                              className={cn(miniBtn, "!px-2")}
                              onClick={() => setCd({ customRoles: cd.customRoles.filter((_, j) => j !== i) })}
                              aria-label="Togli ruolo"
                            >
                              <Trash2 className="size-3.5" aria-hidden />
                            </button>
                          </li>
                        ))}
                      </ul>
                    ) : (
                      <p className="rounded-2xl border border-dashed border-sand/15 px-4 py-4 text-center text-sm text-crema/50">Nessun ruolo extra: oltre Staff/VIP/Boost.</p>
                    )}
                    <button
                      type="button"
                      className={cn(miniBtn, "mt-2")}
                      disabled={!roles.length}
                      onClick={() =>
                        setCd({
                          customRoles: [
                            ...cd.customRoles,
                            { roleId: roles.find((r) => !cd.customRoles.some((c) => c.roleId === r.value))?.value || roles[0]?.value || "", seconds: 15 },
                          ],
                        })
                      }
                    >
                      <Plus className="size-3.5" aria-hidden /> Aggiungi ruolo
                    </button>
                  </div>
                  {tiers.length ? (
                    <ul className="space-y-2">
                      {tiers.map((row, i) => (
                        <li key={i} className="flex flex-wrap items-center gap-2 rounded-2xl bg-espresso/45 p-2 pl-3 ring-1 ring-sand/10">
                          <span className="text-[0.7rem] font-bold uppercase tracking-wider text-crema/45">Dal lv</span>
                          <div className="w-28">
                            <NumberField className="!mt-0" value={row.minLevel} min={1} max={10000} onChange={(v) => setTier(i, { minLevel: Math.max(1, Number(v) || 1) })} aria-label="Livello soglia cooldown" />
                          </div>
                          <ArrowRight className="size-3.5 text-crema/40" aria-hidden />
                          <div className="w-28">
                            <NumberField className="!mt-0" value={row.seconds} min={0} max={3600} onChange={(v) => setTier(i, { seconds: Math.max(0, Number(v) || 0) })} aria-label="Secondi cooldown" />
                          </div>
                          <span className="text-xs text-crema/50">sec</span>
                          <button type="button" className={cn(miniBtn, "!px-2")} onClick={() => setCd({ tiers: tiers.filter((_, j) => j !== i) })} aria-label="Togli soglia">
                            <Trash2 className="size-3.5" aria-hidden />
                          </button>
                        </li>
                      ))}
                    </ul>
                  ) : (
                    <p className="rounded-2xl border border-dashed border-sand/15 px-4 py-4 text-center text-sm text-crema/50">Nessuna soglia: vale solo il cooldown di base.</p>
                  )}
                  <button
                    type="button"
                    className={cn(miniBtn)}
                    onClick={() =>
                      setCd({
                        tiers: [...tiers, { minLevel: (tiers.reduce((m, t) => Math.max(m, t.minLevel), 0) || 0) + 10, seconds: 5 }],
                      })
                    }
                  >
                    <Plus className="size-3.5" aria-hidden /> Aggiungi soglia
                  </button>
                </div>
              );
            })()}
          </Card>
        </div>
      ) : null}

      {tab === "bonus"
        ? (() => {
            const fallback = (k: BonusKind): LevelsExpBonus => ({ enabled: true, amount: k === "firstMessageDaily" ? 150 : 30, channelIds: [] as string[] });
            const first = cfg.bonuses?.firstMessageDaily || fallback("firstMessageDaily");
            const welcome = cfg.bonuses?.welcomeGreeting || fallback("welcomeGreeting");
            const cur = bonusKind === "firstMessageDaily" ? first : welcome;
            const meta = BONUS_META[bonusKind];
            const setBonus = (patch: Partial<typeof cur>) =>
              set({
                bonuses: {
                  firstMessageDaily: bonusKind === "firstMessageDaily" ? { ...first, ...patch } : first,
                  welcomeGreeting: bonusKind === "welcomeGreeting" ? { ...welcome, ...patch } : welcome,
                },
              });
            const draft = cur.noticeDraft || emptyDraft();
            return (
              <div className="space-y-4">
                <Pills
                  value={bonusKind}
                  onChange={setBonusKind}
                  ariaLabel="Quale bonus"
                  options={[
                    { id: "firstMessageDaily", label: BONUS_META.firstMessageDaily.title, icon: Sunrise },
                    { id: "welcomeGreeting", label: BONUS_META.welcomeGreeting.title, icon: HandHeart },
                  ]}
                />

                <Card
                  icon={bonusKind === "firstMessageDaily" ? Sunrise : HandHeart}
                  title={meta.title}
                  text={meta.text}
                  off={!cur.enabled}
                  aside={<Toggle checked={cur.enabled} onChange={(enabled) => setBonus({ enabled })} label={meta.title} />}
                >
                  <div className="grid gap-3 sm:grid-cols-[minmax(0,14rem)_minmax(0,1fr)]">
                    <BigNumber label="EXP regalati" value={cur.amount} min={0} max={100000} onChange={(amount) => setBonus({ amount })} suffix="EXP" />
                    <div className="rounded-2xl bg-espresso/45 p-3.5 ring-1 ring-sand/10">
                      <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-crema/50">Canali</p>
                      <MultiSelect
                        value={cur.channelIds}
                        onChange={(channelIds) => setBonus({ channelIds })}
                        options={channels.map((c) => ({ value: c.id, label: `#${c.name}` }))}
                        className={cn(fieldClass, "mt-2")}
                        placeholder="Predefinito"
                      />
                      <p className="mt-2 text-xs text-crema/50">{meta.channelsHint}</p>
                    </div>
                  </div>
                </Card>

                <p className="text-xs text-crema/55">Il bot risponde al messaggio di chi prende il bonus.{bonusKind === "welcomeGreeting" ? " Il messaggio si cancella da solo dopo 12 secondi." : ""}</p>

                {bonusKind === "welcomeGreeting" ? (
                  <Field label="Parole di saluto" hint="Una per riga. Vuoto = l’elenco predefinito del bot (wordReactions).">
                    <ExpandableTextarea
                      value={(welcome.words || []).join("\n")}
                      rows={5}
                      maxLength={8000}
                      placeholder={"Benvenut*\nBenvenuto\nCiao\n..."}
                      onChange={(e) => {
                        const words = e.target.value
                          .split(/\r?\n/)
                          .map((w) => w.trim())
                          .filter(Boolean)
                          .slice(0, 80);
                        setBonus({ words });
                      }}
                      className={cn(fieldClass, "!mt-0 min-h-28 resize-y py-2.5 font-mono text-[0.8rem] leading-relaxed")}
                      aria-label="Parole che fanno scattare il saluto"
                    />
                  </Field>
                ) : null}

                <EditorWithPreview
                  editor={
                    <DraftEditor
                      key={`bonus-${bonusKind}`}
                      value={draft}
                      onChange={(noticeDraft) => setBonus({ noticeDraft })}
                      emojis={data.pickers.emojis}
                      placeholders={BONUS_PLACEHOLDERS}
                      maxButtons={data.limits.buttons}
                    />
                  }
                  preview={
                    <DiscordMessagePreview
                      testChannelId={cur.channelIds[0] || undefined}
                      bot={data.bot}
                      draft={draft}
                      vars={{ ...vars, amount: String(cur.amount), exp: String(cur.amount) }}
                      roles={pickerRoles}
                      channels={channels}
                    />
                  }
                />
              </div>
            );
          })()
        : null}

      {tab === "ruoli" ? (
        <div className="space-y-4">
          <Card icon={Trophy} title="Ruoli premio" text="Arrivato al livello, il bot dà il ruolo. Chi lo supera senza averlo lo riceve lo stesso.">
            {rewards.length ? (
              <ol className="relative space-y-2 pl-5 before:absolute before:bottom-3 before:left-[0.55rem] before:top-3 before:w-px before:bg-gradient-to-b before:from-[#826bc2]/60 before:to-transparent">
                {rewards.map(({ row, i }) => (
                  <li key={i} className="relative flex flex-wrap items-center gap-2 rounded-2xl bg-espresso/45 p-2 pl-3 ring-1 ring-sand/10">
                    <span className="absolute -left-[1.15rem] top-1/2 size-2.5 -translate-y-1/2 rounded-full bg-[#826bc2] ring-4 ring-roast" aria-hidden />
                    <span className="text-[0.7rem] font-bold uppercase tracking-wider text-crema/45">Lv</span>
                    <div className="w-36 shrink-0">
                      <NumberField className="!mt-0" value={row.level} min={1} max={10000} onChange={(v) => setReward(i, { level: Math.max(1, Number(v) || 1) })} aria-label="Livello del premio" />
                    </div>
                    <span className="size-2.5 shrink-0 rounded-full" style={{ background: roleColor(pickerRoles, row.roleId) }} aria-hidden />
                    <div className="min-w-[10rem] flex-1">
                      <Select value={row.roleId} onChange={(roleId) => setReward(i, { roleId })} options={roles} className={cn(fieldClass, "!mt-0")} aria-label="Ruolo premio" />
                    </div>
                    <button type="button" className={cn(miniBtn, "!px-2")} onClick={() => set({ roleRewards: cfg.roleRewards.filter((_, j) => j !== i) })} aria-label="Togli il premio">
                      <Trash2 className="size-3.5" aria-hidden />
                    </button>
                  </li>
                ))}
              </ol>
            ) : (
              <p className="rounded-2xl border border-dashed border-sand/15 px-4 py-5 text-center text-sm text-crema/50">Nessun ruolo premio: si sale di livello e basta.</p>
            )}
            <button
              type="button"
              className={cn(miniBtn, "mt-3")}
              disabled={!roles.length}
              onClick={() => set({ roleRewards: [...cfg.roleRewards, { level: nextRewardLevel, roleId: roles[0]?.value || "" }] })}
            >
              <Plus className="size-3.5" aria-hidden /> Aggiungi premio (livello {nextRewardLevel})
            </button>
          </Card>

          <Card
            icon={Gift}
            title="Ruolo vantaggio"
            text="Un ruolo in più da un certo livello, per esempio i permessi per mandare foto."
            aside={cfg.perkRoleId ? <StatusBadge tone="accent">dal livello {cfg.perkMinLevel}</StatusBadge> : <StatusBadge>nessuno</StatusBadge>}
          >
            <div className="grid gap-3 sm:grid-cols-[minmax(0,1fr)_10rem]">
              <Field label="Ruolo">
                <Select value={cfg.perkRoleId || ""} onChange={(v) => set({ perkRoleId: v || null })} options={[{ value: "", label: "Nessuno" }, ...roles]} className={fieldClass} />
              </Field>
              <Field label="Dal livello">
                <div className="mt-1.5">
                  <NumberField className="!mt-0" value={cfg.perkMinLevel} min={0} max={10000} disabled={!cfg.perkRoleId} onChange={(v) => set({ perkMinLevel: Math.max(0, Number(v) || 0) })} aria-label="Livello del ruolo vantaggio" />
                </div>
              </Field>
            </div>
          </Card>

          {isMain ? (
            <Card
              icon={Star}
              title="Recensione sul sito"
              text="Livelli regalati a chi lascia una recensione della community su viniliecaffe.it/recensioni (una volta sola). Non usa Disboard."
              aside={(cfg.reviewRewardLevels ?? 5) > 0 ? <StatusBadge tone="accent">+{cfg.reviewRewardLevels ?? 5} livelli</StatusBadge> : <StatusBadge>spento</StatusBadge>}
            >
              <div className="max-w-xs">
                <BigNumber
                  label="Livelli in regalo"
                  value={cfg.reviewRewardLevels ?? 5}
                  min={0}
                  max={100}
                  onChange={(v) => set({ reviewRewardLevels: Math.max(0, Math.floor(v || 0)) })}
                  suffix="livelli"
                  hint="0 = nessun premio."
                />
              </div>
            </Card>
          ) : null}
        </div>
      ) : null}

      {tab === "minigiochi" ? (
        isMain ? (
          <div className="space-y-4">
            <Card icon={Gamepad2} title="Bonus e tipi" text="Risposta veloce, serie, e per ogni gioco: on/off, durata ed EXP. I messaggi Inizio/Vittoria sono unici per tutti.">
              {(() => {
                const scoring: LevelsMinigameScoring = {
                  ...DEFAULT_MINIGAME_SCORING,
                  ...cfg.minigameScoring,
                  fastGuess: { ...DEFAULT_MINIGAME_SCORING.fastGuess, ...cfg.minigameScoring?.fastGuess },
                  streak: { ...DEFAULT_MINIGAME_SCORING.streak, ...cfg.minigameScoring?.streak },
                  rewardExpByType: mergeMinigameRewardExpByType(cfg.minigameScoring?.rewardExpByType),
                  startDraft: cfg.minigameScoring?.startDraft || null,
                  winDraft: cfg.minigameScoring?.winDraft || null,
                };
                const setScoring = (patch: Partial<LevelsMinigameScoring>) => set({ minigameScoring: { ...scoring, ...patch } });
                const setRow = (type: string, patch: Partial<(typeof scoring.rewardExpByType)[0]>) =>
                  setScoring({
                    rewardExpByType: scoring.rewardExpByType.map((r) => (r.type === type ? { ...r, ...patch } : r)),
                  });
                const fastSec = Math.round(scoring.fastGuess.windowMs / 1000);
                const sharedDraft = gameDraftKind === "win" ? scoring.winDraft || emptyDraft() : scoring.startDraft || emptyDraft();
                const sharedSampleType = "guessNumber";
                const sharedSampleImg = resolveMinigamePreviewImage(sharedSampleType, previewCardsReady, realGameImgs);
                const sharedDraftVars =
                  gameDraftKind === "win"
                    ? { ...minigameVars, exp: "200", total: "1500", streak: "3", user: minigameVars.user || "@Mario" }
                    : {
                        ...minigameVars,
                        minigame: minigameTypeLabel(sharedSampleType),
                        prompt: (MINIGAME_PREVIEW[sharedSampleType]?.prompt || "").replace(/\{exp\}/g, "150"),
                        exp: "150",
                        duration: "180",
                        minutes: "3",
                        minutesLabel: "**3 minuti**",
                        image: sharedSampleImg,
                      };
                const sharedPreviewDraft =
                  gameDraftKind === "win" ? sharedDraft : minigamePreviewDraft(sharedDraft, sharedSampleImg || null);
                return (
                  <div className="space-y-4">
                    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-4">
                      <BigNumber
                        label="Finestra risposta veloce"
                        value={fastSec}
                        min={1}
                        max={300}
                        onChange={(v) => setScoring({ fastGuess: { ...scoring.fastGuess, windowMs: Math.max(1, Math.floor(v || 1)) * 1000 } })}
                        suffix="sec"
                        hint="ENTRO questa finestra si applica il moltiplicatore."
                      />
                      <BigNumber
                        label="Moltiplicatore veloce"
                        value={scoring.fastGuess.multiplier}
                        min={1}
                        max={10}
                        step={0.05}
                        onChange={(v) => setScoring({ fastGuess: { ...scoring.fastGuess, multiplier: Math.max(1, Number(v) || 1) } })}
                        suffix="×"
                      />
                      <BigNumber
                        label="Bonus serie"
                        value={scoring.streak.bonusPercentPerWin}
                        min={0}
                        max={100}
                        onChange={(v) => setScoring({ streak: { ...scoring.streak, bonusPercentPerWin: Math.max(0, Math.floor(Number(v) || 0)) } })}
                        suffix="%"
                        hint="In più per ogni vittoria consecutiva."
                      />
                      <BigNumber
                        label="Tetto serie"
                        value={scoring.streak.maxBonusPercent}
                        min={0}
                        max={500}
                        onChange={(v) => setScoring({ streak: { ...scoring.streak, maxBonusPercent: Math.max(0, Math.floor(Number(v) || 0)) } })}
                        suffix="%"
                        hint="Massimo bonus cumulato dalla serie."
                      />
                    </div>

                    <div className="space-y-3 rounded-2xl bg-espresso/45 p-3 ring-1 ring-sand/10">
                      <div className="flex flex-wrap items-center gap-3">
                        <Pills
                          value={gameDraftKind}
                          onChange={setGameDraftKind}
                          ariaLabel="Messaggio condiviso"
                          options={[
                            { id: "start" as const, label: "Inizio round", icon: Play },
                            { id: "win" as const, label: "Vittoria", icon: Trophy },
                          ]}
                        />
                        <p className="text-xs text-crema/50">
                          {gameDraftKind === "start"
                            ? "Un solo messaggio per tutti. {minigame}, {prompt}, {exp}, {minutesLabel}, {image}. L’immagine del round la mette il bot."
                            : "Un solo messaggio di vittoria per tutti i giochi."}
                        </p>
                      </div>
                      <EditorWithPreview
                        editor={
                          <DraftEditor
                            key={`shared-${gameDraftKind}`}
                            value={sharedDraft}
                            onChange={(d) => setScoring(gameDraftKind === "win" ? { winDraft: d } : { startDraft: d })}
                            emojis={data.pickers.emojis}
                            placeholders={gameDraftKind === "win" ? MINIGAME_WIN_PLACEHOLDERS : MINIGAME_START_PLACEHOLDERS}
                            maxButtons={data.limits.buttons}
                          />
                        }
                        preview={
                          <DiscordMessagePreview bot={data.bot} draft={sharedPreviewDraft} vars={sharedDraftVars} roles={pickerRoles} channels={channels} />
                        }
                      />
                    </div>

                    <div>
                      <div className="mb-2 flex items-center justify-between gap-2">
                        <p className={labelClass}>Giochi</p>
                        <StatusBadge>
                          {scoring.rewardExpByType.filter((r) => r.enabled !== false).length}/{scoring.rewardExpByType.length} attivi
                        </StatusBadge>
                      </div>
                      <p className="mb-2 text-xs text-crema/50">Per tipo: attiva/spegni, durata, EXP e anteprima (senza modificare l’embed). Caccia al tesoro: l’EXP scala i bucket.</p>
                      <ul className="space-y-2">
                        {scoring.rewardExpByType.map((row) => {
                          const open = gameEditType === row.type;
                          const on = row.enabled !== false;
                          const durSec = Math.max(15, Math.round((row.durationMs || 180000) / 1000));
                          const rowStart = scoring.startDraft || emptyDraft();
                          const rowWin = scoring.winDraft || emptyDraft();
                          const rowImg = resolveMinigamePreviewImage(row.type, previewCardsReady, realGameImgs);
                          const rowStartVars = minigameRowPreviewVars(row, minigameVars, rowImg);
                          const rowWinVars = {
                            ...minigameVars,
                            exp: String(row.rewardExp || 150),
                            total: "1500",
                            streak: "3",
                            user: minigameVars.user || "@Mario",
                          };
                          const rowStartDraft = minigamePreviewDraft(rowStart, rowImg || null);
                          return (
                            <li key={row.type} className={cn("rounded-2xl ring-1 ring-sand/10", on ? "bg-espresso/45" : "bg-espresso/25 opacity-80")}>
                              <button
                                type="button"
                                className="flex w-full items-center gap-2 p-2.5 pl-3 text-left"
                                onClick={() => setGameEditType(open ? null : row.type)}
                                aria-expanded={open}
                              >
                                <div className="min-w-0 flex-1">
                                  <p className="truncate text-sm font-semibold text-crema">{minigameTypeLabel(row.type)}</p>
                                  <p className="truncate text-[0.65rem] text-crema/45">
                                    {on ? "attivo" : "spento"} · {durSec}s · {row.rewardExp} EXP
                                  </p>
                                </div>
                                <ChevronDown className={cn("size-4 shrink-0 text-crema/50 transition", open && "rotate-180")} aria-hidden />
                              </button>
                              {open ? (
                                <div className="space-y-3 border-t border-sand/10 p-3 pt-3">
                                  <div className="flex flex-wrap items-center gap-3">
                                    <Toggle checked={on} onChange={(enabled) => setRow(row.type, { enabled })} label={`Attiva ${minigameTypeLabel(row.type)}`} />
                                    {!on ? <StatusBadge>fuori rotazione</StatusBadge> : null}
                                  </div>
                                  <div className="grid gap-3 sm:grid-cols-2">
                                    <BigNumber
                                      label="Durata"
                                      value={durSec}
                                      min={15}
                                      max={1800}
                                      onChange={(v) => setRow(row.type, { durationMs: Math.max(15, Math.floor(v || 15)) * 1000 })}
                                      suffix="sec"
                                    />
                                    <BigNumber
                                      label="EXP vittoria"
                                      value={row.rewardExp}
                                      min={1}
                                      max={100000}
                                      step={10}
                                      onChange={(v) => setRow(row.type, { rewardExp: Math.max(1, Math.floor(Number(v) || 1)) })}
                                      suffix="EXP"
                                    />
                                  </div>
                                  <div className="space-y-2">
                                    <p className={labelClass}>Anteprima inizio</p>
                                    {realGameNotes[row.type] ? <p className="text-xs text-[#e2836f]">Immagine d&apos;esempio: {realGameNotes[row.type]}</p> : null}
                                    <DiscordMessagePreview
                                      noTest
                                      bot={data.bot}
                                      draft={rowStartDraft}
                                      vars={rowStartVars}
                                      rows={minigamePreviewRows(row.type)}
                                      roles={pickerRoles}
                                      channels={channels}
                                    />
                                    <p className={labelClass}>Anteprima vittoria</p>
                                    <DiscordMessagePreview
                                      noTest
                                      bot={data.bot}
                                      draft={rowWin}
                                      vars={rowWinVars}
                                      roles={pickerRoles}
                                      channels={channels}
                                    />
                                  </div>
                                </div>
                              ) : null}
                            </li>
                          );
                        })}
                      </ul>
                    </div>
                  </div>
                );
              })()}
            </Card>

            <Card icon={Trophy} title="TOP minigiochi" text="Ruolo del vincitore della classifica settimanale EXP minigiochi.">
              {(() => {
                const aw: LevelsActivityWinners = {
                  channelId: null,
                  excludedRoleIds: [],
                  weeklyTextRoleId: null,
                  weeklyVoiceRoleId: null,
                  weeklyMinigameRoleId: null,
                  monthlyMemberRoleId: null,
                  ...cfg.activityWinners,
                };
                return (
                  <Field label="Ruolo TOP settimanale">
                    <Select
                      value={aw.weeklyMinigameRoleId || ""}
                      onChange={(v) => set({ activityWinners: { ...aw, weeklyMinigameRoleId: v || null } })}
                      options={[{ value: "", label: "Nessuno" }, ...roles]}
                      className={fieldClass}
                      aria-label="TOP minigiochi settimanale"
                    />
                  </Field>
                );
              })()}
            </Card>

            <Card icon={Gamepad2} title="Premi minigiochi" text="Ruoli per chi accumula EXP vincendo i minigiochi. Lista vuota = nessun ruolo.">
              {games.length ? (
                <ol className="relative space-y-2 pl-5 before:absolute before:bottom-3 before:left-[0.55rem] before:top-3 before:w-px before:bg-gradient-to-b before:from-[#826bc2]/60 before:to-transparent">
                  {games.map(({ row, i }) => (
                    <li key={i} className="relative flex flex-wrap items-center gap-2 rounded-2xl bg-espresso/45 p-2 pl-3 ring-1 ring-sand/10">
                      <span className="absolute -left-[1.15rem] top-1/2 size-2.5 -translate-y-1/2 rounded-full bg-[#826bc2] ring-4 ring-roast" aria-hidden />
                      <div className="w-40 shrink-0">
                        <NumberField className="!mt-0" value={row.exp} min={1} max={100000000} step={100} onChange={(v) => setGame(i, { exp: Math.max(1, Number(v) || 1) })} aria-label="EXP dei minigiochi" />
                      </div>
                      <span className="text-[0.7rem] font-bold uppercase tracking-wider text-crema/45">EXP</span>
                      <span className="size-2.5 shrink-0 rounded-full" style={{ background: roleColor(pickerRoles, row.roleId) }} aria-hidden />
                      <div className="min-w-[10rem] flex-1">
                        <Select value={row.roleId} onChange={(roleId) => setGame(i, { roleId })} options={roles} className={cn(fieldClass, "!mt-0")} aria-label="Ruolo premio minigiochi" />
                      </div>
                      <button type="button" className={cn(miniBtn, "!px-2")} onClick={() => set({ minigameRewards: (cfg.minigameRewards || []).filter((_, j) => j !== i) })} aria-label="Togli il premio">
                        <Trash2 className="size-3.5" aria-hidden />
                      </button>
                    </li>
                  ))}
                </ol>
              ) : (
                <p className="rounded-2xl border border-dashed border-sand/15 px-4 py-5 text-center text-sm text-crema/50">Nessun premio: i minigiochi danno solo EXP.</p>
              )}
              <button
                type="button"
                className={cn(miniBtn, "mt-3")}
                disabled={!roles.length}
                onClick={() => set({ minigameRewards: [...(cfg.minigameRewards || []), { exp: nextGameExp, roleId: roles[0]?.value || "" }] })}
              >
                <Plus className="size-3.5" aria-hidden /> Aggiungi premio ({nextGameExp.toLocaleString("it-IT")} EXP)
              </button>
            </Card>

            <Card icon={Megaphone} title="Annuncio premio" text="Dove e come annunciare il ruolo sbloccato coi minigiochi. Vuoto = #comandi e messaggio classico. Placeholder: {user} {role} {exp} {next}.">
              <ChannelField
                label="Canale premio"
                value={cfg.minigameRewardChannelId || null}
                channels={channels}
                onChange={(minigameRewardChannelId) => set({ minigameRewardChannelId: minigameRewardChannelId || null })}
              />
              <div className="mt-4">
                <EditorWithPreview
                  editor={
                    <DraftEditor
                      value={cfg.minigameRewardDraft || emptyDraft()}
                      onChange={(d) => set({ minigameRewardDraft: d })}
                      emojis={data.pickers.emojis}
                      placeholders={MINIGAME_PLACEHOLDERS}
                      maxButtons={data.limits.buttons}
                    />
                  }
                  preview={
                    <DiscordMessagePreview
                      testChannelId={cfg.minigameRewardChannelId || undefined}
                      bot={data.bot}
                      draft={cfg.minigameRewardDraft || emptyDraft()}
                      vars={minigameVars}
                      roles={pickerRoles}
                      channels={channels}
                    />
                  }
                />
              </div>
            </Card>
          </div>
        ) : (
          <Notice>I minigiochi EXP si configurano solo sul server principale.</Notice>
        )
      ) : null}

      {tab === "utenti" ? <UsersTab guildId={guildId} token={token} cfg={cfg} pickerRoles={pickerRoles} onToast={onToast} /> : null}

      {tab === "annunci" ? (
        <div className="space-y-4">
          <Card icon={Megaphone} title="Dove si annuncia" text="Il canale dei messaggi di level-up. Vuoto = il canale comandi predefinito del bot.">
            <ChannelField label="Canale" value={cfg.levelUpChannelId} channels={channels} onChange={(levelUpChannelId) => set({ levelUpChannelId })} />
          </Card>

          <div className="flex flex-wrap items-center gap-3">
            <Pills
              value={announce}
              onChange={setAnnounce}
              ariaLabel="Messaggio di level-up"
              options={[
                { id: "level", label: "Nuovo livello", icon: TrendingUp },
                { id: "milestone", label: "Ruolo premio sbloccato", icon: Trophy },
                ...(isMain ? [{ id: "perks" as const, label: "Vantaggi sbloccati", icon: Gift }] : []),
              ]}
            />
            <p className="text-xs text-crema/55">
              {announce === "level"
                ? "A ogni livello senza premio."
                : announce === "perks"
                  ? "Un secondo messaggio, a parte, coi vantaggi del ruolo premio appena preso."
                  : cfg.roleRewards.length
                    ? "Quando il livello dà un ruolo premio: usa {role} e {perks}."
                    : "Senza ruoli premio non viene mai usato."}
            </p>
          </div>

          {announce === "perks" ? (
            <Card
              icon={Gift}
              title="Vantaggi sbloccati"
              text="Quando qualcuno prende un ruolo premio, il bot manda anche questo messaggio coi vantaggi di quel livello. È separato da quello del canale level-up."
              off={cfg.perksEnabled === false}
              aside={<Toggle checked={cfg.perksEnabled !== false} onChange={(perksEnabled) => set({ perksEnabled })} label="Messaggio vantaggi" />}
            >
              <ChannelField
                label="Canale"
                value={cfg.perksChannelId || null}
                channels={channels}
                onChange={(perksChannelId) => set({ perksChannelId: perksChannelId || null })}
              />
              <p className="-mt-1 text-xs text-crema/50">Vuoto = #supporters.</p>

              <div className="mt-4">
                <p className={labelClass}>Vantaggi per livello</p>
                {perksRewards.length ? (
                  <>
                    <div className="mt-2 flex flex-wrap gap-1.5">
                      {perksRewards.map((r) => {
                        const on = perksSel?.level === r.level;
                        const empty = !r.perks?.trim();
                        return (
                          <button
                            key={r.level}
                            type="button"
                            onClick={() => setPerksLevel(r.level)}
                            className={cn(
                              "inline-flex items-center gap-1.5 rounded-full px-3 py-1.5 text-xs font-semibold ring-1 transition",
                              on ? "bg-[#826bc2]/20 text-crema ring-[#826bc2]/50" : "bg-espresso/45 text-crema/70 ring-sand/10 hover:text-crema",
                            )}
                          >
                            <span className="size-2 rounded-full" style={{ background: roleColor(pickerRoles, r.roleId) }} aria-hidden />
                            Lv {r.level}
                            {empty ? <span className="text-crema/35">· vuoto</span> : null}
                          </button>
                        );
                      })}
                    </div>
                    {perksSel ? (
                      <div className="mt-3">
                        <textarea
                          value={perksSel.perks || ""}
                          onChange={(e) =>
                            set({ roleRewards: cfg.roleRewards.map((r) => (r.level === perksSel.level ? { ...r, perks: e.target.value.slice(0, 2000) } : r)) })
                          }
                          rows={6}
                          placeholder={"Un vantaggio per riga, es.\n:star: Permesso di cambiare nickname"}
                          className={cn(fieldClass, "!mt-0 min-h-36 resize-y py-2.5 font-mono text-[0.8rem] leading-relaxed")}
                          aria-label={`Vantaggi del livello ${perksSel.level}`}
                        />
                        <p className="mt-1.5 text-xs text-crema/50">
                          Finisce al posto di <code className="text-crema/70">{"{perklist}"}</code> quando si arriva al livello {perksSel.level}. Vuoto = &quot;—&quot;.
                        </p>
                      </div>
                    ) : null}
                  </>
                ) : (
                  <p className="mt-2 rounded-2xl border border-dashed border-sand/15 px-4 py-5 text-center text-sm text-crema/50">Aggiungi prima dei ruoli premio nella scheda Ruoli premio.</p>
                )}
              </div>
            </Card>
          ) : null}

          <EditorWithPreview
            editor={
              <DraftEditor
                key={announce}
                value={announce === "level" ? cfg.levelUpDraft : announce === "perks" ? cfg.perksDraft || emptyDraft() : cfg.milestoneDraft}
                onChange={(d) => set(announce === "level" ? { levelUpDraft: d } : announce === "perks" ? { perksDraft: d } : { milestoneDraft: d })}
                emojis={data.pickers.emojis}
                placeholders={announce === "level" ? LEVEL_PLACEHOLDERS : announce === "perks" ? PERKS_PLACEHOLDERS : MILESTONE_PLACEHOLDERS}
                maxButtons={data.limits.buttons}
              />
            }
            preview={
              <DiscordMessagePreview
                testChannelId={(announce === "perks" ? cfg.perksChannelId : cfg.levelUpChannelId) || undefined}
                bot={data.bot}
                draft={announce === "level" ? cfg.levelUpDraft : announce === "perks" ? cfg.perksDraft || emptyDraft() : cfg.milestoneDraft}
                vars={vars}
                roles={pickerRoles}
                channels={channels}
              />
            }
          />
        </div>
      ) : null}
    </div>
  );
}

/* ───────────── evento EXP a tempo ───────────── */

function timeLeft(ms: number) {
  if (ms <= 0) return "finito";
  const m = Math.ceil(ms / 60000);
  const d = Math.floor(m / 1440);
  const h = Math.floor((m % 1440) / 60);
  const min = m % 60;
  if (d) return `${d}g ${h}h`;
  if (h) return `${h}h ${min}m`;
  return `${min}m`;
}

const EVENT_UNITS = [
  { value: "1", label: "minuti" },
  { value: "60", label: "ore" },
  { value: "1440", label: "giorni" },
];

/** "2 giorni e 3 ore", "45 minuti" */
function durationLabel(minutes: number) {
  const d = Math.floor(minutes / 1440);
  const h = Math.floor((minutes % 1440) / 60);
  const m = Math.round(minutes % 60);
  const parts = [d ? `${d} ${d === 1 ? "giorno" : "giorni"}` : "", h ? `${h} ${h === 1 ? "ora" : "ore"}` : "", m ? `${m} ${m === 1 ? "minuto" : "minuti"}` : ""].filter(Boolean);
  return parts.length > 1 ? `${parts.slice(0, -1).join(", ")} e ${parts[parts.length - 1]}` : parts[0] || "0 minuti";
}

const whenLabel = (ms: number) => new Date(ms).toLocaleString("it-IT", { weekday: "short", day: "numeric", month: "short", hour: "2-digit", minute: "2-digit" });

/** valore per <input type="datetime-local"> (ora locale) */
function toLocalInput(ms: number) {
  const d = new Date(ms);
  const p = (n: number) => String(n).padStart(2, "0");
  return `${d.getFullYear()}-${p(d.getMonth() + 1)}-${p(d.getDate())}T${p(d.getHours())}:${p(d.getMinutes())}`;
}

function EventCard({
  guildId,
  token,
  channels,
  event,
  scheduled,
  onChange,
  onToast,
}: {
  guildId: string;
  token: string;
  channels: PickerChannel[];
  event: LevelsEvent | null;
  scheduled: LevelsScheduledEvent[];
  onChange: (e: LevelsEvent, scheduled: LevelsScheduledEvent[]) => void;
  onToast: (msg: string, err?: boolean) => void;
}) {
  const [multiplier, setMultiplier] = useState(2);
  const [amount, setAmount] = useState(1);
  const [unit, setUnit] = useState("1440");
  const [when, setWhen] = useState<"now" | "later">("now");
  const [startAt, setStartAt] = useState("");
  const [announceEnabled, setAnnounceEnabled] = useState(false);
  const [announceChannelId, setAnnounceChannelId] = useState("");
  const [announceContent, setAnnounceContent] = useState("Evento EXP ×{mult} in corso!");
  const [busy, setBusy] = useState(false);
  const [now, setNow] = useState(() => Date.now());

  useEffect(() => {
    const t = window.setInterval(() => setNow(Date.now()), 30_000);
    return () => window.clearInterval(t);
  }, []);

  const endsAt = event?.expiresAt ? new Date(event.expiresAt).getTime() : 0;
  const active = Boolean(event?.active && endsAt > now);
  const minutes = Math.max(1, amount) * Number(unit);
  const startMs = startAt ? new Date(startAt).getTime() : NaN;
  const startOk = when === "now" || (Number.isFinite(startMs) && startMs > now);
  const durationOk = minutes >= 5 && minutes <= 60 * 24 * 30;

  const run = async (body: Parameters<typeof communityApi.setLevelsEvent>[2], okMsg: string) => {
    setBusy(true);
    const r = await communityApi.setLevelsEvent(token, guildId, body);
    setBusy(false);
    if (!r.ok) return onToast(r.message, true);
    onChange(r.data.event, r.data.scheduled || []);
    onToast(okMsg);
  };

  const submit = () => {
    if (when === "later") {
      void run(
        {
          multiplier,
          minutes,
          startAt: new Date(startMs).toISOString(),
          announceEnabled,
          announceChannelId: announceChannelId || null,
          announceContent,
        },
        `Evento ×${multiplier} programmato per ${whenLabel(startMs)}.`,
      );
    } else {
      void run({ multiplier, minutes }, `Evento ×${multiplier} avviato.`);
    }
  };

  const label = "text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-crema/50";

  return (
    <Card
      icon={Timer}
      title="Evento EXP"
      text="Un moltiplicatore in più per un periodo, sopra a tutto il resto. Puoi farlo partire ora o programmarlo; si spegne da solo."
      aside={active ? <StatusBadge tone="ok">attivo</StatusBadge> : scheduled.length ? <StatusBadge tone="accent">{scheduled.length} in programma</StatusBadge> : <StatusBadge>nessuno</StatusBadge>}
    >
      {active && event ? (
        <div className="flex flex-wrap items-center gap-4 rounded-2xl bg-[#826bc2]/12 p-4 ring-1 ring-[#826bc2]/30">
          <p className="font-display text-4xl font-semibold text-crema lining-nums">×{event.multiplier}</p>
          <div className="min-w-0 flex-1">
            <p className="text-sm font-semibold text-crema">In corso · mancano {timeLeft(endsAt - now)}</p>
            <p className="text-xs text-crema/55">Finisce {whenLabel(endsAt)}</p>
          </div>
          <button type="button" className={dangerBtn} disabled={busy} onClick={() => void run({ stop: true }, "Evento EXP chiuso.")}>
            Chiudi ora
          </button>
        </div>
      ) : null}

      {scheduled.length ? (
        <div className={cn(active && "mt-3")}>
          <p className={cn(labelClass, "mb-2")}>In programma</p>
          <ul className="space-y-2">
            {scheduled.map((ev) => {
              const s = new Date(ev.startAt).getTime();
              return (
                <li key={ev.id} className="flex flex-wrap items-center gap-3 rounded-2xl bg-espresso/45 p-3 ring-1 ring-sand/10">
                  <span className="flex h-10 min-w-14 items-center justify-center rounded-xl bg-[#826bc2]/15 px-2 font-display text-lg font-semibold text-[#cdbdf7] ring-1 ring-[#826bc2]/25 lining-nums">×{ev.multiplier}</span>
                  <div className="min-w-0 flex-1">
                    <p className="text-sm font-semibold text-crema">
                      {whenLabel(s)} <span className="font-normal text-crema/50">· tra {timeLeft(s - now)}</span>
                    </p>
                    <p className="text-xs text-crema/55">
                      Dura {durationLabel(ev.durationMs / 60_000)} · finisce {whenLabel(s + ev.durationMs)}
                      {ev.announceEnabled ? " · annuncio all’inizio" : ""}
                    </p>
                  </div>
                  <div className="flex gap-2">
                    <button type="button" className={miniBtn} disabled={busy} onClick={() => void run({ startNowId: ev.id }, `Evento ×${ev.multiplier} avviato adesso.`)}>
                      <Play className="size-3.5" aria-hidden /> Parti ora
                    </button>
                    <button type="button" className={miniBtn} disabled={busy} onClick={() => void run({ cancelId: ev.id }, "Evento programmato annullato.")}>
                      <X className="size-3.5" aria-hidden /> Annulla
                    </button>
                  </div>
                </li>
              );
            })}
          </ul>
        </div>
      ) : null}

      <div className={cn("grid gap-3 lg:grid-cols-[auto_auto_minmax(0,1fr)]", (active || scheduled.length > 0) && "mt-4")}>
        <div className="rounded-2xl bg-espresso/45 p-3.5 ring-1 ring-sand/10">
          <p className={label}>Moltiplicatore</p>
          <div className="mt-2 flex items-center gap-2">
            <div className="w-32">
              <NumberField className="!mt-0" value={multiplier} min={1.1} max={10} step={0.1} onChange={(v) => setMultiplier(Number(v) || 2)} aria-label="Moltiplicatore dell'evento" />
            </div>
            <span className="text-sm font-semibold text-crema/60">×</span>
          </div>
        </div>
        <div className="rounded-2xl bg-espresso/45 p-3.5 ring-1 ring-sand/10">
          <p className={label}>Durata</p>
          <div className="mt-2 flex items-center gap-2">
            <div className="w-32">
              <NumberField className="!mt-0" value={amount} min={1} max={unit === "1" ? 43200 : unit === "60" ? 720 : 30} onChange={(v) => setAmount(Math.max(1, Math.floor(Number(v) || 1)))} aria-label="Durata dell'evento" />
            </div>
            <div className="w-28">
              <Select value={unit} onChange={setUnit} options={EVENT_UNITS} className={cn(fieldClass, "!mt-0")} aria-label="Unità della durata" />
            </div>
          </div>
        </div>
        <div className="rounded-2xl bg-espresso/45 p-3.5 ring-1 ring-sand/10">
          <p className={label}>Quando</p>
          <div className="mt-2 flex flex-wrap items-center gap-2">
            <Pills
              value={when}
              onChange={(v) => {
                setWhen(v);
                if (v === "later" && !startAt) setStartAt(toLocalInput(Math.ceil((Date.now() + 3_600_000) / 3_600_000) * 3_600_000));
              }}
              ariaLabel="Quando parte l'evento"
              options={[
                { id: "now", label: "Subito" },
                { id: "later", label: "Programma", icon: CalendarClock },
              ]}
            />
            {when === "later" ? (
              <div className="w-60">
                <DateTimeField value={startAt} min={toLocalInput(now)} onChange={setStartAt} aria-label="Data e ora di inizio" />
              </div>
            ) : null}
          </div>
        </div>
      </div>
      {when === "later" ? (
        <div className="mt-3 space-y-3 rounded-2xl bg-espresso/45 p-4 ring-1 ring-sand/10">
          <div className="flex flex-wrap items-center justify-between gap-3">
            <Toggle checked={announceEnabled} onChange={setAnnounceEnabled} label="Annuncio all’inizio" />
            <p className="text-xs text-crema/55">Messaggio in chat quando parte l’evento programmato.</p>
          </div>
          <Field
            label="Testo annuncio"
            hint="All’ora di inizio, se attivo. Usa {mult} o {multiplier} per il moltiplicatore."
          >
            <ExpandableTextarea
              value={announceContent}
              rows={3}
              maxLength={2000}
              disabled={!announceEnabled}
              placeholder="Evento EXP ×{mult} in corso!"
              onChange={(e) => setAnnounceContent(e.target.value.slice(0, 2000))}
              className={cn(fieldClass, "!mt-0 min-h-24 resize-y py-2.5")}
              aria-label="Messaggio annuncio evento"
            />
          </Field>
          {announceEnabled ? (
            <Field label="Canale annuncio" hint="Vuoto = canale eventi predefinito del bot.">
              <Select
                value={announceChannelId}
                onChange={setAnnounceChannelId}
                options={[{ value: "", label: "Predefinito" }, ...channels.map((c) => ({ value: c.id, label: `#${c.name}` }))]}
                className={fieldClass}
                aria-label="Canale annuncio evento"
              />
            </Field>
          ) : null}
        </div>
      ) : null}
      {!durationOk ? <p className="mt-2 text-xs text-[#e2836f]">La durata va da 5 minuti a 30 giorni.</p> : null}
      {when === "later" && !startOk ? <p className="mt-2 text-xs text-[#e2836f]">Scegli una data futura.</p> : null}
      <button type="button" className={cn(dashPrimaryBtn, "mt-3")} disabled={busy || multiplier < 1.05 || !durationOk || !startOk} onClick={submit}>
        {when === "later" ? <CalendarClock className="size-4" aria-hidden /> : <Sparkles className="size-4" aria-hidden />}
        {when === "later"
          ? `Programma ×${multiplier} per ${durationLabel(minutes)}${startOk && Number.isFinite(startMs) ? ` · ${whenLabel(startMs)}` : ""}`
          : `${active ? "Sostituisci l'evento" : "Avvia evento"} (×${multiplier} per ${durationLabel(minutes)})`}
      </button>
    </Card>
  );
}

/* ───────────── scheda Utenti ───────────── */

function MemberSearch({ guildId, token, onPick }: { guildId: string; token: string; onPick: (m: MemberHit) => void }) {
  const [query, setQuery] = useState("");
  /* risultati con la ricerca a cui appartengono: così si sa se sta ancora cercando */
  const [result, setResult] = useState<{ q: string; hits: MemberHit[]; err?: string }>({ q: "", hits: [] });
  const [open, setOpen] = useState(false);

  useEffect(() => {
    const q = query.trim();
    if (q.length < 2 && !/^\d{16,22}$/.test(q)) return;
    const timer = window.setTimeout(async () => {
      const res = await searchTicketMembers(token, guildId, q);
      setResult(res.ok ? { q, hits: res.data } : { q, hits: [], err: res.message });
    }, 200);
    return () => window.clearTimeout(timer);
  }, [query, token, guildId]);

  const q = query.trim();
  const valid = q.length >= 2 || /^\d{16,22}$/.test(q);
  const searching = valid && result.q !== q;
  const shown = valid && result.q === q ? result.hits : [];
  const err = valid && result.q === q ? result.err : undefined;

  return (
    <div className="relative">
      <Search className="pointer-events-none absolute left-3.5 top-1/2 size-4 -translate-y-1/2 text-crema/45" aria-hidden />
      <input
        value={query}
        placeholder="Cerca un membro per nome o ID"
        onChange={(e) => {
          setQuery(e.target.value);
          setOpen(true);
        }}
        onFocus={() => setOpen(true)}
        onBlur={() => window.setTimeout(() => setOpen(false), 150)}
        className={cn(fieldClass, "!mt-0 h-11 py-0 pl-10")}
        aria-label="Cerca un membro"
      />
      {searching ? <Loader2 className="pointer-events-none absolute right-3.5 top-1/2 size-4 -translate-y-1/2 animate-spin text-crema/45" aria-hidden /> : null}
      {open && valid && !searching && err ? (
        <p className="absolute inset-x-0 top-full z-20 mt-1 rounded-xl bg-mocha px-3 py-2.5 text-sm text-[#e2836f] shadow-xl ring-1 ring-sand/15">{err}</p>
      ) : null}
      {open && valid && !searching && !err && !shown.length ? (
        <p className="absolute inset-x-0 top-full z-20 mt-1 rounded-xl bg-mocha px-3 py-2.5 text-sm text-crema/55 shadow-xl ring-1 ring-sand/15">Nessun membro trovato per “{q}”.</p>
      ) : null}
      {open && shown.length ? (
        <ul className="absolute inset-x-0 top-full z-20 mt-1 max-h-64 overflow-auto rounded-xl bg-mocha p-1 shadow-xl ring-1 ring-sand/15">
          {shown.map((m) => (
            <li key={m.id}>
              <button
                type="button"
                className="flex w-full items-center justify-between gap-2 rounded-lg px-3 py-2 text-left text-sm text-crema hover:bg-crema/10"
                onMouseDown={(e) => e.preventDefault()}
                onClick={() => {
                  onPick(m);
                  setQuery("");
                  setResult({ q: "", hits: [] });
                  setOpen(false);
                }}
              >
                <span className="truncate font-semibold" translate="no">{m.label}</span>
                {m.label !== m.username ? <span className="truncate text-xs text-crema/50" translate="no">@{m.username}</span> : null}
              </button>
            </li>
          ))}
        </ul>
      ) : null}
    </div>
  );
}

const OPS = [
  { id: "add", label: "Aggiungi", hint: "in più a quelli che ha", icon: Plus },
  { id: "remove", label: "Togli", hint: "in meno da quelli che ha", icon: Minus },
  { id: "set", label: "Imposta", hint: "un valore preciso", icon: Target },
] as const;

function UsersTab({
  guildId,
  token,
  cfg,
  pickerRoles,
  onToast,
}: {
  guildId: string;
  token: string;
  cfg: LevelsConfig;
  pickerRoles: PickerRole[];
  onToast: (msg: string, err?: boolean) => void;
}) {
  const [member, setMember] = useState<MemberHit | null>(null);
  const [user, setUser] = useState<LevelsUser | null>(null);
  const [loading, setLoading] = useState(false);
  const [busy, setBusy] = useState(false);
  const [op, setOp] = useState<"add" | "remove" | "set">("add");
  const [mode, setMode] = useState<"level" | "exp">("level");
  const [value, setValue] = useState(1);
  const [confirmReset, setConfirmReset] = useState(false);

  const pick = async (m: MemberHit) => {
    setMember(m);
    setUser(null);
    setConfirmReset(false);
    setLoading(true);
    const r = await communityApi.getLevelsUser(token, guildId, m.id);
    setLoading(false);
    if (!r.ok) return onToast(r.message, true);
    setUser(r.data.user);
  };

  const clear = () => {
    setMember(null);
    setUser(null);
    setConfirmReset(false);
  };

  const act = async (action: LevelsUserAction["action"]) => {
    if (!member) return;
    setBusy(true);
    const r = await communityApi.mutateLevelsUser(token, guildId, { userId: member.id, action, mode, value });
    setBusy(false);
    setConfirmReset(false);
    if (!r.ok) return onToast(r.message, true);
    setUser(r.data.user);
    if (action === "syncroles") {
      return onToast(r.data.rolesSynced ? "Ruoli premio risincronizzati." : "Il bot non ha il server in memoria: i ruoli si aggiornano al prossimo messaggio.", !r.data.rolesSynced);
    }
    const b = r.data.before;
    const u = r.data.user;
    const roles = r.data.rolesSynced ? "" : " I ruoli si aggiornano al prossimo messaggio.";
    onToast(`${member.label}: livello ${b.level} → ${u.level}, ${b.totalExp.toLocaleString("it-IT")} → ${u.totalExp.toLocaleString("it-IT")} EXP.${roles}`);
  };

  /* anteprima: in livelli si sa il risultato esatto, in EXP si mostrano gli EXP */
  const preview = (() => {
    if (!user) return { label: "", from: "", to: "", changed: false };
    const cur = mode === "level" ? user.level : user.totalExp;
    const next = op === "set" ? value : op === "add" ? cur + value : Math.max(0, cur - value);
    const fmt = (n: number) => n.toLocaleString("it-IT");
    return { label: mode === "level" ? "Livello" : "EXP", from: fmt(cur), to: fmt(next), changed: next !== cur };
  })();

  const sortedRewards = [...cfg.roleRewards].sort((a, b) => a.level - b.level);
  const earned = user ? sortedRewards.filter((r) => r.level <= user.level) : [];
  const nextReward = user ? sortedRewards.find((r) => r.level > user.level) : undefined;
  const roleName = (id: string) => pickerRoles.find((r) => r.id === id)?.name || "ruolo eliminato";
  const span = user ? Math.max(1, user.nextLevelExp - user.levelStartExp) : 1;
  const pct = user ? Math.min(100, Math.max(0, ((user.totalExp - user.levelStartExp) / span) * 100)) : 0;

  return (
    <div className="space-y-4">
      <Card icon={UserRound} title="Utenti" text="Cerca un membro per vedere il suo livello e cambiarlo a mano. Ogni modifica finisce nello storico livelli.">
        {member ? (
          <div className="flex items-center gap-3 rounded-2xl bg-espresso/45 p-3 ring-1 ring-sand/10">
            <span className="flex size-10 shrink-0 items-center justify-center rounded-full bg-[#826bc2]/20 font-display text-lg font-semibold text-[#cdbdf7]" aria-hidden>
              {(member.label || member.username || "?").slice(0, 1).toUpperCase()}
            </span>
            <div className="min-w-0 flex-1">
              <p className="truncate font-semibold text-crema" translate="no">
                {member.label}
              </p>
              <p className="truncate text-xs text-crema/50" translate="no">
                @{member.username} · {member.id}
              </p>
            </div>
            <button type="button" className={cn(miniBtn, "!px-2")} onClick={clear} aria-label="Cambia membro">
              <X className="size-3.5" aria-hidden />
            </button>
          </div>
        ) : (
          <MemberSearch guildId={guildId} token={token} onPick={(m) => void pick(m)} />
        )}
      </Card>

      {member && loading ? <RowsSkeleton rows={3} /> : null}

      {member && user ? (
        <>
          <section className="rounded-3xl bg-gradient-to-br from-[#826bc2]/20 via-roast/80 to-roast/70 p-5 ring-1 ring-[#826bc2]/25">
            <div className="flex flex-wrap items-end gap-x-8 gap-y-3">
              <div>
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-crema/50">Livello</p>
                <p className="font-display text-5xl font-semibold leading-none text-crema lining-nums">{user.level}</p>
              </div>
              <div>
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-crema/50">EXP totali</p>
                <p className="text-xl font-semibold text-crema lining-nums">{user.totalExp.toLocaleString("it-IT")}</p>
              </div>
              <div>
                <p className="text-[0.65rem] font-semibold uppercase tracking-[0.16em] text-crema/50">Questa settimana</p>
                <p className="text-xl font-semibold text-crema lining-nums">{user.weeklyExp.toLocaleString("it-IT")}</p>
              </div>
            </div>
            <div className="mt-4">
              <div className="h-2 overflow-hidden rounded-full bg-espresso/70">
                <div className="h-full rounded-full bg-[#9c86db]" style={{ width: `${pct}%` }} />
              </div>
              <p className="mt-1.5 text-xs text-crema/55 lining-nums">
                {Math.max(0, user.nextLevelExp - user.totalExp).toLocaleString("it-IT")} EXP al livello {user.level + 1}
                {nextReward ? ` · prossimo ruolo premio al livello ${nextReward.level} (${roleName(nextReward.roleId)})` : ""}
              </p>
            </div>
            <div className="mt-4 flex flex-wrap gap-1.5">
              {earned.length ? (
                earned.map((r) => (
                  <span key={`${r.level}-${r.roleId}`} className="inline-flex items-center gap-1.5 rounded-full bg-espresso/60 px-2.5 py-1 text-xs font-semibold text-crema/85 ring-1 ring-sand/10">
                    <span className="size-2 rounded-full" style={{ background: roleColor(pickerRoles, r.roleId) }} aria-hidden />
                    {roleName(r.roleId)}
                    <span className="text-crema/40">Lv {r.level}</span>
                  </span>
                ))
              ) : (
                <span className="text-xs text-crema/50">Nessun ruolo premio ancora.</span>
              )}
            </div>
          </section>

          <Card icon={TrendingUp} title="Modifica" text="Scegli cosa fare, quanto, e controlla l'anteprima prima di applicare.">
            {/* 1. cosa fare */}
            <div className="grid grid-cols-3 gap-2" role="radiogroup" aria-label="Cosa fare">
              {OPS.map((o) => {
                const on = op === o.id;
                return (
                  <button
                    key={o.id}
                    type="button"
                    role="radio"
                    aria-checked={on}
                    onClick={() => setOp(o.id)}
                    className={cn(
                      "flex flex-col items-start gap-1 rounded-2xl p-3 text-left ring-1 transition",
                      on ? "bg-[#826bc2]/15 ring-[#826bc2]/45" : "bg-espresso/45 ring-sand/10 hover:bg-crema/[0.05]",
                    )}
                  >
                    <o.icon className={cn("size-4", on ? "text-[#cdbdf7]" : "text-crema/45")} aria-hidden />
                    <span className={cn("text-sm font-semibold", on ? "text-crema" : "text-crema/75")}>{o.label}</span>
                    <span className="hidden text-xs text-crema/45 sm:block">{o.hint}</span>
                  </button>
                );
              })}
            </div>

            {/* 2. quanto + anteprima + applica */}
            <div className="mt-3 flex flex-wrap items-center gap-3 rounded-2xl bg-espresso/45 p-3 ring-1 ring-sand/10">
              <div className="w-36">
                <NumberField
                  className="!mt-0"
                  value={value}
                  min={0}
                  max={mode === "level" ? 10000 : 2000000000}
                  step={mode === "level" ? 1 : 100}
                  onChange={(v) => setValue(Math.max(0, Math.floor(Number(v) || 0)))}
                  aria-label="Quanto"
                />
              </div>
              <div className="flex h-10 rounded-lg bg-espresso/70 p-1 ring-1 ring-sand/10" role="radiogroup" aria-label="Unità">
                {(
                  [
                    ["level", "livelli"],
                    ["exp", "EXP"],
                  ] as const
                ).map(([id, label]) => (
                  <button
                    key={id}
                    type="button"
                    role="radio"
                    aria-checked={mode === id}
                    onClick={() => setMode(id)}
                    className={cn("rounded-md px-3 text-sm font-semibold transition", mode === id ? "bg-crema/10 text-crema" : "text-crema/50 hover:text-crema/80")}
                  >
                    {label}
                  </button>
                ))}
              </div>

              <div className="flex min-w-0 flex-1 items-center gap-2 text-sm lining-nums">
                <span className="text-crema/55">{preview.label}</span>
                <span className="font-semibold text-crema/70">{preview.from}</span>
                <ArrowRight className="size-3.5 shrink-0 text-crema/40" aria-hidden />
                <span className={cn("font-display text-lg font-semibold", preview.changed ? "text-[#cdbdf7]" : "text-crema/60")}>{preview.to}</span>
              </div>

              <button type="button" className={cn(dashPrimaryBtn, "h-10")} disabled={busy || !preview.changed || ((op === "add" || op === "remove") && value <= 0)} onClick={() => void act(op)}>
                {busy ? <Loader2 className="size-4 animate-spin" aria-hidden /> : <Check className="size-4" aria-hidden />} Applica
              </button>
            </div>

            {/* 3. altro, in piccolo */}
            <div className="mt-4 flex flex-wrap items-center justify-end gap-x-4 gap-y-2 text-xs">
              <button type="button" className="inline-flex items-center gap-1.5 font-semibold text-crema/55 transition hover:text-crema disabled:opacity-45" disabled={busy} onClick={() => void act("syncroles")}>
                <RefreshCw className="size-3.5" aria-hidden /> Risincronizza ruoli premio
              </button>
              {confirmReset ? (
                <span className="inline-flex items-center gap-2">
                  <span className="text-crema/55">Azzerare tutti gli EXP di {member.label}?</span>
                  <button type="button" className={dangerBtn} disabled={busy} onClick={() => void act("reset")}>
                    Sì, azzera
                  </button>
                  <button type="button" className="font-semibold text-crema/55 hover:text-crema" onClick={() => setConfirmReset(false)}>
                    No
                  </button>
                </span>
              ) : (
                <button
                  type="button"
                  className="inline-flex items-center gap-1.5 font-semibold text-[#e2836f]/80 transition hover:text-[#f0a493] disabled:opacity-45"
                  disabled={busy || user.totalExp === 0}
                  onClick={() => setConfirmReset(true)}
                >
                  <RotateCcw className="size-3.5" aria-hidden /> Azzera EXP
                </button>
              )}
            </div>
          </Card>
        </>
      ) : null}
    </div>
  );
}
