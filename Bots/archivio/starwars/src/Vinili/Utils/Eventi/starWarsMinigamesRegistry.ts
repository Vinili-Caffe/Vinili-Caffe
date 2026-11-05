/**
 * Registry minigames / eventi collaterali / giochi — stato + meta per HS e scheduler.
 * Implementazione play: fasi successive; qui catalogo + flag da calendario.
 */
"use strict";

const { FEATURES, resolveFeatureStateNow, featureUnlockMeta } = require("./starWarsEventCalendar") as typeof import("./starWarsEventCalendar");

const REGISTRY = Object.freeze([
  {
    id: "podrace",
    feature: FEATURES.MINIGAME_PODRACE,
    kind: "minigame",
    label: "Gara di Podracer",
    channel: "discord",
    teaser: "3…2…1…VIA! Primo a reagire vince.",
  },
  {
    id: "podracing_championship",
    feature: FEATURES.EVENT_PODRACING_CHAMP,
    kind: "event",
    label: "Podracing Championship",
    channel: "site",
    href: "/evento/gara/",
    teaser: "Scegli lo sguscio.",
  },
  {
    id: "scommessa",
    feature: FEATURES.MINIGAME_SCOMMESSA,
    kind: "minigame",
    label: "Scommessa ai Podracer",
    channel: "site",
    href: "/gara/",
    teaser: "Scommesse solo sul sito.",
  },
  {
    id: "scova_pianeta",
    feature: FEATURES.MINIGAME_SCOVA,
    kind: "minigame",
    label: "Scova il pianeta",
    channel: "discord",
    teaser: "Mappa galattica.",
  },
  {
    id: "ordine66",
    feature: FEATURES.MINIGAME_ORDINE66,
    kind: "minigame",
    label: "Ordine 66",
    channel: "discord",
    teaser: "Ruolo Jedi random.",
  },
  {
    id: "cacciatore_taglie",
    feature: FEATURES.MINIGAME_CACCIATORE,
    kind: "minigame",
    label: "Cacciatore di taglie",
    channel: "discord",
    teaser: "Come Ordine 66.",
  },
  {
    id: "accademia",
    feature: FEATURES.EVENT_ACCADEMIA,
    kind: "event",
    label: "Accademia Militare",
    channel: "site",
    href: "/evento/accademia/",
    teaser: "Mira e bersagli sul sito.",
  },
  {
    id: "kyber",
    feature: FEATURES.EVENT_KYBER,
    kind: "event",
    label: "Estrazione Kyber",
    channel: "site",
    href: "/evento/miniera/",
    teaser: "Miniera giornaliera.",
  },
  {
    id: "attacca_base",
    feature: FEATURES.MINIGAME_ATTACCA_BASE,
    kind: "minigame",
    label: "Attacca la base",
    channel: "discord",
    teaser: "HP base.",
  },
  {
    id: "conquista",
    feature: FEATURES.GAME_CONQUISTA,
    kind: "game",
    label: "Conquista il sistema",
    channel: "discord",
    teaser: "Sistemi random in Community/Pinned.",
  },
  {
    id: "colleziona_pg",
    feature: FEATURES.GAME_COLLEZIONA_PG,
    kind: "game",
    label: "Colleziona PG",
    channel: "discord+site",
    teaser: "Nome in chat.",
  },
  {
    id: "caccia_ewok",
    feature: FEATURES.MINIGAME_CACCIA_EWOK,
    kind: "minigame",
    label: "Caccia all'Ewok",
    channel: "discord",
    teaser: "Messaggio random.",
  },
  {
    id: "puzzle_kessel",
    feature: FEATURES.EVENT_PUZZLE_KESSEL,
    kind: "event",
    label: "Puzzle di Kessel",
    channel: "site",
    href: "/puzzle/",
    teaser: "6 difficoltà sul sito.",
  },
  {
    id: "reliquie",
    feature: FEATURES.GAME_RELIQUIE,
    kind: "game",
    label: "Colleziona le reliquie",
    channel: "discord+site",
    teaser: "Foto + nome in chat.",
  },
  {
    id: "proteggi_convoglio",
    feature: FEATURES.MINIGAME_PROTEGGI,
    kind: "minigame",
    label: "Proteggi convoglio",
    channel: "discord",
    teaser: "3 tappe: chat → Community/Pinned.",
  },
  {
    id: "olocron",
    feature: FEATURES.GAME_OLOCRON,
    kind: "game",
    label: "Caccia all'Olocron",
    channel: "discord",
    teaser: "Come caccia alla pergamena.",
  },
]);

const IMPLEMENTED = new Set([
  "podrace",
  "podracing_championship",
  "scommessa",
  "scova_pianeta",
  "ordine66",
  "cacciatore_taglie",
  "accademia",
  "kyber",
  "attacca_base",
  "conquista",
  "colleziona_pg",
  "caccia_ewok",
  "puzzle_kessel",
  "reliquie",
  "proteggi_convoglio",
  "olocron",
]);

function listMinigamesStatus(now = new Date()) {
  const state = resolveFeatureStateNow(now);
  const active = new Set(state.features || []);
  return {
    date: state.date,
    epoch: state.epoch,
    economyOn: state.economyOn,
    economyPhase: state.economyPhase,
    items: REGISTRY.map((row?) => {
      const unlock = featureUnlockMeta(row.feature);
      return {
        ...row,
        active: active.has(row.feature),
        implemented: IMPLEMENTED.has(row.id),
        unlockDate: unlock?.date || null,
        adventDay: unlock?.advent ?? null,
        unlockNote: unlock?.note || null,
      };
    }),
  };
}

export = {
  REGISTRY,
  listMinigamesStatus,
};
