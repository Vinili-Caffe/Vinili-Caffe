/** Draft Inizio/Vittoria condivisi (un messaggio per tutti i minigiochi). Placeholder: {minigame} {exp} {minutesLabel}… */
const T = require("../../../MultiGuild/core/tenantCommunityTools") as typeof import("../../../MultiGuild/core/tenantCommunityTools");
const { TENANT_EMBED_COLOR } = require("../../../MultiGuild/utils/tenantEmbedBranding") as typeof import("../../../MultiGuild/utils/tenantEmbedBranding");
const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");

const e = (k: string) => String((E as any)?.[k] || "");
const COLOR = String(TENANT_EMBED_COLOR || "#826bc2");

const MINIGAME_TYPE_LABELS: Record<string, string> = {
  guessNumber: "Indovina il numero",
  guessWord: "Indovina la parola",
  guessFlag: "Indovina la bandiera",
  guessPlayer: "Indovina il calciatore",
  guessSong: "Indovina la canzone",
  guessCapital: "Indovina la capitale",
  guessReverseCapital: "Capitale al contrario",
  guessRegionCapital: "Capoluogo di regione",
  fastType: "Gara di digitazione",
  guessTeam: "Indovina la squadra",
  guessSinger: "Indovina il cantante",
  guessAlbum: "Indovina l'album",
  hangman: "Impiccato",
  italianGK: "Quiz Cultura Generale",
  drivingQuiz: "Quiz Patente",
  mathExpression: "Espressione matematica",
  findBot: "Trova il bot",
  findBotVoice: "Trova il bot in vocale",
  memoryEmoji: "Memorizza le emoji",
  guessYear: "Indovina l'anno",
  completeVerse: "Completa la frase",
  guessEmoji: "Indovina l'emoji",
  quoteFilm: "Citazione da film/serie",
  completeProverb: "Completa il proverbio o la frase",
  synonymAntonym: "Indovina il sinonimo o il contrario",
  guessCity: "Indovina la città",
  treasureHunt: "Trova la reaction nascosta",
  starWarsQuiz: "Quiz Star Wars",
  starWarsGuessPlanet: "Indovina il pianeta",
  halloweenQuiz: "Quiz Halloween",
  halloweenFindGhost: "Trova il fantasma",
  halloweenMissingEmoji: "Quale emoji manca?",
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

function minigameTypeLabel(type?) {
  const t = String(type || "").trim();
  return MINIGAME_TYPE_LABELS[t] || t || "Minigioco";
}

/** Inizio round unico: ping nel content + titolo = nome gioco. */
function classicSharedStartDraft() {
  return T.normalizeDraft({
    content: "{ping}",
    mentionUsers: false,
    mentionRoles: true,
    embed: {
      enabled: true,
      title: `{minigame} ${e("VC_Exclamation")}`,
      description: [
        `${e("VC_EXP")} {prompt}`,
        `> ${e("VC_pixeltime")} Hai {minutesLabel} per rispondere!`,
        `> ${e("VC_Winner")} Guarda le tue statistiche dei minigiochi nel [tuo profilo](https://www.viniliecaffe.it/profilo/).`,
      ].join("\n"),
      color: COLOR,
      imageUrl: "{image}",
      thumbnailUrl: "",
      footerText: "",
      timestamp: false,
      authorName: "",
      authorIconUrl: "",
      fields: [],
    },
  });
}

/** Vittoria unica per tutti i tipi. */
function classicSharedWinDraft() {
  return T.normalizeDraft({
    content: "",
    mentionUsers: true,
    embed: {
      enabled: true,
      title: `${e("VC_Events")} Un utente ha vinto${e("VC_Exclamation")}`,
      description: [
        `${e("VC_Winner")} Complimenti {user}, hai vinto e guadagnato **{exp} exp**${e("VC_Exclamation")}`,
        "",
        `${e("VC_Stats")} **Le tue statistiche:**`,
        `${e("VC_Arrow")} Ora hai un totale di **{total} exp**`,
        `${e("VC_Arrow")} Serie di vittorie: **{streak}**`,
      ].join("\n"),
      color: COLOR,
      imageUrl: "",
      thumbnailUrl: "",
      footerText: "I tuoi progressi sono nel profilo su viniliecaffe.it/profilo",
      timestamp: false,
      authorName: "",
      authorIconUrl: "",
      fields: [],
    },
  });
}

/** @deprecated alias — i draft sono condivisi, non per tipo */
function classicWinDraft() {
  return classicSharedWinDraft();
}
function classicStartDraft(_type?) {
  return classicSharedStartDraft();
}
function draftsForType(_type?) {
  return { startDraft: classicSharedStartDraft(), winDraft: classicSharedWinDraft() };
}
function allClassicMinigameDrafts() {
  return {} as Record<string, { startDraft: ReturnType<typeof T.normalizeDraft>; winDraft: ReturnType<typeof T.normalizeDraft> }>;
}

export = {
  MINIGAME_TYPE_LABELS,
  minigameTypeLabel,
  classicSharedStartDraft,
  classicSharedWinDraft,
  classicWinDraft,
  classicStartDraft,
  draftsForType,
  allClassicMinigameDrafts,
};
