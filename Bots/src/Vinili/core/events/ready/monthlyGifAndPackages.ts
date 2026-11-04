const cron = require("node-cron") as typeof import("node-cron");
const { runCronDetached } = require("../../../../shared/scheduling/cronDetached") as typeof import("../../../../shared/scheduling/cronDetached");
const { checkAndInstallPackages } = require("../../../Moderation/utils/checkPackages") as typeof import("../../../Moderation/utils/checkPackages");
const IDs = require("../../../Config/ids") as typeof import("../../../Config/ids");
const { getClientChannelCached } = require("../../../../shared/discord/interactionEntityCache") as typeof import("../../../../shared/discord/interactionEntityCache");
const { logError } = require("./startupHelpers") as typeof import("./startupHelpers");

const getChannelSafe = async (client?, channelId?) => { if (!channelId) return null; return client.channels.cache.get(channelId) || (await getClientChannelCached(client, channelId)); };

function scheduleMonthlyGif(client?) {
  try {
    const { shouldStartExternalWorkerLoop } = require("../../../../shared/runtime/externalWorkerGate") as typeof import("../../../../shared/runtime/externalWorkerGate");
    if (!shouldStartExternalWorkerLoop("BOT_SCHEDULER")) return;
    if (client._monthlyGifTask) return;
    client._monthlyGifTask = cron.schedule(
      "0 0 1 * *",
      runCronDetached("[MONTHLY GIF]", async () => {
        const channelId = IDs.channels.chat;
        const channel = await getChannelSafe(client, channelId);
        if (!channel?.isTextBased?.()) return;

        await channel.send({
          content: "@everyone",
          allowedMentions: { parse: ["everyone"] },
          files: [
            {
              attachment: "https://media.tenor.com/crZirRXKLuQAAAAC/manhdz2k9.gif",
              name: "monthly.gif",
            },
          ],
        });
      }),
      { timezone: "Europe/Rome", noOverlap: true },
    );
  } catch (err) {
    global.logger?.error?.("[MONTHLY GIF] Failed to schedule", err);
  }
}

function maybeCheckPackagesOnReady(client?) {
  if (typeof checkAndInstallPackages !== "function") return;
  if (String(process.env.CHECK_PACKAGES_ON_READY || "").trim() !== "1") return;
  Promise.resolve(checkAndInstallPackages(client)).catch((err?) => {
    logError(client, "[PACKAGES] Check failed:", err?.message || err);
  });
}

export = {
  scheduleMonthlyGif,
  maybeCheckPackagesOnReady,
};
