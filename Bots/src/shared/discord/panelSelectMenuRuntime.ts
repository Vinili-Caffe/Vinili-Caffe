"use strict";

const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");

const EPHEMERAL_FLAG = 1 << 6;

function payloadWithDefaultEphemeral(payload?, ephemeral = true) {
  const next =
    payload && typeof payload === "object" && !Array.isArray(payload)
      ? { ...payload }
      : { content: String(payload || "") };
  if (ephemeral && !Object.prototype.hasOwnProperty.call(next, "flags")) {
    next.flags = EPHEMERAL_FLAG;
  }
  return next;
}

function panelEmbedsFromMessage(interaction?) {
  const embeds = interaction?.message?.embeds;
  if (!Array.isArray(embeds) || !embeds.length) return undefined;
  return embeds.map((embed?) => EmbedBuilder.from(embed));
}

async function resolvePanelEmbeds(rebuildEmbeds?, interaction?) {
  if (typeof rebuildEmbeds === "function") {
    const next = await rebuildEmbeds(interaction);
    if (!Array.isArray(next) || !next.length) return undefined;
    return next.map((embed?) => (embed instanceof EmbedBuilder ? embed : EmbedBuilder.from(embed)));
  }
  return panelEmbedsFromMessage(interaction);
}

async function resolvePanelComponents(rebuildComponents?, interaction?) {
  if (typeof rebuildComponents === "function") {
    return await rebuildComponents(interaction);
  }
  return rebuildComponents;
}

async function resetPanelSelectMenu(interaction?, rebuildComponents?, options: Record<string, any> = {}) {
  if (!interaction?.update) return false;
  const components = await resolvePanelComponents(rebuildComponents, interaction);
  if (!Array.isArray(components)) return false;
  const embeds = await resolvePanelEmbeds(options.rebuildEmbeds, interaction);
  const updatePayload: Record<string, any> = {
    ...(embeds ? { embeds } : {}),
    components,
  };
  if (options.includeBanner === false) updatePayload.includeBanner = false;
  if (options.includeThumbnail === false) updatePayload.includeThumbnail = false;
  if (options.includeAuthor === false) updatePayload.includeAuthor = false;
  if (options.clearAttachments) {
    updatePayload.files = [];
    updatePayload.attachments = [];
  }
  await interaction
    .update(updatePayload)
    .catch(() => null);
  return true;
}

async function panelSelectFollowUp(interaction?, rebuildComponents?, payload?, options: Record<string, any> = {}) {
  await resetPanelSelectMenu(interaction, rebuildComponents, options);
  return interaction
    .followUp(payloadWithDefaultEphemeral(payload, options.ephemeral !== false))
    .catch(() => null);
}

async function beginPanelSelectDefer(interaction?, rebuildComponents?, deferOptions = { flags: EPHEMERAL_FLAG }, options: Record<string, any> = {}) {
  await resetPanelSelectMenu(interaction, rebuildComponents, options);
  if (interaction.deferred || interaction.replied) return true;
  await interaction.deferReply(deferOptions).catch(() => null);
  return Boolean(interaction.deferred);
}

export = {
  EPHEMERAL_FLAG,
  payloadWithDefaultEphemeral,
  resetPanelSelectMenu,
  panelSelectFollowUp,
  beginPanelSelectDefer,
};
