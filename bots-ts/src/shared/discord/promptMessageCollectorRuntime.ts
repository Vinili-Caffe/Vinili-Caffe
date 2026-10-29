"use strict";

function buildAuthorFilter(userId?) {
  return (msg?) =>
    String(msg?.author?.id || "") === String(userId || "") &&
    !msg.author?.bot &&
    !msg.webhookId &&
    !msg.system;
}

function createPromptMessageCollector(channel?, { userId, time, max = 1 } = {}) {
  if (!channel?.createMessageCollector) return null;

  const filter = buildAuthorFilter(userId);
  const collector = channel.createMessageCollector({ filter, time, max });
  const client = channel.client;

  let settled = false;
  let collectHandler = null;
  let endHandler = null;

  const cleanup = () => {
    if (client) client.off("messageUpdate", onMessageUpdate);
  };

  const deliverCollect = async (msg?) => {
    if (settled) return;
    settled = true;
    cleanup();
    collector.stop("fulfilled");
    if (collectHandler) await collectHandler(msg);
  };

  const onMessageUpdate = async (_old?, updated?) => {
    if (settled) return;
    if (String(updated?.channelId || "") !== String(channel.id || "")) return;
    if (!filter(updated)) return;
    await deliverCollect(updated);
  };

  if (client) client.on("messageUpdate", onMessageUpdate);

  const wrapper = {
    on(event?, handler?) {
      if (event === "collect") {
        collectHandler = handler;
        collector.on("collect", deliverCollect);
        return;
      }
      if (event === "end") {
        endHandler = handler;
        collector.on("end", (collected?, reason?) => {
          cleanup();
          if (!settled) settled = true;
          handler(collected, reason);
        });
      }
    },
    stop() {
      if (settled) return;
      settled = true;
      cleanup();
      collector.stop("stopped");
    },
  };

  return wrapper;
}

export = {
  createPromptMessageCollector,
};
