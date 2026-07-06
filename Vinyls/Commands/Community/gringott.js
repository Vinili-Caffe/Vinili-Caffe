const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { safeEditReply } = require("../../../shared/discord/replyRuntime");
const IDs = require("../../Utils/Config/ids");
const { addGaleoni, formatGaleoni, getGringottBalance, resolveGringottConfig, spendGaleoni } = require("../../Services/Community/gringottService");
const EPHEMERAL_FLAG = 1 << 6;
const STAFF_ROLE_IDS = [IDs.roles?.Staff, IDs.roles?.HighStaff].filter(Boolean).map(String);

function hasGringottStaffAccess(interaction) {
  if (String(interaction.guild?.ownerId || "") === String(interaction.user?.id || "")) return true;
  const permissions = interaction.memberPermissions;
  if (permissions?.has?.(PermissionFlagsBits.Administrator) || permissions?.has?.(PermissionFlagsBits.ManageGuild)) {
    return true;
  }
  const roles = interaction.member?.roles?.cache;
  return STAFF_ROLE_IDS.some((id) => roles?.has?.(id));
}

function ledgerLine(entry) {
  const sign = entry.type === "debit" ? "-" : "+";
  const reason = String(entry.reason || "Movimento Gringott").slice(0, 80);
  const dateMs = entry.createdAt ? new Date(entry.createdAt).getTime() : 0;
  const when = Number.isFinite(dateMs) && dateMs > 0 ? ` · <t:${Math.floor(dateMs / 1000)}:R>` : "";
  return `${sign}${formatGaleoni(entry.amount)} · ${reason}${when}`;
}

function buildBalanceEmbed(user, state) {
  const ledger = Array.isArray(state?.ledger) ? state.ledger.slice(0, 5) : [];
  const embed = new EmbedBuilder()
    .setColor("#d4af37")
    .setTitle("Gringott")
    .setDescription(`${user} possiede **${formatGaleoni(state?.balance || 0)}**.`)
    .addFields(
      { name: "Guadagnati", value: formatGaleoni(state?.earned || 0), inline: true },
      { name: "Spesi", value: formatGaleoni(state?.spent || 0), inline: true },
    );
  if (ledger.length) {
    embed.addFields({ name: "Ultimi movimenti", value: ledger.map(ledgerLine).join("\n") });
  } else {
    embed.addFields({ name: "Ultimi movimenti", value: "Nessun movimento registrato." });
  }
  return embed;
}

async function runBalance(interaction, client) {
  const target = interaction.options.getUser("utente") || interaction.user;
  if (target.id !== interaction.user.id && !hasGringottStaffAccess(interaction)) {
    return safeEditReply(interaction, {
      content: "<:vegax:1443934876440068179> Puoi consultare solo il tuo conto Gringott.",
      flags: EPHEMERAL_FLAG,
    });
  }
  const cfg = resolveGringottConfig(client);
  const state = await getGringottBalance(interaction.guildId, target.id, cfg.eventKey);
  return safeEditReply(interaction, { embeds: [buildBalanceEmbed(target, state || { eventKey: cfg.eventKey })], flags: EPHEMERAL_FLAG });
}

async function runMutate(interaction, client, mode) {
  if (!hasGringottStaffAccess(interaction)) {
    return safeEditReply(interaction, {
      content: "<:vegax:1443934876440068179> Solo lo staff può muovere Galeoni da Gringott.",
      flags: EPHEMERAL_FLAG,
    });
  }
  const target = interaction.options.getUser("utente", true);
  const amount = interaction.options.getInteger("importo", true);
  const reason = interaction.options.getString("causale") || "Movimento staff";
  const cfg = resolveGringottConfig(client);
  const result =
    mode === "add"
      ? await addGaleoni({
          guildId: interaction.guildId,
          userId: target.id,
          amount,
          reason,
          actorId: interaction.user.id,
          source: "discord_staff",
          eventKey: cfg.eventKey,
        })
      : await spendGaleoni({
          guildId: interaction.guildId,
          userId: target.id,
          amount,
          reason,
          actorId: interaction.user.id,
          source: "discord_staff",
          eventKey: cfg.eventKey,
        });
  if (!result.ok) {
    const msg =
      result.code === "insufficient_funds"
        ? `${target} non ha abbastanza Galeoni. Saldo attuale: **${formatGaleoni(result.state?.balance || 0)}**.`
        : "Movimento non riuscito. Controlla importo e utente.";
    return safeEditReply(interaction, { content: `<:vegax:1443934876440068179> ${msg}`, flags: EPHEMERAL_FLAG });
  }
  const verb = mode === "add" ? "accreditati" : "scalati";
  const embed = buildBalanceEmbed(target, result.state).setDescription(
    `<:vegacheckmark:1443666279058772028> ${formatGaleoni(amount)} ${verb} a ${target}.\nSaldo attuale: **${formatGaleoni(result.state.balance)}**.`,
  );
  return safeEditReply(interaction, { embeds: [embed], flags: EPHEMERAL_FLAG });
}

module.exports = {
  name: "gringott",
  hideFromHelp: true,
  data: new SlashCommandBuilder()
    .setName("gringott")
    .setDescription("Gestisci il conto Gringott e i Galeoni d'Oro dell'evento Hogwarts.")
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName("saldo")
        .setDescription("Mostra il saldo Gringott.")
        .addUserOption((opt) => opt.setName("utente").setDescription("Utente da consultare.")),
    )
    .addSubcommand((sub) =>
      sub
        .setName("accredita")
        .setDescription("Aggiunge Galeoni d'Oro a un utente.")
        .addUserOption((opt) => opt.setName("utente").setDescription("Utente da accreditare").setRequired(true))
        .addIntegerOption((opt) => opt.setName("importo").setDescription("Galeoni da aggiungere").setMinValue(1).setRequired(true))
        .addStringOption((opt) => opt.setName("causale").setDescription("Motivo del movimento").setMaxLength(160)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("scala")
        .setDescription("Scala Galeoni d'Oro da un utente.")
        .addUserOption((opt) => opt.setName("utente").setDescription("Utente da addebitare").setRequired(true))
        .addIntegerOption((opt) => opt.setName("importo").setDescription("Galeoni da scalare").setMinValue(1).setRequired(true))
        .addStringOption((opt) => opt.setName("causale").setDescription("Motivo del movimento").setMaxLength(160)),
    ),

  async execute(interaction, client) {
    await interaction.deferReply({ flags: EPHEMERAL_FLAG }).catch(() => {});
    const sub = interaction.options.getSubcommand();
    if (sub === "saldo") return runBalance(interaction, client);
    if (sub === "accredita") return runMutate(interaction, client, "add");
    if (sub === "scala") return runMutate(interaction, client, "spend");
    return safeEditReply(interaction, { content: "Sottocomando Gringott non valido.", flags: EPHEMERAL_FLAG });
  },
};