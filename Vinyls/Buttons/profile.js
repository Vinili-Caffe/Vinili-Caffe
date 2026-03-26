const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const { MentionReaction } = require("../Schemas/Community/autoInteractionSchemas");
const { CustomRole } = require("../Schemas/Community/communitySchemas");
const { getBirthdayProfile, setBirthdayProfile, clearBirthdayProfile } = require("../Services/Community/profileStore");
const { inferBirthYearFromAge } = require("../Services/Community/birthdayService");
const { resolveCustomRoleState, buildExpiryText } = require("../Utils/Community/customRoleState");
const { MAX_REACTIONS, parseReactionTokens, toDisplay } = require("../Utils/Community/mentionReactionPanelUtils");

const PANEL_PREFIX = "profile_panel";
const SECTION_HOME = "home";
const SECTION_BIRTHDAY = "birthday";
const SECTION_CUSTOMROLE = "customrole";
const SECTION_CUSTOMVOC = "customvoc";
const SECTION_CUSTOMREACTION = "customreaction";
const PRIVATE_FLAG = 1 << 6;

function parseBirthdayDate(rawValue) {
  const value = String(rawValue || "").trim();
  const match = value.match(/^(\d{1,2})[\/\-.](\d{1,2})$/);
  if (!match) return null;
  const day = Number(match[1]);
  const month = Number(match[2]);
  if (!Number.isInteger(day) || !Number.isInteger(month)) return null;
  if (month < 1 || month > 12) return null;
  const dim = month === 2 ? 29 : ([4, 6, 9, 11].includes(month) ? 30 : 31);
  if (day < 1 || day > dim) return null;
  return { day, month };
}

function parseAge(rawValue) {
  const n = Number(String(rawValue || "").trim());
  if (!Number.isInteger(n) || n < 1 || n > 120) return null;
  return n;
}

function formatBirthday(profile) {
  const day = Number(profile?.day || 0);
  const month = Number(profile?.month || 0);
  if (!day || !month) return "Non impostato";
  const dd = String(day).padStart(2, "0");
  const mm = String(month).padStart(2, "0");
  return `${dd}/${mm}`;
}

function parsePanelCustomId(customId) {
  const parts = String(customId || "").split(":");
  if (parts.length < 3) return null;
  const [prefix, kind, ownerId, ...rest] = parts;
  if (prefix !== PANEL_PREFIX) return null;
  if (!/^\d{16,20}$/.test(String(ownerId || ""))) return null;
  return { kind, ownerId, rest };
}

async function fetchProfilePanelState(guild, userId, client) {
  const guildId = guild?.id;
  const [birthday, reactionDoc, customState] = await Promise.all([
    getBirthdayProfile(guildId, userId),
    MentionReaction.findOne({ guildId, userId }).lean().catch(() => null),
    resolveCustomRoleState({ guild, userId, client, cleanupExpired: false }),
  ]);

  return {
    birthday: birthday || null,
    reactions: Array.isArray(reactionDoc?.reactions) ? reactionDoc.reactions : [],
    custom: customState || null,
  };
}

function buildSectionEmbed(section, state, user) {
  const base = new EmbedBuilder().setColor("#6f4e37");
  const birthday = state?.birthday || {};
  const hasBirthday = Number.isInteger(birthday?.day) && Number.isInteger(birthday?.month);
  const custom = state?.custom || {};
  const customDoc = custom?.doc || null;
  const customRoleStatus = custom?.status || "none";
  const customRoleName = custom?.role?.name ? `**${custom.role.name}**` : "Nessun ruolo attivo";
  const customRoleExpiry = customDoc ? buildExpiryText(customDoc) : "—";
  const customVocLinked = customDoc?.customVocChannelId ? `<#${customDoc.customVocChannelId}>` : "Nessuna vocale collegata";
  const customVocEmoji = String(customDoc?.customVocEmoji || "").trim() || "Non impostata";
  const reactionList = Array.isArray(state?.reactions) ? state.reactions : [];
  const birthdayPrivacy = birthday?.showAge === false ? "Nascosta" : "Visibile";

  if (section === SECTION_BIRTHDAY) {
    return base
      .setTitle("Profile Center • Birthday")
      .setDescription([
        "<a:VC_Flowers:1468687836055212174> Gestisci compleanno dal pannello rapido.",
        "",
        "**Configurazione attuale**",
        `• Data: **${formatBirthday(birthday)}**`,
        `• Età: **${Number.isInteger(birthday?.birthYear) ? "Impostata" : "Non impostata"}**`,
        `• Privacy età: **${birthdayPrivacy}**`,
        "",
        hasBirthday
          ? "Usa i pulsanti sotto per aggiornare o rimuovere il profilo."
          : "Premi **Imposta Birthday** per iniziare.",
      ].join("\n"));
  }

  if (section === SECTION_CUSTOMROLE) {
    return base
      .setTitle("Profile Center • Custom Role")
      .setDescription([
        "<:VC_Modifica:1478859646587633717> Hub custom role.",
        "",
        "**Configurazione attuale**",
        `• Stato: **${customRoleStatus}**`,
        `• Ruolo: ${customRoleName}`,
        `• Scadenza: **${customRoleExpiry}**`,
        `• Vocale collegata: ${customVocLinked}`,
        "",
        "Usa i pulsanti per aprire i setup dedicati.",
      ].join("\n"));
  }

  if (section === SECTION_CUSTOMVOC) {
    return base
      .setTitle("Profile Center • Custom Voc")
      .setDescription([
        "<:VC_Headphone:1482532659514351686> Gestione vocale privata.",
        "",
        "**Configurazione attuale**",
        `• Stato custom role: **${customRoleStatus}**`,
        `• Vocale privata: ${customVocLinked}`,
        `• Emoji vocale: **${customVocEmoji}**`,
        "",
        "Apri il setup con il comando guidato.",
      ].join("\n"));
  }

  if (section === SECTION_CUSTOMREACTION) {
    return base
      .setTitle("Profile Center • Custom Reaction")
      .setDescription([
        "<:VC_emoji:1485419161168511036> Reaction automatiche alle menzioni.",
        "",
        "**Configurazione attuale**",
        reactionList.length
          ? `• Attive (${reactionList.length}/${MAX_REACTIONS}): ${reactionList.map(toDisplay).join(" ")}`
          : "• Nessuna reaction attiva.",
        "",
        "Puoi impostarle qui dal pannello.",
      ].join("\n"));
  }

  const reactionsCount = reactionList.length;
  return base
    .setTitle("Profile Center")
    .setDescription([
      `<a:VC_Announce:1482534613568979007> Benvenuto ${user}.`,
      "Qui trovi una mini guida per configurare il tuo profilo e le funzioni principali del bot.",
      "",
      "**Stato rapido**",
      `• Birthday: **${hasBirthday ? "Configurato" : "Non configurato"}**`,
      `• Custom Role: **${customRoleStatus}**`,
      `• Vocale Privata: **${customVocLinked}**`,
      `• Custom Reactions: **${reactionsCount}/${MAX_REACTIONS}**`,
      "",
      "**Configurazione attuale**",
      `• Data birthday: **${formatBirthday(birthday)}**`,
      `• Privacy età: **${birthdayPrivacy}**`,
      `• Ruolo attivo: ${customRoleName}`,
      `• Emoji vocale: **${customVocEmoji}**`,
      "Usa il menu a tendina per cambiare pagina e i pulsanti per agire.",
    ].join("\n"))
    .setFooter({ text: "Profile Center • aggiornamento live" });
}

function buildRows(ownerId, section) {
  const select = new StringSelectMenuBuilder()
    .setCustomId(`${PANEL_PREFIX}:select:${ownerId}`)
    .setPlaceholder("Scegli una sezione")
    .addOptions(
      { label: "Home", value: SECTION_HOME, emoji: "🏠", default: section === SECTION_HOME },
      { label: "Birthday", value: SECTION_BIRTHDAY, emoji: "🎂", default: section === SECTION_BIRTHDAY },
      { label: "Custom Role", value: SECTION_CUSTOMROLE, emoji: "🎨", default: section === SECTION_CUSTOMROLE },
      { label: "Custom Voc", value: SECTION_CUSTOMVOC, emoji: "🎧", default: section === SECTION_CUSTOMVOC },
      { label: "Custom Reaction", value: SECTION_CUSTOMREACTION, emoji: "✨", default: section === SECTION_CUSTOMREACTION },
    );

  const row1 = new ActionRowBuilder().addComponents(select);
  const row2 = new ActionRowBuilder();

  if (section === SECTION_BIRTHDAY) {
    row2.addComponents(
      new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:action:${ownerId}:birthday_set`).setLabel("Imposta Birthday").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:action:${ownerId}:birthday_privacy`).setLabel("Toggle Privacy").setStyle(ButtonStyle.Secondary),
      new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:action:${ownerId}:birthday_clear`).setLabel("Rimuovi").setStyle(ButtonStyle.Danger),
    );
  } else if (section === SECTION_CUSTOMROLE) {
    row2.addComponents(
      new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:action:${ownerId}:open_customrole`).setLabel("Apri +customrole").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:action:${ownerId}:open_customvoc`).setLabel("Apri +customvoc").setStyle(ButtonStyle.Secondary),
    );
  } else if (section === SECTION_CUSTOMVOC) {
    row2.addComponents(
      new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:action:${ownerId}:open_customvoc`).setLabel("Apri +customvoc").setStyle(ButtonStyle.Primary),
    );
  } else if (section === SECTION_CUSTOMREACTION) {
    row2.addComponents(
      new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:action:${ownerId}:reaction_set`).setLabel("Imposta Reactions").setStyle(ButtonStyle.Primary),
      new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:action:${ownerId}:reaction_clear`).setLabel("Azzera").setStyle(ButtonStyle.Danger),
      new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:action:${ownerId}:open_customreaction`).setLabel("Apri +customreaction").setStyle(ButtonStyle.Secondary),
    );
  } else {
    row2.addComponents(
      new ButtonBuilder().setCustomId(`${PANEL_PREFIX}:action:${ownerId}:refresh`).setLabel("Aggiorna").setStyle(ButtonStyle.Secondary),
    );
  }

  return [row1, row2];
}

async function buildPanelPayload(guild, ownerId, client, section = SECTION_HOME) {
  const state = await fetchProfilePanelState(guild, ownerId, client);
  return {
    embeds: [buildSectionEmbed(section, state, `<@${ownerId}>`)],
    components: buildRows(ownerId, section),
  };
}

async function ensureOwner(interaction, ownerId) {
  if (String(interaction?.user?.id || "") === String(ownerId)) return true;
  await interaction.reply({
    content: "<:vegax:1443934876440068179> Questo pannello non è tuo.",
    flags: PRIVATE_FLAG,
  }).catch(() => {});
  return false;
}

async function handleBirthdaySetModal(interaction, ownerId) {
  const dateRaw = interaction.fields.getTextInputValue("date");
  const ageRaw = interaction.fields.getTextInputValue("age");
  const parsedDate = parseBirthdayDate(dateRaw);
  const age = parseAge(ageRaw);
  if (!parsedDate || !age) {
    await interaction.reply({
      content: "<:vegax:1443934876440068179> Dati non validi. Usa `gg/mm` e un'età 1-120.",
      flags: PRIVATE_FLAG,
    }).catch(() => {});
    return true;
  }

  const birthYear = inferBirthYearFromAge(parsedDate.day, parsedDate.month, age);
  await setBirthdayProfile(interaction.guild.id, ownerId, {
    day: parsedDate.day,
    month: parsedDate.month,
    birthYear,
    showAge: true,
  }).catch(() => {});

  const payload = await buildPanelPayload(interaction.guild, ownerId, interaction.client, SECTION_BIRTHDAY);
  if (interaction.message?.edit) await interaction.message.edit(payload).catch(() => {});
  await interaction.reply({
    content: "<:vegacheckmark:1443666279058772028> Birthday aggiornato.",
    flags: PRIVATE_FLAG,
  }).catch(() => {});
  return true;
}

async function handleReactionSetModal(interaction, ownerId) {
  const raw = interaction.fields.getTextInputValue("reactions");
  const tokens = parseReactionTokens(raw, MAX_REACTIONS, interaction.guild);
  if (!tokens.length) {
    await interaction.reply({
      content: "<:vegax:1443934876440068179> Nessuna reaction valida trovata.",
      flags: PRIVATE_FLAG,
    }).catch(() => {});
    return true;
  }

  await MentionReaction.findOneAndUpdate(
    { guildId: interaction.guild.id, userId: ownerId },
    { $set: { reactions: tokens } },
    { upsert: true, new: true, setDefaultsOnInsert: true },
  ).catch(() => {});

  const payload = await buildPanelPayload(interaction.guild, ownerId, interaction.client, SECTION_CUSTOMREACTION);
  if (interaction.message?.edit) await interaction.message.edit(payload).catch(() => {});
  await interaction.reply({
    content: `<:vegacheckmark:1443666279058772028> Reactions salvate: ${tokens.map(toDisplay).join(" ")}`,
    flags: PRIVATE_FLAG,
  }).catch(() => {});
  return true;
}

function match(interaction) {
  const customId = String(interaction?.customId || "");
  return customId.startsWith(`${PANEL_PREFIX}:`);
}

async function execute(interaction, client) {
  const parsed = parsePanelCustomId(interaction.customId);
  if (!parsed) return false;
  const { kind, ownerId, rest } = parsed;

  if (!(await ensureOwner(interaction, ownerId))) return true;

  if (interaction.isStringSelectMenu() && kind === "select") {
    const section = String(interaction.values?.[0] || SECTION_HOME);
    const payload = await buildPanelPayload(interaction.guild, ownerId, client, section);
    await interaction.update(payload).catch(() => {});
    return true;
  }

  if (interaction.isButton() && kind === "action") {
    const action = String(rest?.[0] || "");
    if (action === "refresh") {
      const payload = await buildPanelPayload(interaction.guild, ownerId, client, SECTION_HOME);
      await interaction.update(payload).catch(() => {});
      return true;
    }

    if (action === "birthday_set") {
      const modal = new ModalBuilder()
        .setCustomId(`${PANEL_PREFIX}:modal_birthday:${ownerId}:${SECTION_BIRTHDAY}`)
        .setTitle("Imposta Birthday");
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("date")
            .setLabel("Data (gg/mm)")
            .setPlaceholder("21/02")
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ),
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("age")
            .setLabel("Età (1-120)")
            .setPlaceholder("18")
            .setStyle(TextInputStyle.Short)
            .setRequired(true),
        ),
      );
      await interaction.showModal(modal).catch(() => {});
      return true;
    }

    if (action === "birthday_privacy") {
      const profile = await getBirthdayProfile(interaction.guild.id, ownerId);
      if (!Number.isInteger(profile?.day) || !Number.isInteger(profile?.month)) {
        await interaction.reply({
          content: "<:vegax:1443934876440068179> Prima imposta il birthday.",
          flags: PRIVATE_FLAG,
        }).catch(() => {});
        return true;
      }
      await setBirthdayProfile(interaction.guild.id, ownerId, {
        day: profile.day,
        month: profile.month,
        birthYear: profile.birthYear,
        showAge: !(profile?.showAge !== false),
        registrationMessageId: profile.registrationMessageId,
        registrationChannelId: profile.registrationChannelId,
      }).catch(() => {});
      const payload = await buildPanelPayload(interaction.guild, ownerId, client, SECTION_BIRTHDAY);
      await interaction.update(payload).catch(() => {});
      return true;
    }

    if (action === "birthday_clear") {
      await clearBirthdayProfile(interaction.guild.id, ownerId).catch(() => {});
      const payload = await buildPanelPayload(interaction.guild, ownerId, client, SECTION_BIRTHDAY);
      await interaction.update(payload).catch(() => {});
      return true;
    }

    if (action === "reaction_set") {
      const modal = new ModalBuilder()
        .setCustomId(`${PANEL_PREFIX}:modal_reactions:${ownerId}:${SECTION_CUSTOMREACTION}`)
        .setTitle("Imposta Reactions");
      modal.addComponents(
        new ActionRowBuilder().addComponents(
          new TextInputBuilder()
            .setCustomId("reactions")
            .setLabel("Emoji (max 3)")
            .setPlaceholder("🐼 🔥 <:emoji:123>")
            .setStyle(TextInputStyle.Paragraph)
            .setRequired(true),
        ),
      );
      await interaction.showModal(modal).catch(() => {});
      return true;
    }

    if (action === "reaction_clear") {
      await MentionReaction.deleteOne({ guildId: interaction.guild.id, userId: ownerId }).catch(() => {});
      const payload = await buildPanelPayload(interaction.guild, ownerId, client, SECTION_CUSTOMREACTION);
      await interaction.update(payload).catch(() => {});
      return true;
    }

    if (action === "open_customrole" || action === "open_customvoc" || action === "open_customreaction") {
      const cmd = action === "open_customrole"
        ? "+customrole"
        : action === "open_customvoc"
          ? "+customvoc"
          : "+customreaction";
      await interaction.reply({
        content: `Usa ${cmd} nel canale comandi per aprire il pannello dedicato.`,
        flags: PRIVATE_FLAG,
      }).catch(() => {});
      return true;
    }
  }

  if (interaction.isModalSubmit() && kind === "modal_birthday") {
    return handleBirthdaySetModal(interaction, ownerId);
  }

  if (interaction.isModalSubmit() && kind === "modal_reactions") {
    return handleReactionSetModal(interaction, ownerId);
  }

  return false;
}

module.exports = {
  name: "profile",
  order: 70,
  match,
  execute,
  buildPanelPayload,
};