function normalizeThreadName(name?) {
  return String(name || "")
    .replace(/\s+/g, " ")
    .trim()
    .toLowerCase();
}

function threadMatchesSpecName(thread?, specName?) {
  if (!thread?.isThread?.()) return false;
  return normalizeThreadName(thread.name) === normalizeThreadName(specName);
}

async function collectThreadsUnderParent(parent?) {
  const out = [];
  const seen = new Set();
  const push = (thread?) => {
    if (!thread?.id || seen.has(thread.id)) return;
    if (!thread.isThread?.()) return;
    seen.add(thread.id);
    out.push(thread);
  };

  if (!parent?.threads) return out;

  if (parent.threads.cache?.size) {
    for (const thread of parent.threads.cache.values()) push(thread);
  }

  if (parent.threads.fetchActive) {
    const active = await parent.threads.fetchActive().catch(() => null);
    if (active?.threads?.size) {
      for (const thread of active.threads.values()) push(thread);
    }
  }

  if (parent.threads.fetchArchived) {
    let before;
    for (let page = 0; page < 4; page += 1) {
      const archived = await parent.threads
        .fetchArchived({ limit: 25, ...(before ? { before } : {}) })
        .catch(() => null);
      if (!archived?.threads?.size) break;
      for (const thread of archived.threads.values()) push(thread);
      before = archived.threads.last()?.id;
      if (archived.threads.size < 25) break;
    }
  }

  return out;
}

async function fetchThreadChannel(client?, threadId?) {
  const id = String(threadId || "").trim();
  if (!/^\d{16,22}$/.test(id)) return null;
  const cached = client?.channels?.cache?.get(id) || null;
  if (cached?.isThread?.()) return cached;
  const fetched = await client?.channels?.fetch?.(id).catch(() => null);
  return fetched?.isThread?.() ? fetched : null;
}

async function dedupeStaffThreads(matching?, keepId?, logTag?) {
  const keep = String(keepId || "").trim();
  if (!keep) return;
  for (const thread of matching) {
    if (String(thread.id) === keep) continue;
    await thread.delete("Thread staff duplicato (stesso nome)").catch((err?) => {
      global.logger?.warn?.(`${logTag} Eliminazione duplicato fallita:`, thread.id, err?.message || err);
    });
  }
}

async function resolveExistingStaffThread(client?, parent?, specName?, savedId?, logTag = "[STAFF THREAD]") {
  if (!parent?.id) return null;
  const parentId = String(parent.id);
  const threads = await collectThreadsUnderParent(parent);
  const matching = threads.filter(
    (thread?) => String(thread.parentId || "") === parentId && threadMatchesSpecName(thread, specName),
  );

  if (savedId) {
    const savedThread = await fetchThreadChannel(client, savedId);
    if (
      savedThread &&
      String(savedThread.parentId || "") === parentId &&
      threadMatchesSpecName(savedThread, specName)
    ) {
      await dedupeStaffThreads(matching, savedThread.id, logTag);
      return savedThread;
    }
  }

  if (!matching.length) return null;

  const canonical = [...matching].sort(
    (a?, b?) => Number(a.createdTimestamp || 0) - Number(b.createdTimestamp || 0),
  )[0];
  await dedupeStaffThreads(matching, canonical.id, logTag);
  return canonical;
}

export = {
  resolveExistingStaffThread,
  __test: {
    normalizeThreadName,
    threadMatchesSpecName,
  },
};
