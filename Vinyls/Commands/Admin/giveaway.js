const { SlashCommandBuilder, ChannelType } = require("discord.js");
const { safeEditReply } = require("../../../shared/discord/replyRuntime");
const {
  parseDuration,
  buildGiveawayEmbed,
  buildEnterButton,
  createGiveaway,
  setGiveawayMessageId,
  endGiveawayByMessageId,
  editGiveawayByMessageId,
  deleteGiveawayByMessageId,
  rerollGiveawayByMessageId,
  scheduleGiveawayEnd,
} = require("../../Services/Giveaway/giveawayService");
const { isConfigured: isMorgamesVerifyConfigured } = require("../../Services/Integrations/morgamesDiscordGiveawayVerify");
const EPHEMERAL_FLAG = 1 << 6;

function parseMessageIdFromOption(value) {
  if (!value || typeof value !== "string") return null;
  const trimmed = value.trim();
  if (/^\d{17,21}$/.test(trimmed)) return trimmed;
  const match = trimmed.match(/discord\.com\/channels\/\d{17,21}\/\d{17,21}\/(\d{17,21})/);
  return match ? match[1] : null;
}

function requireMessageId(interaction, raw) {
  const messageId = parseMessageIdFromOption(raw);
  if (!messageId) {
    return {
      ok: false,
      reply: safeEditReply(interaction, {
        content: "<a:VC_Cross:1482532424570376253> Inserisci un ID messaggio valido o il link al messaggio del giveaway.",
        flags: EPHEMERAL_FLAG,
      }),
    };
  }
  return { ok: true, messageId };
}

module.exports = {
  data: new SlashCommandBuilder()
    .setName("giveaway")
    .setDescription("Crea o gestisci un giveaway.")
    .addSubcommand((sub) =>
      sub
        .setName("create")
        .setDescription("Crea un nuovo giveaway")
        .addStringOption((o) => o.setName("premio").setDescription("Premio in palio").setRequired(true))
        .addStringOption((o) => o.setName("durata").setDescription("Durata: es. 1h, 24h, 7d").setRequired(true))
        .addIntegerOption((o) =>
          o.setName("vincitori").setDescription("Numero di vincitori (default 1)").setRequired(false).setMinValue(1).setMaxValue(20),
        )
        .addChannelOption((o) =>
          o
            .setName("canale")
            .setDescription("Canale dove inviare il giveaway")
            .setRequired(false)
            .addChannelTypes(ChannelType.GuildText),
        )
        .addUserOption((o) => o.setName("host").setDescription("Utente che ospita il giveaway").setRequired(false))
        .addBooleanOption((o) =>
          o
            .setName("requisito_morgames")
            .setDescription("Richiedi account Morgames collegato a Discord (default: no)")
            .setRequired(false),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("end")
        .setDescription("Termina forzatamente un giveaway attivo")
        .addStringOption((o) =>
          o.setName("messaggio").setDescription("ID del messaggio del giveaway o link al messaggio").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("edit")
        .setDescription("Modifica un giveaway attivo")
        .addStringOption((o) =>
          o.setName("messaggio").setDescription("ID del messaggio del giveaway o link al messaggio").setRequired(true),
        )
        .addStringOption((o) => o.setName("premio").setDescription("Nuovo premio").setRequired(false))
        .addStringOption((o) =>
          o.setName("durata").setDescription("Nuova durata rimanente: es. 1h, 24h, 7d").setRequired(false),
        )
        .addIntegerOption((o) =>
          o.setName("vincitori").setDescription("Nuovo numero di vincitori").setRequired(false).setMinValue(1).setMaxValue(20),
        )
        .addUserOption((o) => o.setName("host").setDescription("Nuovo host del giveaway").setRequired(false)),
    )
    .addSubcommand((sub) =>
      sub
        .setName("delete")
        .setDescription("Cancella un giveaway attivo (senza estrarre vincitori)")
        .addStringOption((o) =>
          o.setName("messaggio").setDescription("ID del messaggio del giveaway o link al messaggio").setRequired(true),
        ),
    )
    .addSubcommand((sub) =>
      sub
        .setName("reroll")
        .setDescription("Estrai un nuovo vincitore per un giveaway terminato")
        .addStringOption((o) =>
          o.setName("messaggio").setDescription("ID del messaggio del giveaway o link al messaggio").setRequired(true),
        ),
    ),

  async execute(interaction) {
    const subcommand = interaction.options.getSubcommand();
    await interaction.deferReply({ flags: EPHEMERAL_FLAG }).catch(() => {});

    if (subcommand === "create") {
      const prize = interaction.options.getString("premio")?.trim() || "";
      const durationStr = interaction.options.getString("durata")?.trim() || "";
      const winnerCount = interaction.options.getInteger("vincitori") ?? 1;
      const channelOption = interaction.options.getChannel("canale");
      const hostUser = interaction.options.getUser("host") || interaction.user;
      const hostId = hostUser?.id;
      const hostTag = hostUser?.tag || "";
      const requireMorgames = interaction.options.getBoolean("requisito_morgames") === true;

      if (!prize) {
        return safeEditReply(interaction, {
          content: "<a:VC_Cross:1482532424570376253> Inserisci un premio valido.",
          flags: EPHEMERAL_FLAG,
        });
      }

      const durationMs = parseDuration(durationStr);
      if (!durationMs || durationMs < 60 * 1000) {
        return safeEditReply(interaction, {
          content: "<a:VC_Cross:1482532424570376253> Durata non valida. Usa ad es. `1h`, `24h`, `7d`.",
          flags: EPHEMERAL_FLAG,
        });
      }

      if (requireMorgames && !isMorgamesVerifyConfigured()) {
        return safeEditReply(interaction, {
          content:
            "<a:VC_Cross:1482532424570376253> Requisito Morgames attivo ma manca `MORGAMES_DISCORD_GIVEAWAY_API_SECRET` sul bot. Configuralo e riprova.",
          flags: EPHEMERAL_FLAG,
        });
      }

      const channel = channelOption || interaction.channel;
      if (!channel?.isTextBased?.()) {
        return safeEditReply(interaction, {
          content: "<a:VC_Cross:1482532424570376253> Canale non valido.",
          flags: EPHEMERAL_FLAG,
        });
      }

      const guildId = interaction.guild?.id;

      try {
        const giveaway = await createGiveaway({
          guildId,
          channelId: channel.id,
          hostId,
          hostTag,
          prize,
          durationMs,
          winnerCount,
          requireMorgames,
        });

        const embed = buildGiveawayEmbed(giveaway);
        const row = buildEnterButton(giveaway._id.toString());
        const msg = await channel.send({ embeds: [embed], components: [row] }).catch(() => null);
        if (!msg) {
          return safeEditReply(interaction, {
            content: "<a:VC_Cross:1482532424570376253> Impossibile inviare il messaggio nel canale.",
            flags: EPHEMERAL_FLAG,
          });
        }

        await setGiveawayMessageId(giveaway._id, msg.id);
        scheduleGiveawayEnd(interaction.client, giveaway._id.toString(), giveaway.endAt);

        return safeEditReply(interaction, {
          content:
            `<a:VC_Events:1482706144953897223> Giveaway creato in ${channel}. Termina tra ${durationStr}.` +
            (requireMorgames ? "<:VC_Morgames:1562470559319719957> Requisito obbligatorio: account Morgames collegato a Discord." : ""),
          flags: EPHEMERAL_FLAG,
        });
      } catch (err) {
        global.logger?.error?.("[GIVEAWAY] create error:", err);
        return safeEditReply(interaction, {
          content: "<a:VC_Cross:1482532424570376253> Errore durante la creazione del giveaway.",
          flags: EPHEMERAL_FLAG,
        });
      }
    }

    const raw = interaction.options.getString("messaggio");
    const parsed = requireMessageId(interaction, raw);
    if (!parsed.ok) return parsed.reply;
    const { messageId } = parsed;

    if (subcommand === "end") {
      const result = await endGiveawayByMessageId(messageId, interaction.client);
      if (result.ok) {
        const winners = Array.isArray(result.winnerIds) ? result.winnerIds : [];
        const winnersText =
          winners.length > 0 ? winners.map((id) => `<@${id}>`).join(", ") : "nessun partecipante";
        return safeEditReply(interaction, {
          content: `<a:VC_Events:1482706144953897223> Giveaway terminato. Vincitori: ${winnersText}.`,
          flags: EPHEMERAL_FLAG,
        });
      }
      return safeEditReply(interaction, {
        content: `<a:VC_Cross:1482532424570376253> ${result.error || "Errore durante la chiusura del giveaway."}`,
        flags: EPHEMERAL_FLAG,
      });
    }

    if (subcommand === "edit") {
      const prize = interaction.options.getString("premio");
      const durationStr = interaction.options.getString("durata");
      const winnerCount = interaction.options.getInteger("vincitori");
      const hostUser = interaction.options.getUser("host");

      const patch = {};
      if (prize != null) patch.prize = prize;
      if (winnerCount != null) patch.winnerCount = winnerCount;
      if (hostUser) {
        patch.hostId = hostUser.id;
        patch.hostTag = hostUser.tag || "";
      }
      if (durationStr != null) {
        const durationMs = parseDuration(durationStr.trim());
        if (!durationMs || durationMs < 60 * 1000) {
          return safeEditReply(interaction, {
            content: "<a:VC_Cross:1482532424570376253> Durata non valida. Usa ad es. `1h`, `24h`, `7d`.",
            flags: EPHEMERAL_FLAG,
          });
        }
        patch.durationMs = durationMs;
      }

      if (!Object.keys(patch).length) {
        return safeEditReply(interaction, {
          content:
            "<a:VC_Cross:1482532424570376253> Specifica almeno un campo da modificare (`premio`, `durata`, `vincitori` o `host`).",
          flags: EPHEMERAL_FLAG,
        });
      }

      const result = await editGiveawayByMessageId(messageId, interaction.client, patch);
      if (result.ok) {
        return safeEditReply(interaction, {
          content: "<a:VC_Events:1482706144953897223> Giveaway aggiornato.",
          flags: EPHEMERAL_FLAG,
        });
      }
      return safeEditReply(interaction, {
        content: `<a:VC_Cross:1482532424570376253> ${result.error || "Errore durante la modifica del giveaway."}`,
        flags: EPHEMERAL_FLAG,
      });
    }

    if (subcommand === "delete") {
      const result = await deleteGiveawayByMessageId(messageId, interaction.client);
      if (result.ok) {
        return safeEditReply(interaction, {
          content: result.deletedMessage
            ? "<a:VC_Events:1482706144953897223> Giveaway cancellato e messaggio rimosso."
            : "<a:VC_Events:1482706144953897223> Giveaway cancellato.",
          flags: EPHEMERAL_FLAG,
        });
      }
      return safeEditReply(interaction, {
        content: `<a:VC_Cross:1482532424570376253> ${result.error || "Errore durante la cancellazione del giveaway."}`,
        flags: EPHEMERAL_FLAG,
      });
    }

    if (subcommand === "reroll") {
      const result = await rerollGiveawayByMessageId(messageId, interaction.client);
      if (result.ok) {
        return safeEditReply(interaction, {
          content: `<a:VC_Events:1482706144953897223> Reroll effettuato! Nuovo vincitore: <@${result.newWinnerId}>. Il messaggio è stato aggiornato nel canale.`,
          flags: EPHEMERAL_FLAG,
        });
      }
      return safeEditReply(interaction, {
        content: `<a:VC_Cross:1482532424570376253> ${result.error || "Errore durante il reroll."}`,
        flags: EPHEMERAL_FLAG,
      });
    }
  },
};
