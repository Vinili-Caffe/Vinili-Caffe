const Giveaway = require("./guildFeatureBucketGiveawayModel");
const { getClientChannelCached } = require("../../../shared/discord/interactionEntityCache") as typeof import("../../../shared/discord/interactionEntityCache");
const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const {
  GIVEAWAY_REROLL_PREFIX,
  buildGiveawayEmbed,
  buildEnterButton,
  buildRerollButton,
} = require("./giveawayUi") as typeof import("./giveawayUi");

const MAX_TIMEOUT_MS = 2_147_483_647;
const pendingEndTimers = new Map();

const GIVEAWAY_READ_PROJECTION = {
  participants: 1,
  winnerCount: 1,
  channelId: 1,
  messageId: 1,
  _id: 1,
  prize: 1,
  endAt: 1,
  hostId: 1,
  hostTag: 1,
  ended: 1,
  cancelled: 1,
  winnerIds: 1,
  guildId: 1,
};

async function createGiveaway({ guildId, channelId, hostId, hostTag, prize, durationMs, winnerCount }) {
  const endAt = new Date(Date.now() + durationMs);
  const doc = await Giveaway.create({
    guildId,
    channelId,
    messageId: null,
    prize,
    endAt,
    winnerCount: Math.max(1, Math.min(Number(winnerCount) || 1, 20)),
    hostId,
    hostTag: hostTag || "",
    participants: [],
    ended: false,
  });
  return doc;
}

async function setGiveawayMessageId(giveawayId?, messageId?) {
  await Giveaway.updateOne({ _id: giveawayId }, { $set: { messageId: String(messageId) } });
}

function pickWinners(participants?, winnerCount?) {
  const list = Array.isArray(participants) ? [...participants] : [];
  if (list.length === 0) return [];
  const count = Math.min(winnerCount, list.length);
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list.slice(0, count);
}

async function resolveEligibleParticipants(giveaway?) {
  return Array.isArray(giveaway?.participants) ? giveaway.participants : [];
}

function clearScheduledGiveawayEnd(giveawayId?) {
  const id = String(giveawayId || "").trim();
  if (!id) return;
  const timer = pendingEndTimers.get(id);
  if (timer) {
    clearTimeout(timer);
    pendingEndTimers.delete(id);
  }
}

async function endGiveaway(giveawayId?, client?) {
  const id = String(giveawayId || "").trim();
  clearScheduledGiveawayEnd(id);

  const giveaway = await Giveaway.findOne({ _id: id, ended: false, cancelled: { $ne: true } }, GIVEAWAY_READ_PROJECTION).lean();
  if (!giveaway) return null;

  // Claim subito (prima del filtro async): solo un processo tra bot/scheduler prosegue.
  const claimed = await Giveaway.updateOne(
    { _id: id, ended: false },
    { $set: { ended: true } },
  );
  if (!claimed?.modifiedCount) return null;

  const participants = await resolveEligibleParticipants({ ...giveaway, ended: true });
  const winnerIds = pickWinners(participants, giveaway.winnerCount);
  if (winnerIds.length) {
    await Giveaway.updateOne({ _id: id }, { $set: { winnerIds } });
  }

  const channel = await getClientChannelCached(client, giveaway.channelId);
  if (channel?.isTextBased?.()) {
    try {
      const msg = await channel.messages.fetch(giveaway.messageId).catch(() => null);
      if (msg?.editable) {
        const endedEmbed = buildGiveawayEmbed(
          { ...giveaway, ended: true, winnerIds },
        );
        const rerollRow = buildRerollButton(giveaway._id.toString());
        await msg.edit({ embeds: [endedEmbed], components: [rerollRow] }).catch(() => { });
      }
    } catch (err) {
      global.logger?.warn?.("[giveawayService] end/reroll:", err?.message || err);
    }

    if (winnerIds.length === 1) {
      await channel.send({ content: `${E.VC_Events} <@${winnerIds[0]}> ha vinto il giveaway! ${E.VC_Winner}` }).catch(() => { });
    } else if (winnerIds.length > 1) {
      const mention = winnerIds.map((wid?) => `<@${wid}>`).join(", ");
      await channel.send({ content: `${E.VC_Events}${mention} hanno vinto il giveaway! ${E.VC_Winner}` }).catch(() => { });
    }
  }

  return { winnerIds, participants: participants.length };
}

function scheduleGiveawayEnd(client?, giveawayId?, endAt?) {
  const id = String(giveawayId || "").trim();
  if (!client || !id) return;
  clearScheduledGiveawayEnd(id);

  const atMs = endAt instanceof Date ? endAt.getTime() : new Date(endAt).getTime();
  if (!Number.isFinite(atMs)) return;

  const delay = atMs - Date.now();
  if (delay <= 0) {
    void endGiveaway(id, client).catch((err?) =>
      global.logger?.warn?.("[Giveaway] scheduled end failed:", id, err?.message || err),
    );
    return;
  }

  if (delay > MAX_TIMEOUT_MS) {
    const timer = setTimeout(() => scheduleGiveawayEnd(client, id, atMs), MAX_TIMEOUT_MS - 60_000);
    timer.unref?.();
    pendingEndTimers.set(id, timer);
    return;
  }

  const timer = setTimeout(() => {
    pendingEndTimers.delete(id);
    void endGiveaway(id, client).catch((err?) =>
      global.logger?.warn?.("[Giveaway] scheduled end failed:", id, err?.message || err),
    );
  }, delay);
  timer.unref?.();
  pendingEndTimers.set(id, timer);
}

async function scheduleActiveGiveawayEnds(client?) {
  if (!client) return { scheduled: 0 };
  const now = new Date();
  const due = await Giveaway.find({ ended: false, endAt: { $lte: now } }, { _id: 1 }).lean();
  for (const g of due) {
    await endGiveaway(g._id.toString(), client).catch((err?) =>
      global.logger?.warn?.("[Giveaway] endGiveaway failed:", g._id, err?.message),
    );
  }
  const upcoming = await Giveaway.find({ ended: false, endAt: { $gt: now } }, { _id: 1, endAt: 1 }).lean();
  for (const g of upcoming) {
    scheduleGiveawayEnd(client, g._id.toString(), g.endAt);
  }
  return { scheduled: upcoming.length, endedDue: due.length };
}

function pickOneExcluding(participants?, excludeIds?) {
  const set = new Set(Array.isArray(excludeIds) ? excludeIds : []);
  const pool = Array.isArray(participants) ? participants.filter((id?) => !set.has(String(id))) : [];
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

async function rerollGiveaway(interaction?, client?) {
  const customId = String(interaction?.customId || "");
  if (!customId.startsWith(GIVEAWAY_REROLL_PREFIX)) return false;
  const giveawayId = customId.slice(GIVEAWAY_REROLL_PREFIX.length).trim();
  if (!giveawayId) return false;

  const giveaway = await Giveaway.findOne({ _id: giveawayId }, GIVEAWAY_READ_PROJECTION).lean();
  if (!giveaway) {
    await interaction.reply({ content: `${E.VC_Alert} Giveaway non trovato.`, flags: 1 << 6 }).catch(() => { });
    return true;
  }
  if (!giveaway.ended) {
    await interaction.reply({ content: `${E.VC_Alert} Il giveaway non è ancora terminato.`, flags: 1 << 6 }).catch(() => { });
    return true;
  }

  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply({ flags: 1 << 6 }).catch(() => { });
  }
  const participants = await resolveEligibleParticipants(giveaway);
  const currentWinners = Array.isArray(giveaway.winnerIds) ? giveaway.winnerIds : [];
  const newWinnerId = pickOneExcluding(participants, currentWinners);
  const newWinnerIds = newWinnerId ? [newWinnerId] : null;

  if (newWinnerIds !== null) {
    await Giveaway.updateOne(
      { _id: giveawayId },
      { $set: { winnerIds: newWinnerIds } },
    );
  }

  const channel = await getClientChannelCached(client, giveaway.channelId);
  if (channel?.isTextBased?.() && newWinnerIds !== null) {
    try {
      const msg = await channel.messages.fetch(giveaway.messageId).catch(() => null);
      if (msg?.editable) {
        const updated = { ...giveaway, winnerIds: newWinnerIds };
        const embed = buildGiveawayEmbed(updated);
        const rerollRow = buildRerollButton(giveawayId);
        await msg.edit({ embeds: [embed], components: [rerollRow] }).catch(() => { });
      }
      await channel.send({ content: `${E.VC_Events}<@${newWinnerId}> ha vinto il giveaway! ${E.VC_Winner}` }).catch(() => { });
    } catch (err) {
      global.logger?.warn?.("[giveawayService] end/reroll:", err?.message || err);
    }
  }

  const rerollMsg = newWinnerId
    ? `${E.VC_Alert} Reroll effettuato! Il messaggio con il nuovo vincitore è stato inviato nel canale.`
    : `${E.VC_Alert} Nessun altro partecipante disponibile per il reroll.`;
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply({ content: rerollMsg }).catch(() => { });
  } else {
    await interaction.reply({ content: rerollMsg, flags: 1 << 6 }).catch(() => { });
  }
  return true;
}

async function endGiveawayByMessageId(messageId?, client?) {
  if (!messageId || !client) return { ok: false, error: "Parametri mancanti." };
  const giveaway = await Giveaway.findOne({ messageId: String(messageId) }, GIVEAWAY_READ_PROJECTION).lean();
  if (!giveaway) return { ok: false, error: "Giveaway non trovato (messaggio non valido)." };
  if (giveaway.cancelled) return { ok: false, error: "Questo giveaway è già stato annullato." };
  if (giveaway.ended) return { ok: false, error: "Il giveaway è già terminato." };

  const result = await endGiveaway(giveaway._id.toString(), client);
  if (!result) return { ok: false, error: "Impossibile terminare il giveaway." };
  return { ok: true, winnerIds: result.winnerIds || [] };
}

async function editGiveawayByMessageId(messageId?, client?, patch: Record<string, any> = {}) {
  if (!messageId || !client) return { ok: false, error: "Parametri mancanti." };
  const giveaway = await Giveaway.findOne({ messageId: String(messageId) }, GIVEAWAY_READ_PROJECTION).lean();
  if (!giveaway) return { ok: false, error: "Giveaway non trovato (messaggio non valido)." };
  if (giveaway.cancelled) return { ok: false, error: "Questo giveaway è già stato annullato." };
  if (giveaway.ended) return { ok: false, error: "Non puoi modificare un giveaway già terminato." };

  const $set: Record<string, any> = {};
  if (patch.prize != null) {
    const prize = String(patch.prize || "").trim();
    if (!prize) return { ok: false, error: "Premio non valido." };
    $set.prize = prize;
  }
  if (patch.winnerCount != null) {
    const n = Math.max(1, Math.min(Number(patch.winnerCount) || 1, 20));
    $set.winnerCount = n;
  }
  if (patch.hostId != null) {
    $set.hostId = String(patch.hostId);
    $set.hostTag = String(patch.hostTag || "").trim();
  }
  if (patch.durationMs != null) {
    const durationMs = Number(patch.durationMs);
    if (!Number.isFinite(durationMs) || durationMs < 60 * 1000) {
      return { ok: false, error: "Durata non valida. Usa ad es. `1h`, `24h`, `7d`." };
    }
    $set.endAt = new Date(Date.now() + durationMs);
  }

  if (!Object.keys($set).length) {
    return { ok: false, error: "Specifica almeno un campo da modificare (premio, durata, vincitori o host)." };
  }

  const updated = await Giveaway.findOneAndUpdate(
    { _id: giveaway._id, ended: false },
    { $set },
    { new: true },
  );
  if (!updated) return { ok: false, error: "Impossibile aggiornare il giveaway." };

  const plain = updated.toObject ? updated.toObject() : { ...giveaway, ...$set };
  if ($set.endAt) {
    scheduleGiveawayEnd(client, String(giveaway._id), $set.endAt);
  }

  const channel = await getClientChannelCached(client, plain.channelId || giveaway.channelId);
  if (channel?.isTextBased?.()) {
    try {
      const msg = await channel.messages.fetch(String(messageId)).catch(() => null);
      if (msg?.editable) {
        await msg
          .edit({
            embeds: [buildGiveawayEmbed(plain)],
            components: [buildEnterButton(String(giveaway._id))],
          })
          .catch(() => {});
      }
    } catch (err) {
      global.logger?.warn?.("[giveawayService] edit message:", err?.message || err);
    }
  }

  return { ok: true, giveaway: plain };
}

async function deleteGiveawayByMessageId(messageId?, client?, options: Record<string, any> = {}) {
  const deleteMessage = options.deleteMessage !== false;
  if (!messageId || !client) return { ok: false, error: "Parametri mancanti." };
  const giveaway = await Giveaway.findOne({ messageId: String(messageId) }, GIVEAWAY_READ_PROJECTION).lean();
  if (!giveaway) return { ok: false, error: "Giveaway non trovato (messaggio non valido)." };
  if (giveaway.cancelled) return { ok: false, error: "Questo giveaway è già stato annullato." };
  if (giveaway.ended) return { ok: false, error: "Il giveaway è già terminato: usa il reroll se serve." };

  clearScheduledGiveawayEnd(String(giveaway._id));
  const claimed = await Giveaway.updateOne(
    { _id: giveaway._id, ended: false },
    { $set: { ended: true, cancelled: true, winnerIds: [] } },
  );
  if (!claimed?.modifiedCount) return { ok: false, error: "Impossibile cancellare il giveaway." };

  let deletedMessage = false;
  const channel = await getClientChannelCached(client, giveaway.channelId);
  if (channel?.isTextBased?.()) {
    try {
      const msg = await channel.messages.fetch(String(messageId)).catch(() => null);
      if (msg) {
        if (deleteMessage && msg.deletable) {
          await msg.delete().catch(() => null);
          deletedMessage = true;
        } else if (msg.editable) {
          await msg
            .edit({
              embeds: [buildGiveawayEmbed({ ...giveaway, ended: true, cancelled: true, winnerIds: [] })],
              components: [],
            })
            .catch(() => {});
        }
      }
    } catch (err) {
      global.logger?.warn?.("[giveawayService] delete message:", err?.message || err);
    }
  }

  return { ok: true, deletedMessage };
}

async function rerollGiveawayByMessageId(messageId?, client?) {
  if (!messageId || !client) return { ok: false, error: `${E.VC_Alert} Parametri mancanti.` };
  const giveaway = await Giveaway.findOne({ messageId: String(messageId) }, GIVEAWAY_READ_PROJECTION).lean();
  if (!giveaway) return { ok: false, error: `${E.VC_Alert} Giveaway non trovato (messaggio non valido).` };
  if (giveaway.cancelled) return { ok: false, error: `${E.VC_Alert} Questo giveaway è stato annullato.` };
  if (!giveaway.ended) return { ok: false, error: `${E.VC_Alert} Il giveaway non è ancora terminato.` };

  const participants = await resolveEligibleParticipants(giveaway);
  const currentWinners = Array.isArray(giveaway.winnerIds) ? giveaway.winnerIds : [];
  const newWinnerId = pickOneExcluding(participants, currentWinners);
  const newWinnerIds = newWinnerId ? [newWinnerId] : null;

  if (newWinnerIds !== null) {
    await Giveaway.updateOne(
      { _id: giveaway._id },
      { $set: { winnerIds: newWinnerIds } },
    );
  }

  const channel = await getClientChannelCached(client, giveaway.channelId);
  if (channel?.isTextBased?.() && newWinnerIds !== null) {
    try {
      const msg = await channel.messages.fetch(giveaway.messageId).catch(() => null);
      if (msg?.editable) {
        const updated = { ...giveaway, winnerIds: newWinnerIds };
        const embed = buildGiveawayEmbed(updated);
        const rerollRow = buildRerollButton(giveaway._id.toString());
        await msg.edit({ embeds: [embed], components: [rerollRow] }).catch(() => {});
      }
      await channel.send({ content: `${E.VC_Events}<@${newWinnerId}> ha vinto il giveaway! ${E.VC_Winner}` }).catch(() => {});
    } catch (err) {
      global.logger?.warn?.("[giveawayService] reroll send:", err?.message || err);
    }
  }

  if (newWinnerId) return { ok: true, newWinnerId };
  return { ok: false, error: `${E.VC_Alert} Nessun altro partecipante disponibile per il reroll.` };
}

async function runScheduledEnds(client?) {
  const now = new Date();
  const list = await Giveaway.find({ ended: false, cancelled: { $ne: true }, endAt: { $lte: now } }).lean();
  for (const g of list) {
    await endGiveaway(g._id.toString(), client).catch((err?) =>
      global.logger?.warn?.("[Giveaway] endGiveaway failed:", g._id, err?.message),
    );
  }
  const upcoming = await Giveaway.find({ ended: false, cancelled: { $ne: true }, endAt: { $gt: now } }, { _id: 1, endAt: 1 }).lean();
  for (const g of upcoming) {
    if (!pendingEndTimers.has(String(g._id))) {
      scheduleGiveawayEnd(client, g._id.toString(), g.endAt);
    }
  }
}

async function syncActiveGiveawayButtons(client?) {
  const now = new Date();
  const activeGiveaways = await Giveaway.find({ ended: false, cancelled: { $ne: true }, endAt: { $gt: now } }, GIVEAWAY_READ_PROJECTION).lean();
  let updated = 0;
  let failed = 0;
  for (const giveaway of activeGiveaways) {
    const channelId = String(giveaway?.channelId || "");
    const messageId = String(giveaway?.messageId || "");
    const giveawayId = String(giveaway?._id || "");
    if (!channelId || !messageId || !giveawayId) continue;
    const channel = await getClientChannelCached(client, channelId).catch(() => null);
    if (!channel?.isTextBased?.()) {
      failed += 1;
      continue;
    }
    const message = await channel.messages.fetch(messageId).catch(() => null);
    if (!message?.editable) {
      failed += 1;
      continue;
    }
    await message.edit({ components: [buildEnterButton(giveawayId)] })
      .then(() => { updated += 1; })
      .catch(() => { failed += 1; });
  }
  return { scanned: activeGiveaways.length, updated, failed };
}

export = {
  createGiveaway,
  setGiveawayMessageId,
  endGiveaway,
  scheduleGiveawayEnd,
  scheduleActiveGiveawayEnds,
  rerollGiveaway,
  endGiveawayByMessageId,
  editGiveawayByMessageId,
  deleteGiveawayByMessageId,
  rerollGiveawayByMessageId,
  runScheduledEnds,
  syncActiveGiveawayButtons,
};
