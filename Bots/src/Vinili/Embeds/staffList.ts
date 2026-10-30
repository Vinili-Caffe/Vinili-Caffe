const { isDiscordStaffChannelPostsEnabled } = require("../Web/discordWorkflowUiGate") as typeof import("../Web/discordWorkflowUiGate");
const { startStaffListPeriodicRefreshLoop } = require("../Utils/Community/staffListUtils") as typeof import("../Utils/Community/staffListUtils");

async function run(client?) {
  if (!isDiscordStaffChannelPostsEnabled()) return;
  startStaffListPeriodicRefreshLoop(client);
}

export = { name: "staffList", order: 100, section: "embedOnly", run };
