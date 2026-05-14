const { CLASSIFICA_TOGGLE_PREFIX, CLASSIFICA_CLOSE_PREFIX, buildClassificaPayload } = require("../Prefix/Level/classifica");

function match(interaction) {
  const id = String(interaction?.customId || "");
  return interaction?.isButton?.() && (id.startsWith(CLASSIFICA_TOGGLE_PREFIX) || id.startsWith(CLASSIFICA_CLOSE_PREFIX));
}

function parseToggleCustomId(customId) {
  const raw = String(customId || "");
  if (!raw.startsWith(CLASSIFICA_TOGGLE_PREFIX)) return null;
  const payload = raw.slice(CLASSIFICA_TOGGLE_PREFIX.length);
  const [modeToken = "", ownerId = "", sourceMessageId = ""] = payload.split(":");
  const rawMode = String(modeToken || "").trim().toLowerCase();
  const mode =
    rawMode === "alltime" ? "alltime" : rawMode === "monthly" ? "monthly" : "weekly";
  return {
    mode,
    ownerId: /^\d{16,20}$/.test(String(ownerId || "").trim()) ? String(ownerId).trim() : null,
    sourceMessageId: /^\d{16,20}$/.test(String(sourceMessageId || "").trim()) ? String(sourceMessageId).trim() : null,
  };
}

function parseCloseCustomId(customId) {
  const raw = String(customId || "");
  if (!raw.startsWith(CLASSIFICA_CLOSE_PREFIX)) return null;
  const payload = raw.slice(CLASSIFICA_CLOSE_PREFIX.length);
  const [ownerId = "", sourceMessageId = ""] = payload.split(":");
  return {
    ownerId: /^\d{16,20}$/.test(String(ownerId || "").trim()) ? String(ownerId).trim() : null,
    sourceMessageId: /^\d{16,20}$/.test(String(sourceMessageId || "").trim()) ? String(sourceMessageId).trim() : null,
  };
}

async function execute(interaction) {
  const id = String(interaction.customId || "");
  if (id.startsWith(CLASSIFICA_CLOSE_PREFIX)) {
    const parsedClose = parseCloseCustomId(id);
    if (parsedClose?.ownerId && String(interaction.user.id) !== String(parsedClose.ownerId)) {
      await interaction.reply({
        content: "<a:VC_Alert:1482706673176150077> Solo chi ha aperto la classifica può chiuderla.",
        flags: 1 << 6,
      }).catch(() => {});
      return true;
    }
    await interaction.message?.delete?.().catch(() => {});
    if (parsedClose?.sourceMessageId && interaction.channel?.messages?.fetch) {
      const sourceMessage = await interaction.channel.messages.fetch(parsedClose.sourceMessageId).catch(() => null);
      if (sourceMessage?.deletable) {
        await sourceMessage.delete().catch(() => {});
      }
    }
    if (!interaction.replied && !interaction.deferred) {
      await interaction.deferUpdate().catch(() => {});
    }
    return true;
  }
  const parsedToggle = parseToggleCustomId(id);
  const mode = parsedToggle?.mode || "weekly";
  const guild = interaction.guild;
  if (!guild) return false;
  const payload = await buildClassificaPayload(guild, mode, {
    ownerId: parsedToggle?.ownerId || null,
    sourceMessageId: parsedToggle?.sourceMessageId || null,
  });
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload).catch(() => interaction.followUp(payload).catch(() => { }));
  } else {
    await interaction.update(payload).catch(() => interaction.reply(payload).catch(() => { }));
  }
  return true;
}

module.exports = { name: "classificaToggle", order: 9, match, execute };