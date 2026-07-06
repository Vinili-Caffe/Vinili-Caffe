const { ghostPingUserIfHuman } = require("../Utils/Message/ghostPingOnChannelEnter");

function resolveThread(thread, addedMembers, removedMembers) {
  if (thread?.isThread?.()) return thread;
  return (
    addedMembers?.first?.()?.thread ||
    removedMembers?.first?.()?.thread ||
    null
  );
}

module.exports = {
  name: "threadMembersUpdate",
  async execute(addedMembers, removedMembers, thread) {
    try {
      const resolvedThread = resolveThread(thread, addedMembers, removedMembers);
      if (!resolvedThread?.isThread?.()) return;
      if (!addedMembers?.forEach) return;

      for (const threadMember of addedMembers.values()) {
        await ghostPingUserIfHuman(resolvedThread, threadMember);
      }
    } catch (error) {
      global.logger?.error?.("[threadMembersUpdate] failed:", error);
    }
  },
};
