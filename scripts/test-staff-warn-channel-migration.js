const assert = require("assert");
const {
  isStaffWarnChannelMessage,
  shouldMigrateStaffWarnMessage,
} = require("../Vinyls/Services/Staff/staffWarnChannelMigrationService");

function run() {
  const warnMsg = {
    id: "1",
    author: { bot: true },
    content: "<@123>",
    embeds: [{ title: "<a:VC_Alert:1482706673176150077> • **__WARN STAFF__** `#1`" }],
    components: [],
  };
  assert(isStaffWarnChannelMessage(warnMsg) === true, "warn embed detected");
  assert(shouldMigrateStaffWarnMessage(warnMsg) === true, "bot warn message migrates");

  const depexPrompt = {
    id: "2",
    author: { bot: false },
    content: "<@123>",
    embeds: [{ title: "<a:VC_Alert:1482706673176150077> 2 warn staff — Decidi azione" }],
    components: [{ components: [{ customId: "staff_warn_depex:123:yes" }] }],
  };
  assert(shouldMigrateStaffWarnMessage(depexPrompt) === true, "depex prompt migrates");

  const randomMsg = {
    id: "3",
    author: { bot: false },
    content: "ciao",
    embeds: [],
    components: [],
  };
  assert(shouldMigrateStaffWarnMessage(randomMsg) === false, "random message skipped");
}

module.exports = run;
if (require.main === module) {
  run();
  console.log("STAFF_WARN_CHANNEL_MIGRATION_TEST_OK");
}