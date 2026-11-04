const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const OBJECTIVE_DEFS = Object.freeze([
  { id: "setup_first", emoji: E["39560settings"], kind: "flag", flag: "setupDone" },
  { id: "first_partnership", emoji: E["57968element"], kind: "count", target: 1 },
  { id: "server_description", emoji: E["22880partner"], kind: "flag", flag: "descSet" },
  { id: "thank_you_embed", emoji: E.VC_ThankYou, kind: "flag", flag: "thankYouSet" },
  { id: "privacy_responses", emoji: E["3409locked"], kind: "flag", flag: "privacySet" },
  { id: "partnerships_25", emoji: E["853922bronze"], kind: "count", target: 25 },
  { id: "partnerships_50", emoji: E["829581silver"], kind: "count", target: 50 },
  { id: "partnerships_100", emoji: E["919633gold"], kind: "count", target: 100 },
  { id: "partnerships_250", emoji: E["641170diamond"], kind: "count", target: 250 },
  { id: "partnerships_500", emoji: E["174112platinum"], kind: "count", target: 500 },
  { id: "partnerships_1000", emoji: E["310916crimson"], kind: "count", target: 1000 },
  { id: "partnerships_5000", emoji: E["716729iridescent"], kind: "count", target: 5000 },
  { id: "partnerships_10000", emoji: E["681634top250"], kind: "count", target: 10000 },
  { id: "top_daily_first", emoji: E["94814firstplacetrophy"], kind: "appearances", scope: "daily", target: 1 },
  { id: "top_daily_5", emoji: E["30646secondplacetrophy"], kind: "appearances", scope: "daily", target: 5 },
  { id: "top_daily_10", emoji: E["22955thirdplacetrophy"], kind: "appearances", scope: "daily", target: 10 },
  { id: "top_weekly_first", emoji: E["14755chaveouro"], kind: "appearances", scope: "weekly", target: 1 },
  { id: "top_weekly_5", emoji: E["14755chavemedalhaprata"], kind: "appearances", scope: "weekly", target: 5 },
  { id: "top_weekly_10", emoji: E["14755chavebronze"], kind: "appearances", scope: "weekly", target: 10 },
  { id: "top_global_first", emoji: E["76245medalla"], kind: "appearances", scope: "global", target: 1 },
  { id: "top_global_5", emoji: E["78330medalsilver"], kind: "appearances", scope: "global", target: 5 },
  { id: "top_global_10", emoji: E["720660medalbronze"], kind: "appearances", scope: "global", target: 10 },
  { id: "top_global_rank_1", emoji: E.VC_Podio1, kind: "rank", maxRank: 1 },
  { id: "top_global_rank_3", emoji: E.VC_Podio2, kind: "rank", maxRank: 3 },
  { id: "top_global_rank_10", emoji: E.VC_Podio3, kind: "rank", maxRank: 10 },
  { id: "bug_report_1", emoji: E["2398shinyredbughunter"], kind: "counter", counter: "bugReports", target: 1 },
  { id: "bug_report_5", emoji: E["1757bugbusterbadgediscord"], kind:   "counter", counter: "bugReports", target: 5 },
  { id: "bug_report_10", emoji: E["5594shinypurplebughunter"], kind: "counter", counter: "bugReports", target: 10 },
]);

const BADGE_DEFS = Object.freeze(
  OBJECTIVE_DEFS.map((row?) => ({
    id: row.id,
    emoji: row.emoji,
  })),
);

function buildObjectiveDefs() {
  return OBJECTIVE_DEFS.map((row?) => ({ ...row }));
}

export = { OBJECTIVE_DEFS, BADGE_DEFS, buildObjectiveDefs };
