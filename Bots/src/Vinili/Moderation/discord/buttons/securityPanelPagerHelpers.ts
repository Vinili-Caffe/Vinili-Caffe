const { ActionRowBuilder, ButtonBuilder, ButtonStyle, MessageFlags } = require("discord.js") as typeof import("discord.js");
const sec = require("../../../Prefix/Admin/security") as typeof import("../../../Prefix/Admin/security");

const PRIVATE_FLAG = MessageFlags.Ephemeral;
const STATICS_LAST = 2;

function notYourPanelReply() {
  return { content: "<a:VC_Cross:1482532424570376253> Solo chi ha aperto il pannello può usarlo.", flags: PRIVATE_FLAG };
}

function extractOwnerIdFromCustomId(customId?) {
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

async function replyEphemeral(interaction?, content?) {
  const { buildSimpleNoticePayload } = require("../../../../shared/embeds/simpleNoticeEmbed") as typeof import("../../../../shared/embeds/simpleNoticeEmbed");
  const payload = buildSimpleNoticePayload(String(content || "").slice(0, 1900), interaction.guild, {
    flags: PRIVATE_FLAG,
  });
  if (interaction.deferred || interaction.replied) {
    await interaction.followUp(payload).catch(() => null);
    return;
  }
  await interaction.reply(payload).catch(() => null);
}

async function ensureDeferred(interaction?) {
  if (interaction.deferred || interaction.replied) return true;
  try {
    await interaction.deferUpdate();
    return true;
  } catch (err) {
    global.logger?.warn?.("[securityPanel] deferUpdate:", err?.message || err);
    return false;
  }
}

async function respondPayload(interaction?, payload?) {
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

function buildPagerRow(kind?, ownerId?, page?, lastIdx?) {
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

async function handleHub(interaction?, guild?, member?, ownerId?) {
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

async function handleBack(interaction?, guild?, ownerId?, member?) {
  if (!(await ensureDeferred(interaction))) {
    await replyEphemeral(interaction, "<a:VC_Cross:1482532424570376253> Impossibile aggiornare il pannello. Riprova.");
    return true;
  }
  const payload = sec.buildSecurityHubPayload(guild, ownerId, interaction.user, member);
  await respondPayload(interaction, payload);
  return true;
}

async function handlePager(interaction?, parts?, guild?, ownerId?) {
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
  return false;
}

export = {
  PRIVATE_FLAG,
  notYourPanelReply,
  extractOwnerIdFromCustomId,
  replyEphemeral,
  ensureDeferred,
  respondPayload,
  handleHub,
  handleBack,
  handlePager,
};
