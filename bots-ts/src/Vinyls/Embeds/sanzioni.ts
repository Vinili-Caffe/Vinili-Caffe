const IDs = require("../Utils/Config/ids") as typeof import("../Utils/Config/ids");
const { getClientChannelCached } = require("../Utils/Interaction/interactionEntityCache") as typeof import("../Utils/Interaction/interactionEntityCache");
const { ensureModerationStickyPanel } = require("../Utils/Moderation/moderationStickyPanelRuntime") as typeof import("../Utils/Moderation/moderationStickyPanelRuntime");

async function run(client?) {
  const channelId = String(IDs.channels?.sanzioniUtenti || "1442569245878648924").trim();
  if (!channelId) return;
  const channel =
    client.channels.cache.get(channelId) || (await getClientChannelCached(client, channelId));
  if (!channel?.isTextBased?.()) {
    if (String(process.env.LOG_PANELS || "0") === "1") {
      global.logger?.warn?.("[CLIENT READY] Sanzioni sticky channel missing:", channelId);
    }
    return;
  }
  await ensureModerationStickyPanel(client, channel);
}

export = { name: "sanzioni", order: 43, section: "embedWithButtons", run };
