const { isMarkovScamText, isMarkovScamMessage, filterScamLines } = require("./markovScamFilter");
const { isMarkovBannedText, filterBannedLines } = require("./markovBannedWordsFilter");
const {
  isMarkovPolicyBlockedText,
  filterPolicyBlockedLines,
} = require("./markovContentPolicy");
const {
  isMarkovBotNoiseText,
  isMarkovBotNoiseMessage,
  filterBotNoiseLines,
} = require("./markovBotNoiseFilter");

function isMarkovUnsafeText(text) {
  return (
    isMarkovScamText(text) ||
    isMarkovBannedText(text) ||
    isMarkovPolicyBlockedText(text) ||
    isMarkovBotNoiseText(text)
  );
}

function filterUnsafeMarkovLines(lines) {
  return filterBotNoiseLines(filterPolicyBlockedLines(filterBannedLines(filterScamLines(lines))));
}

module.exports = {
  isMarkovUnsafeText,
  filterUnsafeMarkovLines,
  isMarkovScamText,
  isMarkovScamMessage,
  isMarkovBannedText,
  isMarkovPolicyBlockedText,
  isMarkovBotNoiseText,
  isMarkovBotNoiseMessage,
};
