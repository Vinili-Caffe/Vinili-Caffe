/** Minigiochi: immagini delle domande (canvas), cartelli, impiccato e immagini scaricate. */
const remote = require("./minigameImageRemote") as typeof import("./minigameImageRemote");
const canvas = require("./minigameImageCanvas") as typeof import("./minigameImageCanvas");

export = {
  normalizeCountryName: remote.normalizeCountryName,
  polishItalianQuestionText: remote.polishItalianQuestionText,
  fetchWikiRegionImage: remote.fetchWikiRegionImage,
  pickBestSingerImage: remote.pickBestSingerImage,
  fetchSingerImageFallback: remote.fetchSingerImageFallback,
  buildDrivingQuizPromptImage: canvas.buildDrivingQuizPromptImage,
  buildEmojiRichPromptImageAttachment: canvas.buildEmojiRichPromptImageAttachment,
  buildPromptImageAttachment: canvas.buildPromptImageAttachment,
  fetchRawImageAttachment: remote.fetchRawImageAttachment,
  buildRemoteGuessImageCardAttachment: canvas.buildRemoteGuessImageCardAttachment,
  buildMathExpressionImageAttachment: canvas.buildMathExpressionImageAttachment,
  hasUsablePlayerImage: remote.hasUsablePlayerImage,
  censorArtworkImage: canvas.censorArtworkImage,
  buildRegionNameImageAttachment: canvas.buildRegionNameImageAttachment,
};
