
const { startGuessFlagGame, startGuessPlayerGame, startGuessSongGame, startGuessTeamGame, startGuessSingerGame, startGuessAlbumGame } = require("./quizGuessMedia") as typeof import("./quizGuessMedia");
const { startGuessCapitalGame, startGuessRegionCapitalGame, startGuessReverseCapitalGame, startGuessCityGame } = require("./quizGeography") as typeof import("./quizGeography");
const { startGuessNumberGame, startGuessWordGame, startFastTypeGame, startHangmanGame } = require("./quizWords") as typeof import("./quizWords");
const { startDrivingQuizGame } = require("./quizDriving") as typeof import("./quizDriving");
const { startItalianGkGame, startMathExpressionGame, startGuessYearGame, startCompleteVerseGame, startGuessEmojiGame, startQuoteFilmGame, startCompleteProverbGame, startSynonymAntonymGame } = require("./quizCulture") as typeof import("./quizCulture");


export = { startGuessNumberGame, startGuessWordGame, startGuessFlagGame, startGuessPlayerGame, startGuessSongGame, startGuessCapitalGame, startGuessRegionCapitalGame, startGuessReverseCapitalGame, startFastTypeGame, startGuessTeamGame, startGuessSingerGame, startGuessAlbumGame, startHangmanGame, startItalianGkGame, startDrivingQuizGame, startMathExpressionGame, startGuessYearGame, startCompleteVerseGame, startGuessEmojiGame, startQuoteFilmGame, startCompleteProverbGame, startSynonymAntonymGame, startGuessCityGame };
