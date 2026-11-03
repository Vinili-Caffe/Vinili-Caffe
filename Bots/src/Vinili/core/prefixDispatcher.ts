const IDs = require("../Config/ids") as typeof import("../Config/ids");
const { handleOfficialPrefixMessage } = require("./officialPrefixDispatcher") as typeof import("./officialPrefixDispatcher");
const { getCachedOrFetchMember } = require("../Community/services/officialMessageAutomationHandlers") as typeof import("../Community/services/officialMessageAutomationHandlers");
const { isCoffeePrefixCommandToken } = require("../../shared/discord/coffeePrefixCommandTokens") as typeof import("../../shared/discord/coffeePrefixCommandTokens");
const { createDispatchPrefixMessage } = require("../../shared/prefix/createDispatchPrefixMessage") as typeof import("../../shared/prefix/createDispatchPrefixMessage");

export = createDispatchPrefixMessage({
  ids: IDs,
  handleOfficialPrefixMessage,
  getCachedOrFetchMember,
  defaultPrefixFallback: "+",
  skipWrongPrefixHintForToken: (token?, usedPrefix?) => {
    if (usedPrefix === "-" && isCoffeePrefixCommandToken(token)) return true;
    return false;
  },
  skipWrongPrefixHintForCommand: (commandName?) => String(commandName || "").toLowerCase() === "help",
});
