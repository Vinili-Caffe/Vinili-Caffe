const { ghostPingUserIfHuman } = require("../Utils/Message/ghostPingOnChannelEnter");

function resolveThread(oldMembers, newMembers) {
  return newMembers?.thread || oldMembers?.thread || newMembers?.first?.()?.thread || oldMembers?.first?.()?.thread || null;
}

function resolveAddedThreadMembers(oldMembers, newMembers) {
  const added = [];
  if (!newMembers?.forEach) return added;

  newMembers.forEach((threadMember, userId) => {
    const id = String(threadMember?.id || userId || "").trim();
    if (!id || oldMembers?.has?.(id)) return;
    added.push(threadMember);
  });

  return added;
}

module.exports = {
  name: "threadMembersUpdate",
  async execute(oldMembers, newMembers) {
    try {
      const thread = resolveThread(oldMembers, newMembers);
      if (!thread?.isThread?.()) return;

      for (const threadMember of resolveAddedThreadMembers(oldMembers, newMembers)) {
        await ghostPingUserIfHuman(thread, threadMember);
      }
    } catch (error) {
      global.logger?.error?.("[threadMembersUpdate] failed:", error);
    }
  },
};