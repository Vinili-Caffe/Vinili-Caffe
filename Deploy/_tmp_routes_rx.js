const { Routes } = require("/opt/bot/node_modules/discord.js");
console.log(Object.keys(Routes).filter((k) => /reaction/i.test(k)));
console.log("channelMessageReaction", typeof Routes.channelMessageReaction);
console.log("channelMessageReactions", typeof Routes.channelMessageReactions);
if (typeof Routes.channelMessageReaction === "function") {
  console.log(Routes.channelMessageReaction("c", "m", "e"));
}
if (typeof Routes.channelMessageReactions === "function") {
  console.log(Routes.channelMessageReactions("c", "m", "e"));
}
