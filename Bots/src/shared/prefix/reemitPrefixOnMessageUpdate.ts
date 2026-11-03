const UNICODE_DASH_RE = /[\u2010\u2011\u2012\u2013\u2014\u2212]/g;

/**
 * Se il messaggio editato è (ancora/ora) un comando prefix, re-emette messageCreate.
 * @returns {boolean} true se ha emesso
 */
function reemitPrefixOnMessageUpdate(oldMessage?, newMessage?, client?, options: Record<string, any> = {}) {
  let previous = oldMessage;
  let updated = newMessage;

  const run = async () => {
    if (previous?.partial) previous = await previous.fetch().catch(() => previous);
    if (updated?.partial) updated = await updated.fetch().catch(() => updated);

    if (!updated?.guild || !updated?.author) return false;
    if (updated.author.bot || updated.system || updated.webhookId) return false;

    const before = String(previous?.content || "");
    const afterRaw = String(updated?.content || "");
    const beforeNorm = before.replace(UNICODE_DASH_RE, "-");
    const afterNorm = afterRaw.replace(UNICODE_DASH_RE, "-");
    if (!afterNorm.trim() || beforeNorm === afterNorm) return false;

    const safePrefix =
      String(client?.config?.prefix || options.defaultPrefix || "+").trim() || "+";
    if (!afterNorm.startsWith(safePrefix)) return false;

    if (afterNorm !== afterRaw) {
      try {
        updated.content = afterNorm;
      } catch (_) {}
    }
    updated.__fromMessageUpdatePrefix = true;
    client.emit("messageCreate", updated);
    return true;
  };

  return run();
}

export = { reemitPrefixOnMessageUpdate, UNICODE_DASH_RE };
