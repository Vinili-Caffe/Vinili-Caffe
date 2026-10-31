/** Vocali pubbliche: ordine dei canali nella categoria (dove mettere quelli nuovi, riallineamento). */
const { ChannelType } = require("discord.js") as typeof import("discord.js");
const IDs: any = require("../../Utils/Config/ids") as typeof import("../../Utils/Config/ids");
const { getGameVoiceHubCategoryId, isGameVoiceHubsEnabled, getHubChannelIds, getPublicVoiceHubCategoryId, isPublicVoiceHubId, parseVoiceSuffixIndex, voiceHubGroupKeyFromName, resolveHubGroupKey, isHubGroupSpawnChannel, botCanManageVoiceHubs } = require("./voiceHubConfig") as typeof import("./voiceHubConfig");

function channelCategorySortPosition(ch?) {
  if (!ch) return -1;
  const raw = Number(ch.rawPosition);
  if (Number.isFinite(raw)) return raw;
  const pos = Number(ch.position);
  return Number.isFinite(pos) ? pos : -1;
}

function listCategoryChannelsSorted(guild?, parentId?) {
  return [...guild.channels.cache.values()]
    .filter((ch?) => String(ch.parentId || "") === String(parentId || ""))
    .sort((a?, b?) => a.rawPosition - b.rawPosition || String(a.id).localeCompare(String(b.id)));
}

/**
 * hubSpawnUnderHub3: ordine VOCE nella categoria (Discord UI ordina i vocali
 * tra loro; mischiare text+voice in setPositions lasciava gli spawn SOPRA gli hub).
 */
function listCategoryVoiceChannelsSorted(guild?, parentId?) {
  return [...guild.channels.cache.values()]
    .filter(
      (ch?) =>
        String(ch.parentId || "") === String(parentId || "") &&
        (ch.type === ChannelType.GuildVoice || ch.type === ChannelType.GuildStageVoice),
    )
    .sort(
      (a?, b?) =>
        a.rawPosition - b.rawPosition || Number(BigInt(a.id) - BigInt(b.id)),
    );
}

/** Stesso gruppo di discord.js `_sortedChannels` per un vocale (parent + voice types). */
function listSortableVoiceSiblings(guild?, parentId?) {
  return [...guild.channels.cache.values()]
    .filter(
      (ch?) =>
        String(ch.parentId || "") === String(parentId || "") &&
        (ch.type === ChannelType.GuildVoice || ch.type === ChannelType.GuildStageVoice),
    )
    .sort(
      (a?, b?) =>
        a.rawPosition - b.rawPosition || Number(BigInt(a.id) - BigInt(b.id)),
    );
}

/**
 * Indice per Channel#setPosition (discord.js: indice nel gruppo sortable, NON rawPosition).
 * rawPosition passato a setPosition mette lo spawn in cima / sopra l'hub.
 */
function resolveVoiceSetPositionIndex(siblings?, moveId?, afterId?) {
  const list = Array.isArray(siblings) ? siblings : [];
  const afterIdx = list.findIndex((ch?) => String(ch.id) === String(afterId));
  if (afterIdx < 0) return null;
  let targetIdx = afterIdx + 1;
  const moveIdx = list.findIndex((ch?) => String(ch.id) === String(moveId));
  if (moveIdx !== -1 && moveIdx < targetIdx) targetIdx -= 1;
  if (moveIdx === targetIdx) return null; // già a posto
  if (targetIdx < 0) targetIdx = 0;
  if (targetIdx >= list.length) targetIdx = Math.max(0, list.length - 1);
  return targetIdx;
}

/** Coda del gruppo hub (hub + spawn dello stesso tipo), come le stanze sotto l'hub. */
function resolveHubSpawnCreatePosition(guild?, hubChannel?, client?) {
  const hubKey = resolveHubGroupKey(hubChannel, client);
  if (!hubKey) return null;
  const group = listHubGroupChannels(guild, hubChannel, client);
  let tailPos = channelCategorySortPosition(hubChannel);
  for (const ch of group) {
    const pos = channelCategorySortPosition(ch);
    if (pos > tailPos) tailPos = pos;
  }
  /* rawPosition+1 → Channel Create / setPositions (API), non Channel#setPosition */
  return tailPos >= 0 ? tailPos + 1 : null;
}

async function applyHubSpawnCreatePosition(voiceChannel?, rawPosition?, reason?) {
  if (!voiceChannel || rawPosition === undefined || rawPosition === null) return;
  const target = Number(rawPosition);
  if (!Number.isFinite(target)) return;
  /* Preferisci setPositions (raw API). Channel#setPosition interpreta l'argomento come INDICE. */
  if (voiceChannel.guild?.channels?.setPositions) {
    const ok = await voiceChannel.guild.channels
      .setPositions([{ channel: voiceChannel.id, position: target }])
      .then(() => true)
      .catch((err?) => {
        global.logger?.warn?.("[publicVoiceHub] setPositions failed:", err?.message || err);
        return false;
      });
    if (ok) return;
  }
  const parentId = String(voiceChannel.parentId || "");
  const siblings = listSortableVoiceSiblings(voiceChannel.guild, parentId);
  const anchor = siblings.find((ch?) => channelCategorySortPosition(ch) === target - 1) || null;
  const idx = anchor
    ? resolveVoiceSetPositionIndex(siblings, voiceChannel.id, anchor.id)
    : null;
  if (idx == null) return;
  await voiceChannel
    .setPosition(idx, { reason: reason || "Vocale hub spawn in coda gruppo" })
    .catch((err?) => {
      global.logger?.warn?.("[publicVoiceHub] setPosition(index) failed:", err?.message || err);
    });
}

/** Posiziona lo spawn subito sotto l'ultimo canale del gruppo hub (hub o spawn precedente). */
async function placeSpawnAfterHubGroupTail(created?, hubChannel?, guild?, client?, reason?) {
  if (!created?.id || !hubChannel || !guild) return false;
  const parentId = getPublicVoiceHubCategoryId(client, hubChannel);
  await refreshParentChannelsCache(guild, parentId, client, { force: true });
  const freshHub = guild.channels.cache.get(hubChannel.id) || hubChannel;
  const freshCreated = guild.channels.cache.get(created.id) || created;
  const group = listHubGroupChannels(guild, freshHub, client).filter(
    (ch?) =>
      String(ch.id) !== String(freshCreated.id) &&
      (isPublicVoiceHubId(ch.id, client) || isHubGroupSpawnChannel(ch, freshHub, client)),
  );
  const sortedGroup = group.sort(
    (a?, b?) =>
      channelCategorySortPosition(a) - channelCategorySortPosition(b) ||
      String(a.id).localeCompare(String(b.id)),
  );
  const anchor = sortedGroup[sortedGroup.length - 1] || freshHub;
  const anchorFresh = guild.channels.cache.get(anchor.id) || anchor;
  const siblings = listSortableVoiceSiblings(guild, parentId || freshCreated.parentId);
  const targetIdx = resolveVoiceSetPositionIndex(siblings, freshCreated.id, anchorFresh.id);
  if (targetIdx == null) return true;

  let ok = await freshCreated
    .setPosition(targetIdx, { reason: reason || "Vocale hub spawn sotto gruppo" })
    .then(() => true)
    .catch((err?) => {
      global.logger?.warn?.("[publicVoiceHub] place after tail failed:", err?.message || err);
      return false;
    });
  if (!ok && typeof guild.channels?.setPositions === "function") {
    const anchorPos = channelCategorySortPosition(anchorFresh);
    if (anchorPos >= 0) {
      ok = await guild.channels
        .setPositions([{ channel: freshCreated.id, position: anchorPos + 1 }])
        .then(() => true)
        .catch(() => false);
    }
  }
  return ok;
}

function listHubGroupChannels(guild?, hubChannel?, client = null) {
  const parentId = getPublicVoiceHubCategoryId(client, hubChannel);
  const hubKey = resolveHubGroupKey(hubChannel, client);
  if (!hubKey || !parentId) return [];
  return listCategoryVoiceChannelsSorted(guild, parentId).filter(
    (ch?) => resolveHubGroupKey(ch, client) === hubKey,
  );
}

function nextSpawnSuffixIndex(groupChannels?, hubId?) {
  const used = new Set();
  for (const ch of groupChannels) {
    if (String(ch.id) === String(hubId)) continue;
    const n = parseVoiceSuffixIndex(ch.name);
    if (n > 0) used.add(n);
  }
  let i = 1;
  while (used.has(i)) i += 1;
  return i;
}

function resolveInsertSlot(hubChannel?, guild?, client?) {
  const parentId = getPublicVoiceHubCategoryId(client, hubChannel);
  const hubKey = resolveHubGroupKey(hubChannel, client);
  if (!hubKey || !parentId) return null;
  const siblings = listCategoryVoiceChannelsSorted(guild, parentId);
  const hubIndex = siblings.findIndex((ch?) => String(ch.id) === String(hubChannel.id));
  if (hubIndex < 0) return null;

  let insertAt = hubIndex + 1;
  for (let i = hubIndex + 1; i < siblings.length; i += 1) {
    const ch = siblings[i];
    if (ch.type !== ChannelType.GuildVoice && ch.type !== ChannelType.GuildStageVoice) continue;
    if (isPublicVoiceHubId(ch.id, client, guild)) break;
    if (resolveHubGroupKey(ch, client) !== hubKey) break;
    insertAt = i + 1;
  }

  const prev = siblings[insertAt - 1];
  if (!prev) return null;
  const prevPos = channelCategorySortPosition(prev);
  if (prevPos < 0) return null;
  // Sempre subito sotto l'ultimo canale del gruppo (hub o spawn precedente).
  return prevPos + 1;
}

function resolveInsertPosition(hubChannel?, guild?, client?) {
  // Preferisci lo slot per indice fratelli (subito dopo l'ultimo spawn del gruppo),
  // non solo rawPosition+1 (con buchi Discord finiva sotto l'hub sbagliato).
  const bySlot = resolveInsertSlot(hubChannel, guild, client);
  if (bySlot != null) return bySlot;
  return resolveHubSpawnCreatePosition(guild, hubChannel, client);
}

async function refreshParentChannelsCache(guild?, parentId?, client?, options: Record<string, any> = {}) {
  if (!guild?.channels?.fetch || !parentId) return;
  const force = options.force === true;
  const parentIdStr = String(parentId);
  const hubIds = client ? getHubChannelIds(client) : [];

  if (force || hubIds.some((id?) => !guild.channels.cache.has(id))) {
    await guild.channels.fetch(undefined, { force: true }).catch(() => null);
    return;
  }

  const cachedInParent = [...guild.channels.cache.values()].filter(
    (ch?) => String(ch.parentId || "") === parentIdStr,
  );
  const hubsInParent = hubIds
    .map((id?) => guild.channels.cache.get(id))
    .filter((ch?) => ch && String(ch.parentId || "") === parentIdStr);
  if (!hubsInParent.length && !cachedInParent.length) {
    await guild.channels.fetch(undefined, { force: true }).catch(() => null);
    return;
  }

  const siblings = listCategoryChannelsSorted(guild, parentId);
  const missingHubInSiblings = hubsInParent.some(
    (hub?) => !siblings.some((ch?) => String(ch.id) === String(hub.id)),
  );
  if (missingHubInSiblings) {
    await guild.channels.fetch(undefined, { force: true }).catch(() => null);
    return;
  }

  const voiceInParentCount = cachedInParent.filter((ch?) => ch.type === ChannelType.GuildVoice).length;
  if (voiceInParentCount < hubsInParent.length) {
    await guild.channels.fetch(undefined, { force: true }).catch(() => null);
  }
}

function verifyHubGroupChannelOrder(guild?, hubChannel?, client?) {
  const parentId = getPublicVoiceHubCategoryId(client, hubChannel);
  if (!parentId) return { ok: true, misplaced: [] };
  const freshHub = guild.channels.cache.get(hubChannel.id) || hubChannel;
  /* hubSpawnUnderHub3: solo vocali — come li vede Discord in UI */
  const siblings = listCategoryVoiceChannelsSorted(guild, parentId);
  const hubIdx = siblings.findIndex((ch?) => String(ch.id) === String(freshHub.id));
  if (hubIdx < 0) return { ok: true, misplaced: [] };

  const spawns = siblings
    .filter((ch?) => isHubGroupSpawnChannel(ch, freshHub, client))
    .sort((a?, b?) => parseVoiceSuffixIndex(a.name) - parseVoiceSuffixIndex(b.name));
  const misplaced = [];
  for (let i = 0; i < spawns.length; i += 1) {
    const idx = siblings.findIndex((ch?) => String(ch.id) === String(spawns[i].id));
    const expectedIdx = hubIdx + 1 + i;
    if (idx !== expectedIdx) {
      misplaced.push({ id: spawns[i].id, name: spawns[i].name, idx, expectedIdx });
    }
  }
  return { ok: misplaced.length === 0, misplaced };
}

function buildDesiredSiblingsWithHubSpawns(siblings?, hub?, spawns?) {
  const spawnIdSet = new Set(spawns.map((ch?) => String(ch.id)));
  const withoutSpawns = siblings.filter((ch?) => !spawnIdSet.has(String(ch.id)));
  const hubIdx = withoutSpawns.findIndex((ch?) => String(ch.id) === String(hub.id));
  if (hubIdx < 0) return siblings;
  return [
    ...withoutSpawns.slice(0, hubIdx + 1),
    ...spawns,
    ...withoutSpawns.slice(hubIdx + 1),
  ];
}

function siblingsOrderEqual(left?, right?) {
  if (left.length !== right.length) return false;
  for (let i = 0; i < left.length; i += 1) {
    if (String(left[i].id) !== String(right[i].id)) return false;
  }
  return true;
}

function computeCategoryPositionUpdates(currentSorted?, desiredOrder?) {
  if (currentSorted.length !== desiredOrder.length) return [];
  const base = Math.min(...currentSorted.map((ch?) => Number(ch.rawPosition)));
  if (!Number.isFinite(base)) return [];
  const orderMismatch = currentSorted.some((ch?, i?) => String(desiredOrder[i]?.id) !== String(ch.id));
  const updates = [];
  for (let i = 0; i < desiredOrder.length; i += 1) {
    const ch = desiredOrder[i];
    const wantPos = base + i;
    const posMismatch = Number(ch.rawPosition) !== wantPos;
    /* hubSpawnUnderHub3: se l'ordine è sbagliato, riscrivi TUTTE le posizioni voice
       (update parziali Discord spesso non scambiano duo⁰¹ ↔ hub). */
    if (orderMismatch || posMismatch) {
      updates.push({ channel: ch.id, position: wantPos });
    }
  }
  return updates;
}

function isStanzaLobbyOrRoomChannel(ch?, parentId = "") {
  const id = String(ch?.id || "").trim();
  const lobbyId = String(IDs.channels?.stanzaLobbyVoice || "").trim();
  if (lobbyId && id === lobbyId) return true;
  if (!ch?.isVoiceBased?.()) return false;
  /* hub duo/trio/squad/chill/cinema non sono stanze temporanee */
  if (isPublicVoiceHubId(id, null, ch.guild)) return false;
  const pinIds = new Set(getPinnedTopPublicVoiceIds());
  if (pinIds.has(id)) return false;
  const n = String(ch?.name || "");
  if (/crea una\s/i.test(n)) return false;
  /* hubSpawnUnderHub3: duo⁰¹/trio⁰¹/squad⁰¹ NON sono stanze Coffee —
     altrimenti finiscono sotto "crea una stanza" e SOPRA gli hub. */
  if (parseVoiceSuffixIndex(n) > 0 && voiceHubGroupKeyFromName(n)) return false;
  /* Coffee crea le stanze: reorder Vinyls le tiene sotto l'hub "crea una stanza". */
  if (/Stanza di\s+/i.test(n)) return true;
  if (parentId && String(ch.parentId || "") !== String(parentId)) return false;
  try {
    const coffee = require("../../../Caffè/Services/Voice/stanzaVoiceRoomsService") as typeof import("../../../Caffè/Services/Voice/stanzaVoiceRoomsService");
    if (typeof coffee.isManagedStanzaRoomChannel === "function") {
      return Boolean(coffee.isManagedStanzaRoomChannel(ch, parentId || String(ch.parentId || "")));
    }
  } catch (_) {}
  return false;
}

function getPinnedTopPublicVoiceIds() {
  /* cinema + chill sempre in cima a VOCALI (cinema primo, poi chill; sopra stanza/hub) */
  return [
    String(IDs.channels?.serataFilm || "").trim(),
    String(IDs.channels?.vocaleLounge1 || "").trim(),
  ].filter((id?) => /^\d{16,22}$/.test(id));
}

function buildLimitateCategoryDesiredOrder(guild?, client?, parentId?) {
  /* hubSpawnUnderHub3: solo voice — setPositions su mix text+voice rompeva lo stack UI */
  const siblings = listCategoryVoiceChannelsSorted(guild, parentId);
  const used = new Set();
  const ordered = [];

  for (const pinId of getPinnedTopPublicVoiceIds()) {
    const pinned = siblings.find((ch?) => String(ch.id) === pinId);
    if (!pinned || used.has(String(pinned.id))) continue;
    ordered.push(pinned);
    used.add(String(pinned.id));
  }

  // Hub stanze temporanee + le sue stanze SOPRA gli altri hub (duo/trio/…).
  const stanzaLobbyId = String(IDs.channels?.stanzaLobbyVoice || "").trim();
  const stanzaLobby = siblings.find((ch?) => String(ch.id) === stanzaLobbyId);
  if (stanzaLobby) {
    ordered.push(stanzaLobby);
    used.add(String(stanzaLobby.id));
    for (const ch of siblings) {
      if (used.has(String(ch.id))) continue;
      if (!isStanzaLobbyOrRoomChannel(ch, parentId)) continue;
      ordered.push(ch);
      used.add(String(ch.id));
    }
  }

  /* Hub da ID configurati + discovery "crea una …" (se ID stale, non perdiamo il gruppo). */
  const hubIdSet = new Set(getHubChannelIds(client, guild).map((id?) => String(id)));
  const hubs = [];
  for (const ch of siblings) {
    if (hubIdSet.has(String(ch.id))) {
      hubs.push(ch);
      continue;
    }
    /* fallback nome: crea una duo/trio/squad… = hub lobby */
    if (/crea\s+un[a']?\s+/i.test(String(ch.name || "")) && voiceHubGroupKeyFromName(ch.name)) {
      hubs.push(ch);
    }
  }
  hubs.sort((a?, b?) => a.rawPosition - b.rawPosition || String(a.id).localeCompare(String(b.id)));

  for (const hub of hubs) {
    if (used.has(String(hub.id))) continue;
    ordered.push(hub);
    used.add(String(hub.id));
    const spawns = siblings
      .filter((ch?) => !used.has(String(ch.id)) && isHubGroupSpawnChannel(ch, hub, client))
      .sort((a?, b?) => parseVoiceSuffixIndex(a.name) - parseVoiceSuffixIndex(b.name));
    for (const spawn of spawns) {
      ordered.push(spawn);
      used.add(String(spawn.id));
    }
  }
  for (const ch of siblings) {
    if (!used.has(String(ch.id))) ordered.push(ch);
  }
  return ordered;
}

async function applyCategoryPositionUpdates(guild?, updates?) {
  if (!updates.length) return { applied: 0 };
  const movable = [];
  for (const row of updates) {
    const ch = guild.channels.cache.get(row.channel);
    if (!ch) continue;
    if (ch.manageable === false) continue;
    movable.push(row);
  }
  if (!movable.length) return { applied: 0, reason: "nothing_movable" };
  try {
    if (typeof guild.channels?.setPositions === "function") {
      await guild.channels.setPositions(movable);
    } else {
      for (const row of movable) {
        const ch = guild.channels.cache.get(row.channel);
        if (ch?.setPosition) await ch.setPosition(row.position);
      }
    }
    await guild.channels.fetch(undefined, { force: true }).catch(() => null);
    return { applied: movable.length };
  } catch (err) {
    return {
      applied: 0,
      reason: "set_positions_failed",
      error: err?.message || String(err),
    };
  }
}

async function moveMisplacedHubSpawns(guild?, client?, parentId?, desiredOrder?, options: Record<string, any> = {}) {
  const gapMs = Number(options.gapMs) > 0 ? Number(options.gapMs) : 350;
  let moved = 0;
  for (let targetIdx = 0; targetIdx < desiredOrder.length; targetIdx += 1) {
    const target = desiredOrder[targetIdx];
    if (!target || isPublicVoiceHubId(target.id, client, guild)) continue;
    if (target.type !== ChannelType.GuildVoice && target.type !== ChannelType.GuildStageVoice) {
      continue;
    }
    /* Solo spawn hub (duo/trio/…) — non altre voice random */
    const isSpawn = parseVoiceSuffixIndex(target.name) > 0 && resolveHubGroupKey(target, client);
    if (!isSpawn && !isHubGroupSpawnChannel(target, desiredOrder[targetIdx - 1] || target, client)) {
      /* keep moving only superscript spawns */
      if (parseVoiceSuffixIndex(target.name) <= 0) continue;
    }

    let prev = null;
    for (let i = targetIdx - 1; i >= 0; i -= 1) {
      const ch = desiredOrder[i];
      if (ch?.type === ChannelType.GuildVoice || ch?.type === ChannelType.GuildStageVoice) {
        prev = ch;
        break;
      }
    }

    const siblings = listSortableVoiceSiblings(guild, parentId);
    const currentIdx = siblings.findIndex((ch?) => String(ch.id) === String(target.id));
    const prevIdx = prev ? siblings.findIndex((ch?) => String(ch.id) === String(prev.id)) : -1;
    if (prev && currentIdx === prevIdx + 1) continue;
    if (!prev && currentIdx === 0) continue;

    const fresh = guild.channels.cache.get(target.id) || target;
    if (fresh.manageable === false) continue;

    let ok = false;
    if (prev) {
      const idx = resolveVoiceSetPositionIndex(siblings, fresh.id, prev.id);
      if (idx == null) continue;
      ok = await fresh
        .setPosition(idx, { reason: "hubSpawnUnderHub3 spawn under hub" })
        .then(() => true)
        .catch(() => false);
      if (!ok && typeof guild.channels?.setPositions === "function") {
        const prevPos = channelCategorySortPosition(guild.channels.cache.get(prev.id) || prev);
        if (prevPos >= 0) {
          ok = await guild.channels
            .setPositions([{ channel: fresh.id, position: prevPos + 1 }])
            .then(() => true)
            .catch(() => false);
        }
      }
    } else {
      ok = await fresh.setPosition(0, { reason: "hubSpawnUnderHub3 spawn top" }).then(() => true).catch(() => false);
    }
    if (ok) {
      moved += 1;
      if (gapMs > 0) await pauseMs(gapMs);
      if (options.skipFetch !== true) {
        await guild.channels.fetch(undefined, { force: true }).catch(() => null);
      }
    }
  }
  return moved;
}

async function reorderLimitateCategory(guild?, client?, options: Record<string, any> = {}) {
  const stats = { moved: 0, failed: 0, parentId: "" };
  if (!guild || !(await botCanManageVoiceHubs(guild))) return stats;
  const quick = options.quick === true;
  const maxAttempts = quick ? 1 : 3;
  const retryPauseMs = quick ? 0 : 450;
  const spawnGapMs = quick ? 0 : 350;

  const parentId = String(
    options.parentId ||
      getPublicVoiceHubCategoryId(client) ||
      IDs.categories?.categoryPublics ||
      IDs.categories?.categoryLimitate ||
      guild.channels.cache.get(getHubChannelIds(client)[0] || "")?.parentId ||
      "",
  );
  if (!parentId) return stats;
  stats.parentId = parentId;

  await refreshParentChannelsCache(guild, parentId, client, { force: options.forceFetch === true && !quick });
  const desired = buildLimitateCategoryDesiredOrder(guild, client, parentId);
  let siblings = listCategoryVoiceChannelsSorted(guild, parentId);
  if (siblingsOrderEqual(siblings, desired)) return stats;

  for (let attempt = 0; attempt < maxAttempts; attempt += 1) {
    siblings = listCategoryVoiceChannelsSorted(guild, parentId);
    const desiredOrder = buildLimitateCategoryDesiredOrder(guild, client, parentId);
    if (siblingsOrderEqual(siblings, desiredOrder)) break;

    const updates = computeCategoryPositionUpdates(siblings, desiredOrder);
    const batch = await applyCategoryPositionUpdates(guild, updates);
    if (batch.applied > 0) {
      stats.moved += batch.applied;
      if (retryPauseMs > 0) await pauseMs(retryPauseMs);
      siblings = listCategoryVoiceChannelsSorted(guild, parentId);
      if (siblingsOrderEqual(siblings, desiredOrder)) break;
    }

    /* hubSpawnUnderHub3: dopo setPositions, forza move spawn→sotto hub uno a uno */
    const spawnMoved = await moveMisplacedHubSpawns(guild, client, parentId, desiredOrder, {
      gapMs: spawnGapMs,
      skipFetch: quick,
    });
    if (spawnMoved > 0) {
      stats.moved += spawnMoved;
      if (retryPauseMs > 0) await pauseMs(retryPauseMs);
      continue;
    }

    if (batch.applied > 0) continue;

    stats.failed += 1;
    if (!quick) {
      global.logger?.warn?.(
        "[publicVoiceHub] limitate reorder failed:",
        batch.reason || "spawn_move_failed",
        batch.error || "",
        siblings.map((ch?) => `${ch.name}@${ch.rawPosition}`).join(" | "),
      );
    }
    break;
  }

  return stats;
}

function pauseMs(ms?) {
  return new Promise((resolve?) => setTimeout(resolve, ms));
}

async function ensureHubGroupChannelOrder(guild?, hubChannel?, client?, options: Record<string, any> = {}) {
  const parentId = getPublicVoiceHubCategoryId(client, hubChannel);
  const stats: any = await reorderLimitateCategory(guild, client, {
    parentId,
    forceFetch: options.forceFetch === true,
  });
  stats.hubId = String(hubChannel?.id || "");
  const verify = verifyHubGroupChannelOrder(guild, hubChannel, client);
  if (!verify.ok) stats.misplaced = verify.misplaced;
  return stats;
}

async function realignAllPublicVoiceHubGroups(guild?, client?) {
  const summary = { moved: 0, skipped: 0, failed: 0, misplaced: [] };
  if (!guild || !(await botCanManageVoiceHubs(guild))) return summary;
  await guild.channels.fetch(undefined, { force: true }).catch(() => null);
  const parentIds = new Set();
  const duoParent = getPublicVoiceHubCategoryId(client);
  if (duoParent) parentIds.add(duoParent);
  const gameParent = getGameVoiceHubCategoryId(client);
  if (gameParent && isGameVoiceHubsEnabled(client)) parentIds.add(gameParent);
  for (const parentId of parentIds) {
    const stats = await reorderLimitateCategory(guild, client, { forceFetch: true, parentId });
    summary.moved += stats.moved || 0;
    summary.failed += stats.failed || 0;
  }
  for (const hubId of getHubChannelIds(client, guild)) {
    const hub = guild.channels.cache.get(hubId) || (await guild.channels.fetch(hubId).catch(() => null));
    if (!hub?.isVoiceBased?.()) continue;
    const verify = verifyHubGroupChannelOrder(guild, hub, client);
    if (!verify.ok && Array.isArray(verify.misplaced)) summary.misplaced.push(...verify.misplaced);
  }
  return summary;
}

async function realignPublicVoiceHubGroupsOnStartup(client?) {
  const guildId = String(IDs.guilds?.main || "");
  if (!guildId) return { ok: false, reason: "no_main_guild" };
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  if (!guild) return { ok: false, reason: "guild_not_found" };
  if (!(await botCanManageVoiceHubs(guild))) {
    global.logger?.warn?.("[publicVoiceHub] realign skipped: missing ManageChannels/MoveMembers or members.me");
    return { ok: false, reason: "missing_permissions" };
  }
  const summary = await realignAllPublicVoiceHubGroups(guild, client);
  if (summary.misplaced.length) {
    global.logger?.warn?.(
      "[publicVoiceHub] realign incomplete:",
      summary.misplaced.map((row?) => `${row.name || row.id} idx=${row.idx} expected=${row.expectedIdx}`).join("; "),
      `(moved=${summary.moved} failed=${summary.failed})`,
    );
    return { ok: false, reason: "misplaced_after_realign", summary };
  }
  if (summary.failed > 0) {
    global.logger?.warn?.(
      "[publicVoiceHub] realign had failures:",
      `moved=${summary.moved} skipped=${summary.skipped} failed=${summary.failed}`,
    );
    return { ok: false, reason: "move_failed", summary };
  }
  return { ok: true, summary };
}

export = { placeSpawnAfterHubGroupTail, listHubGroupChannels, nextSpawnSuffixIndex, resolveInsertSlot, resolveInsertPosition, refreshParentChannelsCache, verifyHubGroupChannelOrder, buildDesiredSiblingsWithHubSpawns, computeCategoryPositionUpdates, buildLimitateCategoryDesiredOrder, reorderLimitateCategory, pauseMs, ensureHubGroupChannelOrder, realignAllPublicVoiceHubGroups, realignPublicVoiceHubGroupsOnStartup };
