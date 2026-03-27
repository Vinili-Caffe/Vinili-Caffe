const { EmbedBuilder, ModalBuilder, TextInputBuilder, TextInputStyle, ActionRowBuilder } = require("discord.js");
const { buildLevelServerPanelPayload, buildLevelUserPanelPayload } = require("../Prefix/Admin/level");
const { ActivityUserProfile } = require("../Schemas/Community/communitySchemas");
const {
  getLevelInfo,
  getTotalExpForLevel,
  recordLevelHistory,
  setLevelChannelLocked,
  setRoleIgnored,
  setRoleExpMultiplier,
  setTemporaryEventMultiplier,
  setGlobalMultiplier,
  syncLevelRolesForMember,
  sendLevelUpAnnouncement,
} = require("../Services/Community/expService");
const { getGuildMemberCached } = require("../Utils/Interaction/interactionEntityCache");

const PRIVATE_FLAG = 1 << 6;

function match(interaction) {
  const id = String(interaction?.customId || "");
  const isComponent = interaction?.isButton?.() || interaction?.isStringSelectMenu?.() || interaction?.isModalSubmit?.();
  if (!isComponent) return false;
  return id.startsWith("level_panel:") || id.startsWith("level_panel_modal:");
}

function parseLevelPanelComponentId(customId) {
  const parts = String(customId || "").split(":");
  if (parts[0] !== "level_panel") return null;
  if (parts[1] === "server_nav") return { kind: "server_nav", ownerId: parts[2] || "" };
  if (parts[1] === "server_btn") return { kind: "server_btn", action: parts[2] || "", ownerId: parts[3] || "" };
  if (parts[1] === "user_actions") return { kind: "user_actions", ownerId: parts[2] || "", targetId: parts[3] || "" };
  return null;
}

function parseModalId(customId) {
  const parts = String(customId || "").split(":");
  return {
    root: parts[0] || "",
    scope: parts[1] || "",
    action: parts[2] || "",
    ownerId: parts[3] || "",
    targetId: parts[4] || "",
  };
}

function asInt(value) {
  const n = Number(value);
  if (!Number.isFinite(n)) return null;
  return Math.floor(n);
}

function fmtDate(dateValue) {
  const d = new Date(dateValue);
  if (Number.isNaN(d.getTime())) return "-";
  return d.toLocaleString("it-IT", { hour12: false });
}

function buildModal(scope, action, ownerId, targetId = "") {
  const baseId = `level_panel_modal:${scope}:${action}:${ownerId}${targetId ? `:${targetId}` : ""}`;
  const modal = new ModalBuilder().setCustomId(baseId).setTitle(`Level ${scope} • ${action}`);
  const rows = [];
  const pushInput = (customId, label, placeholder, required = true) => {
    rows.push(new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId(customId)
        .setLabel(label)
        .setStyle(TextInputStyle.Short)
        .setRequired(required)
        .setPlaceholder(placeholder || ""),
    ));
  };
  if (scope === "server") {
    if (action === "lock" || action === "unlock") pushInput("target", "Canale", "#canale oppure id");
    if (action === "ignore" || action === "unignore") pushInput("target", "Ruolo", "@ruolo oppure id");
    if (action === "multiplier") {
      pushInput("value", "Moltiplicatore", "es. 2");
      pushInput("minutes", "Durata minuti", "es. 60", false);
    }
    if (action === "gmulti") pushInput("value", "Moltiplicatore globale", "es. 2");
    if (action === "role_multi_set") {
      pushInput("target", "Ruolo", "@ruolo oppure id");
      pushInput("value", "Moltiplicatore", "es. 2 o 1.25");
    }
    if (action === "role_multi_remove") pushInput("target", "Ruolo", "@ruolo oppure id");
  } else {
    if (action === "set") {
      pushInput("mode", "Tipo", "exp oppure level");
      pushInput("value", "Valore", "es. 10000");
    }
    if (action === "add" || action === "remove") pushInput("value", "Livelli", "es. 2");
  }
  return modal.addComponents(...rows);
}

function buildSimpleEmbed(title, description) {
  return new EmbedBuilder().setColor("#6f4e37").setTitle(title).setDescription(description);
}

async function runServerModalAction(interaction, action) {
  const guildId = interaction.guild?.id;
  if (!guildId) return buildSimpleEmbed("Level", "Guild non disponibile.");
  if (action === "lock" || action === "unlock") {
    const rawTarget = String(interaction.fields.getTextInputValue("target") || "");
    const cleanTarget = rawTarget.replace(/[<#@&>]/g, "").trim();
    if (!/^\d{16,20}$/.test(cleanTarget)) return buildSimpleEmbed("Level", "Canale non valido.");
    const locked = action === "lock";
    const next = await setLevelChannelLocked(guildId, cleanTarget, locked);
    return buildSimpleEmbed("Level", `${locked ? "Canale bloccato" : "Canale sbloccato"} per EXP: <#${cleanTarget}>. Totale: **${next.length}**`);
  }
  if (action === "ignore" || action === "unignore") {
    const rawTarget = String(interaction.fields.getTextInputValue("target") || "");
    const cleanTarget = rawTarget.replace(/[<#@&>]/g, "").trim();
    if (!/^\d{16,20}$/.test(cleanTarget)) return buildSimpleEmbed("Level", "Ruolo non valido.");
    const ignored = action === "ignore";
    const next = await setRoleIgnored(guildId, cleanTarget, ignored);
    return buildSimpleEmbed("Level", `${ignored ? "Ruolo ignorato" : "Ruolo riabilitato"} per EXP: <@&${cleanTarget}>. Totale: **${next.length}**`);
  }
  if (action === "multiplier") {
    const value = Number(interaction.fields.getTextInputValue("value"));
    const minutesRaw = String(interaction.fields.getTextInputValue("minutes") || "").trim();
    const minutes = asInt(minutesRaw || 60);
    if (!Number.isFinite(value) || value <= 0 || !Number.isFinite(minutes) || minutes <= 0) {
      return buildSimpleEmbed("Level", "Valori non validi.");
    }
    const out = await setTemporaryEventMultiplier(guildId, value, minutes * 60 * 1000);
    return buildSimpleEmbed("Level", `Evento EXP impostato a **${out.multiplier}x** fino al **${fmtDate(out.expiresAt)}**.`);
  }
  if (action === "gmulti") {
    const value = Number(interaction.fields.getTextInputValue("value"));
    if (!Number.isFinite(value) || value <= 0) return buildSimpleEmbed("Level", "Valore non valido.");
    const stored = await setGlobalMultiplier(guildId, value);
    return buildSimpleEmbed("Level", `Moltiplicatore globale impostato a **${stored}x**.`);
  }
  if (action === "role_multi_set") {
    const rawTarget = String(interaction.fields.getTextInputValue("target") || "");
    const cleanTarget = rawTarget.replace(/[<#@&>]/g, "").trim();
    const value = Number(interaction.fields.getTextInputValue("value"));
    if (!/^\d{16,20}$/.test(cleanTarget)) return buildSimpleEmbed("Level", "Ruolo non valido.");
    if (!Number.isFinite(value) || value <= 0) return buildSimpleEmbed("Level", "Moltiplicatore non valido.");
    await setRoleExpMultiplier(guildId, cleanTarget, value);
    return buildSimpleEmbed("Level", `Moltiplicatore ruolo impostato per <@&${cleanTarget}> a **${value}x**.`);
  }
  if (action === "role_multi_remove") {
    const rawTarget = String(interaction.fields.getTextInputValue("target") || "");
    const cleanTarget = rawTarget.replace(/[<#@&>]/g, "").trim();
    if (!/^\d{16,20}$/.test(cleanTarget)) return buildSimpleEmbed("Level", "Ruolo non valido.");
    await setRoleExpMultiplier(guildId, cleanTarget, null);
    return buildSimpleEmbed("Level", `Override moltiplicatore rimosso per <@&${cleanTarget}> (torna al default se presente).`);
  }
  return buildSimpleEmbed("Level", "Azione server non riconosciuta.");
}

async function runUserAction(interaction, action, targetId) {
  const guildId = interaction.guild?.id;
  if (!guildId || !/^\d{16,20}$/.test(String(targetId || ""))) return buildSimpleEmbed("Level", "Utente non valido.");
  if (action === "syncroles") {
    const profileRow = await ActivityUserProfile.findOne({ guildId, userId: targetId }).select("profile.totals.exp.totalExp").lean().catch(() => null);
    const totalExp = Math.max(0, Number(profileRow?.profile?.totals?.exp?.totalExp || 0));
    const level = getLevelInfo(totalExp).level;
    await syncLevelRolesForMember(interaction.guild, targetId, level);
    return buildSimpleEmbed("Level", `Ruoli allineati al livello **${level}** per <@${targetId}>.`);
  }
  if (action === "reset") {
    return runUserMutation(interaction, "reset", targetId, null, null);
  }
  return null;
}

async function runUserMutation(interaction, action, targetId, modeInput = null, valueInput = null) {
  const guildId = interaction.guild?.id;
  const mode = String(modeInput || "").toLowerCase();
  const value = asInt(valueInput);
  let doc = await ActivityUserProfile.findOne({ guildId, userId: targetId });
  if (!doc) doc = new ActivityUserProfile({ guildId, userId: targetId });
  if (!doc.profile) doc.profile = {};
  if (!doc.profile.totals) doc.profile.totals = {};
  if (!doc.profile.totals.exp) doc.profile.totals.exp = {};
  const beforeExp = Math.max(0, Math.floor(Number(doc.profile.totals.exp.totalExp || 0)));
  const beforeLevel = getLevelInfo(beforeExp).level;
  let afterExp = beforeExp;
  if (action === "set") {
    if (!["exp", "level"].includes(mode) || !Number.isFinite(value) || value < 0) return buildSimpleEmbed("Level", "Valori non validi per set.");
    afterExp = mode === "exp" ? value : getTotalExpForLevel(value);
  } else if (action === "add") {
    if (!Number.isFinite(value) || value <= 0) return buildSimpleEmbed("Level", "Valore non valido per add.");
    afterExp = getTotalExpForLevel(beforeLevel + value);
  } else if (action === "remove") {
    if (!Number.isFinite(value) || value <= 0) return buildSimpleEmbed("Level", "Valore non valido per remove.");
    afterExp = getTotalExpForLevel(Math.max(0, beforeLevel - value));
  } else if (action === "reset") {
    afterExp = 0;
  }
  doc.profile.totals.exp.totalExp = Math.max(0, Math.floor(afterExp));
  doc.profile.totals.exp.level = getLevelInfo(doc.profile.totals.exp.totalExp).level;
  await doc.save();
  await syncLevelRolesForMember(interaction.guild, targetId, doc.profile.totals.exp.level);
  await recordLevelHistory({
    guildId,
    userId: targetId,
    actorId: interaction.user.id,
    action: `staff_${action}`,
    beforeExp,
    afterExp: doc.profile.totals.exp.totalExp,
    note: `Pannello +level ${action}`,
  });
  if (doc.profile.totals.exp.level > beforeLevel) {
    const member = interaction.guild.members.cache.get(targetId) || await getGuildMemberCached(interaction.guild, targetId).catch(() => null);
    if (member) await sendLevelUpAnnouncement(interaction.guild, member, doc.profile.totals.exp.level).catch(() => {});
  }
  return buildSimpleEmbed("Aggiornamento Level", [
    `- Utente: <@${targetId}>`,
    `- Azione: **${action}**`,
    `- Livello: **${beforeLevel} -> ${doc.profile.totals.exp.level}**`,
    `- EXP: **${beforeExp} -> ${doc.profile.totals.exp.totalExp}**`,
  ].join("\n"));
}
}

async function execute(interaction) {
  const parsed = interaction.isModalSubmit() ? parseModalId(interaction.customId) : parseCustomId(interaction.customId);
  const ownerId = String(parsed.ownerId || "");
  if (ownerId && String(interaction.user?.id || "") !== ownerId) {
    const denied = {
      embeds: [new EmbedBuilder().setColor("#e74c3c").setDescription("<:vegax:1443934876440068179> Questo pannello non è tuo.")],
      flags: PRIVATE_FLAG,
    };
    if (interaction.deferred || interaction.replied) await interaction.followUp(denied).catch(() => {});
    else await interaction.reply(denied).catch(() => {});
    return true;
  }

  if (interaction.isModalSubmit()) {
    const scope = String(modalParsed.scope || "");
    const action = String(modalParsed.action || "");
    let embed;
    if (scope === "server") {
      embed = await runServerModalAction(interaction, action);
    } else if (scope === "user") {
      const targetId = String(modalParsed.targetId || "");
      if (action === "set") {
        embed = await runUserMutation(interaction, action, targetId, interaction.fields.getTextInputValue("mode"), interaction.fields.getTextInputValue("value"));
      } else if (action === "add" || action === "remove") {
        embed = await runUserMutation(interaction, action, targetId, null, interaction.fields.getTextInputValue("value"));
      } else {
        embed = buildSimpleEmbed("Level", "Azione utente non supportata da modal.");
      }
    } else {
      embed = buildSimpleEmbed("Level", "Scope modal non valido.");
    }
    await interaction.reply({ embeds: [embed], flags: PRIVATE_FLAG }).catch(() => {});
    return true;
  }

  if (interaction.isButton()) {
    if (!compParsed || compParsed.kind !== "server_btn") return false;
    const modalAction = SERVER_BTN_MODAL[compParsed.action];
    if (!modalAction) return false;
    const modal = buildModal("server", modalAction, ownerId);
    await interaction.showModal(modal).catch(() => {});
    return true;
  }

  if (interaction.isStringSelectMenu()) {
    if (compParsed?.kind === "server_nav") {
      const section = String(interaction.values?.[0] || "home").toLowerCase();
      const payload = await buildLevelServerPanelPayload(interaction.guild, ownerId, section);
      await interaction.update(payload).catch(async () => { await interaction.reply(payload).catch(() => {}); });
      return true;
    }
    if (compParsed?.kind === "user_actions") {
      const action = String(interaction.values?.[0] || "").toLowerCase();
      const targetId = String(compParsed.targetId || "");
      if (!/^\d{16,20}$/.test(targetId)) {
        await interaction.reply({
          embeds: [buildSimpleEmbed("Level", "Target utente non valido.")],
          flags: PRIVATE_FLAG,
        }).catch(() => {});
        return true;
      }
      if (action === "syncroles" || action === "reset") {
        const embed = await runUserAction(interaction, action, targetId);
        await interaction.reply({ embeds: [embed], flags: PRIVATE_FLAG }).catch(() => {});
        return true;
      }
      const modal = buildModal("user", action, ownerId, targetId);
      await interaction.showModal(modal).catch(() => {});
      return true;
    }
  }

  return false;
}

module.exports = { name: "levelPanel", order: 11, match, execute };