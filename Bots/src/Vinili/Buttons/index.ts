/** Barrel parziale per Prefix/Stats e buttonParsers (non è il registry del loader). */
export = {
  server: require("./stats/server"),
  me: require("./stats/me"),
  user: require("./stats/user"),
  channel: require("./stats/channel"),
  blacklist: require("./moderation/blacklist"),
  backupInfo: require("./backup/backupInfo"),
  backupList: require("./backup/backupList"),
  topChannelComponents: require("./stats/topChannel/components"),
};
