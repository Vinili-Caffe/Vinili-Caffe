const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js") as typeof import("discord.js");
const { PRIVACY_CONTENT_KINDS, PRIVACY_CONTENT_LABELS, privacyContentModel } = require("./privacyContentKinds") as typeof import("./privacyContentKinds");
const { siteUserProfilePagePlainRef } = require("../../../shared/web/siteTicketsPageRef") as typeof import("../../../shared/web/siteTicketsPageRef");

const { E } = require("../../../shared/emojis/emojiCatalog") as typeof import("../../../shared/emojis/emojiCatalog");
const PREFIX = "privacy_panel";
const KINDS = PRIVACY_CONTENT_KINDS;
const LABELS = PRIVACY_CONTENT_LABELS;
const EMOJI_OFF = E.VC_OfflineStatus;
const EMOJI_ON = E.VC_OnlineStatus;
const BTN_EMOJI_OFF = E.VC_OfflineStatus;
const BTN_EMOJI_ON = E.VC_OnlineStatus;
const PRIVATE = 1 << 6;

async function loadStates(guildId?, userId?) {
  const entries = await Promise.all(
    KINDS.map(async (kind?) => {
      const Model = privacyContentModel(kind);
      const doc = Model ? await Model.findOne({ guildId, userId }).lean().catch(() => null) : null;
      return [kind, Boolean(doc?.blocked)];
    }),
  );
  return Object.fromEntries(entries);
}

async function setKindBlocked(guildId?, userId?, kind?, blocked?) {
  const Model = privacyContentModel(kind);
  if (!Model) return;
  await Model.findOneAndUpdate(
    { guildId, userId },
    { $set: { blocked: Boolean(blocked) }, $setOnInsert: { guildId, userId } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch((err?) => global.logger?.warn?.("[privacyContentPanel] save:", kind, err?.message || err));
}

async function setAllBlocked(guildId?, userId?, blocked?) {
  await Promise.all(KINDS.map((k?) => setKindBlocked(guildId, userId, k, blocked)));
}

function buildPanelEmbed(states?) {
  const lines = KINDS.map((key?) => {
    const hidden = states[key];
    return `• **${LABELS[key]}**: ${hidden ? `${EMOJI_OFF} Nascosto / bloccato` : `${EMOJI_ON} Visibile`}`;
  });
  const desc = [
    `${E.VC_PinkQuestionMark} Gestisci **privacy** di avatar, banner, quote e repost in questo server.`,
    "",
    ...lines,
    "",
    "Clicca un pulsante per alternare. **Blocca tutto** / **Sblocca tutto** applica alle quattro voci.",
    "",
    `${E.VC_Exclamation} In canale: avatar e banner nascosti se bloccati; **quote** e **repost** dei tuoi messaggi non si possono creare se bloccati.`,
  ].join("\n");

  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle(`${E.VC_Announce} Privacy contenuti`)
    .setDescription(desc)
    .setFooter({ text: `Usa ${siteUserProfilePagePlainRef()} per riaprire questo pannello.` });
}

function buildRows(states?, ownerId?) {
  const row1 = new ActionRowBuilder();
  for (const key of KINDS) {
    const hidden = states[key];
    row1.addComponents(
      new ButtonBuilder()
        .setCustomId(`${PREFIX}:toggle:${key}:${ownerId}`)
        .setLabel(String(LABELS[key]).slice(0, 80))
        .setStyle(hidden ? ButtonStyle.Secondary : ButtonStyle.Success)
        .setEmoji(hidden ? BTN_EMOJI_OFF : BTN_EMOJI_ON),
    );
  }
  const allBlocked = KINDS.every((k?) => states[k]);
  const allVisible = KINDS.every((k?) => !states[k]);
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${PREFIX}:all:${ownerId}`)
      .setLabel("Blocca tutto")
      .setStyle(allBlocked ? ButtonStyle.Danger : ButtonStyle.Secondary)
      .setEmoji(E.cancel),
    new ButtonBuilder()
      .setCustomId(`${PREFIX}:none:${ownerId}`)
      .setLabel("Sblocca tutto")
      .setStyle(allVisible ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setEmoji(E.success),
    new ButtonBuilder()
      .setCustomId(`${PREFIX}:done:${ownerId}`)
      .setLabel("Fine")
      .setStyle(ButtonStyle.Primary)
      .setEmoji(E.vegacheckmark),
  );
  return [row1, row2];
}

function parsePrivacyCustomId(customId?) {
  const parts = String(customId || "").split(":");
  if (parts[0] !== PREFIX || parts.length < 3) return null;
  if (parts[1] === "toggle") {
    if (parts.length < 4) return null;
    return { action: "toggle", kind: parts[2], ownerId: parts[3] };
  }
  return { action: parts[1], ownerId: parts[2] };
}

async function handlePrivacyPanelInteraction(interaction?) {
  const parsed = parsePrivacyCustomId(interaction.customId);
  if (!parsed) return false;
  if (String(interaction.user?.id) !== String(parsed.ownerId)) {
    await interaction
      .reply({ content: `${E.vegax} Questo pannello non è tuo.`, flags: PRIVATE })
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
            .setTitle(`${E.success} Privacy aggiornata`)
            .setDescription(
              `${E.VC_InactiveStatus} Le impostazioni sono salvate. Usa [Personalizza](https://www.viniliecaffe.it/personalizza/) per modificarle in futuro.`,
            ),
        ],
        components: [],
      })
      .catch(() => null);
    return true;
  }

  if (parsed.action === "toggle" && KINDS.includes(parsed.kind)) {
    const states = await loadStates(guildId, userId);
    await setKindBlocked(guildId, userId, parsed.kind, !states[parsed.kind]);
  } else if (parsed.action === "all") {
    await setAllBlocked(guildId, userId, true);
  } else if (parsed.action === "none") {
    await setAllBlocked(guildId, userId, false);
  } else {
    return false;
  }

  const next = await loadStates(guildId, userId);
  await interaction
    .update({
      embeds: [buildPanelEmbed(next)],
      components: buildRows(next, userId),
    })
    .catch(() => null);
  return true;
}

export = {
  parsePrivacyCustomId,
  handlePrivacyPanelInteraction,
};
