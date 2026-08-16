const IDs = require("../Utils/Config/ids");
const { getClientChannelCached } = require("../Utils/Interaction/interactionEntityCache");
const { ensurePauseStickyPanel } = require("../Utils/Pause/pauseStickyPanelRuntime");

async function run(client) {
  const pauseChannelId = String(IDs.channels?.pause || "").trim();
  if (!pauseChannelId) return;
  const channel =
    client.channels.cache.get(pauseChannelId) ||
    (await getClientChannelCached(client, pauseChannelId));
  if (!channel?.isTextBased?.()) {
    if (String(process.env.LOG_PANELS || "0") === "1") {
      global.logger?.warn?.("[CLIENT READY] Pause panel channel missing:", pauseChannelId);
    }
    return;
  }
  await ensurePauseStickyPanel(client, channel);
}

module.exports = { name: "pause", order: 42, section: "embedWithButtons", run };