const { COUNTING_RESTORE_PREFIX, handleCountingRestoreButton } = require("../Utils/Community/countingRestoreService");
const {
  invalidateCountingConfig,
  withCountingGuildLock,
} = require("../Utils/Message/officialMessageCommunityHandlers");

function match(interaction) {
  const id = String(interaction?.customId || "");
  return interaction?.isButton?.() && id.startsWith(COUNTING_RESTORE_PREFIX);
}

async function execute(interaction, client) {
  const guildId = String(interaction?.guildId || "");
  if (!guildId) {
    await handleCountingRestoreButton(interaction, client, invalidateCountingConfig);
    return;
  }
  await withCountingGuildLock(guildId, () =>
    handleCountingRestoreButton(interaction, client, invalidateCountingConfig),
  );
}

module.exports = { name: "countingRestore", order: 49, match, execute };