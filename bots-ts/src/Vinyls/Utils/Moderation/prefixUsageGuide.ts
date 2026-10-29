const { ActionRowBuilder, StringSelectMenuBuilder, EmbedBuilder, MessageFlags, ComponentType } = require("discord.js") as typeof import("discord.js");
const { TENANT_EMBED_COLOR, applyTenantPayloadBranding, stripTenantBrandingInternals } = require("../../MultiGuild/utils/tenantEmbedBranding") as typeof import("../../MultiGuild/utils/tenantEmbedBranding");
const { buildSimpleNoticePayload } = require("../Embeds/simpleNoticeEmbed") as typeof import("../Embeds/simpleNoticeEmbed");

const GUIDE_LIFETIME_MS = 10 * 60 * 1000;
const PRIVATE = MessageFlags.Ephemeral || 1 << 6;

function guideEmbedColor(guild?) {
  try {
    const { resolveEmbedColorForGuild } = require("../../MultiGuild/utils/tenantEmbedBranding") as typeof import("../../MultiGuild/utils/tenantEmbedBranding");
    return resolveEmbedColorForGuild(guild?.id) || TENANT_EMBED_COLOR;
  } catch {
    return TENANT_EMBED_COLOR;
  }
}

function brandGuidePayload(payload?, guild?) {
  if (!guild?.id) return payload;
  return stripTenantBrandingInternals(
    applyTenantPayloadBranding(payload, {
      guildId: guild.id,
      guild,
      client: guild.client,
      includeBanner: false,
      includeAuthor: true,
      includeThumbnail: true,
    }),
  ) || payload;
}

function normalizeSubcommands(command?) {
  const fromField = Array.isArray(command?.subcommands) ? command.subcommands : [];
  const fromExamples = Array.isArray(command?.examples)
    ? command.examples
        .map((ex?) => String(ex || "").trim())
        .map((ex?) => ex.replace(/^[+!,.?/-]+/, "").split(/\s+/)[1])
        .filter(Boolean)
    : [];
  return [...new Set([...fromField, ...fromExamples].map((s?) => String(s).trim()).filter(Boolean))];
}

function getSubDescription(command?, sub?) {
  if (typeof command?.getSubcommandDescription === "function") {
    return String(command.getSubcommandDescription(sub) || "").trim() || "Nessuna descrizione.";
  }
  if (command?.subcommandDescriptions && typeof command.subcommandDescriptions === "object") {
    return String(command.subcommandDescriptions[sub] || "").trim() || "Nessuna descrizione.";
  }
  return "Nessuna descrizione.";
}

function buildDefaultGuideEmbed(command?, prefix = "+", guild = null) {
  const name = String(command?.name || "comando");
  const description = String(command?.description || command?.helpDescription || "Nessuna descrizione.").trim();
  const usage = String(command?.usage || `${prefix}${name}`).trim();
  return new EmbedBuilder()
    .setColor(guideEmbedColor(guild))
    .setTitle(`Guida: ${prefix}${name}`)
    .setDescription(
      [
        "",
        `**Descrizione:** ${description}`,
        "**Uso:**",
        usage,
      ].join("\n"),
    );
}

function buildSubGuideEmbed(command?, prefix?, sub?, guild = null) {
  const name = String(command?.name || "comando");
  const description = getSubDescription(command, sub);
  return new EmbedBuilder()
    .setColor(guideEmbedColor(guild))
    .setTitle(`Guida: ${prefix}${name} ${sub}`)
    .setDescription(
      [
        "",
        `**Descrizione:** ${description}`,
        "**Uso:**",
        `${prefix}${name} ${sub}`,
      ].join("\n"),
    );
}

function buildSubcommandRow(command?, ownerId?, currentValue = "__default") {
  const subs = normalizeSubcommands(command);
  if (!subs.length) return null;
  const hidden = String(currentValue || "__default").toLowerCase();
  const filteredSubs =
    hidden === "__default" ? subs : subs.filter((sub?) => String(sub).toLowerCase() !== hidden);

  const menu = new StringSelectMenuBuilder()
    .setCustomId(`usage_guide:${command.name}:${ownerId}`)
    .setPlaceholder("Vedi sotto - comandi")
    .addOptions(
      ...filteredSubs.slice(0, 24).map((sub?) => ({
        label: sub,
        description: getSubDescription(command, sub).slice(0, 100),
        value: sub,
      })),
      {
        label: "default",
        description: "Torna alla guida principale del comando",
        value: "__default",
      },
    );
  return new ActionRowBuilder().addComponents(menu);
}

function parseUsageGuideCustomId(customId?) {
  const parts = String(customId || "").split(":");
  if (parts[0] !== "usage_guide" || parts.length < 3) return null;
  return { commandName: parts[1], ownerId: parts[2] };
}

function resolvePrefixCommand(client?, commandName?) {
  const name = String(commandName || "").toLowerCase();
  if (!name) return null;
  const map = client?.prefix || client?.prefixCommands || client?.pcommands;
  if (map?.get) {
    return map.get(name) || map.get(commandName) || null;
  }
  if (map && typeof map === "object") {
    return map[name] || map[commandName] || null;
  }
  return null;
}

async function handleUsageGuideInteraction(interaction?, { prefix = "+" } = {}) {
  const parsed = parseUsageGuideCustomId(interaction.customId);
  if (!parsed) return false;
  if (String(interaction.user?.id) !== parsed.ownerId) {
    await interaction
      .reply(buildSimpleNoticePayload("Questo menu non è tuo.", interaction.guild, { ephemeral: true }))
      .catch(() => null);
    return true;
  }
  const command = resolvePrefixCommand(interaction.client, parsed.commandName);
  if (!command) {
    await interaction
      .reply(
        buildSimpleNoticePayload("Comando non disponibile. Rifai il comando.", interaction.guild, {
          ephemeral: true,
        }),
      )
      .catch(() => null);
    return true;
  }
  const picked = String(interaction.values?.[0] || "__default");
  const row = buildSubcommandRow(command, parsed.ownerId, picked);
  const nextEmbed =
    picked === "__default"
      ? buildDefaultGuideEmbed(command, prefix, interaction.guild)
      : buildSubGuideEmbed(command, prefix, picked, interaction.guild);
  await interaction
    .update(
      brandGuidePayload(
        {
          embeds: [nextEmbed],
          components: row ? [row] : [],
        },
        interaction.guild,
      ),
    )
    .catch(() => null);
  return true;
}

async function showPrefixUsageGuide({ message, command, prefix = "+", deleteCommandMessage = null }: any) {
  if (!message || !command) return false;
  const defaultEmbed = buildDefaultGuideEmbed(command, prefix, message.guild);
  const row = buildSubcommandRow(command, message.author.id, "__default");

  if (typeof deleteCommandMessage === "function") {
    await deleteCommandMessage().catch(() => {});
  }

  const sent = await message.channel
    .send(
      brandGuidePayload(
        { embeds: [defaultEmbed], ...(row ? { components: [row] } : {}) },
        message.guild,
      ),
    )
    .catch(() => null);
  return Boolean(sent);
}

export = {
  showPrefixUsageGuide,
  parseUsageGuideCustomId,
  handleUsageGuideInteraction,
  GUIDE_LIFETIME_MS,
};
