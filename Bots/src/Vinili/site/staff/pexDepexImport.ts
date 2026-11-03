/** pexImport1: importa una volta i pex/depex vecchi dal canale #pex-depex nella cronologia della Gestione.
 *  Salta quelli già presenti nel database (stesso tipo entro 36 ore) e segna in BotState che l'ha fatto. */
const IDs = require("../../Config/ids") as typeof import("../../Config/ids");
const { ActivityUserProfile } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const BotState = require("../../../shared/schemas/botState/botStateSchema");
const { classifyPexDepexKind } = require("./organicoHistory") as typeof import("./organicoHistory");

const STATE_KEY = "pexDepexImport_v1";
const DUP_WINDOW_MS = 36 * 60 * 60 * 1000;
const MAX_MESSAGES = 20_000;

function messageText(message?) {
  const parts = [String(message?.content || "")];
  for (const e of message?.embeds || []) {
    parts.push(String(e?.title || ""), String(e?.description || ""));
    for (const f of e?.fields || []) parts.push(`${f?.name || ""}: ${f?.value || ""}`);
  }
  return parts.filter(Boolean).join("\n");
}

function cleanText(s?) {
  return String(s || "")
    .replace(/<a?:\w+:\d+>/g, " ")
    .replace(/[*_`~|]/g, "")
    .replace(/\s+/g, " ")
    .trim();
}

/** Messaggio del canale → { kind, userId, oldRole, newRole, reason } oppure null. */
function parsePexDepexMessage(message?) {
  const text = messageText(message);
  if (!text) return null;
  const head = text.split("\n").slice(0, 2).join(" ");
  const kind = /\bdepex\b/i.test(head) ? "depex" : /\bpex\b/i.test(head) ? "pex" : null;
  if (!kind) return null;
  const mention = /<@!?(\d{16,22})>/.exec(text);
  const userId = mention?.[1] || String(message?.mentions?.users?.first?.()?.id || "");
  if (!/^\d{16,22}$/.test(userId)) return null;

  const ticks = [...text.matchAll(/`([^`\n]{1,80})`/g)].map((m?) => m[1].trim()).filter(Boolean);
  let oldRole = ticks[0] || "";
  let newRole = ticks[1] || "";
  let afterRoles = "";
  if (!oldRole && !newRole) {
    /* scritto a mano: "Pex @utente da Helper -> Moderator" */
    const plain = text
      .replace(/<a?:VC_Arrow:\d+>/gi, " → ")
      .replace(/<a?:\w+:\d+>|<@[!&]?\d+>/g, " ")
      .replace(/\b(?:de)?pex\b/gi, " ");
    const arrowLine = plain.split("\n").find((l?) => /->|→|➜|=>/.test(l)) || "";
    const arrow = /([A-Za-zÀ-ÿ+'&. ]{2,40}?)\s*(?:->|→|➜|=>)\s*([A-Za-zÀ-ÿ+'&. ]{2,40})/.exec(arrowLine);
    if (arrow) {
      afterRoles = cleanText(arrowLine.slice(arrow.index + arrow[0].length)).replace(/^[,;:.\-–—\s]+/, "");
      oldRole = cleanText(arrow[1]).replace(/^(?:da|dal|dallo|dalla)\s+/i, "");
      newRole = cleanText(arrow[2]).replace(/^(?:a|al|allo|alla|ad)\s+/i, "");
    }
  }

  let reason = "";
  const reasonLine =
    /<a?:VC_reason:\d+>\s*([\s\S]+)$/i.exec(text) || /\b(?:motivo|motivazione|reason)\s*[:\-]\s*([\s\S]+)$/i.exec(text);
  if (reasonLine) reason = cleanText(reasonLine[1]);
  if (!reason) reason = afterRoles;
  if (!reason) {
    const rest = text
      .split("\n")
      .slice(1)
      .filter((l?) => !/`[^`]+`/.test(l))
      .join(" ");
    reason = cleanText(rest.replace(/<@!?\d+>/g, ""));
  }
  return { kind, userId, oldRole, newRole, reason: reason.slice(0, 500) };
}

async function fetchAllMessages(channel?) {
  const out = [];
  let before;
  while (out.length < MAX_MESSAGES) {
    const batch = await channel.messages.fetch({ limit: 100, ...(before ? { before } : {}) }).catch(() => null);
    if (!batch?.size) break;
    for (const m of batch.values()) out.push(m);
    before = batch.last()?.id;
    if (batch.size < 100) break;
  }
  return out;
}

function existingRowsFor(doc?) {
  const rows = []
    .concat(Array.isArray(doc?.staff?.rolesHistory) ? doc.staff.rolesHistory : [])
    .concat(Array.isArray(doc?.staffRolesHistoryRetention) ? doc.staffRolesHistoryRetention : [])
    .concat(Array.isArray(doc?.staff?.trackHistory) ? doc.staff.trackHistory : [])
    .concat(Array.isArray(doc?.staffPexImported) ? doc.staffPexImported : []);
  return rows.filter(Boolean);
}

function rowKind(row?, guild?) {
  const k = String(row?.kind || "").toLowerCase();
  if (k === "pex" || k === "depex") return k;
  const byRoles = classifyPexDepexKind(row?.oldRole, row?.newRole, guild);
  if (byRoles) return byRoles;
  const r = String(row?.reason || "").toLowerCase();
  if (/\bdepex\b|retrocess|dimission/.test(r)) return "depex";
  if (/\bpex\b|promoz/.test(r)) return "pex";
  return null;
}

async function importOldPexDepex(client?) {
  const state: any = await BotState.findOne({ key: STATE_KEY }).lean().catch(() => null);
  if (state?.value?.done) return null;
  const guildId = String(IDs.guilds?.main || "").trim();
  const channelId = String(IDs.channels?.pexDepex || "").trim();
  if (!guildId || !channelId) return null;
  const guild = client.guilds.cache.get(guildId) || (await client.guilds.fetch(guildId).catch(() => null));
  const channel = guild ? await guild.channels.fetch(channelId).catch(() => null) : null;
  if (!channel?.messages?.fetch) return null;

  const messages = await fetchAllMessages(channel);
  const byUser = new Map();
  let unparsed = 0;
  const samples = [];
  for (const m of messages) {
    const parsed = parsePexDepexMessage(m);
    if (!parsed) {
      if (String(m?.content || "").trim() || m?.embeds?.length) {
        unparsed += 1;
        if (samples.length < 5) samples.push(cleanText(messageText(m)).slice(0, 120));
      }
      continue;
    }
    const list = byUser.get(parsed.userId) || [];
    list.push({ ...parsed, message: m });
    byUser.set(parsed.userId, list);
  }

  let imported = 0;
  let skipped = 0;
  for (const [userId, list] of byUser) {
    const doc: any = await ActivityUserProfile.findOne(
      { guildId, userId },
      { "staff.rolesHistory": 1, "staff.trackHistory": 1, staffRolesHistoryRetention: 1, staffPexImported: 1 },
    )
      .lean()
      .catch(() => null);
    const existing = existingRowsFor(doc);
    const importedIds = new Set(existing.map((r?) => String(r?.importMessageId || "")).filter(Boolean));
    const toAdd = [];
    for (const p of list) {
      const at = p.message.createdAt instanceof Date ? p.message.createdAt : new Date(p.message.createdTimestamp);
      if (importedIds.has(String(p.message.id))) {
        skipped += 1;
        continue;
      }
      const dup = existing.some((r?) => {
        const d = r?.date ? new Date(r.date).getTime() : NaN;
        return rowKind(r, guild) === p.kind && Number.isFinite(d) && Math.abs(d - at.getTime()) < DUP_WINDOW_MS;
      });
      if (dup) {
        skipped += 1;
        continue;
      }
      const author = p.message.author;
      const target = p.message.mentions?.users?.get?.(userId);
      toAdd.push({
        kind: p.kind,
        oldRole: p.oldRole || null,
        newRole: p.newRole || null,
        reason: p.reason || null,
        date: at,
        username: target?.username || null,
        displayName: target?.globalName || target?.username || null,
        actorId: author && !author.bot ? String(author.id) : null,
        actorName: author && !author.bot ? String(author.globalName || author.username || "") : null,
        importMessageId: String(p.message.id),
      });
    }
    if (!toAdd.length) continue;
    await ActivityUserProfile.updateOne(
      { guildId, userId },
      { $push: { staffPexImported: { $each: toAdd } } },
      { upsert: true },
    ).catch(() => null);
    imported += toAdd.length;
  }

  const summary = { done: true, at: new Date(), messages: messages.length, imported, skipped, unparsed };
  await BotState.updateOne({ key: STATE_KEY }, { $set: { value: summary } }, { upsert: true }).catch(() => null);
  global.logger?.info?.(
    `[PEX IMPORT] cronologia: ${imported} pex/depex vecchi importati, ${skipped} già presenti, ${unparsed} messaggi non riconosciuti (su ${messages.length}).`,
  );
  if (samples.length) global.logger?.info?.("[PEX IMPORT] esempi non riconosciuti:", samples);
  return summary;
}

export = { importOldPexDepex };
