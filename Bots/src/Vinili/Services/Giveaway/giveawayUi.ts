const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js") as typeof import("discord.js");

const GIVEAWAY_ENTER_PREFIX = "giveaway_enter:";
const GIVEAWAY_LEAVE_PREFIX = "giveaway_leave:";
const GIVEAWAY_COUNT_PREFIX = "giveaway_count:";
const GIVEAWAY_REROLL_PREFIX = "giveaway_reroll:";

function parseDuration(input?) {
  const str = String(input || "").trim().toLowerCase();
  const match = str.match(/^(\d+)(m|h|d|s)$/);
  if (!match) return null;
  const value = Math.max(1, parseInt(match[1], 10));
  const unit = match[2];
  const multipliers = { s: 1000, m: 60 * 1000, h: 60 * 60 * 1000, d: 24 * 60 * 60 * 1000 };
  return value * (multipliers[unit] || 0);
}

function discordRelativeEndTimestamp(endAt?) {
  const sec = Math.floor(new Date(endAt).getTime() / 1000);
  if (!Number.isFinite(sec)) return "—";
  return `<t:${sec}:R>`;
}

function buildGiveawayEmbed(giveaway?, options: Record<string, any> = {}) {
  const {
    prize,
    endAt,
    winnerCount,
    hostId,
    hostTag,
    participants = [],
    ended,
    cancelled,
    winnerIds = [],
  } = giveaway;
  void participants;
  void winnerIds;
  const endDate = new Date(endAt);
  const dateStr = endDate.toLocaleDateString("it-IT", { day: "2-digit", month: "2-digit", year: "numeric" });
  const hostDisplay = hostId ? `<@${hostId}>` : (hostTag || "—");
  const isCancelled = Boolean(cancelled);

  const fields = [
    {
      name: "<a:VC_Calendar:1482706208149475358> Tempo rimanente",
      value: isCancelled ? "Annullato" : ended ? "Terminato" : discordRelativeEndTimestamp(endAt),
      inline: true,
    },
    {
      name: "<:VC_EXP:1482534670896730143> Hosted by",
      value: hostTag || hostDisplay || "—",
      inline: true,
    },
  ];

  const embed = new EmbedBuilder()
    .setColor(isCancelled ? "#992d22" : "#5865F2")
    .setTitle(`<a:VC_Events:1482706144953897223> ${prize}`)
    .addFields(fields)
    .setFooter({
      text: isCancelled
        ? `Annullato il ${dateStr}`
        : ended
          ? `Terminato il ${dateStr}`
          : `${winnerCount} vincitor${winnerCount !== 1 ? "i" : "e"} | Termina il ${dateStr}`,
    });

  if (options.imageUrl) embed.setImage(options.imageUrl);

  return embed;
}

function buildEnterButton(giveawayId?) {
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

function buildRerollButton(giveawayId?) {
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

export = {
  GIVEAWAY_ENTER_PREFIX,
  GIVEAWAY_LEAVE_PREFIX,
  GIVEAWAY_COUNT_PREFIX,
  GIVEAWAY_REROLL_PREFIX,
  parseDuration,
  buildGiveawayEmbed,
  buildEnterButton,
  buildRerollButton,
};
