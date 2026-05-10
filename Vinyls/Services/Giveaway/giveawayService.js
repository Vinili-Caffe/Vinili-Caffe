const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const Giveaway = require("../../Schemas/Giveaway/giveawaySchema");
const { getClientChannelCached } = require("../../Utils/Interaction/interactionEntityCache");
const GIVEAWAY_ENTER_PREFIX = "giveaway_enter:";
const GIVEAWAY_LEAVE_PREFIX = "giveaway_leave:";
const GIVEAWAY_COUNT_PREFIX = "giveaway_count:";
const GIVEAWAY_REROLL_PREFIX = "giveaway_reroll:";

function parseDuration(input) {
  const str = String(input || "").trim().toLowerCase();
  const match = str.match(/^(\d+)(m|h|d|s)$/);
  if (!match) return null;
  const value = Math.max(1, parseInt(match[1], 10));
  const unit = match[2];
  const multipliers = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };
  return value * (multipliers[unit] || 0);
}

function discordRelativeEndTimestamp(endAt) {
  const sec = Math.floor(new Date(endAt).getTime() / 1000);
  if (!Number.isFinite(sec)) return "—";
  return `<t:${sec}:R>`;
}

function buildGiveawayEmbed(giveaway, options = {}) {
  const { prize, endAt, winnerCount, hostId, hostTag, participants = [], ended, winnerIds = [] } = giveaway;
  const endDate = new Date(endAt);
  const dateStr = endDate.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
  const hostDisplay = hostId ? `<@${hostId}>` : (hostTag || "—");

  const embed = new EmbedBuilder()
    .setColor("#5865F2")
    .setTitle(`<a:VC_Events:1482706144953897223> ${prize}`)
    .addFields(
      {
        name: "<a:VC_Calendar:1482706208149475358> Tempo rimanente",
        value: ended ? "Terminato" : discordRelativeEndTimestamp(endAt),
        inline: true,
      },
      {
        name: "<:VC_EXP:1482534670896730143> Hosted by",
        value: hostTag || "—",
        inline: true,
      }
    )
    .setFooter({
      text: ended ? `Terminato il ${dateStr}` : `${winnerCount} vincitor${winnerCount !== 1 ? "i" : "e"} | Termina il ${dateStr}`,
    });

  if (options.imageUrl) embed.setImage(options.imageUrl);

  return embed;
}

function buildEnterButton(giveawayId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${GIVEAWAY_ENTER_PREFIX}${giveawayId}`)
      .setLabel("Entra")
      .setStyle(ButtonStyle.Success)
      .setEmoji("<a:VC_Events:1482706144953897223>"),
    new ButtonBuilder()
      .setCustomId(`${GIVEAWAY_LEAVE_PREFIX}${giveawayId}`)
      .setLabel("Esci")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("<:cancel:1461730653677551691>"),
    new ButtonBuilder()
      .setCustomId(`${GIVEAWAY_COUNT_PREFIX}${giveawayId}`)
      .setLabel("Partecipanti")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("<:VC_Stats:1482527532682055780>"),
  );
}

function buildRerollButton(giveawayId) {
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${GIVEAWAY_COUNT_PREFIX}${giveawayId}`)
      .setLabel("Partecipanti")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("<:VC_Stats:1482527532682055780>"),
    new ButtonBuilder()
      .setCustomId(`${GIVEAWAY_REROLL_PREFIX}${giveawayId}`)
      .setLabel("Re-Roll")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("<:VC_Refresh:1473359252276904203>"),
  );
}

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

async function setGiveawayMessageId(giveawayId, messageId) {
  await Giveaway.updateOne({ _id: giveawayId }, { $set: { messageId: String(messageId) } });
}

async function getGiveawayByMessageId(messageId) {
  return Giveaway.findOne({ messageId: String(messageId) }).lean();
}

async function getGiveawayById(id) {
  return Giveaway.findById(id).lean();
}

async function enterGiveaway(interaction, client) {
  const customId = String(interaction?.customId || "");
  if (!customId.startsWith(GIVEAWAY_ENTER_PREFIX)) return false;
  const giveawayId = customId.slice(GIVEAWAY_ENTER_PREFIX.length).trim();
  if (!giveawayId) return false;

  const giveaway = await Giveaway.findOne({ _id: giveawayId }).lean();
  if (!giveaway) {
    await interaction.reply({ content: "<a:VC_Alert:1482706673176150077> Giveaway non trovato o già terminato.", flags: 1 << 6 }).catch(() => { });
    return true;
  }
  if (giveaway.ended) {
    await interaction.reply({ content: "<a:VC_Alert:1482706673176150077> Questo giveaway è già terminato.", flags: 1 << 6 }).catch(() => { });
    return true;
  }
  if (new Date(giveaway.endAt).getTime() <= Date.now()) {
    await interaction.reply({ content: "<a:VC_Alert:1482706673176150077> Il tempo per partecipare è scaduto.", flags: 1 << 6 }).catch(() => { });
    return true;
  }

  const userId = String(interaction.user?.id || "");
  const wasIn = giveaway.participants && giveaway.participants.includes(userId);
  const updated = await Giveaway.findOneAndUpdate(
    { _id: giveawayId, ended: false },
    { $addToSet: { participants: userId } },
    { new: true },
  );
  if (!updated) {
    await interaction.reply({ content: "<a:VC_Alert:1482706673176150077> Giveaway non trovato o già terminato.", flags: 1 << 6 }).catch(() => { });
    return true;
  }

  const count = Array.isArray(updated.participants) ? updated.participants.length : 0;
  await interaction.reply({
    content: wasIn
      ? "<a:VC_Alert:1482706673176150077> Sei già iscritto! "
      : "<a:VC_Events:1482706144953897223> Sei entrato nel giveaway!",
    flags: 1 << 6,
  }).catch(() => { });

  return true;
}

async function leaveGiveaway(interaction, client) {
  void client;
  const customId = String(interaction?.customId || "");
  if (!customId.startsWith(GIVEAWAY_LEAVE_PREFIX)) return false;
  const giveawayId = customId.slice(GIVEAWAY_LEAVE_PREFIX.length).trim();
  if (!giveawayId) return false;

  const giveaway = await Giveaway.findOne({ _id: giveawayId }).lean();
  if (!giveaway) {
    await interaction.reply({ content: "<a:VC_Alert:1482706673176150077> Giveaway non trovato o già terminato.", flags: 1 << 6 }).catch(() => { });
    return true;
  }
  if (giveaway.ended) {
    await interaction.reply({ content: "<a:VC_Alert:1482706673176150077> Questo giveaway è già terminato.", flags: 1 << 6 }).catch(() => { });
    return true;
  }
  if (new Date(giveaway.endAt).getTime() <= Date.now()) {
    await interaction.reply({ content: "<a:VC_Alert:1482706673176150077> Il tempo per modificare la partecipazione è scaduto.", flags: 1 << 6 }).catch(() => { });
    return true;
  }

  const userId = String(interaction.user?.id || "");
  const wasIn = Array.isArray(giveaway.participants) && giveaway.participants.includes(userId);
  if (!wasIn) {
    await interaction.reply({ content: "<a:VC_Alert:1482706673176150077> Non eri iscritto a questo giveaway.", flags: 1 << 6 }).catch(() => { });
    return true;
  }

  await Giveaway.updateOne(
    { _id: giveawayId, ended: false },
    { $pull: { participants: userId } },
  );
  await interaction.reply({
    content: "<:cancel:1461730653677551691> Sei uscito dal giveaway.",
    flags: 1 << 6,
  }).catch(() => { });
  return true;
}

async function showGiveawayJoinCount(interaction, client) {
  void client;
  const customId = String(interaction?.customId || "");
  if (!customId.startsWith(GIVEAWAY_COUNT_PREFIX)) return false;
  const giveawayId = customId.slice(GIVEAWAY_COUNT_PREFIX.length).trim();
  if (!giveawayId) return false;

  const giveaway = await Giveaway.findOne({ _id: giveawayId }, { participants: 1, ended: 1 }).lean();
  if (!giveaway) {
    await interaction.reply({ content: "<a:VC_Alert:1482706673176150077> Giveaway non trovato.", flags: 1 << 6 }).catch(() => { });
    return true;
  }
  const count = Array.isArray(giveaway.participants) ? giveaway.participants.length : 0;
  await interaction.reply({
    content: `<:VC_Stats:1482527532682055780> Partecipanti attuali: **${count}**.`,
    flags: 1 << 6,
  }).catch(() => { });
  return true;
}

function pickWinners(participants, winnerCount) {
  const list = Array.isArray(participants) ? [...participants] : [];
  if (list.length === 0) return [];
  const count = Math.min(winnerCount, list.length);
  for (let i = list.length - 1; i > 0; i--) {
    const j = Math.floor(Math.random() * (i + 1));
    [list[i], list[j]] = [list[j], list[i]];
  }
  return list.slice(0, count);
}

const GIVEAWAY_READ_PROJECTION = { participants: 1, winnerCount: 1, channelId: 1, messageId: 1, _id: 1, prize: 1, endAt: 1, hostId: 1, hostTag: 1, ended: 1, winnerIds: 1 };

async function endGiveaway(giveawayId, client) {
  const giveaway = await Giveaway.findOne({ _id: giveawayId }, GIVEAWAY_READ_PROJECTION).lean();
  if (!giveaway || giveaway.ended) return null;

  const participants = Array.isArray(giveaway.participants) ? giveaway.participants : [];
  const winnerIds = pickWinners(participants, giveaway.winnerCount);

  await Giveaway.updateOne(
    { _id: giveawayId },
    { $set: { ended: true, winnerIds } },
  );

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
      await channel.send({ content: `<a:VC_Events:1482706144953897223> <@${winnerIds[0]}> ha vinto il giveaway! <a:VC_Winner:1482535294757507255>` }).catch(() => { });
    } else if (winnerIds.length > 1) {
      const mention = winnerIds.map((id) => `<@${id}>`).join(", ");
      await channel.send({ content: `<a:VC_Events:1482706144953897223>${mention} hanno vinto il giveaway! <a:VC_Winner:1482535294757507255>` }).catch(() => { });
    }
  }

  return { winnerIds, participants: participants.length };
}

function pickOneExcluding(participants, excludeIds) {
  const set = new Set(Array.isArray(excludeIds) ? excludeIds : []);
  const pool = Array.isArray(participants) ? participants.filter((id) => !set.has(String(id))) : [];
  if (pool.length === 0) return null;
  return pool[Math.floor(Math.random() * pool.length)];
}

async function rerollGiveaway(interaction, client) {
  const customId = String(interaction?.customId || "");
  if (!customId.startsWith(GIVEAWAY_REROLL_PREFIX)) return false;
  const giveawayId = customId.slice(GIVEAWAY_REROLL_PREFIX.length).trim();
  if (!giveawayId) return false;

  const giveaway = await Giveaway.findOne({ _id: giveawayId }, GIVEAWAY_READ_PROJECTION).lean();
  if (!giveaway) {
    await interaction.reply({ content: "<a:VC_Alert:1482706673176150077> Giveaway non trovato.", flags: 1 << 6 }).catch(() => { });
    return true;
  }
  if (!giveaway.ended) {
    await interaction.reply({ content: "<a:VC_Alert:1482706673176150077> Il giveaway non è ancora terminato.", flags: 1 << 6 }).catch(() => { });
    return true;
  }

  const participants = Array.isArray(giveaway.participants) ? giveaway.participants : [];
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
      await channel.send({ content: `<a:VC_Events:1482706144953897223><@${newWinnerId}> ha vinto il giveaway! <a:VC_Winner:1482535294757507255>` }).catch(() => { });
    } catch (err) {
      global.logger?.warn?.("[giveawayService] end/reroll:", err?.message || err);
    }
  }

  if (newWinnerId) {
    await interaction.reply({
      content: "<a:VC_Alert:1482706673176150077> Reroll effettuato! Il messaggio con il nuovo vincitore è stato inviato nel canale.",
      flags: 1 << 6,
    }).catch(() => { });
  } else {
    await interaction.reply({
      content: "<a:VC_Alert:1482706673176150077> Nessun altro partecipante disponibile per il re - roll.",
      flags: 1 << 6,
    }).catch(() => { });
  }
  return true;
}

/**
 * Esegue un re-roll per giveaway identificato dal messageId. Usabile dal comando /giveaway reroll.
 * @returns {{ ok: boolean, newWinnerId?: string, error?: string }}
 */
async function rerollGiveawayByMessageId(messageId, client) {
  if (!messageId || !client) return { ok: false, error: "<a:VC_Alert:1482706673176150077> Parametri mancanti." };
  const giveaway = await Giveaway.findOne({ messageId: String(messageId) }, GIVEAWAY_READ_PROJECTION).lean();
  if (!giveaway) return { ok: false, error: "<a:VC_Alert:1482706673176150077> Giveaway non trovato (messaggio non valido)." };
  if (!giveaway.ended) return { ok: false, error: "<a:VC_Alert:1482706673176150077> Il giveaway non è ancora terminato." };

  const participants = Array.isArray(giveaway.participants) ? giveaway.participants : [];
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
      await channel.send({ content: `<a:VC_Events:1482706144953897223><@${newWinnerId}> ha vinto il giveaway! <a:VC_Winner:1482535294757507255>` }).catch(() => {});
    } catch (err) {
      global.logger?.warn?.("[giveawayService] reroll send:", err?.message || err);
    }
  }

  if (newWinnerId) return { ok: true, newWinnerId };
  return { ok: false, error: "<a:VC_Alert:1482706673176150077> Nessun altro partecipante disponibile per il re - roll." };
}

async function runScheduledEnds(client) {
  const now = new Date();
  const list = await Giveaway.find({ ended: false, endAt: { $lte: now } }).lean();
  for (const g of list) {
    await endGiveaway(g._id.toString(), client).catch((err) =>
      global.logger?.warn?.("[Giveaway] endGiveaway failed:", g._id, err?.message),
    );
  }
}

async function syncActiveGiveawayButtons(client) {
  const now = new Date();
  const activeGiveaways = await Giveaway.find({ ended: false, endAt: { $gt: now } }, GIVEAWAY_READ_PROJECTION).lean();
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

module.exports = { GIVEAWAY_ENTER_PREFIX, GIVEAWAY_LEAVE_PREFIX, GIVEAWAY_COUNT_PREFIX, GIVEAWAY_REROLL_PREFIX, parseDuration, buildGiveawayEmbed, buildEnterButton, buildRerollButton, createGiveaway, setGiveawayMessageId, getGiveawayByMessageId, getGiveawayById, enterGiveaway, leaveGiveaway, showGiveawayJoinCount, endGiveaway, rerollGiveaway, rerollGiveawayByMessageId, runScheduledEnds, syncActiveGiveawayButtons };