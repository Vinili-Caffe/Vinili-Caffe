const { EmbedBuilder, PermissionsBitField } = require("discord.js");
const { safeMessageReply } = require("../../../shared/discord/replyRuntime");
const { CustomRole } = require("../../Schemas/Community/communitySchemas");
const { isValidGuildUserId } = require("../../Utils/DB/validateWriteIds");

const ANCHOR_ROLE_ID = "1469452890761596981";

function trimRoleName(name) {
  const clean = String(name || "").replace(/\s+/g, " ").trim();
  const base = clean || "Custom Role";
  const prefixed = base.startsWith("༄") ? base : `༄ ${base}`;
  return prefixed.slice(0, 32).trim();
}

async function resolveTargetMember(message, raw) {
  const mentioned = message.mentions?.members?.first();
  if (mentioned) return mentioned;
  const id = String(raw || "").replace(/[<@!>]/g, "");
  if (!/^\d{16,20}$/.test(id)) return null;
  return message.guild.members.fetch(id).catch(() => null);
}

function resolveRoleArg(message, raw) {
  const mentionedRole = message.mentions?.roles?.first();
  if (mentionedRole) return mentionedRole;
  const id = String(raw || "").replace(/[<@&>]/g, "");
  if (!/^\d{16,20}$/.test(id)) return null;
  return message.guild.roles.cache.get(id) || null;
}

async function positionRoleUnderAnchor(guild, role, me) {
  if (!guild || !role || !me) return;
  const anchor = guild.roles.cache.get(ANCHOR_ROLE_ID) || (await guild.roles.fetch(ANCHOR_ROLE_ID).catch(() => null));
  if (!anchor) return;
  const targetPosition = Math.max(1, Number(anchor.position) - 1);
  if (targetPosition >= Number(me.roles.highest.position)) return;
  await role.setPosition(targetPosition).catch(() => {});
}

module.exports = {
  name: "customregister",
  aliases: ["cregister"],
  usage: "+customregister <@utente | id> [@ruolo | id]",

  async execute(message, args = []) {
    if (!message.guild || !message.member) return;
    await message.channel.sendTyping().catch(() => {});

    const me = message.guild.members.me || message.guild.members.cache.get(message.client.user.id);
    if (!me?.permissions?.has(PermissionsBitField.Flags.ManageRoles)) {
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("<:vegax:1443934876440068179> Mi serve il permesso `Gestisci Ruoli`."),
        ],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const target = await resolveTargetMember(message, args[0]);
    if (!target) {
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("<:vegax:1443934876440068179> Usa: `+customregister <@utente | id> [@ruolo | id]`"),
        ],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    if (!isValidGuildUserId(String(message.guild.id), String(target.id))) {
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("<:vegax:1443934876440068179> ID utente/guild non valido."),
        ],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    let role = resolveRoleArg(message, args[1]);
    let createdRole = false;

    if (!role) {
      role = await message.guild.roles.create({
        name: trimRoleName(target.displayName || target.user?.username || "Custom Role"),
        colors: { primaryColor: "#f4b6d7" },
        reason: `Custom role register for ${target.user?.tag || target.id} by ${message.author.tag}`,
      }).catch(() => null);
      if (!role) {
        await safeMessageReply(message, {
          embeds: [
            new EmbedBuilder()
              .setColor("Red")
              .setDescription("<:vegax:1443934876440068179> Non sono riuscito a creare il ruolo custom."),
          ],
          allowedMentions: { repliedUser: false },
        });
        return;
      }
      createdRole = true;
      await positionRoleUnderAnchor(message.guild, role, me);
    }

    if (role.position >= me.roles.highest.position) {
      if (createdRole) await role.delete().catch(() => {});
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("<:vegax:1443934876440068179> Non posso gestire quel ruolo (gerarchia)."),
        ],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    const addOk = await target.roles.add(role.id, `Custom role register by ${message.author.tag}`).then(() => true).catch(() => false);
    if (!addOk) {
      await safeMessageReply(message, {
        embeds: [
          new EmbedBuilder()
            .setColor("Red")
            .setDescription("<:vegax:1443934876440068179> Non sono riuscito ad assegnare il ruolo all'utente."),
        ],
        allowedMentions: { repliedUser: false },
      });
      return;
    }

    await CustomRole.findOneAndUpdate(
      { guildId: String(message.guild.id), userId: String(target.id) },
      {
        $setOnInsert: { guildId: String(message.guild.id), userId: String(target.id) },
        $set: {
          roleId: String(role.id),
          expiresAt: null,
          customRoleEligibilityLostAt: null,
          customVocEligibilityLostAt: null,
        },
      },
      { upsert: true, new: true, setDefaultsOnInsert: true },
    ).catch(() => null);

    await safeMessageReply(message, {
      embeds: [
        new EmbedBuilder()
          .setColor("#6f4e37")
          .setTitle("<:vegacheckmark:1443666279058772028> Custom role registrato")
          .setDescription(
            [
              `Utente: ${target}`,
              `Ruolo: ${role}`,
              `Azione: ${createdRole ? "creato + assegnato + registrato" : "assegnato + registrato"}`,
            ].join("\n"),
          ),
      ],
      allowedMentions: { repliedUser: false },
    });
  },
};