/** Barrel parziale per Stats buttons + buttonParsers (non è il registry del loader). */
export = {
  server: require("./server"),
  me: require("./me"),
  user: require("./user"),
  channel: require("./channel"),
  blacklist: require("../../../Moderation/discord/buttons/blacklist"),
  backupInfo: require("../../../Backup/discord/buttons/backupInfo"),
  backupList: require("../../../Backup/discord/buttons/backupList"),
  topChannelComponents: require("./topChannel/components"),
};
