/** Minigiochi: immagini delle domande (canvas), cartelli, impiccato e immagini scaricate. */
const remote = require("./minigameImageRemote") as typeof import("./minigameImageRemote");
const canvas = require("./minigameImageCanvas") as typeof import("./minigameImageCanvas");
const { shouldUseStarWarsTheme } = require("../utils/starWarsMinigameHooks") as typeof import("../utils/starWarsMinigameHooks");

/**
 * Prompt attachment: stile SW (sfondo CDN) se evento live, altrimenti canvas classico.
 * @returns {{ attachment: any, backgroundUrl: string|null }}
 */
async function resolveMinigamePromptAttachment(
  cfg?,
  title?,
  lines = [],
  fileBaseName = "minigame",
  client = null,
  options: Record<string, any> = {},
) {
  const forceSw = Boolean(options?.forceStarWars);
  const useSw = forceSw || shouldUseStarWarsTheme(cfg);
  const suffix = String(options?.fileNameSuffix || "");
  if (useSw) {
    try {
      const { pickRandomQuizBackgroundUrl } = require("../../../../archivio/starwars/src/Vinili/Utils/Eventi/starWarsQuizBank") as typeof import("../../../../archivio/starwars/src/Vinili/Utils/Eventi/starWarsQuizBank");
      const backgroundUrl = String(options?.backgroundUrl || pickRandomQuizBackgroundUrl() || "").trim();
      const attachment = await canvas.buildStarWarsThemedPromptImage({
        title,
        lines,
        backgroundUrl,
        heroImageUrl: options?.heroImageUrl || null,
        fileName: `${String(fileBaseName || "minigame").replace(/[^\w\-]+/g, "_")}${suffix ? `_${suffix}` : ""}.png`,
      });
      if (attachment) return { attachment, backgroundUrl };
    } catch (_) {}
  }
  const sourceLines = Array.isArray(lines) ? lines : [];
  const needsEmojiArt = sourceLines.some((line?) =>
    /[\p{Extended_Pictographic}\u{1F1E6}-\u{1F1FF}]/u.test(String(line || "")),
  );
  if (needsEmojiArt) {
    try {
      const rich = await canvas.buildEmojiRichPromptImageAttachment(title, lines, fileBaseName);
      if (rich) return { attachment: rich, backgroundUrl: null };
    } catch (_) {}
  }
  return {
    attachment: canvas.buildPromptImageAttachment(title, lines, fileBaseName, suffix, client),
    backgroundUrl: null,
  };
}

/** Aggiornamenti board impiccato: riesue lo stesso sfondo SW del round se presente. */
async function buildHangmanBoardAttachment(game?, lines = [], client = null, fileNameSuffix = "") {
  const bg = String(game?.swBackgroundUrl || "").trim();
  if (bg) {
    try {
      const attachment = await canvas.buildStarWarsThemedPromptImage({
        title: "Impiccato",
        lines,
        backgroundUrl: bg,
        fileName: `hangman_${String(fileNameSuffix || Date.now()).replace(/[^\w\-]+/g, "_")}.png`,
      });
      if (attachment) return attachment;
    } catch (_) {}
  }
  return canvas.buildPromptImageAttachment("Impiccato", lines, "hangman", fileNameSuffix, client);
}

export = {
  normalizeCountryName: remote.normalizeCountryName,
  polishItalianQuestionText: remote.polishItalianQuestionText,
  fetchWikiRegionImage: remote.fetchWikiRegionImage,
  pickBestSingerImage: remote.pickBestSingerImage,
  fetchSingerImageFallback: remote.fetchSingerImageFallback,
  buildDrivingQuizPromptImage: canvas.buildDrivingQuizPromptImage,
  buildStarWarsThemedPromptImage: canvas.buildStarWarsThemedPromptImage,
  buildStarWarsQuizPromptImage: canvas.buildStarWarsQuizPromptImage,
  buildStarWarsQuizAnnounceImage: canvas.buildStarWarsQuizAnnounceImage,
  buildEmojiRichPromptImageAttachment: canvas.buildEmojiRichPromptImageAttachment,
  buildPromptImageAttachment: canvas.buildPromptImageAttachment,
  resolveMinigamePromptAttachment,
  buildHangmanBoardAttachment,
  fetchRawImageAttachment: remote.fetchRawImageAttachment,
  buildRemoteGuessImageCardAttachment: canvas.buildRemoteGuessImageCardAttachment,
  buildMathExpressionImageAttachment: canvas.buildMathExpressionImageAttachment,
  hasUsablePlayerImage: remote.hasUsablePlayerImage,
  censorArtworkImage: canvas.censorArtworkImage,
  buildRegionNameImageAttachment: canvas.buildRegionNameImageAttachment,
};
