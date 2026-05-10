const { SlashCommandBuilder, EmbedBuilder, PermissionFlagsBits } = require("discord.js");
const { safeEditReply } = require("../../../shared/discord/replyRuntime");

const { fetchGuildMembersRespectingGatewayRateLimit } = require("../../Utils/Discord/gatewayMemberFetch");

const EPHEMERAL_FLAG = 1 << 6;
const CHUNK_SIZE = 5;
const CHUNK_DELAY_MS = 900;
const MEMBER_FETCH_MAX_ATTEMPTS = 30;

async function fetchAllGuildMembersResilient(guild) {
  return fetchGuildMembersRespectingGatewayRateLimit(guild, {
    maxAttempts: MEMBER_FETCH_MAX_ATTEMPTS,
    onRateLimit: (waitMs, attempt, maxAttempts) => {
      global.logger?.warn?.(
        `[role all] Richiesta membri (gateway) rate-limited, nuovo tentativo tra ~${Math.round(waitMs / 1000)}s (${attempt}/${maxAttempts})`,
      );
    },
  });
}

async function runRoleAllToMembers(interaction, role) {
  const guild = interaction.guild;
  await fetchAllGuildMembersResilient(guild);
  const members = [...guild.members.cache.values()];
  let skipped = 0;
  const targets = [];
  for (const m of members) {
    if (m.roles.cache.has(role.id)) skipped += 1;
    else targets.push(m);
  }
  let added = 0;
  let failed = 0;
  for (let i = 0; i < targets.length; i += CHUNK_SIZE) {
    const chunk = targets.slice(i, i + CHUNK_SIZE);
    await Promise.all(
      chunk.map((member) =>
        member.roles
          .add(role, { reason: `/role all — ${interaction.user.tag}` })
          .then(() => {
            added += 1;
          })
          .catch(() => {
            failed += 1;
          }),
      ),
    );
    if (i + CHUNK_SIZE < targets.length) {
      await new Promise((r) => setTimeout(r, CHUNK_DELAY_MS));
    }
  }
  return { added, skipped, failed, total: members.length };
}

module.exports = {
  skipDeploy: true,
  name: "role",
  data: new SlashCommandBuilder()
    .setName("role")
    .setDescription("Gestione ruoli di massa.")
    .setDMPermission(false)
    .addSubcommand((sub) =>
      sub
        .setName("all")
        .setDescription("Assegna un ruolo a tutti i membri che non ce l'hanno già.")
        .addRoleOption((opt) =>
          opt.setName("ruolo").setDescription("Il ruolo da assegnare").setRequired(true),
        ),
    ),

  async execute(interaction) {
    if (interaction.options.getSubcommand() !== "all") return;

    await interaction.deferReply({ flags: EPHEMERAL_FLAG }).catch(() => {});

    const guild = interaction.guild;
    const role = interaction.options.getRole("ruolo", true);
    const me = guild.members.me;

    if (!me?.permissions?.has(PermissionFlagsBits.ManageRoles)) {
      return safeEditReply(interaction, {
        content:
          "<a:VC_Alert:1482706673176150077> Il bot non ha il permesso **Gestisci ruoli**.",
        flags: EPHEMERAL_FLAG,
      });
    }

    if (!role || role.id === guild.id) {
      return safeEditReply(interaction, {
        content: "<a:VC_Alert:1482706673176150077> Ruolo non valido.",
        flags: EPHEMERAL_FLAG,
      });
    }

    if (role.managed) {
      return safeEditReply(interaction, {
        content:
          "<a:VC_Alert:1482706673176150077> Non puoi assegnare un ruolo gestito da un'integrazione (bot).",
        flags: EPHEMERAL_FLAG,
      });
    }

    if (me.roles.highest.position <= role.position) {
      return safeEditReply(interaction, {
        content:
          "<a:VC_Alert:1482706673176150077> Il ruolo del bot deve stare **sopra** il ruolo da assegnare.",
        flags: EPHEMERAL_FLAG,
      });
    }

    await safeEditReply(interaction, {
      content:
        "<a:VC_Calendar:1482706208149475358> Caricamento membri e assegnazione **in corso**…",
      flags: EPHEMERAL_FLAG,
    });

    void (async () => {
      try {
        const stats = await runRoleAllToMembers(interaction, role);
        const embed = new EmbedBuilder()
          .setColor("#6f4e37")
          .setDescription(
            [
              `<:vegacheckmark:1443666279058772028> Assegnazione completata: ${role}`,
              "",
              `• Aggiunti: **${stats.added}**`,
              `• Già con il ruolo: **${stats.skipped}**`,
              `• Non riusciti: **${stats.failed}**`,
              `• Membri totali: **${stats.total}**`,
            ].join("\n"),
          );
        await safeEditReply(interaction, { embeds: [embed], flags: EPHEMERAL_FLAG });
      } catch (err) {
        global.logger?.error?.("[role all]", err);
        await safeEditReply(interaction, {
          content: `<:vegax:1443934876440068179> Errore durante l'assegnazione: ${String(err?.message || err).slice(0, 500)}`,
          flags: EPHEMERAL_FLAG,
        });
      }
    })();
  },
};