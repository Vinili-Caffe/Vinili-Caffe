/** Stanze vocali: posizione della stanza nuova nella categoria. */
const IDs: any = require("../../Config/ids") as typeof import("../../Config/ids");

const STANZA_LOBBY_VOICE_ID = String(IDs.channels?.stanzaLobbyVoice || "").trim();
const STANZA_CATEGORY_ID = String(IDs.categories?.categoryPublics || "1442569076902989844").trim();

function getStanzaCategoryParentId() {
  return STANZA_CATEGORY_ID || "";
}

function channelCategorySortPosition(ch?) {
  if (!ch) return -1;
  const raw = Number(ch.rawPosition);
  if (Number.isFinite(raw)) return raw;
  const pos = Number(ch.position);
  return Number.isFinite(pos) ? pos : -1;
}

function getKnownPublicHubOrPinIds() {
  const ids = [
    STANZA_LOBBY_VOICE_ID,
    IDs.channels?.vocaleLounge1,
    IDs.channels?.serataFilm,
    IDs.channels?.vocaleDuo1,
    IDs.channels?.vocaleTrio1,
    IDs.channels?.vocaleQuad1,
    IDs.channels?.vocaleSquad1,
    IDs.channels?.vocalePenta1,
    IDs.channels?.vocaleHexa1,
    IDs.channels?.vocaleSetta1,
    IDs.channels?.vocaleOcta1,
  ];
  if (Array.isArray(IDs.publicVoiceHubChannelIds)) {
    for (const x of IDs.publicVoiceHubChannelIds) ids.push(x);
  }
  return new Set(ids.map((x?) => String(x || "").trim()).filter(Boolean));
}

function isPublicHubOrPinVoiceChannel(ch?) {
  const id = String(ch?.id || "").trim();
  if (!id) return false;
  if (getKnownPublicHubOrPinIds().has(id)) return true;
  if (/crea una\s/i.test(String(ch?.name || ""))) return true;
  return false;
}

function isManagedStanzaRoomChannel(ch?, parentId = "") {
  if (!ch?.isVoiceBased?.()) return false;
  if (parentId && String(ch.parentId || "") !== String(parentId)) return false;
  if (isPublicHubOrPinVoiceChannel(ch)) return false;
  if (stanzaChannelMeta.has(String(ch.id))) return true;
  if (/Stanza di\s+/i.test(String(ch.name || ""))) return true;
  try {
    return Boolean(parseStanzaVoiceName(ch.name));
  } catch (_) {
    return false;
  }
}

function resolveStanzaVoiceCreatePlacement(guild?, lobbyCh?) {
  const parentId = getStanzaCategoryParentId() || String(lobbyCh?.parentId || "").trim() || null;
  const lobby =
    String(lobbyCh?.id || "") === STANZA_LOBBY_VOICE_ID
      ? lobbyCh
      : guild?.channels?.cache?.get(STANZA_LOBBY_VOICE_ID) || lobbyCh;
  if (!guild?.channels?.cache || !parentId || !lobby) {
    return { parentId, position: channelCategorySortPosition(lobby) + 1 };
  }
  const siblings = [...guild.channels.cache.values()]
    .filter((ch?) => ch?.isVoiceBased?.() && String(ch.parentId || "") === String(parentId))
    .sort(
      (a?, b?) =>
        channelCategorySortPosition(a) - channelCategorySortPosition(b) ||
        String(a.id).localeCompare(String(b.id)),
    );
  const lobbyIdx = siblings.findIndex((ch?) => String(ch.id) === String(lobby.id));
  if (lobbyIdx < 0) {
    return { parentId, position: channelCategorySortPosition(lobby) + 1 };
  }
  /* Sotto hub crea-una-stanza / ultima stanza del gruppo — mai dopo duo/trio/squad. */
  let insertAt = lobbyIdx + 1;
  for (let i = lobbyIdx + 1; i < siblings.length; i += 1) {
    const ch = siblings[i];
    if (isPublicHubOrPinVoiceChannel(ch)) break;
    if (!isManagedStanzaRoomChannel(ch, parentId)) break;
    insertAt = i + 1;
  }
  const prev = siblings[insertAt - 1] || lobby;
  const prevPos = channelCategorySortPosition(prev);
  return { parentId, position: prevPos >= 0 ? prevPos + 1 : 0 };
}

async function placeStanzaAfterGroupTail(created?, guild?, reason?) {
  if (!created?.id || !guild) return false;
  const parentId = getStanzaCategoryParentId() || String(created.parentId || "").trim();
  const lobby = guild.channels.cache.get(STANZA_LOBBY_VOICE_ID);
  if (!lobby || !parentId) return false;
  await guild.channels.fetch(undefined, { force: true }).catch(() => null);
  const freshCreated = guild.channels.cache.get(created.id) || created;
  const siblings = [...guild.channels.cache.values()]
    .filter((ch?) => ch?.isVoiceBased?.() && String(ch.parentId || "") === String(parentId))
    .sort(
      (a?, b?) =>
        channelCategorySortPosition(a) - channelCategorySortPosition(b) ||
        String(a.id).localeCompare(String(b.id)),
    );
  const lobbyIdx = siblings.findIndex((ch?) => String(ch.id) === String(lobby.id));
  if (lobbyIdx < 0) return false;
  let anchor = lobby;
  for (let i = lobbyIdx + 1; i < siblings.length; i += 1) {
    const ch = siblings[i];
    if (String(ch.id) === String(freshCreated.id)) continue;
    if (isPublicHubOrPinVoiceChannel(ch)) break;
    if (!isManagedStanzaRoomChannel(ch, parentId)) break;
    anchor = ch;
  }
  const anchorPos = channelCategorySortPosition(guild.channels.cache.get(anchor.id) || anchor);
  if (anchorPos < 0) return false;
  return applyStanzaVoiceCreatePosition(
    freshCreated,
    anchorPos + 1,
    reason || "Stanza temporanea sotto hub",
  ).then(() => true);
}

async function applyStanzaVoiceCreatePosition(voiceChannel?, position?, reason?) {
  if (!voiceChannel || position === undefined || position === null) return;
  const target = Number(position);
  if (!Number.isFinite(target)) return;
  const ok = await voiceChannel
    .setPosition(target, { reason: reason || "Stanza temporanea sotto hub crea una stanza" })
    .then(() => true)
    .catch((err?) => {
      global.logger?.warn?.("[stanza] setPosition failed:", err?.message || err);
      return false;
    });
  if (!ok && voiceChannel.guild?.channels?.setPositions) {
    await voiceChannel.guild.channels
      .setPositions([{ channel: voiceChannel.id, position: target }])
      .catch((err?) => {
        global.logger?.warn?.("[stanza] setPositions failed:", err?.message || err);
      });
  }
}

const stanzaChannelMeta = new Map();

const STANZA_NAME_LEAD = "༄";
/** Create only: ༄emoji︲Stanza di label. Rename/enforce: ༄emoji︲label (no "Stanza di"). */
const STANZA_CONNECTOR = "︲";
const STANZA_LEGACY_MIDDLE_RE = /[︲╵｜|]\s*Stanza di\s+/iu;

function findStanzaAnchorIndex(afterLead?) {
  const s = String(afterLead || "");
  // Legacy rooms: ༄emoji︲Stanza di label — consume middle so label is clean.
  const legacy = s.match(STANZA_LEGACY_MIDDLE_RE);
  if (legacy && legacy.index != null) {
    return { idx: legacy.index, len: legacy[0].length };
  }
  // Canonical: emoji then connector ︲ (tolerate lookalike separators).
  const emojiMatch = s.match(/^((?:\p{Extended_Pictographic}(?:\u200D\p{Extended_Pictographic})*)+\uFE0F?)/u);
  if (emojiMatch) {
    const rest = s.slice(emojiMatch[1].length);
    const conn = rest.match(/^[︲╵｜|]/);
    if (conn) return { idx: emojiMatch[1].length, len: conn[0].length };
  }
  const exact = s.indexOf(STANZA_CONNECTOR);
  if (exact !== -1) return { idx: exact, len: STANZA_CONNECTOR.length };
  return null;
}

function parseStanzaVoiceName(name?) {
  const n = String(name || "");
  if (!n.startsWith(STANZA_NAME_LEAD)) return null;
  const afterLead = n.slice(STANZA_NAME_LEAD.length);
  if (!afterLead) return null;
  const anchor = findStanzaAnchorIndex(afterLead);
  if (anchor) {
    const emojiPart = afterLead.slice(0, anchor.idx);
    if (!emojiPart) return null;
    const labelPart = afterLead.slice(anchor.idx + anchor.len);
    return { emojiPart, labelPart, hasAnchor: true };
  }
  const m = afterLead.match(/^((?:\p{Extended_Pictographic}(?:\u200D\p{Extended_Pictographic})*)+\uFE0F?)/u);
  if (!m) return null;
  const emojiPart = m[1];
  const labelPart = afterLead.slice(emojiPart.length);
  return { emojiPart, labelPart, hasAnchor: false };
}

export = { STANZA_LOBBY_VOICE_ID, STANZA_CATEGORY_ID, getStanzaCategoryParentId, isManagedStanzaRoomChannel, resolveStanzaVoiceCreatePlacement, placeStanzaAfterGroupTail, applyStanzaVoiceCreatePosition, stanzaChannelMeta, STANZA_NAME_LEAD, STANZA_CONNECTOR, findStanzaAnchorIndex, parseStanzaVoiceName };
