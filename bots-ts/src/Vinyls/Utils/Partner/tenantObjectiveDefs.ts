const OBJECTIVE_DEFS = Object.freeze([
  { id: "setup_first", emoji: "<:39560settings:1525525624628973608>", kind: "flag", flag: "setupDone" },
  { id: "first_partnership", emoji: "<:57968element:1525536598765338694>", kind: "count", target: 1 },
  { id: "server_description", emoji: "<:22880partner:1525536381580087307>", kind: "flag", flag: "descSet" },
  { id: "thank_you_embed", emoji: "<a:VC_ThankYou:1330186319673950401>", kind: "flag", flag: "thankYouSet" },
  { id: "privacy_responses", emoji: "<:3409locked:1525536195520626871>", kind: "flag", flag: "privacySet" },
  { id: "partnerships_25", emoji: "<:853922bronze:1525518301130657874>", kind: "count", target: 25 },
  { id: "partnerships_50", emoji: "<:829581silver:1525518304150556732>", kind: "count", target: 50 },
  { id: "partnerships_100", emoji: "<:919633gold:1525518306738442381>", kind: "count", target: 100 },
  { id: "partnerships_250", emoji: "<:641170diamond:1525518309993353297>", kind: "count", target: 250 },
  { id: "partnerships_500", emoji: "<:174112platinum:1525518313843851294>", kind: "count", target: 500 },
  { id: "partnerships_1000", emoji: "<:310916crimson:1525518317782040757>", kind: "count", target: 1000 },
  { id: "partnerships_5000", emoji: "<:716729iridescent:1525518322987307138>", kind: "count", target: 5000 },
  { id: "partnerships_10000", emoji: "<:681634top250:1525518324900036648>", kind: "count", target: 10000 },
  { id: "top_daily_first", emoji: "<a:94814firstplacetrophy:1525519444447723571>", kind: "appearances", scope: "daily", target: 1 },
  { id: "top_daily_5", emoji: "<a:30646secondplacetrophy:1525519446729556139>", kind: "appearances", scope: "daily", target: 5 },
  { id: "top_daily_10", emoji: "<a:22955thirdplacetrophy:1525519449321635850>", kind: "appearances", scope: "daily", target: 10 },
  { id: "top_weekly_first", emoji: "<:14755chaveouro:1525537879500259500>", kind: "appearances", scope: "weekly", target: 1 },
  { id: "top_weekly_5", emoji: "<:14755chavemedalhaprata:1525537877880996020>", kind: "appearances", scope: "weekly", target: 5 },
  { id: "top_weekly_10", emoji: "<:14755chavebronze:1525537881186242580>", kind: "appearances", scope: "weekly", target: 10 },
  { id: "top_global_first", emoji: "<a:76245medalla:1525537883027542116>", kind: "appearances", scope: "global", target: 1 },
  { id: "top_global_5", emoji: "<a:78330medalsilver:1525537884231434433>", kind: "appearances", scope: "global", target: 5 },
  { id: "top_global_10", emoji: "<a:720660medalbronze:1525537886026469546>", kind: "appearances", scope: "global", target: 10 },
  { id: "top_global_rank_1", emoji: "<:VC_Podio1:1482694399283433582>", kind: "rank", maxRank: 1 },
  { id: "top_global_rank_3", emoji: "<:VC_Podio2:1482694424411635712>", kind: "rank", maxRank: 3 },
  { id: "top_global_rank_10", emoji: "<:VC_Podio3:1482694450806259744>", kind: "rank", maxRank: 10 },
  { id: "bug_report_1", emoji: "<:2398shinyredbughunter:1525509031651840171>", kind: "counter", counter: "bugReports", target: 1 },
  { id: "bug_report_5", emoji: "<:1757bugbusterbadgediscord:1525509035233644614>", kind:   "counter", counter: "bugReports", target: 5 },
  { id: "bug_report_10", emoji: "<:5594shinypurplebughunter:1525509033514238112>", kind: "counter", counter: "bugReports", target: 10 },
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
