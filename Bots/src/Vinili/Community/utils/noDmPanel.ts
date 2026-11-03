const { siteUserProfilePagePlainRef } = require("../../../shared/web/siteTicketsPageRef") as typeof import("../../../shared/web/siteTicketsPageRef");
const { getNoDmPreferences, setNoDmCategories, DM_CATEGORIES, DM_CATEGORY_ALL, DM_CATEGORY_LABELS } = require("./noDmList") as typeof import("./noDmList");
// bug: i componenti Discord del pannello non erano importati (il pannello preferenze DM andava in errore)
const { ActionRowBuilder, ButtonBuilder, ButtonStyle, EmbedBuilder } = require("discord.js") as typeof import("discord.js");

const PREFIX = "nodm_panel";
const EMOJI_OFF = "<:VC_OfflineStatus:1482527117051957380>";
const EMOJI_ON = "<:VC_OnlineStatus:1482527088912240650>";
const BTN_EMOJI_OFF = "<:VC_OfflineStatus:1482527117051957380>";
const BTN_EMOJI_ON = "<:VC_OnlineStatus:1482527088912240650>";
const PRIVATE = 1 << 6;

function buildPanelEmbed(prefs?) {
  const isAll = prefs.blockAll || prefs.disabled.has(DM_CATEGORY_ALL);
  const lines = DM_CATEGORIES.map((key?) => {
    const off = isAll || prefs.disabled.has(key);
    return `• **${DM_CATEGORY_LABELS[key]}**: ${off ? `${EMOJI_OFF} Disattivato` : `${EMOJI_ON} Attivo`}`;
  });
  const intro = "<:VC_PinkQuestionMark:1471892611026391306> Configura le tue **preferenze DM**. Clicca un pulsante per attivare/disattivare una categoria.";
  const footerText = `Usa ${siteUserProfilePagePlainRef()} per gestire i tuoi avvisi in DM.`;
  const desc = [
    `${intro}`,
    "",
    ...lines,
    "",
    isAll
      ? "<:VC_Attention:1482534443632558151> **Tutti i DM sono attualmente disattivati.** Clicca una categoria per ricevere solo quella, o **Attiva tutto**."
      : "<a:VC_Alert:1482706673176150077> Usa **Disattiva tutto** per bloccare tutti i DM, o **Attiva tutto** per riceverli tutti.",
    "",
    "<a:VC_Exclamation:1482534702077444217> Ticket, moderazione e messaggi importanti restano sempre inviati.",
  ].join("\n");

  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<a:VC_Announce:1482534613568979007> Preferenze DM")
    .setDescription(desc)
    .setFooter({ text: footerText });
}

function buildRows(prefs?, ownerId?) {
  const isAll = prefs.blockAll || prefs.disabled.has(DM_CATEGORY_ALL);
  const dmButtons = DM_CATEGORIES.map((key?) => {
    const off = isAll || prefs.disabled.has(key);
    return new ButtonBuilder()
      .setCustomId(`${PREFIX}:toggle:${key}:${ownerId}`)
      .setLabel(String(DM_CATEGORY_LABELS[key]).slice(0, 80))
      .setStyle(off ? ButtonStyle.Secondary : ButtonStyle.Success)
      .setEmoji(off ? BTN_EMOJI_OFF : BTN_EMOJI_ON);
  });
  const rows = [];
  for (let i = 0; i < dmButtons.length; i += 5) {
    rows.push(new ActionRowBuilder().addComponents(...dmButtons.slice(i, i + 5)));
  }
  rows.push(
    new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`${PREFIX}:all:${ownerId}`)
        .setLabel("Disattiva tutto")
        .setStyle(isAll ? ButtonStyle.Danger : ButtonStyle.Secondary)
        .setEmoji("<:cancel:1461730653677551691>"),
      new ButtonBuilder()
        .setCustomId(`${PREFIX}:none:${ownerId}`)
        .setLabel("Attiva tutto")
        .setStyle(!isAll && prefs.disabled.size === 0 ? ButtonStyle.Success : ButtonStyle.Secondary)
        .setEmoji("<:success:1461731530333229226>"),
      new ButtonBuilder()
        .setCustomId(`${PREFIX}:done:${ownerId}`)
        .setLabel("Fine")
        .setStyle(ButtonStyle.Primary)
        .setEmoji("<:vegacheckmark:1443666279058772028>"),
    ),
  );
  return rows;
}

function parseNoDmCustomId(customId?) {
  const parts = String(customId || "").split(":");
  if (parts[0] !== PREFIX || parts.length < 3) return null;
  if (parts[1] === "toggle") {
    if (parts.length < 4) return null;
    return { action: "toggle", category: parts[2], ownerId: parts[3] };
  }
  return { action: parts[1], ownerId: parts[2] };
}

async function handleNoDmPanelInteraction(interaction?) {
  const parsed = parseNoDmCustomId(interaction.customId);
  if (!parsed) return false;
  if (String(interaction.user?.id) !== String(parsed.ownerId)) {
    await interaction
      .reply({ content: "<:vegax:1443934876440068179> Questo pannello non è tuo.", flags: PRIVATE })
      .catch(() => null);
    return true;
  }
  const guildId = interaction.guild?.id;
  const userId = parsed.ownerId;
  if (!guildId) return true;

  if (parsed.action === "done") {
    await interaction
      .update({
        embeds: [
          new EmbedBuilder()
            .setColor("#6f4e37")
            .setTitle("<:success:1461731530333229226> Preferenze DM salvate")
            .setDescription(
              "<:VC_InactiveStatus:1482526984234860574> Le tue preferenze sono state aggiornate con successo. Usa [Personalizza](https://www.viniliecaffe.it/personalizza/) per modificarle in futuro.",
            ),
        ],
        components: [],
      })
      .catch(() => null);
    return true;
  }

  if (parsed.action === "toggle") {
    const cat = parsed.category;
    if (!DM_CATEGORIES.includes(cat)) {
      await interaction.deferUpdate().catch(() => null);
      return true;
    }
    const prefs2 = await getNoDmPreferences(guildId, userId);
    const isAll = prefs2.blockAll || prefs2.disabled.has(DM_CATEGORY_ALL);
    let next;
    if (isAll) {
      next = DM_CATEGORIES.filter((k?) => k !== cat);
    } else {
      const disabled = new Set(prefs2.disabled);
      if (disabled.has(cat)) disabled.delete(cat);
      else disabled.add(cat);
      next = [...disabled];
    }
    await setNoDmCategories(guildId, userId, next.length ? next : []);
  } else if (parsed.action === "all") {
    await setNoDmCategories(guildId, userId, [DM_CATEGORY_ALL]);
  } else if (parsed.action === "none") {
    await setNoDmCategories(guildId, userId, []);
  } else {
    return false;
  }

  const prefs3 = await getNoDmPreferences(guildId, userId);
  await interaction
    .update({
      embeds: [buildPanelEmbed(prefs3)],
      components: buildRows(prefs3, userId),
    })
    .catch(() => null);
  return true;
}

export = {
  parseNoDmCustomId,
  handleNoDmPanelInteraction,
  PREFIX,
};
