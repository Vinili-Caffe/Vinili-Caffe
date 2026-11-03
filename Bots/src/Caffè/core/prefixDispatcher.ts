const IDs = require("../Config/ids") as typeof import("../Config/ids");
const { handleOfficialPrefixMessage } = require("./officialPrefixDispatcher") as typeof import("./officialPrefixDispatcher");
const { getGuildMemberCached } = require("../../shared/discord/interactionEntityCache") as typeof import("../../shared/discord/interactionEntityCache");
const { createDispatchPrefixMessage } = require("../../shared/prefix/createDispatchPrefixMessage") as typeof import("../../shared/prefix/createDispatchPrefixMessage");

export = createDispatchPrefixMessage({
  ids: IDs,
  handleOfficialPrefixMessage,
  getCachedOrFetchMember: getGuildMemberCached,
  defaultPrefixFallback: ",",
});
