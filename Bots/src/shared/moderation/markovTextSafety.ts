const { isMarkovScamText, isMarkovScamMessage, filterScamLines } = require("./markovScamFilter") as typeof import("./markovScamFilter");
const { isMarkovBannedText, filterBannedLines } = require("./markovBannedWordsFilter") as typeof import("./markovBannedWordsFilter");
const {
  isMarkovPolicyBlockedText,
  filterPolicyBlockedLines,
} = require("./markovContentPolicy") as typeof import("./markovContentPolicy");
const {
  isMarkovBotNoiseText,
  isMarkovBotNoiseMessage,
  filterBotNoiseLines,
} = require("./markovBotNoiseFilter") as typeof import("./markovBotNoiseFilter");

function isMarkovUnsafeText(text?) {
  return (
    isMarkovScamText(text) ||
    isMarkovBannedText(text) ||
    isMarkovPolicyBlockedText(text) ||
    isMarkovBotNoiseText(text)
  );
}

function filterUnsafeMarkovLines(lines?) {
  return filterBotNoiseLines(filterPolicyBlockedLines(filterBannedLines(filterScamLines(lines))));
}

export = {
  isMarkovUnsafeText,
  filterUnsafeMarkovLines,
  isMarkovScamText,
  isMarkovScamMessage,
  isMarkovBannedText,
  isMarkovPolicyBlockedText,
  isMarkovBotNoiseText,
  isMarkovBotNoiseMessage,
};
