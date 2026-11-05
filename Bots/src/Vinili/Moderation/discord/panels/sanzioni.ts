const IDs = require("../../../Config/ids") as typeof import("../../../Config/ids");
const { getClientChannelCached } = require("../../../../shared/discord/interactionEntityCache") as typeof import("../../../../shared/discord/interactionEntityCache");
const { removeModerationStickyPanel } = require("../../utils/moderationStickyPanelRuntime") as typeof import("../../utils/moderationStickyPanelRuntime");

/** Ready: toglie lo sticky guida sanzioni (resta solo sul sito). */
async function run(client?) {
  const channelId = String(IDs.channels?.sanzioniUtenti || "1442569245878648924").trim();
  if (!channelId) return;
  const channel =
    client.channels.cache.get(channelId) || (await getClientChannelCached(client, channelId));
  if (!channel?.isTextBased?.()) {
    if (String(process.env.LOG_PANELS || "0") === "1") {
      global.logger?.warn?.("[CLIENT READY] Sanzioni channel missing:", channelId);
    }
    return;
  }
  await removeModerationStickyPanel(client, channel);
}

export = { name: "sanzioni", order: 43, section: "embedWithButtons", run };
