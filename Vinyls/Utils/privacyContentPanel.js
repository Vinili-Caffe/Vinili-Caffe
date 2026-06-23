const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, ComponentType } = require("discord.js");
const { PRIVACY_CONTENT_KINDS, PRIVACY_CONTENT_LABELS, privacyContentModel } = require("./privacyContentKinds");

const PREFIX = "privacy_panel_";
const KINDS = PRIVACY_CONTENT_KINDS;
const LABELS = PRIVACY_CONTENT_LABELS;
const EMOJI_OFF = "<:VC_OfflineStatus:1482527117051957380>";
const EMOJI_ON = "<:VC_OnlineStatus:1482527088912240650>";
const BTN_EMOJI_OFF = "<:VC_OfflineStatus:1482527117051957380>";
const BTN_EMOJI_ON = "<:VC_OnlineStatus:1482527088912240650>";

function _stripRef(p) {
  if (!p || typeof p !== "object") return p;
  const o = { ...p };
  delete o.reply;
  delete o.messageReference;
  delete o.failIfNotExists;
  if (o.allowedMentions && typeof o.allowedMentions === "object") {
    o.allowedMentions = { ...o.allowedMentions, repliedUser: false };
  }
  return o;
}

async function _reply(message, payload) {
  if (!message || typeof message.reply !== "function") {
    return message.channel && message.channel.send
      ? message.channel.send(_stripRef(payload)).catch(() => null)
      : null;
  }
  try {
    return await message.reply(payload);
  } catch (e) {
    if (e && e.code === 10008) return null;
    if (
      e &&
      e.code === 50035 &&
      e.rawError &&
      e.rawError.errors &&
      e.rawError.errors.message_reference
    ) {
      return message.channel.send(_stripRef(payload)).catch(() => null);
    }
    const sent =
      message.channel && message.channel.send
        ? await message.channel.send(_stripRef(payload)).catch(() => null)
        : null;
    if (!sent) {
      global.logger?.warn?.("[privacyContentPanel] reply failed:", e?.code, e?.message || e);
    }
    return sent;
  }
}

async function loadStates(guildId, userId) {
  const entries = await Promise.all(
    KINDS.map(async (kind) => {
      const Model = privacyContentModel(kind);
      const doc = Model ? await Model.findOne({ guildId, userId }).lean().catch(() => null) : null;
      return [kind, Boolean(doc?.blocked)];
    }),
  );
  return Object.fromEntries(entries);
}

async function setKindBlocked(guildId, userId, kind, blocked) {
  const Model = privacyContentModel(kind);
  if (!Model) return;
  await Model.findOneAndUpdate(
    { guildId, userId },
    { $set: { blocked: Boolean(blocked) }, $setOnInsert: { guildId, userId } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch((err) => global.logger?.warn?.("[privacyContentPanel] save:", kind, err?.message || err));
}

async function setAllBlocked(guildId, userId, blocked) {
  await Promise.all(KINDS.map((k) => setKindBlocked(guildId, userId, k, blocked)));
}

function buildPanelEmbed(states) {
  const lines = KINDS.map((key) => {
    const hidden = states[key];
    return `• **${LABELS[key]}**: ${hidden ? `${EMOJI_OFF} Nascosto / bloccato` : `${EMOJI_ON} Visibile`}`;
  });
  const desc = [
    "<:VC_PinkQuestionMark:1471892611026391306> Gestisci **privacy** di avatar, banner, quote e repost in questo server.",
    "",
    ...lines,
    "",
    "Clicca un pulsante per alternare. **Blocca tutto** / **Sblocca tutto** applica alle quattro voci.",
    "",
    "<a:VC_Exclamation:1482534702077444217> In canale: avatar e banner nascosti se bloccati; **quote** e **repost** dei tuoi messaggi non si possono creare se bloccati.",
  ].join("\n");

  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<a:VC_Announce:1482534613568979007> Privacy contenuti")
    .setDescription(desc)
    .setFooter({ text: "Usa +profile per riaprire questo pannello." });
}

function buildRows(states, uniqueKey) {
  const row1 = new ActionRowBuilder();
  for (const key of KINDS) {
    const hidden = states[key];
    row1.addComponents(
      new ButtonBuilder()
        .setCustomId(`${PREFIX}toggle_${key}_${uniqueKey}`)
        .setLabel(String(LABELS[key]).slice(0, 80))
        .setStyle(hidden ? ButtonStyle.Secondary : ButtonStyle.Success)
        .setEmoji(hidden ? BTN_EMOJI_OFF : BTN_EMOJI_ON),
    );
  }
  const allBlocked = KINDS.every((k) => states[k]);
  const allVisible = KINDS.every((k) => !states[k]);
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${PREFIX}all_${uniqueKey}`)
      .setLabel("Blocca tutto")
      .setStyle(allBlocked ? ButtonStyle.Danger : ButtonStyle.Secondary)
      .setEmoji("<:cancel:1461730653677551691>"),
    new ButtonBuilder()
      .setCustomId(`${PREFIX}none_${uniqueKey}`)
      .setLabel("Sblocca tutto")
      .setStyle(allVisible ? ButtonStyle.Success : ButtonStyle.Secondary)
      .setEmoji("<:success:1461731530333229226>"),
    new ButtonBuilder()
      .setCustomId(`${PREFIX}done_${uniqueKey}`)
      .setLabel("Fine")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("<:vegacheckmark:1443666279058772028>"),
  );
  return [row1, row2];
}

function matchesSession(customId, uniqueKey) {
  return typeof customId === "string" && customId.endsWith(`_${uniqueKey}`);
}

function parseToggleKind(customId, uniqueKey) {
  const p = `${PREFIX}toggle_`;
  if (!customId.startsWith(p) || !matchesSession(customId, uniqueKey)) return null;
  const suffix = `_${uniqueKey}`;
  const mid = customId.slice(p.length, -suffix.length);
  return KINDS.includes(mid) ? mid : null;
}

/**
 * Pannello interattivo: blocca/sblocca avatar, banner e quote (come +dm-filters).
 * @param {import("discord.js").Message} message
 */
async function runPrivacyPanel(message) {
  const guildId = message.guild.id;
  const userId = message.author.id;
  let states = await loadStates(guildId, userId);
  const uniqueKey = `u${Date.now()}${Math.floor(Math.random() * 1e6)}`;

  const promptMessage = await _reply(message, {
    embeds: [buildPanelEmbed(states)],
    components: buildRows(states, uniqueKey),
    allowedMentions: { repliedUser: false },
  });
  if (!promptMessage) return;

  const collector = promptMessage.createMessageComponentCollector({
    componentType: ComponentType.Button,
    time: 120_000,
    filter: (i) => i.user.id === userId && matchesSession(i.customId, uniqueKey),
  });

  collector.on("collect", async (interaction) => {
    const id = interaction.customId;
    const kind = parseToggleKind(id, uniqueKey);
    if (kind) {
      const nextBlocked = !states[kind];
      await setKindBlocked(guildId, userId, kind, nextBlocked);
      Object.assign(states, await loadStates(guildId, userId));
      await interaction
        .update({
          embeds: [buildPanelEmbed(states)],
          components: buildRows(states, uniqueKey),
        })
        .catch(() => {});
      return;
    }
    if (id === `${PREFIX}all_${uniqueKey}`) {
      await setAllBlocked(guildId, userId, true);
      Object.assign(states, await loadStates(guildId, userId));
      await interaction
        .update({
          embeds: [buildPanelEmbed(states)],
          components: buildRows(states, uniqueKey),
        })
        .catch(() => {});
      return;
    }
    if (id === `${PREFIX}none_${uniqueKey}`) {
      await setAllBlocked(guildId, userId, false);
      Object.assign(states, await loadStates(guildId, userId));
      await interaction
        .update({
          embeds: [buildPanelEmbed(states)],
          components: buildRows(states, uniqueKey),
        })
        .catch(() => {});
      return;
    }
    if (id === `${PREFIX}done_${uniqueKey}`) {
      collector.stop("done");
      await interaction
        .update({
          embeds: [
            new EmbedBuilder()
              .setColor("#6f4e37")
              .setTitle("<:success:1461731530333229226> Privacy aggiornata")
              .setDescription(
                "<:VC_InactiveStatus:1482526984234860574> Le impostazioni sono salvate. Usa `+profile` per modificarle in futuro.",
              ),
          ],
          components: [],
        })
        .catch(() => {});
    }
  });

  collector.on("end", async (_, reason) => {
    if (reason === "done") return;
    try {
      const rows = buildRows(await loadStates(guildId, userId), uniqueKey);
      const disabledRows = rows.map(
        (row) =>
          new ActionRowBuilder().addComponents(
            ...row.components.map((c) => ButtonBuilder.from(c).setDisabled(true)),
          ),
      );
      await promptMessage.edit({ components: disabledRows }).catch(() => {});
    } catch (err) {
      global.logger?.warn?.("[privacyContentPanel] end edit:", err?.message || err);
    }
  });
}

module.exports = { runPrivacyPanel };