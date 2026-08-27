const { isDiscordStaffChannelPostsEnabled } = require("../Utils/Web/discordWorkflowUiGate");
const { startStaffListPeriodicRefreshLoop } = require("../Utils/Community/staffListUtils");

async function run(client) {
  if (!isDiscordStaffChannelPostsEnabled()) return;
  startStaffListPeriodicRefreshLoop(client);
}

module.exports = { name: "staffList", order: 100, section: "embedOnly", run };
