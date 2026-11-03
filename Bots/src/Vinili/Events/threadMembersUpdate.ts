const { ghostPingUserIfHuman } = require("../Community/services/ghostPingOnChannelEnter") as typeof import("../Community/services/ghostPingOnChannelEnter");
const {
  resolveManagedStaffThreadContext,
  pruneUnauthorizedStaffThreadMembers,
} = require("../Staff/utils/staffManagedThreadsGuard") as typeof import("../Staff/utils/staffManagedThreadsGuard");

function resolveThread(thread?, addedMembers?, removedMembers?) {
  if (thread?.isThread?.()) return thread;
  return (
    addedMembers?.first?.()?.thread ||
    removedMembers?.first?.()?.thread ||
    null
  );
}

export = {
  name: "threadMembersUpdate",
  async execute(addedMembers?, removedMembers?, thread?) {
    try {
      const resolvedThread = resolveThread(thread, addedMembers, removedMembers);
      if (!resolvedThread?.isThread?.()) return;
      if (!addedMembers?.forEach) return;

      const ctx = await resolveManagedStaffThreadContext(resolvedThread);
      if (ctx) {
        await pruneUnauthorizedStaffThreadMembers(resolvedThread, ctx, addedMembers);
      }

      for (const threadMember of addedMembers.values()) {
        await ghostPingUserIfHuman(resolvedThread, threadMember);
      }
    } catch (error) {
      global.logger?.error?.("[threadMembersUpdate] failed:", error);
    }
  },
};
