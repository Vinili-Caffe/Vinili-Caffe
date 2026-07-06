"use strict";

const { EmbedBuilder } = require("discord.js");

const EPHEMERAL_FLAG = 1 << 6;

function isStringSelectMenuInteraction(interaction) {
  return Boolean(interaction?.isStringSelectMenu?.() && interaction.isStringSelectMenu());
}

function payloadWithDefaultEphemeral(payload, ephemeral = true) {
  const next =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? { ...payload }
      : { content: String(payload || "") };
  if (ephemeral && !Object.prototype.hasOwnProperty.call(next, "flags")) {
    next.flags = EPHEMERAL_FLAG;
  }
  return next;
}

function panelEmbedsFromMessage(interaction) {
  const embeds = interaction?.message?.embeds;
  if (!Array.isArray(embeds) || !embeds.length) return undefined;
  return embeds.map((embed) => EmbedBuilder.from(embed));
}

async function resolvePanelEmbeds(rebuildEmbeds, interaction) {
  if (typeof rebuildEmbeds === "function") {
    const next = await rebuildEmbeds(interaction);
    if (!Array.isArray(next) || !next.length) return undefined;
    return next.map((embed) => (embed instanceof EmbedBuilder ? embed : EmbedBuilder.from(embed)));
  }
  return panelEmbedsFromMessage(interaction);
}

async function resolvePanelComponents(rebuildComponents, interaction) {
  if (typeof rebuildComponents === "function") {
    return await rebuildComponents(interaction);
  }
  return rebuildComponents;
}

async function resetPanelSelectMenu(interaction, rebuildComponents, options = {}) {
  if (!interaction?.update) return false;
  const components = await resolvePanelComponents(rebuildComponents, interaction);
  if (!Array.isArray(components)) return false;
  const embeds = await resolvePanelEmbeds(options.rebuildEmbeds, interaction);
  await interaction
    .update({
      ...(embeds ? { embeds } : {}),
      components,
    })
    .catch(() => null);
  return true;
}

function buildFollowUpInteractionProxy(interaction, options = {}) {
  const ephemeral = options.ephemeral !== false;
  const sendFollowUp = (payload) =>
    interaction.followUp(payloadWithDefaultEphemeral(payload, ephemeral)).catch(() => null);

  // Delegate to the real interaction instance so discord.js fields (client, guild, member) stay valid.
  return Object.assign(Object.create(interaction), {
    isButton: () => Boolean(options.treatAsButton),
    isStringSelectMenu: () => false,
    reply: (payload) => sendFollowUp(payload),
    editReply: (payload) => sendFollowUp(payload),
  });
}

async function panelSelectFollowUp(interaction, rebuildComponents, payload, options = {}) {
  await resetPanelSelectMenu(interaction, rebuildComponents, options);
  return interaction
    .followUp(payloadWithDefaultEphemeral(payload, options.ephemeral !== false))
    .catch(() => null);
}

async function beginPanelSelectDefer(interaction, rebuildComponents, deferOptions = { flags: EPHEMERAL_FLAG }, options = {}) {
  await resetPanelSelectMenu(interaction, rebuildComponents, options);
  if (interaction.deferred || interaction.replied) return true;
  await interaction.deferReply(deferOptions).catch(() => null);
  return Boolean(interaction.deferred);
}

async function runPanelSelectWithFollowUp(interaction, rebuildComponents, handler, options = {}) {
  await resetPanelSelectMenu(interaction, rebuildComponents, options);
  const proxy = buildFollowUpInteractionProxy(interaction, options);
  return handler(proxy, interaction);
}

module.exports = {
  EPHEMERAL_FLAG,
  isStringSelectMenuInteraction,
  payloadWithDefaultEphemeral,
  resetPanelSelectMenu,
  buildFollowUpInteractionProxy,
  panelSelectFollowUp,
  beginPanelSelectDefer,
  runPanelSelectWithFollowUp,
};
