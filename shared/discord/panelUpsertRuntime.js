const fs = require("fs");
const crypto = require("crypto");
const axios = require("axios");
const CDN_ATTACHMENT_PATTERN = /(cdn\.discordapp\.com|media\.discordapp\.net)\/attachments\//i;
/** Components V2: Container = 17 (discord-api-types / discord.js ComponentType.Container). */
const COMPONENT_TYPE_CONTAINER = 17;
const IS_COMPONENTS_V2_FLAG = 1 << 15;

function messageFlagsBitfield(messageOrPayload) {
  const raw = messageOrPayload?.flags;
  if (raw == null) return 0;
  if (typeof raw === "number") return raw;
  if (typeof raw?.bitfield === "bigint") return Number(raw.bitfield);
  if (typeof raw?.bitfield === "number") return Number(raw.bitfield);
  if (typeof raw?.valueOf === "function") {
    const v = raw.valueOf();
    if (typeof v === "number") return v;
  }
  return Number(raw) || 0;
}

function hasComponentsV2Flag(messageOrPayload) {
  return (messageFlagsBitfield(messageOrPayload) & IS_COMPONENTS_V2_FLAG) === IS_COMPONENTS_V2_FLAG;
}

function componentRootType(component) {
  const raw = typeof component?.toJSON === "function" ? component.toJSON() : component;
  return Number(raw?.type ?? raw?.data?.type ?? 0) || 0;
}

function isComponentsV2Tree(components = []) {
  const rows = Array.isArray(components) ? components : [];
  return rows.some((c) => componentRootType(c) === COMPONENT_TYPE_CONTAINER);
}

function isComponentsV2Message(message) {
  return hasComponentsV2Flag(message) || isComponentsV2Tree(message?.components);
}

function isComponentsV2Payload(payload) {
  return hasComponentsV2Flag(payload) || isComponentsV2Tree(payload?.components);
}

function normalizeDiscordAttachmentUrl(value) {
  if (typeof value !== "string") return value;
  if (value.startsWith("attachment://")) return value.toLowerCase();
  if (!CDN_ATTACHMENT_PATTERN.test(value)) return value;
  const filenameMatch = value.match(/\/([^/?#]+)(?:\?|#|$)/);
  if (!filenameMatch?.[1]) return value;
  return `attachment://${filenameMatch[1].toLowerCase()}`;
}

function normalizeText(value) {
  return String(value ?? "").trim();
}

function hashBuffer(bufferLike) {
  const buffer = Buffer.isBuffer(bufferLike) ? bufferLike : Buffer.from(bufferLike);
  return crypto.createHash("sha256").update(buffer).digest("hex");
}

function resolvePayloadFileName(file) {
  const json = typeof file?.toJSON === "function" ? file.toJSON() : file;
  const explicitName = file?.name || file?.data?.name || json?.name || null;
  if (explicitName) return String(explicitName);
  const src = file?.attachment ?? file;
  if (typeof src === "string") {
    const normalized = src.replace(/\\/g, "/");
    return normalized.split("/").pop() || null;
  }
  return null;
}

function readPayloadFileBuffer(file) {
  const src = file?.attachment ?? file;
  if (Buffer.isBuffer(src)) return src;
  if (src instanceof Uint8Array) return Buffer.from(src);
  if (typeof src === "string" && fs.existsSync(src)) {
    try {
      return fs.readFileSync(src);
    } catch {
      return null;
    }
  }
  return null;
}

async function fetchAttachmentHash(url) {
  if (!url) return null;
  try {
    const res = await axios.get(url, { responseType: "arraybuffer", timeout: 20000 });
    return hashBuffer(Buffer.from(res.data));
  } catch {
    return null;
  }
}

function simplifyEmbed(embed) {
  const raw = typeof embed?.toJSON === "function" ? embed.toJSON() : embed;
  if (!raw || typeof raw !== "object") return null;
  const img = raw.image?.url ? normalizeDiscordAttachmentUrl(raw.image.url) : null;
  const thumb = raw.thumbnail?.url ? normalizeDiscordAttachmentUrl(raw.thumbnail.url) : null;
  const author = raw.author ? { name: normalizeText(raw.author.name), icon_url: raw.author.icon_url ? normalizeDiscordAttachmentUrl(raw.author.icon_url) : null, url: raw.author.url ? String(raw.author.url) : null } : null;
  const footer = raw.footer ? { text: normalizeText(raw.footer.text), icon_url: raw.footer.icon_url ? normalizeDiscordAttachmentUrl(raw.footer.icon_url) : null } : null;
  const fields = Array.isArray(raw.fields) ? raw.fields.map((f) => ({ name: normalizeText(f?.name), value: normalizeText(f?.value), inline: Boolean(f?.inline) })) : [];
  return { title: normalizeText(raw.title), description: normalizeText(raw.description), color: Number.isFinite(raw.color) ? raw.color : null, url: raw.url ? String(raw.url) : null, image: img, thumbnail: thumb, author, footer, fields };
}

function simplifyComponentNode(node) {
  const r = typeof node?.toJSON === "function" ? node.toJSON() : node;
  if (!r || typeof r !== "object") return null;
  const type = r.type ?? null;
  const children = Array.isArray(r.components) ? r.components.map(simplifyComponentNode).filter(Boolean) : undefined;
  const items = Array.isArray(r.items)
    ? r.items.map((item) => ({
        media: item?.media?.url ? normalizeDiscordAttachmentUrl(item.media.url) : null,
      }))
    : undefined;
  return {
    type,
    style: r.style ?? null,
    custom_id: r.custom_id || r.customId || null,
    label: normalizeText(r.label),
    url: r.url ? String(r.url) : null,
    disabled: Boolean(r.disabled),
    content: normalizeText(r.content),
    accent_color: Number.isFinite(r.accent_color) ? r.accent_color : Number.isFinite(r.accentColor) ? r.accentColor : null,
    divider: r.divider == null ? null : Boolean(r.divider),
    spacing: r.spacing ?? null,
    emoji: r.emoji
      ? {
          id: r.emoji.id ? String(r.emoji.id) : null,
          name: r.emoji.name ? String(r.emoji.name) : null,
          animated: Boolean(r.emoji.animated),
        }
      : null,
    ...(items ? { items } : {}),
    ...(children ? { components: children } : {}),
  };
}

function simplifyComponents(components = []) {
  const rows = Array.isArray(components) ? components : [];
  return rows.map(simplifyComponentNode).filter(Boolean);
}

function extractTextFromComponents(components = [], out = []) {
  for (const node of Array.isArray(components) ? components : []) {
    const r = typeof node?.toJSON === "function" ? node.toJSON() : node;
    if (!r || typeof r !== "object") continue;
    if (r.content) out.push(normalizeText(r.content));
    if (Array.isArray(r.components)) extractTextFromComponents(r.components, out);
  }
  return out;
}

function toComparableEmbeds(embeds = []) {
  const arr = Array.isArray(embeds) ? embeds : [];
  return JSON.stringify(arr.map(simplifyEmbed).filter(Boolean));
}

function toComparableComponents(components = []) {
  return JSON.stringify(simplifyComponents(components));
}

function messageHasAttachmentName(message, expectedName) {
  const wanted = String(expectedName || "").trim().toLowerCase();
  if (!wanted) return false;
  const attachments = message?.attachments;
  if (!attachments?.size) return false;
  for (const item of attachments.values()) {
    const name = String(item?.name || "").trim().toLowerCase();
    if (name && name === wanted) return true;
  }
  return false;
}

function isBotPanelCandidateMessage(msg, client) {
  if (msg?.author?.id !== client.user?.id) return false;
  if (Array.isArray(msg?.embeds) && msg.embeds.length) return true;
  if (isComponentsV2Message(msg)) return true;
  if (Array.isArray(msg?.components) && msg.components.length) return true;
  return false;
}

async function fetchBotPanelMessages(channel, client, limit = 200) {
  const out = [];
  let before = null;
  while (out.length < limit) {
    const batch = await channel.messages.fetch(before ? { limit: 100, before } : { limit: 100 }).catch(() => null);
    if (!batch?.size) break;
    const values = [...batch.values()];
    for (const msg of values) {
      if (!isBotPanelCandidateMessage(msg, client)) continue;
      out.push(msg);
      if (out.length >= limit) break;
    }
    before = values[values.length - 1]?.id || null;
    if (!before || values.length < 100) break;
  }
  return out;
}

const PANEL_CACHE_TTL_MS = Math.max(
  60_000,
  Number(process.env.VC_PANEL_CACHE_TTL_MS || 30 * 60 * 1000) || 30 * 60 * 1000,
);
const PANEL_CACHE_MAX = Math.max(20, Number(process.env.VC_PANEL_CACHE_MAX || 200) || 200);

function getPanelMessageCacheStore(client) {
  if (!client) return null;
  if (!(client._panelUpsertMessageCache instanceof Map)) {
    client._panelUpsertMessageCache = new Map();
  }
  return client._panelUpsertMessageCache;
}

function prunePanelMessageCache(store, now = Date.now()) {
  if (!(store instanceof Map)) return;
  for (const [key, entry] of store.entries()) {
    const at = Number(entry?.at || 0);
    if (at > 0 && now - at > PANEL_CACHE_TTL_MS) store.delete(key);
  }
  if (store.size > PANEL_CACHE_MAX) {
    const overflow = store.size - PANEL_CACHE_MAX;
    let removed = 0;
    for (const key of store.keys()) {
      if (removed >= overflow) break;
      store.delete(key);
      removed += 1;
    }
  }
}

function readCachedBotPanelMessages(channel, client, limit) {
  const store = getPanelMessageCacheStore(client);
  if (!store || !channel?.id) return null;
  prunePanelMessageCache(store);
  const entry = store.get(channel.id);
  if (!entry) return null;
  const at = Number(entry.at || 0);
  if (at > 0 && Date.now() - at > PANEL_CACHE_TTL_MS) {
    store.delete(channel.id);
    return null;
  }
  const messages = Array.isArray(entry.messages) ? entry.messages : [];
  if (Number(entry.limit || 0) < Number(limit || 0)) return null;
  return messages;
}

function writeCachedBotPanelMessages(channel, client, limit, messages) {
  const store = getPanelMessageCacheStore(client);
  if (!store || !channel?.id) return;
  const nextMessages = Array.isArray(messages) ? messages.filter(Boolean) : [];
  store.set(channel.id, { limit, messages: nextMessages, at: Date.now() });
  prunePanelMessageCache(store);
}

function upsertCachedBotPanelMessage(channel, client, message) {
  const store = getPanelMessageCacheStore(client);
  if (!store || !channel?.id || !message?.id) return;
  const entry = store.get(channel.id);
  if (!entry) return;
  const current = Array.isArray(entry.messages) ? entry.messages.filter(Boolean) : [];
  const filtered = current.filter((item) => item?.id !== message.id);
  filtered.unshift(message);
  entry.messages = filtered;
  entry.at = Date.now();
  store.set(channel.id, entry);
}

function resolvePanelHistoryLimit(client) {
  const envLimit = Number(process.env.PANEL_UPSERT_HISTORY_LIMIT || "");
  const configLimit = Number(client?.config?.panelUpsertHistoryLimit || "");
  const raw = Number.isFinite(envLimit) && envLimit > 0 ? envLimit : configLimit;
  if (!Number.isFinite(raw) || raw <= 0) return 200;
  return Math.max(25, Math.min(400, Math.floor(raw)));
}

function scoreEmbedSimilarity(message, payload) {
  const msgFirst = simplifyEmbed(Array.isArray(message?.embeds) ? message.embeds[0] : null) || {};
  const nextFirst = simplifyEmbed(Array.isArray(payload?.embeds) ? payload.embeds[0] : null) || {};
  let score = 0;
  if (msgFirst.title && nextFirst.title && msgFirst.title === nextFirst.title) score += 6;
  if (msgFirst.author?.name && nextFirst.author?.name && msgFirst.author.name === nextFirst.author.name) score += 4;
  if (msgFirst.footer?.text && nextFirst.footer?.text && msgFirst.footer.text === nextFirst.footer.text) score += 3;
  if (msgFirst.image && nextFirst.image && msgFirst.image === nextFirst.image) score += 2;
  if (msgFirst.thumbnail && nextFirst.thumbnail && msgFirst.thumbnail === nextFirst.thumbnail) score += 2;
  if (Number(Array.isArray(message?.embeds) ? message.embeds.length : 0) === Number(Array.isArray(payload?.embeds) ? payload.embeds.length : 0)) score += 1;
  if (Number(Array.isArray(message?.components) ? message.components.length : 0) === Number(Array.isArray(payload?.components) ? payload.components.length : 0)) score += 1;
  const msgDesc = normalizeText(msgFirst.description || "").toLowerCase();
  const nextDesc = normalizeText(nextFirst.description || "").toLowerCase();
  if (msgDesc && nextDesc) {
    const msgHead = msgDesc.slice(0, 80);
    const nextHead = nextDesc.slice(0, 80);
    if (msgHead && nextHead && (msgHead === nextHead || msgHead.includes(nextHead) || nextHead.includes(msgHead))) score += 2;
  }
  return score;
}

function walkCollectCustomIds(node, ids) {
  const raw = typeof node?.toJSON === "function" ? node.toJSON() : node;
  if (!raw || typeof raw !== "object") return;
  const id = raw.custom_id || raw.customId || null;
  if (id) ids.add(String(id));
  if (Array.isArray(raw.components)) {
    for (const child of raw.components) walkCollectCustomIds(child, ids);
  }
}

function extractCustomIdsFromComponents(components = []) {
  const ids = new Set();
  for (const row of components || []) walkCollectCustomIds(row, ids);
  return ids;
}

function scoreV2TextSimilarity(message, payload) {
  const msgText = extractTextFromComponents(message?.components || []).join("\n").toLowerCase();
  const nextText = extractTextFromComponents(payload?.components || []).join("\n").toLowerCase();
  if (!msgText || !nextText) return 0;
  let score = 0;
  const msgHead = msgText.slice(0, 120);
  const nextHead = nextText.slice(0, 120);
  if (msgHead && nextHead && (msgHead === nextHead || msgHead.includes(nextHead.slice(0, 40)) || nextHead.includes(msgHead.slice(0, 40)))) {
    score += 5;
  }
  if (msgText.includes(nextText.slice(0, 60)) || nextText.includes(msgText.slice(0, 60))) score += 3;
  return score;
}

function buildStableEmbedIdentity(rawEmbed) {
  if (!rawEmbed || typeof rawEmbed !== "object") return "";
  const title = normalizeText(rawEmbed.title || "").toLowerCase();
  const author = normalizeText(rawEmbed.author?.name || "").toLowerCase();
  const footer = normalizeText(rawEmbed.footer?.text || "").toLowerCase();
  const image = normalizeText(normalizeDiscordAttachmentUrl(rawEmbed.image?.url || "")).toLowerCase();
  const thumbnail = normalizeText(normalizeDiscordAttachmentUrl(rawEmbed.thumbnail?.url || "")).toLowerCase();
  const firstField = normalizeText(rawEmbed.fields?.[0]?.name || "").toLowerCase();
  const parts = [title, author, footer, image, thumbnail, firstField].filter(Boolean);
  if (!parts.length) return "";
  return parts.join("|").slice(0, 400);
}

function buildEmbedSignatureFromPayload(payloadEmbeds = []) {
  const first = Array.isArray(payloadEmbeds) ? payloadEmbeds[0] : null;
  const raw = typeof first?.toJSON === "function" ? first.toJSON() : first;
  return buildStableEmbedIdentity(raw);
}

function buildEmbedSignatureFromMessage(msgEmbeds = []) {
  const first = Array.isArray(msgEmbeds) ? msgEmbeds[0] : null;
  const raw = typeof first?.toJSON === "function" ? first.toJSON() : first;
  return buildStableEmbedIdentity(raw);
}

function preparePanelDiscordPayload(payload) {
  const p = payload && typeof payload === "object" ? { ...payload } : {};
  delete p.messageId;
  delete p.attachmentName;
  delete p.forceNew;
  delete p.editOnly;
  delete p.includeBanner;
  delete p.__staleMessageId;
  if (!("content" in p) || p.content === undefined) {
    p.content = "";
  }
  if (isComponentsV2Payload(p)) {
    p.flags = messageFlagsBitfield(p) | IS_COMPONENTS_V2_FLAG;
    // V2: nessun classic embed nello stesso messaggio
    p.embeds = [];
  }
  if (Array.isArray(p.files) && p.files.length > 0) {
    p.attachments = [];
  }
  return p;
}

function omitPanelFilesIfAttachmentPresent(message, payload) {
  if (!message || !payload || typeof payload !== "object") return payload;
  const attachmentName = String(payload.attachmentName || "").trim().toLowerCase();
  if (!attachmentName) return payload;
  if (!Array.isArray(payload.files) || payload.files.length === 0) return payload;
  if (!messageHasAttachmentName(message, attachmentName)) return payload;
  const next = { ...payload };
  delete next.files;
  return next;
}

async function editPanelMessageSafe(message, editPayload) {
  if (!message?.edit) return { ok: false, code: null };
  const tryEdit = async (payload) => {
    try {
      const edited = await message.edit(payload);
      return { ok: true, message: edited };
    } catch (error) {
      return { ok: false, error, code: Number(error?.code) || null };
    }
  };

  let result = await tryEdit(editPayload);
  if (result.ok) return result;

    if (
    Number(result.code) === 50035 &&
    editPayload &&
    Object.prototype.hasOwnProperty.call(editPayload, "attachments")
  ) {
    const retry = { ...editPayload };
    delete retry.attachments;
    result = await tryEdit(retry);
    if (result.ok) return result;
  }

    if (editPayload && (editPayload.files || editPayload.attachments)) {
    const soft = { ...editPayload };
    delete soft.files;
    delete soft.attachments;
    result = await tryEdit(soft);
    if (result.ok) return result;
  }

  if (result.error && Number(result.code) !== 50005) {
    global.logger?.error?.("[panelUpsert] edit failed:", result.error);
  }
  return { ok: false, code: result.code, error: result.error };
}

async function shouldEditMessage(message, payload) {
  if (!message) return true;
  const msgV2 = isComponentsV2Message(message);
  const payloadV2 = isComponentsV2Payload(payload);
  if (msgV2 !== payloadV2) return true;
  if ((messageFlagsBitfield(message) & IS_COMPONENTS_V2_FLAG) !== (messageFlagsBitfield(payload) & IS_COMPONENTS_V2_FLAG)) {
    return true;
  }
  if (String(message.content ?? "") !== String(payload?.content ?? "")) return true;
  if (!payloadV2 && toComparableEmbeds(message?.embeds || []) !== toComparableEmbeds(payload?.embeds || [])) return true;
  if (toComparableComponents(message?.components || []) !== toComparableComponents(payload?.components || [])) return true;
  const expectedFiles = Array.isArray(payload?.files) ? payload.files.length : 0;
  const actualAttachments = Number(message?.attachments?.size || 0);
  if (expectedFiles > 0 && actualAttachments !== expectedFiles) return true;
  return false;
}

async function upsertPanelMessage(channel, client, payload) {
  const messageId = payload?.messageId || null;
  const attachmentName = String(payload?.attachmentName || "").trim().toLowerCase();
  const forceNew = payload?.forceNew === true;
  const editOnly = payload?.editOnly === true;

  async function editExisting(existing) {
    // Classic → V2: rimpiazza il messaggio (edit raramente accetta il cambio di layout).
    if (isComponentsV2Payload(payload) && !isComponentsV2Message(existing) && !editOnly) {
      await existing.delete().catch(() => null);
      return sendNew();
    }
    const editPayload = preparePanelDiscordPayload(omitPanelFilesIfAttachmentPresent(existing, payload));
    const needsEdit = await shouldEditMessage(existing, editPayload);
    if (!needsEdit) return { ok: true, message: existing };
    const edited = await editPanelMessageSafe(existing, editPayload);
    if (edited.ok && edited.message) {
      upsertCachedBotPanelMessage(channel, client, edited.message);
      return { ok: true, message: edited.message };
    }
    if (Number(edited.code) === 10008) {
      global.logger?.warn?.(
        `[panelUpsert] stale message ${existing.id} in #${channel?.id} (10008); clearing.`,
      );
      return { ok: false, staleMessageId: String(existing.id) };
    }
    // Edit V2 fallito: prova resend se non editOnly
    if (isComponentsV2Payload(payload) && !editOnly) {
      global.logger?.warn?.(
        `[panelUpsert] V2 edit failed for ${existing.id} in #${channel?.id}; resending.`,
      );
      await existing.delete().catch(() => null);
      return sendNew();
    }
    global.logger?.warn?.(
      `[panelUpsert] edit failed for ${existing.id} in #${channel?.id}; no resend.`,
    );
    return { ok: false, code: edited.code };
  }

  async function sendNew() {
    if (editOnly) return { ok: false, reason: "edit_only" };
    const cleanPayload = preparePanelDiscordPayload(payload);
    const sent = await channel.send(cleanPayload).catch((error) => {
      global.logger?.error?.("[panelUpsert] send failed:", error);
      return null;
    });
    if (sent) {
      upsertCachedBotPanelMessage(channel, client, sent);
      return { ok: true, message: sent };
    }
    return { ok: false, reason: "send_failed" };
  }

  async function finalize(outcome) {
    if (outcome?.staleMessageId && payload && typeof payload === "object") {
      payload.__staleMessageId = String(outcome.staleMessageId);
    }
    if (outcome?.ok && outcome.message) return outcome.message;
    return null;
  }

    if (forceNew) return finalize(await sendNew());

  if (messageId) {
    const direct = await channel.messages.fetch(messageId).catch((error) => {
      if (Number(error?.code) === 10008) return { __stale: true };
      return null;
    });
    if (direct?.__stale) {
      global.logger?.warn?.(
        `[panelUpsert] stored messageId ${messageId} missing in #${channel?.id} (10008).`,
      );
      if (editOnly) return finalize({ ok: false, staleMessageId: String(messageId) });
            return finalize(await sendNew());
    }
    if (direct) {
      const edited = await editExisting(direct);
      if (edited.ok) return finalize(edited);
      if (edited.staleMessageId) {
        if (editOnly) return finalize(edited);
        return finalize(await sendNew());
      }
            return finalize(edited);
    }
  }

  if (editOnly) return finalize({ ok: false, reason: "edit_only_no_message" });

  const historyLimit = resolvePanelHistoryLimit(client);
  let botMessages = readCachedBotPanelMessages(channel, client, historyLimit);
  if (!botMessages) {
    botMessages = await fetchBotPanelMessages(channel, client, historyLimit);
    writeCachedBotPanelMessages(channel, client, historyLimit, botMessages);
  }
  const payloadCustomIds = extractCustomIdsFromComponents(payload?.components || []);
  const payloadComponentsComparable = toComparableComponents(payload?.components || []);
  const payloadSignature = buildEmbedSignatureFromPayload(payload?.embeds || []);
  let existing = null;

  if (payloadCustomIds.size > 0) {
    existing = botMessages.find((msg) => {
      const msgCustomIds = extractCustomIdsFromComponents(msg.components || []);
      if (!msgCustomIds.size) return false;
      for (const id of payloadCustomIds) if (!msgCustomIds.has(id)) return false;
      return true;
    }) || null;
  }

  if (!existing && payloadComponentsComparable && payloadComponentsComparable !== "[]") {
    existing =
      botMessages.find((msg) => toComparableComponents(msg.components || []) === payloadComponentsComparable) ||
      null;
  }
  if (!existing && payloadSignature) {
    existing =
      botMessages.find((msg) => buildEmbedSignatureFromMessage(msg.embeds || []) === payloadSignature) || null;
  }
  if (!existing && attachmentName) {
    existing = botMessages.find((msg) => messageHasAttachmentName(msg, attachmentName)) || null;
  }

  if (!existing) {
    const payloadEmbedsCount = Array.isArray(payload?.embeds) ? payload.embeds.length : 0;
    const payloadComponentsCount = Array.isArray(payload?.components) ? payload.components.length : 0;
    const structuralCandidates = botMessages.filter((msg) => {
      const msgEmbedsCount = Array.isArray(msg?.embeds) ? msg.embeds.length : 0;
      const msgComponentsCount = Array.isArray(msg?.components) ? msg.components.length : 0;
      return msgEmbedsCount === payloadEmbedsCount && msgComponentsCount === payloadComponentsCount;
    });
    if (structuralCandidates.length === 1) existing = structuralCandidates[0];
  }

  if (!existing && botMessages.length) {
    const payloadIsV2 = isComponentsV2Payload(payload);
    const ranked = botMessages
      .map((msg) => {
        const embedScore = scoreEmbedSimilarity(msg, payload);
        const v2Score = payloadIsV2 || isComponentsV2Message(msg) ? scoreV2TextSimilarity(msg, payload) : 0;
        return { msg, score: Math.max(embedScore, v2Score) };
      })
      .sort((a, b) =>
        b.score !== a.score
          ? b.score - a.score
          : Number(b.msg?.createdTimestamp || 0) - Number(a.msg?.createdTimestamp || 0),
      );
    if (ranked[0]?.score >= 3) existing = ranked[0].msg;
  }

  // Classic → V2: meglio un messaggio nuovo (edit spesso rifiuta il cambio di layout).
  if (existing && isComponentsV2Payload(payload) && !isComponentsV2Message(existing) && !editOnly) {
    try {
      await existing.delete().catch(() => null);
    } catch {
      /* ignore */
    }
    existing = null;
  }

  if (existing) {
    const edited = await editExisting(existing);
    if (edited.ok) return finalize(edited);
    if (edited.staleMessageId) return finalize(await sendNew());
    return finalize(edited);
  }

  return finalize(await sendNew());
}

module.exports = {
  shouldEditMessage,
  upsertPanelMessage,
  normalizeDiscordAttachmentUrl,
  resolvePayloadFileName,
  readPayloadFileBuffer,
  fetchAttachmentHash,
  isComponentsV2Message,
  isComponentsV2Payload,
};