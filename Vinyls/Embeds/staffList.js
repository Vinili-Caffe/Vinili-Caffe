const { startStaffListPeriodicRefreshLoop } = require("../Utils/Community/staffListUtils");

async function run(client) {
  startStaffListPeriodicRefreshLoop(client);
}

module.exports = { name: "staffList", order: 100, section: "embedOnly", run };