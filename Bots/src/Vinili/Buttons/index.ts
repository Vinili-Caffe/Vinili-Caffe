/** Barrel parziale per Stats buttons + buttonParsers (non è il registry del loader). */
export = {
  server: require("../Stats/discord/buttons/server"),
  me: require("../Stats/discord/buttons/me"),
  user: require("../Stats/discord/buttons/user"),
  channel: require("../Stats/discord/buttons/channel"),
  blacklist: require("../Moderation/discord/buttons/blacklist"),
  backupInfo: require("../Backup/discord/buttons/backupInfo"),
  backupList: require("../Backup/discord/buttons/backupList"),
  topChannelComponents: require("../Stats/discord/buttons/topChannel/components"),
};
