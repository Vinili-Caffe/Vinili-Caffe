const assert = require("assert");
const { ActivityUserProfile } = require("../Vinyls/Schemas/Community/communitySchemas");

function run() {
  const staff = {
    positiveValutazioni: [{ channelId: "111", messageId: "222" }],
    negativeValutazioni: [{ channelId: "111", messageId: "333" }],
    autoValutazioni: [{ channelId: "444", messageId: "555", type: "positive", key: "x" }],
  };
  const paths = new Set();
  for (const list of [staff.positiveValutazioni, staff.negativeValutazioni, staff.autoValutazioni]) {
    for (const entry of list) paths.add(`${entry.channelId}:${entry.messageId}`);
  }
  assert(paths.size === 3, "three unique message refs");
  const schemaPaths = ActivityUserProfile.schema.path("staff").schema.paths;
  assert(schemaPaths.positiveValutazioni, "positiveValutazioni in schema");
  assert(schemaPaths.negativeValutazioni, "negativeValutazioni in schema");
}

module.exports = run;
if (require.main === module) {
  run();
  console.log("STAFF_DEPEX_CHANNEL_CLEANUP_TEST_OK");
}