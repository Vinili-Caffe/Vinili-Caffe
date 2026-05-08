module.exports = {
  name: "messageUpdate",
  async execute(oldMessage, newMessage, client) {
    let previous = oldMessage;
    let updated = newMessage;

    if (previous?.partial) {
      previous = await previous.fetch().catch(() => previous);
    }
    if (updated?.partial) {
      updated = await updated.fetch().catch(() => updated);
    }

    if (!updated?.guild || !updated?.author) return;
    if (updated.author.bot || updated.system || updated.webhookId) return;

    const before = String(previous?.content || "");
    const afterRaw = String(updated?.content || "");
    const dash = /[\u2010\u2011\u2012\u2013\u2014\u2212]/g;
    const beforeNorm = before.replace(dash, "-");
    const afterNorm = afterRaw.replace(dash, "-");
    if (!afterNorm.trim() || beforeNorm === afterNorm) return;

    const safePrefix = String(client?.config?.prefix || "-").trim() || "-";
    if (!afterNorm.startsWith(safePrefix)) return;

    if (afterNorm !== afterRaw) {
      try {
        updated.content = afterNorm;
      } catch (_) {}
    }
    updated.__fromMessageUpdatePrefix = true;
    client.emit("messageCreate", updated);
  },
};
