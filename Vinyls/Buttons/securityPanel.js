const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require("discord.js");
const sec = require("../Prefix/Admin/security");
const { getGuildMemberCached } = require("../Utils/Interaction/interactionEntityCache");
const PRIVATE_FLAG = MessageFlags.Ephemeral;
const STATICS_LAST = 2;

function match(interaction) {
  const id = String(interaction?.customId || "");
  if (!interaction?.isButton?.() && !interaction?.isStringSelectMenu?.()) return false;
  return id.startsWith("security_panel:");
}

function notYourPanelReply() {
  return { content: "<a:VC_Cross:1482532424570376253> Solo chi ha aperto il pannello può usarlo.", flags: PRIVATE_FLAG };
}

function extractOwnerIdFromCustomId(customId) {
  const parts = String(customId || "").split(":");
  const kind = String(parts[1] || "");
  if (kind === "hub" || kind === "pick" || kind === "back" || kind === "toggle" || kind === "bulk") {
    return String(parts[2] || "").trim();
  }
  if (kind === "status" || kind === "panic" || kind === "statics") {
    return String(parts[2] || "").trim();
  }
  return "";
}

async function replyEphemeral(interaction, content) {
  const { buildSimpleNoticePayload } = require("../Utils/Embeds/simpleNoticeEmbed");
  const payload = buildSimpleNoticePayload(String(content || "").slice(0, 1900), interaction.guild, {
    flags: PRIVATE_FLAG,
  });
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload).catch(() => null);
    return;
  }
  await interaction.reply(payload).catch(() => null);
}

async function ensureDeferred(interaction) {
  if (interaction.deferred || interaction.replied) return true;
  try {
    await interaction.deferUpdate();
    return true;
  } catch (err) {
    global.logger?.warn?.("[securityPanel] deferUpdate:", err?.message || err);
    return false;
  }
}

async function respondPayload(interaction, payload) {
  if (interaction.deferred || interaction.replied) {
    await interaction.editReply(payload);
    return;
  }
  try {
    await interaction.update(payload);
  } catch (err) {
    if (!(await ensureDeferred(interaction))) throw err;
    await interaction.editReply(payload);
  }
}

function buildPagerRow(kind, ownerId, page, lastIdx) {
  const p = Math.max(0, Math.min(lastIdx, page));
  const base = `security_panel:${kind}:${ownerId}`;
  const back = `security_panel:back:${ownerId}`;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${base}:${p}:first`)
      .setEmoji("<:1343arrowleft:1525249879151083621>")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(p <= 0),
    new ButtonBuilder()
      .setCustomId(`${base}:${p}:prev`)
      .setEmoji("<:1343arrowleft:1525249879151083621>")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(p <= 0),
    new ButtonBuilder()
      .setCustomId(`${base}:${p}:next`)
      .setEmoji("<:1343arrowright:1525249880728145970>")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(p >= lastIdx),
    new ButtonBuilder()
      .setCustomId(`${base}:${p}:last`)
      .setEmoji("<:1343arrowright:1525249880728145970>")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(p >= lastIdx),
    new ButtonBuilder().setCustomId(back).setEmoji("<:VC_page2:1482459724657201387>").setStyle(ButtonStyle.Primary),
  );
}

async function logModuleAction(interaction, guild, action, target, results) {
  const okCount = results.filter((r) => r.ok).length;
  const changedCount = results.filter((r) => r.changed).length;
  await sec
    .sendSecurityAuditLog(guild, {
      actorId: interaction.user.id,
      action: action === "enable" ? "security.enable" : "security.disable",
      details: [
        `Target: \`${target}\``,
        `Risultati: ${okCount}/${results.length} ok, modificati ${changedCount}`,
      ],
      color: okCount === results.length ? "#57F287" : "#FEE75C",
    })
    .catch(() => null);
}

async function execute(interaction) {
  const guild = interaction.guild;
  if (!guild) return false;

  const id = String(interaction.customId || "");
  const parts = id.split(":");

  try {
    let member = interaction.member;
    if (!member && interaction.user?.id) {
      member = await getGuildMemberCached(guild, interaction.user.id).catch(() => null);
    }
    if (!member) {
      await replyEphemeral(interaction, "<a:VC_Cross:1482532424570376253> Impossibile verificare il tuo profilo nel server. Riprova.");
      return true;
    }
    if (!sec.hasStaffAccess(member, guild)) {
      await replyEphemeral(interaction, "<a:VC_Cross:1482532424570376253> Non hai i permessi.");
      return true;
    }

    const ownerId = extractOwnerIdFromCustomId(id);
    if (!/^\d{16,20}$/.test(ownerId)) {
      await replyEphemeral(
        interaction,
        "<a:VC_Cross:1482532424570376253> Pannello non valido o scaduto. Esegui di nuovo **`+security`**.",
      );
      return true;
    }

    if (String(interaction.user?.id || "") !== ownerId) {
      await replyEphemeral(interaction, notYourPanelReply().content);
      return true;
    }

  if (interaction.isStringSelectMenu() && parts[1] === "hub") {
    const v = String(interaction.values?.[0] || "");
    if (v === "view_modules") {
      if (!sec.hasPanicControlAccess(member, guild)) {
        await replyEphemeral(interaction, "<a:VC_Cross:1482532424570376253> Solo Founder può gestire i moduli.");
        return true;
      }
    }
    if (!v) {
      await replyEphemeral(interaction, "<a:VC_Cross:1482532424570376253> Selezione non valida.");
      return true;
    }
    if (!(await ensureDeferred(interaction))) {
      await replyEphemeral(interaction, "<a:VC_Cross:1482532424570376253> Impossibile aggiornare il pannello. Riprova.");
      return true;
    }
    if (v === "view_status") {
      const pages = await sec.buildStatusEmbeds(guild);
      const last = pages.length - 1;
      await respondPayload(interaction, {
        embeds: [pages[0]],
        components: [buildPagerRow("status", ownerId, 0, last)],
      });
      return true;
    }
    if (v === "view_panic") {
      const pages = await sec.buildPanicStatusEmbeds(guild);
      const last = pages.length - 1;
      await respondPayload(interaction, {
        embeds: [pages[0]],
        components: [buildPagerRow("panic", ownerId, 0, last)],
      });
      return true;
    }
    if (v === "view_statics") {
      await respondPayload(interaction, {
        embeds: [sec.buildSecurityStaticsPanelEmbed(guild.id, 0)],
        components: [buildPagerRow("statics", ownerId, 0, STATICS_LAST)],
      });
      return true;
    }
    if (v === "view_modules") {
      const payload = await sec.buildSecurityModulesPanelPayload(guild, ownerId, member);
      await respondPayload(interaction, payload);
      return true;
    }
    if (v === "pick_enable" || v === "pick_disable") {
      const payload = await sec.buildSecurityModulesPanelPayload(guild, ownerId, member);
      await respondPayload(interaction, payload);
      return true;
    }
    await replyEphemeral(interaction, "<a:VC_Cross:1482532424570376253> Selezione non valida.");
    return true;
  }

  if (interaction.isStringSelectMenu() && parts[1] === "pick") {
    if (!sec.hasPanicControlAccess(member, guild)) {
      await replyEphemeral(interaction, "<a:VC_Cross:1482532424570376253> Solo Founder può gestire i moduli.");
      return true;
    }
    const target = sec.parsePanicTarget(interaction.values?.[0]);
    if (!target) {
      await replyEphemeral(interaction, "<a:VC_Cross:1482532424570376253> Target non valido.");
      return true;
    }
    const action = String(parts[3] || "").toLowerCase() === "enable" ? "enable" : "disable";
    if (!(await ensureDeferred(interaction))) {
      await replyEphemeral(interaction, "<a:VC_Cross:1482532424570376253> Impossibile aggiornare il pannello. Riprova.");
      return true;
    }
    const results = await sec.runSecurityAction(action, target, guild, interaction.user.id);
    await logModuleAction(interaction, guild, action, target, results);
    const payload = await sec.buildSecurityModulesPanelPayload(guild, ownerId, member);
    await respondPayload(interaction, payload);
    return true;
  }

  if (interaction.isButton() && parts[1] === "toggle") {
    if (!sec.hasPanicControlAccess(member, guild)) {
      await replyEphemeral(interaction, "<a:VC_Cross:1482532424570376253> Solo Founder può gestire i moduli.");
      return true;
    }
    const moduleId = sec.parsePanicTarget(parts[3]);
    if (!moduleId || moduleId === "all") {
      await replyEphemeral(interaction, "<a:VC_Cross:1482532424570376253> Modulo non valido.");
      return true;
    }
    if (!(await ensureDeferred(interaction))) {
      await replyEphemeral(interaction, "<a:VC_Cross:1482532424570376253> Impossibile aggiornare il pannello. Riprova.");
      return true;
    }
    const modules = await sec.fetchSecurityModulesState(guild);
    const mod = modules.find((m) => m.id === moduleId);
    const action = mod?.enabled ? "disable" : "enable";
    const results = await sec.runSecurityAction(action, moduleId, guild, interaction.user.id);
    await logModuleAction(interaction, guild, action, moduleId, results);
    const payload = await sec.buildSecurityModulesPanelPayload(guild, ownerId, member);
    await respondPayload(interaction, payload);
    return true;
  }

  if (interaction.isButton() && parts[1] === "bulk") {
    if (!sec.hasPanicControlAccess(member, guild)) {
      await replyEphemeral(interaction, "<a:VC_Cross:1482532424570376253> Solo Founder può gestire i moduli.");
      return true;
    }
    const bulkAction = String(parts[3] || "").toLowerCase();
    const action = bulkAction === "enable_all" ? "enable" : bulkAction === "disable_all" ? "disable" : "";
    if (!action) {
      await replyEphemeral(interaction, "<a:VC_Cross:1482532424570376253> Azione non valida.");
      return true;
    }
    if (!(await ensureDeferred(interaction))) {
      await replyEphemeral(interaction, "<a:VC_Cross:1482532424570376253> Impossibile aggiornare il pannello. Riprova.");
      return true;
    }
    const results = await sec.runSecurityAction(action, "all", guild, interaction.user.id);
    await logModuleAction(interaction, guild, action, "all", results);
    const payload = await sec.buildSecurityModulesPanelPayload(guild, ownerId, member);
    await respondPayload(interaction, payload);
    return true;
  }

  if (interaction.isButton() && parts[1] === "back") {
    if (!(await ensureDeferred(interaction))) {
      await replyEphemeral(interaction, "<a:VC_Cross:1482532424570376253> Impossibile aggiornare il pannello. Riprova.");
      return true;
    }
    const payload = sec.buildSecurityHubPayload(guild, ownerId, interaction.user, member);
    await respondPayload(interaction, payload);
    return true;
  }

  if (interaction.isButton() && ["status", "panic", "statics"].includes(parts[1])) {
    const page = Number(parts[3]);
    const op = String(parts[4] || "").toLowerCase();
    if (!Number.isFinite(page)) {
      await replyEphemeral(interaction, "<a:VC_Cross:1482532424570376253> Pagina non valida.");
      return true;
    }
    if (!(await ensureDeferred(interaction))) {
      await replyEphemeral(interaction, "<a:VC_Cross:1482532424570376253> Impossibile aggiornare il pannello. Riprova.");
      return true;
    }
    let nextPage = page;
    if (op === "first") nextPage = 0;
    else if (op === "prev") nextPage = Math.max(0, page - 1);
    else if (op === "next") nextPage = page + 1;
    else if (op === "last") {
      if (parts[1] === "statics") nextPage = STATICS_LAST;
      else {
        const pages =
          parts[1] === "status"
            ? await sec.buildStatusEmbeds(guild)
            : await sec.buildPanicStatusEmbeds(guild);
        nextPage = pages.length - 1;
      }
    } else {
      await replyEphemeral(interaction, "<a:VC_Cross:1482532424570376253> Azione non valida.");
      return true;
    }

    if (parts[1] === "status") {
      const pages = await sec.buildStatusEmbeds(guild);
      const last = pages.length - 1;
      nextPage = Math.max(0, Math.min(last, nextPage));
      await respondPayload(interaction, {
        embeds: [pages[nextPage]],
        components: [buildPagerRow("status", ownerId, nextPage, last)],
      });
      return true;
    }
    if (parts[1] === "panic") {
      const pages = await sec.buildPanicStatusEmbeds(guild);
      const last = pages.length - 1;
      nextPage = Math.max(0, Math.min(last, nextPage));
      await respondPayload(interaction, {
        embeds: [pages[nextPage]],
        components: [buildPagerRow("panic", ownerId, nextPage, last)],
      });
      return true;
    }
    if (parts[1] === "statics") {
      nextPage = Math.max(0, Math.min(STATICS_LAST, nextPage));
      await respondPayload(interaction, {
        embeds: [sec.buildSecurityStaticsPanelEmbed(guild.id, nextPage)],
        components: [buildPagerRow("statics", ownerId, nextPage, STATICS_LAST)],
      });
      return true;
    }
  }

  await replyEphemeral(interaction, "<a:VC_Cross:1482532424570376253> Azione pannello non riconosciuta.");
  return true;
  } catch (err) {
    global.logger?.error?.(
      `[securityPanel] execute error customId=${id} guild=${String(guild?.id || "")} user=${String(interaction?.user?.id || "")}:`,
      err?.stack || err?.message || err,
    );
    await replyEphemeral(
      interaction,
      "<a:VC_Cross:1482532424570376253> Errore nel pannello sicurezza. Controlla i log del bot o riprova tra poco.",
    );
    return true;
  }
}

module.exports = { name: "securityPanel", order: 12, match, execute };