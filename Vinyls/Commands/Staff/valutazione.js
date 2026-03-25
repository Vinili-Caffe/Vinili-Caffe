const { safeEditReply } = require("../../../shared/discord/replyRuntime");
const { SlashCommandBuilder, EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle } = require("discord.js");
const { ActivityUserProfile } = require("../../Schemas/Community/communitySchemas");
const { getOrCreateStaffDoc, ensureStaff } = require("../../Utils/Staff/staffDocUtils");
const IDs = require("../../Utils/Config/ids");
const { getGuildChannelCached, getGuildMemberCached } = require("../../Utils/Interaction/interactionEntityCache");
const { addStaffWarnFromNegatives, applyFullDepex, getHighestStaffRoleId } = require("../../Services/Staff/staffWarnService");
const EPHEMERAL_FLAG = 1 << 6;

function errorEmbed(description) {
  return new EmbedBuilder()
    .setDescription(description)
    .setColor("Red");
}

function successEmbed(description) {
  return new EmbedBuilder()
    .setDescription(description)
    .setColor("#6f4e37");
}

async function ensureStaffProfileDoc(profileDoc, guildId, userId) {
  if (profileDoc) {
    ensureStaff(profileDoc);
    return profileDoc;
  }
  return getOrCreateStaffDoc(guildId, userId);
}

async function getStaffDoc(guildId, userId) {
  const g = String(guildId ?? "").trim();
  const u = String(userId ?? "").trim();
  if (!g || !u) return null;
  return ActivityUserProfile.findOne({ guildId: g, userId: u });
}

function makeLogEmbed(
  interaction,
  user,
  title,
  reason,
  idValue,
  color = "#6f4e37",
) {
  return new EmbedBuilder()
    .setAuthor({
      name: `Valutazione eseguita da ${interaction.user.username}`,
      iconURL: (interaction.member || interaction.user).displayAvatarURL(),
    })
    .setTitle(title)
    .setThumbnail(user.displayAvatarURL())
    .setDescription(
      [
        `<:staff:1443651912179388548> <a:VC_Arrow:1482706699365257397> ${user}`,
        `<:VC_reason:1478517122929004544> __${reason}__`,
        `<:VC_id:1478517313618575419> **ID Valutazione** __\`${idValue}\`__`,
      ].join("\n"),
    )
    .setColor(color);
}

function makeRemovalEmbed(
  interaction,
  user,
  title,
  description,
  reason,
  updatedLabel,
  updatedValue,
) {
  return new EmbedBuilder()
    .setAuthor({
      name: `<:cancel:1461730653677551691> Valutazione rimossa da ${interaction.user.username}`,
      iconURL: (interaction.member || interaction.user).displayAvatarURL(),
    })
    .setTitle(title)
    .setDescription(description.replace("{user}", user.toString()))
    .addFields(
      { name: "<:VC_reason:1478517122929004544> Motivazione: ", value: `${reason}`, inline: false },
      { name: updatedLabel, value: updatedValue, inline: false },
    )
    .setColor("#6f4e37");
}

async function sendChannelEmbed(channel, payload) {
  if (!channel) return;
  await channel.send(payload).catch(() => null);
}

async function handlePositiveAdd(
  interaction,
  profileDoc,
  staffUser,
  reason,
  channel,
) {
  const s = ensureStaff(profileDoc);
  s.valutazioniCount += 1;
  s.positiveCount += 1;
  if (!Array.isArray(s.positiveReasons)) s.positiveReasons = [];
  s.positiveReasons.push(reason);
  profileDoc.markModified("staff");
  await profileDoc.save();

  const embed = makeLogEmbed(interaction, staffUser, `<:thumbsup:1471292172145004768> **__VALUTAZIONE POSITIVA__** #${s.positiveCount}\``, reason, s.valutazioniCount,);

  await sendChannelEmbed(channel, { content: `${staffUser}`, embeds: [embed] });
  return safeEditReply(interaction, {
    embeds: [
      successEmbed(
        "<:vegacheckmark:1443666279058772028> Valutazione positiva registrata con successo!",
      ),
    ],
  });
}

async function handlePositiveRemove(
  interaction,
  profileDoc,
  staffUser,
  reason,
  channel,
) {
  const s = ensureStaff(profileDoc);
  const removeId = interaction.options.getInteger("id");
  if (
    !Number.isInteger(removeId) ||
    removeId < 1 ||
    !s.positiveReasons?.[removeId - 1]
  ) {
    return safeEditReply(interaction, {
      embeds: [errorEmbed("<:VC_Attention:1482534443632558151> ID non valido")],
      flags: EPHEMERAL_FLAG,
    });
  }

  s.positiveReasons.splice(removeId - 1, 1);
  s.positiveCount = Math.max(0, s.positiveCount - 1);
  s.valutazioniCount = Math.max(0, s.valutazioniCount - 1);
  profileDoc.markModified("staff");
  await profileDoc.save();

  const embed = makeRemovalEmbed(interaction, staffUser, "<:cancel:1461730653677551691> **__VALUTAZIONE POSITIVA RIMOSSA__**",
    "",
    `<:VC_reason:1478517122929004544> A __${staffUser.username}__ è stata **rimossa** una _Valutazione Positiva!_`, reason,
    "",
    "<:VC_update:1478721333096349817> __Valutazione Positive Totali__",
    `<:VC_OnlineStatus:1482527088912240650> Ora sei a \`${s.positiveCount}\` valutazioni positive!`);

  await sendChannelEmbed(channel, { embeds: [embed] });
  return safeEditReply(interaction, {
    embeds: [
      successEmbed(
        "<:vegacheckmark:1443666279058772028> Valutazione positiva rimossa con successo!",
      ),
    ],
  });
}

async function handleNegativeAdd(
  interaction,
  profileDoc,
  staffUser,
  reason,
  channel,
) {
  const s = ensureStaff(profileDoc);
  s.valutazioniCount += 1;
  s.negativeCount += 1;
  if (!Array.isArray(s.negativeReasons)) s.negativeReasons = [];
  s.negativeReasons.push(reason);
  profileDoc.markModified("staff");
  await profileDoc.save();

  const embed = makeLogEmbed(interaction, staffUser, `<:thumbsdown:1471292163957457013> **__VALUTAZIONE NEGATIVA__** #${s.negativeCount}\``, reason, s.valutazioniCount,);

  await sendChannelEmbed(channel, { content: `${staffUser}`, embeds: [embed] });

  const guild = interaction.guild;
  const warnResult = await addStaffWarnFromNegatives(guild.id, staffUser.id, s.negativeCount, reason);
  const warnChannel = guild.channels.cache.get(IDs.channels?.warnStaff) || (await getGuildChannelCached(guild, IDs.channels?.warnStaff));
  if (warnResult.added && warnChannel?.isTextBased?.()) {
    const warnEmbed = new EmbedBuilder()
      .setAuthor({ name: `Warn automatico (3 valutazioni negative) da ${interaction.user.username}`, iconURL: (interaction.member || interaction.user).displayAvatarURL() })
      .setTitle(`<a:VC_Alert:1482706673176150077> • **__WARN STAFF__** \`#${warnResult.warnCount}\``)
      .setThumbnail(staffUser.displayAvatarURL())
      .setDescription(`${staffUser}\n<:VC_reason:1478517122929004544> __${String(reason).slice(0, 400)}__`)
      .setColor("#E74C3C");
    await warnChannel.send({ content: `${staffUser}`, embeds: [warnEmbed] }).catch(() => null);
    if (warnResult.shouldAskDepex) {
      const promptEmbed = new EmbedBuilder()
        .setColor("#E74C3C")
        .setTitle("<a:VC_Alert:1482706673176150077> 2 warn staff — Decidi azione")
        .setDescription(
          `${staffUser} ha raggiunto **2 warn staff** (da valutazioni negative).\n\n` +
          "**Depex ora** = un livello in basso (Mod → depex completo; Coord → Mod; …).\n" +
          "**No** = nessuna azione ora; al **3° warn** scatterà il **depex completo** (ruolo + staff).",
        )
        .setThumbnail(staffUser.displayAvatarURL());
      const row = new ActionRowBuilder().addComponents(
        new ButtonBuilder().setCustomId(`staff_warn_depex:${staffUser.id}:yes`).setLabel("Depex ora").setStyle(ButtonStyle.Danger),
        new ButtonBuilder().setCustomId(`staff_warn_depex:${staffUser.id}:no`).setLabel("No (al 3° warn depex completo)").setStyle(ButtonStyle.Secondary),
      );
      await warnChannel.send({ content: `${staffUser}`, embeds: [promptEmbed], components: [row] }).catch(() => null);
    }
  }
  if (warnResult.added && warnResult.shouldFullDepex) {
    const member = await getGuildMemberCached(guild, staffUser.id);
    if (member) {
      const currentRoleId = getHighestStaffRoleId(member);
      const fullResult = await applyFullDepex(guild, member, currentRoleId);
      if (fullResult.ok) {
        const pexDepexChannel = await getGuildChannelCached(guild, IDs.channels?.pexDepex);
        if (pexDepexChannel?.isTextBased?.()) {
          await pexDepexChannel.send({
            content: `**<:cancel:1461730653677551691> DEPEX** ${staffUser}\n` +
              `<:staff:1443651912179388548> \`${currentRoleId}\` <a:VC_Arrow:1482706699365257397> Nessuno\n` +
              `<:VC_reason:1478517122929004544> __Depex automatico: 3 warn staff (valutazioni negative).__`,
          }).catch(() => null);
        }
      }
    }
  }

  return safeEditReply(interaction, {
    embeds: [
      successEmbed(
        "<:vegacheckmark:1443666279058772028> Valutazione negativa registrata con successo!",
      ),
    ],
  });
}

async function handleNegativeRemove(
  interaction,
  profileDoc,
  staffUser,
  reason,
  channel,
) {
  const s = ensureStaff(profileDoc);
  const removeId = interaction.options.getInteger("id");
  if (
    !Number.isInteger(removeId) ||
    removeId < 1 ||
    !s.negativeReasons?.[removeId - 1]
  ) {
    return safeEditReply(interaction, {
      embeds: [errorEmbed("<:VC_Attention:1482534443632558151> ID non valido")],
      flags: EPHEMERAL_FLAG,
    });
  }

  s.negativeReasons.splice(removeId - 1, 1);
  s.negativeCount = Math.max(0, s.negativeCount - 1);
  s.valutazioniCount = Math.max(0, s.valutazioniCount - 1);
  profileDoc.markModified("staff");
  await profileDoc.save();

  const embed = makeRemovalEmbed(interaction, staffUser, "<:cancel:1461730653677551691> **__VALUTAZIONE NEGATIVA RIMOSSA__**",
    "",
    `<:VC_reason:1478517122929004544> A __${staffUser.username}__ è stata **rimossa** una _Valutazione Negativa!_`, reason,
    "",
    "<:VC_update:1478721333096349817> __Valutazione Negative Totali__",
    `<:VC_OnlineStatus:1482527088912240650> Ora sei a \`${s.negativeCount}\` valutazioni negative!`);

  await sendChannelEmbed(channel, { embeds: [embed] });
  return safeEditReply(interaction, {
    embeds: [
      successEmbed(
        "<:vegacheckmark:1443666279058772028> Valutazione negativa rimossa con successo!",
      ),
    ],
  });
}

async function handleMedia(interaction, staffUser, doc) {
  if (!doc?.staff) {
    return safeEditReply(interaction, {
      embeds: [
        errorEmbed("<:VC_Attention:1482534443632558151> Nessuna valutazione trovata."),
      ],
      flags: EPHEMERAL_FLAG,
    });
  }

  const st = doc.staff;
  const embed = new EmbedBuilder()
    .setTitle(`<:VC_InactiveStatus:1482526984234860574> Valutazioni di ${staffUser.username}`)
    .setColor("#6f4e37")
    .addFields(
      {
        name: "<:thumbsup:1471292172145004768> Positive",
        value:
          (st.positiveReasons || [])
            .map((entry, index) => `\`${index + 1}\` " ${entry}`)
            .join("\n") || "Nessuna",
        inline: true,
      },
      {
        name: "<:thumbsdown:1471292163957457013> Negative",
        value:
          (st.negativeReasons || [])
            .map((entry, index) => `\`${index + 1}\` " ${entry}`)
            .join("\n") || "Nessuna",
        inline: true,
      },
    );

  return safeEditReply(interaction, { embeds: [embed] });
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("valutazione")
    .setDescription("Gestisci le valutazioni degli staffer")
    .addSubcommandGroup((group) =>
      group
        .setName("positiva")
        .setDescription("Gestisci valutazioni positive")
        .addSubcommand((sub) =>
          sub
            .setName("add")
            .setDescription("Aggiungi una valutazione positiva a uno staffer")
            .addUserOption((opt) =>
              opt
                .setName("staffer")
                .setDescription("Staffer")
                .setRequired(true),
            )
            .addStringOption((opt) =>
              opt
                .setName("motivo")
                .setDescription("Motivazione")
                .setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("remove")
            .setDescription("Rimuovi una valutazione positiva")
            .addUserOption((opt) =>
              opt
                .setName("staffer")
                .setDescription("Staffer")
                .setRequired(true),
            )
            .addIntegerOption((opt) =>
              opt
                .setName("id")
                .setDescription("ID valutazione")
                .setRequired(true),
            )
            .addStringOption((opt) =>
              opt
                .setName("motivo")
                .setDescription("Motivazione rimozione")
                .setRequired(true),
            ),
        ),
    )
    .addSubcommandGroup((group) =>
      group
        .setName("negativa")
        .setDescription("Gestisci valutazioni negative")
        .addSubcommand((sub) =>
          sub
            .setName("add")
            .setDescription("Aggiungi una valutazione negativa a uno staffer")
            .addUserOption((opt) =>
              opt
                .setName("staffer")
                .setDescription("Staffer")
                .setRequired(true),
            )
            .addStringOption((opt) =>
              opt
                .setName("motivo")
                .setDescription("Motivazione")
                .setRequired(true),
            ),
        )
        .addSubcommand((sub) =>
          sub
            .setName("remove")
            .setDescription("Rimuovi una valutazione negativa")
            .addUserOption((opt) =>
              opt
                .setName("staffer")
                .setDescription("Staffer")
                .setRequired(true),
            )
            .addIntegerOption((opt) =>
              opt
                .setName("id")
                .setDescription("ID valutazione")
                .setRequired(true),
            )
            .addStringOption((opt) =>
              opt
                .setName("motivo")
                .setDescription("Motivazione rimozione")
                .setRequired(true),
            ),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("media")
        .setDescription("Vedi le valutazioni di uno staffer")
        .addUserOption((opt) =>
          opt.setName("staffer")
            .setDescription("Staffer")
            .setRequired(true),
        ),
    ),

  async execute(interaction) {
    const group = interaction.options.getSubcommandGroup(false);
    const sub = interaction.options.getSubcommand();
    const staffUser = interaction.options.getUser("staffer");
    const reason = interaction.options.getString("motivo");
    const guildId = interaction.guild.id;
    const channel = interaction.guild.channels.cache.get(IDs.channels?.valutazioniStaff,);

    await interaction.deferReply({ flags: EPHEMERAL_FLAG }).catch(() => { });

    try {
      const existingProfileDoc = sub === "media" ? await getStaffDoc(guildId, staffUser.id) : null;
      if (sub === "media") {
        return handleMedia(interaction, staffUser, existingProfileDoc);
      }

      const profileDoc = await ensureStaffProfileDoc(existingProfileDoc || (await getStaffDoc(guildId, staffUser.id)), guildId, staffUser.id);

      if (group === "positiva" && sub === "add") {
        return handlePositiveAdd(
          interaction,
          profileDoc,
          staffUser,
          reason,
          channel,
        );
      }
      if (group === "positiva" && sub === "remove") {
        return handlePositiveRemove(
          interaction,
          profileDoc,
          staffUser,
          reason,
          channel,
        );
      }
      if (group === "negativa" && sub === "add") {
        return handleNegativeAdd(
          interaction,
          profileDoc,
          staffUser,
          reason,
          channel,
        );
      }
      if (group === "negativa" && sub === "remove") {
        return handleNegativeRemove(
          interaction,
          profileDoc,
          staffUser,
          reason,
          channel,
        );
      }
    } catch (err) {
      global.logger.error(err);
      return safeEditReply(interaction, {
        embeds: [
          errorEmbed(
            "<:vegax:1443934876440068179> Errore durante l'esecuzione del comando.",
          ),
        ],
        flags: EPHEMERAL_FLAG,
      });
    }
  },
};