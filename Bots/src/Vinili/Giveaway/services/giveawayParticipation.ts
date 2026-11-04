const Giveaway = require("./guildFeatureBucketGiveawayModel");
const { GIVEAWAY_ENTER_PREFIX, GIVEAWAY_LEAVE_PREFIX, GIVEAWAY_COUNT_PREFIX } = require("./giveawayUi") as typeof import("./giveawayUi");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
async function replyGiveawayEphemeral(interaction?, payload?) {
  const ephemeral = { flags: 1 << 6 };
  try {
    if (typeof payload === "string") {
      payload = { content: payload, embeds: [], components: [] };
    } else {
      payload = {
        content: payload.content || "",
        embeds: payload.embeds || [],
        components: payload.components || [],
      };
    }
    if (interaction.deferred || interaction.replied) {
      await interaction.editReply(payload).catch(() => { });
    } else {
      await interaction.reply({ ...payload, ...ephemeral }).catch(() => { });
    }
  } catch (_) {}
}

async function enterGiveaway(interaction?, client?, opts?) {
  opts = opts || {};
  const customId = String(interaction?.customId || "");
  let giveawayId = "";
  if (customId.startsWith(GIVEAWAY_ENTER_PREFIX)) {
    giveawayId = customId.slice(GIVEAWAY_ENTER_PREFIX.length).trim();
  } else if (opts.giveawayId) {
    giveawayId = String(opts.giveawayId).trim();
  }
  if (!giveawayId) return false;

  const ephemeral = { flags: 1 << 6 };
  if (!interaction.deferred && !interaction.replied) {
    await interaction.deferReply(ephemeral).catch(() => { });
  }

  const giveaway = await Giveaway.findOne({ _id: giveawayId }).lean();
  if (!giveaway) {
    await replyGiveawayEphemeral(interaction, `${E.VC_Alert} Giveaway non trovato o già terminato.`);
    return true;
  }
  if (giveaway.cancelled) {
    await replyGiveawayEphemeral(interaction, `${E.VC_Alert} Questo giveaway è stato annullato.`);
    return true;
  }
  if (giveaway.ended) {
    await replyGiveawayEphemeral(interaction, `${E.VC_Alert} Questo giveaway è già terminato.`);
    return true;
  }
  if (new Date(giveaway.endAt).getTime() <= Date.now()) {
    const { endGiveaway } = require("./giveawayLifecycle") as typeof import("./giveawayLifecycle");
    void endGiveaway(giveawayId, client).catch(() => null);
    await replyGiveawayEphemeral(interaction, `${E.VC_Alert} Il tempo per partecipare è scaduto.`);
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
    await replyGiveawayEphemeral(interaction, `${E.VC_Alert} Giveaway non trovato o già terminato.`);
    return true;
  }

  await replyGiveawayEphemeral(
    interaction,
    wasIn
      ? `${E.VC_Alert} Sei già iscritto!`
      : `${E.VC_Events} Sei entrato nel giveaway!`,
  );

  return true;
}

async function leaveGiveaway(interaction?, client?) {
  const customId = String(interaction?.customId || "");
  if (!customId.startsWith(GIVEAWAY_LEAVE_PREFIX)) return false;
  const giveawayId = customId.slice(GIVEAWAY_LEAVE_PREFIX.length).trim();
  if (!giveawayId) return false;

  const giveaway = await Giveaway.findOne({ _id: giveawayId }).lean();
  if (!giveaway) {
    await interaction.reply({ content: `${E.VC_Alert} Giveaway non trovato o già terminato.`, flags: 1 << 6 }).catch(() => { });
    return true;
  }
  if (giveaway.cancelled) {
    await interaction.reply({ content: `${E.VC_Alert} Questo giveaway è stato annullato.`, flags: 1 << 6 }).catch(() => { });
    return true;
  }
  if (giveaway.ended) {
    await interaction.reply({ content: `${E.VC_Alert} Questo giveaway è già terminato.`, flags: 1 << 6 }).catch(() => { });
    return true;
  }
  if (new Date(giveaway.endAt).getTime() <= Date.now()) {
    const { endGiveaway } = require("./giveawayLifecycle") as typeof import("./giveawayLifecycle");
    void endGiveaway(giveawayId, client).catch(() => null);
    await interaction.reply({ content: `${E.VC_Alert} Il tempo per modificare la partecipazione è scaduto.`, flags: 1 << 6 }).catch(() => { });
    return true;
  }

  const userId = String(interaction.user?.id || "");
  const wasIn = Array.isArray(giveaway.participants) && giveaway.participants.includes(userId);
  if (!wasIn) {
    await interaction.reply({ content: `${E.VC_Alert} Non eri iscritto a questo giveaway.`, flags: 1 << 6 }).catch(() => { });
    return true;
  }

  await Giveaway.updateOne(
    { _id: giveawayId, ended: false },
    { $pull: { participants: userId } },
  );
  await interaction.reply({
    content: `${E.cancel} Sei uscito dal giveaway.`,
    flags: 1 << 6,
  }).catch(() => { });
  return true;
}

async function showGiveawayJoinCount(interaction?, client?) {
  void client;
  const customId = String(interaction?.customId || "");
  if (!customId.startsWith(GIVEAWAY_COUNT_PREFIX)) return false;
  const giveawayId = customId.slice(GIVEAWAY_COUNT_PREFIX.length).trim();
  if (!giveawayId) return false;

  const giveaway = await Giveaway.findOne({ _id: giveawayId }, { participants: 1, ended: 1 }).lean();
  if (!giveaway) {
    await interaction.reply({ content: `${E.VC_Alert} Giveaway non trovato.`, flags: 1 << 6 }).catch(() => { });
    return true;
  }
  const count = Array.isArray(giveaway.participants) ? giveaway.participants.length : 0;
  await interaction.reply({
    content: `${E.VC_Stats} Partecipanti attuali: **${count}**.`,
    flags: 1 << 6,
  }).catch(() => { });
  return true;
}

export = {
  replyGiveawayEphemeral,
  enterGiveaway,
  leaveGiveaway,
  showGiveawayJoinCount,
};
