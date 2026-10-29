const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require("discord.js") as typeof import("discord.js");
const { getAutoModMemberSnapshot } = require("../Services/Moderation/automodService") as typeof import("../Services/Moderation/automodService");
const { accountUsername } = require("../Utils/Discord/guildDiscordIdentity") as typeof import("../Utils/Discord/guildDiscordIdentity");

function chunk(array?, size?) {
  const out = [];
  for (let i = 0; i < array.length; i += size) out.push(array.slice(i, i + size));
  return out;
}

function buildStrikeButtons(ownerId?, targetId?, page?, totalPages?) {
  const base = `info_strike:${ownerId}:${targetId}:${page}:${totalPages}`;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${base}:first`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("⏮️")
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(`${base}:prev`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("◀️")
      .setDisabled(page <= 0),
    new ButtonBuilder()
      .setCustomId(`${base}:next`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("▶️")
      .setDisabled(page >= totalPages - 1),
    new ButtonBuilder()
      .setCustomId(`${base}:last`)
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("⏭️")
      .setDisabled(page >= totalPages - 1),
    new ButtonBuilder()
      .setCustomId(`${base}:close`)
      .setStyle(ButtonStyle.Danger)
      .setEmoji("✖️"),
  );
}

function parseInfoStrikeCustomId(customId?) {
  const parts = String(customId || "").split(":");
  if (parts[0] !== "info_strike" || parts.length < 6) return null;
  const [, ownerId, targetId, pageRaw, totalRaw, action] = parts;
  if (!/^\d{16,20}$/.test(ownerId) || !/^\d{16,20}$/.test(targetId)) return null;
  if (!["first", "prev", "next", "last", "close"].includes(action)) return null;
  return {
    ownerId,
    targetId,
    page: Math.max(0, Math.floor(Number(pageRaw) || 0)),
    total: Math.max(1, Math.floor(Number(totalRaw) || 1)),
    action,
  };
}

async function handleInfoStrikeInteraction(interaction?) {
  const parsed = parseInfoStrikeCustomId(interaction.customId);
  if (!parsed) return false;
  if (String(interaction.user?.id) !== parsed.ownerId) {
    await interaction
      .reply({
        content: "Solo chi ha usato il comando può usare questi pulsanti.",
        flags: MessageFlags.Ephemeral,
      })
      .catch(() => null);
    return true;
  }
  if (parsed.action === "close") {
    await interaction.update({ components: [] }).catch(() => null);
    return true;
  }
  const member = await interaction.guild.members.fetch(parsed.targetId).catch(() => null);
  if (!member) {
    await interaction.update({ components: [] }).catch(() => null);
    return true;
  }
  const auto = (await getAutoModMemberSnapshot(interaction.guild.id, member.id).catch(() => null)) || {};
  const strikeItems = Array.isArray(auto.strikeReasons)
    ? auto.strikeReasons.map((x?) => String(x || "").trim()).filter(Boolean)
    : [];
  const strikePages = chunk(strikeItems, 5);
  const totalPages = Math.max(1, 1 + strikePages.length);
  let page = parsed.page;
  if (parsed.action === "first") page = 0;
  else if (parsed.action === "prev") page = Math.max(0, page - 1);
  else if (parsed.action === "next") page = Math.min(totalPages - 1, page + 1);
  else if (parsed.action === "last") page = totalPages - 1;
  page = Math.min(totalPages - 1, Math.max(0, page));

  let embed;
  if (page <= 0) {
    embed = new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle(`Who is ${accountUsername(member)}?`)
      .setDescription(
        `Usa \`+info\` di nuovo per la scheda completa.\n\n**Active Strikes:** \`${strikeItems.length}\`\nPage: 1/${totalPages}`,
      );
  } else {
    const strikePageIndex = page - 1;
    const strikeRows = (strikePages[strikePageIndex] || []).map(
      (item?, i?) => `\`${strikePageIndex * 5 + i + 1}\` ${item}`,
    );
    embed = new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle(`${accountUsername(member)}'s Strikes:`)
      .setDescription(
        [
          "**Active Strikes:**",
          ...(strikeRows.length ? strikeRows : ["Nessuno strike disponibile."]),
          "",
          `Page: ${page + 1}/${totalPages}`,
        ].join("\n"),
      );
  }

  await interaction
    .update({
      embeds: [embed],
      components: [buildStrikeButtons(parsed.ownerId, parsed.targetId, page, totalPages)],
    })
    .catch(() => null);
  return true;
}

export = {
  name: "infoStrike",
  order: 47,
  match(interaction?) {
    return interaction?.isButton?.() && Boolean(parseInfoStrikeCustomId(interaction.customId));
  },
  async execute(interaction?) {
    return handleInfoStrikeInteraction(interaction);
  },
  buildStrikeButtons,
  parseInfoStrikeCustomId,
};
