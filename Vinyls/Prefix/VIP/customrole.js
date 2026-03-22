const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, PermissionsBitField, } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { createCustomRoleGrantRequest, } = require("../../Events/interaction/customRoleHandlers");
const { CustomRole } = require("../../Schemas/Community/communitySchemas");
const IDs = require("../../Utils/Config/ids");
const { resolveCustomRoleState, buildExpiryText, } = require("../../Utils/Community/customRoleState");

const ANCHOR_ROLE_ID = "1469452890761596981";
const REQUEST_TIMEOUT_MS = 60_000;
const VALID_SUBCOMMANDS = new Set(["create", "modify", "add", "remove"]);

function buildUsageEmbed() {
  return new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Custom Role")
    .setDescription(
      [
        "Usa uno di questi subcommands:",
        "`+customrole create`",
        "`+customrole modify`",
        "`+customrole add @utente`",
        "`+customrole remove`",
      ].join("\n"),
    );
}

function trimRoleName(name) {
  const clean = String(name || "").replace(/\s+/g, " ").trim();
  const base = clean || "Custom Role";
  const prefixed = base.startsWith("༄") ? base : `༄ ${base}`;
  return prefixed.slice(0, 32).trim();
}

async function resolveActiveCustomRole(message) {
  const state = await resolveCustomRoleState({ guild: message.guild, userId: message.author.id, client: message.client, cleanupExpired: true, });

  if (state.status === "none") {
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setDescription(
            "<:vegax:1443934876440068179> Non hai un ruolo personalizzato. Usa prima `+customrole create`.",
          ),
      ],
      allowedMentions: { repliedUser: false },
    });
    return null;
  }

  if (state.status === "expired") {
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setDescription(
            [
              "<:vegax:1443934876440068179> Il tuo custom role temporaneo è scaduto.",
              `Scadenza: ${buildExpiryText(state.doc)}`,
              "Usa `+customrole create` per crearne uno nuovo.",
            ].join("\n"),
          ),
      ],
      allowedMentions: { repliedUser: false },
    });
    return null;
  }

  if (state.status === "missing_role") {
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setDescription(
            "<:vegax:1443934876440068179> Il tuo ruolo personalizzato non esiste più. Ricrealo con `+customrole create`.",
          ),
      ],
      allowedMentions: { repliedUser: false },
    });
    return null;
  }

  return state;
}

function buildPanelRows(ownerId, roleId) {
  const row1 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`customrole_name:${ownerId}:${roleId}`)
      .setLabel("Modifica Nome")
      .setEmoji(`<:VC_Modifica:1478859646587633717>`)
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`customrole_color:${ownerId}:${roleId}`)
      .setLabel("Modifica Colore")
      .setEmoji(`<:VC_Color:1482532543273238569>`)
      .setStyle(ButtonStyle.Primary),
    new ButtonBuilder()
      .setCustomId(`customrole_emoji:${ownerId}:${roleId}`)
      .setLabel("Modifica Icona")
      .setEmoji(`<:VC_emoji:1485419161168511036>`)
      .setStyle(ButtonStyle.Primary),
  );
  const row2 = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`customrole_members:${ownerId}:${roleId}`)
      .setLabel("Aggiungi Utenti")
      .setEmoji(`<:VC_addperson:1485419347068588073>`)
      .setStyle(ButtonStyle.Success),
    new ButtonBuilder()
      .setCustomId(`customrole_members_remove:${ownerId}:${roleId}`)
      .setLabel("Rimuovi Utenti")
      .setEmoji(`<:VC_addperson:1485419347068588073>`)
      .setStyle(ButtonStyle.Danger),
    new ButtonBuilder()
      .setCustomId(`customrole_delete:${ownerId}:${roleId}`)
      .setLabel("Elimina Ruolo")
      .setEmoji(`<:VC_delete:1485421886589501511>`)
      .setStyle(ButtonStyle.Danger),
  );
  return [row1, row2];
}

function buildCreatePanelEmbed(role, guild, doc) {
  const lines = ["<a:VC_Flowers:1468687836055212174> Il tuo ruolo è stato creato/aggiornato. Personalizzalo con i bottoni sotto.", "Altri comandi li trovi con `+help`.", "", "**Ruolo:**", `${role}`,
  ];

  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("<:vegacheckmark:1443666279058772028> Custom Role")
    .setDescription(lines.join("\n"));

  if (doc?.expiresAt) {
    embed.addFields({
      name: "Scadenza",
      value: `<t:${Math.floor(new Date(doc.expiresAt).getTime() / 1000)}:F>`,
      inline: true,
    });
  } else {
    embed.addFields({
      name: "Scadenza",
      value: "Permanente",
      inline: true,
    });
  }

  const guildIcon = guild?.iconURL?.({ extension: "png", size: 256, forceStatic: false }) || null;
  if (guildIcon) embed.setThumbnail(guildIcon);
  return embed;
}

function buildModifyPanelEmbed(role, guild, doc) {
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Modifica Ruolo")
    .setDescription(["<a:VC_Flowers:1468687836055212174> Modifica il tuo ruolo personalizzato.", "Altri comandi li trovi con `+help`.", "Puoi configurarlo con i pulsanti qui sotto.", "", "**Ruolo:**", `${role}`,
      "",
      `**Scadenza:** ${buildExpiryText(doc)}`,
    ].join("\n"));

  const guildIcon = guild?.iconURL?.({ extension: "png", size: 256, forceStatic: false }) || null;
  if (guildIcon) embed.setThumbnail(guildIcon);
  return embed;
}

async function resolveOrCreateRole(message) {
  const guild = message.guild;
  const me = guild.members.me || guild.members.cache.get(message.client.user.id);
  if (!me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) {
    return { error: "Mi serve il permesso `Gestisci Ruoli`." };
  }

  const state = await resolveCustomRoleState({ guild, userId: message.author.id, client: message.client, cleanupExpired: true, });

  let doc = state.status === "active" ? state.doc : null;
  let role = state.status === "active" ? state.role : null;

  if (state.status === "expired") {
    await CustomRole.deleteOne({
      guildId: guild.id,
      userId: message.author.id,
    }).catch(() => { });
    doc = null;
    role = null;
  }

  if (!role) {
    const roleName = trimRoleName(message.member?.displayName || message.author.username,);
    role = await guild.roles
      .create({
        name: roleName,
        colors: { primaryColor: "#f4b6d7" },
        reason: `Custom role for ${message.author.tag}`,
      })
      .catch(() => null);
    if (!role) return { error: "Non sono riuscito a creare il ruolo." };

    if (role.position >= me.roles.highest.position) {
      await role.delete().catch(() => { });
      return {
        error: "Non posso gestire quel ruolo: sposta il mio ruolo più in alto.",
      };
    }

    const anchor = guild.roles.cache.get(ANCHOR_ROLE_ID) || (await guild.roles.fetch(ANCHOR_ROLE_ID).catch(() => null));
    if (anchor) {
      const docs = await CustomRole.find({ guildId: String(guild.id) }, { roleId: 1, _id: 0 }).lean().catch(() => []);
      const existingRoleIds = new Set((Array.isArray(docs) ? docs : []).map((d) => String(d?.roleId || "")).filter(Boolean));
      existingRoleIds.delete(String(role.id));

      const existingPositions = Array.from(existingRoleIds)
        .map((id) => guild.roles.cache.get(id) || null)
        .filter((r) => r && Number.isFinite(Number(r.position)) && Number(r.position) < Number(anchor.position))
        .map((r) => Number(r.position));
      const bottomMost = existingPositions.length ? Math.min(...existingPositions) : null;

      const defaultTarget = Math.max(1, anchor.position - 1);
      const targetPosition = bottomMost != null ? Math.max(1, bottomMost - 1) : defaultTarget;
      if (targetPosition < me.roles.highest.position) {
        await role.setPosition(targetPosition).catch(() => { });
      }
    }
  }

  await message.member.roles.add(role.id).catch(() => { });

  const update = { guildId: guild.id, userId: message.author.id, roleId: role.id, expiresAt: null, };

  const updatedDoc = await CustomRole.findOneAndUpdate({ guildId: guild.id, userId: message.author.id }, { $set: update }, { upsert: true, new: true, setDefaultsOnInsert: true },).catch(() => null);

  return { role, doc: updatedDoc || doc || null };
}

async function handleCreate(message, args) {
  const { role, doc, error } = await resolveOrCreateRole(message);
  if (error) {
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setDescription(`<:vegax:1443934876440068179> ${error}`),
      ],
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  await safeMessageReply(message, {
    embeds: [buildCreatePanelEmbed(role, message.guild, doc)],
    components: buildPanelRows(message.author.id, role.id),
    allowedMentions: { repliedUser: false },
  });
}

async function handleModify(message) {
  const state = await resolveActiveCustomRole(message);
  if (!state) return;

  await safeMessageReply(message, {
    embeds: [buildModifyPanelEmbed(state.role, message.guild, state.doc)],
    components: buildPanelRows(message.author.id, state.role.id),
    allowedMentions: { repliedUser: false },
  });
}

async function handleAdd(message) {
  const target = message.mentions?.members?.first() || null;
  if (!target || target.id === message.author.id) {
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setTitle("Errore di sintassi")
          .setDescription(
            [
              "Sintassi corretta:",
              "`+customrole add @utente`",
              "Devi taggare un utente valido diverso da te.",
            ].join("\n"),
          ),
      ],
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  const state = await resolveActiveCustomRole(message);
  if (!state) return;

  const started = await createCustomRoleGrantRequest({ client: message.client, guildId: message.guild.id, channelId: message.channel.id, requesterId: message.author.id, targetId: target.id, roleId: state.role.id, timeoutMs: REQUEST_TIMEOUT_MS, });

  if (!started?.ok) {
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setDescription(
            "<:vegax:1443934876440068179> Non sono riuscito ad avviare la richiesta (controlla DM aperti e permessi).",
          ),
      ],
      allowedMentions: { repliedUser: false },
    });
  }
}

async function handleRemove(message) {
  const state = await resolveActiveCustomRole(message);
  if (!state) return;

  const role = state.role;
  const me = message.guild.members.me || message.guild.members.cache.get(message.client.user.id);
  if (
    !me?.permissions?.has(PermissionsBitField.Flags.ManageRoles) ||
    role.position >= me.roles.highest.position
  ) {
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor("Red")
          .setDescription(
            "<:vegax:1443934876440068179> Non posso gestire questo ruolo (permessi/gerarchia).",
          ),
      ],
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  await message.guild.members.fetch().catch(() => { });
  const membersWithRole = Array.from(role.members.values()).filter((m) => !m.user?.bot && m.id !== message.author.id).slice(0, 25);

  if (!membersWithRole.length) {
    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor("#6f4e37")
          .setTitle("Seleziona un utente")
          .setDescription(
            "Nessun utente valido (diverso da te) ha attualmente il tuo ruolo personalizzato.",
          ),
      ],
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  const row = new ActionRowBuilder().addComponents(new StringSelectMenuBuilder().setCustomId(`customrole_remove_select:${message.author.id}:${role.id}`)
    .setPlaceholder("Seleziona un utente")
    .setMinValues(1)
    .setMaxValues(1)
    .addOptions(
      membersWithRole.slice(0, 25).map((member) => ({
        label: String(member.user?.username || member.id).slice(0, 100),
        value: String(member.id).slice(0, 100),
        description: String(member.displayName || member.user?.username || "").slice(0, 100),
      })),
    ),
  );

  await safeMessageReply(message, {
    embeds: [
      new EmbedBuilder()
        .setColor("#6f4e37")
        .setTitle("Seleziona un utente")
        .setDescription(
          [
            "Usa il menù a tendina qui sotto per rimuovere un utente dal tuo ruolo personalizzato.",
            `Scadenza ruolo: ${buildExpiryText(state.doc)}`,
          ].join("\n"),
        ),
    ],
    components: [row],
    allowedMentions: { repliedUser: false },
  });
}

module.exports = {
  name: "customrole",
  subcommands: ["create", "modify", "add", "remove"],
  allowEmptyArgs: true,

  async execute(message, args = []) {
    if (!message.guild || !message.member) return;
    const subcommand = String(args[0] || "").trim().toLowerCase();

    if (!VALID_SUBCOMMANDS.has(subcommand)) {
      await safeMessageReply(message, {
        embeds: [buildUsageEmbed()],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const rest = args.slice(1);
    if (subcommand === "create") return handleCreate(message, rest);
    if (subcommand === "modify") return handleModify(message);
    if (subcommand === "add") return handleAdd(message);
    if (subcommand === "remove") return handleRemove(message);
  },
};