const { EmbedBuilder, ActionRowBuilder, ButtonBuilder, ButtonStyle, StringSelectMenuBuilder, ModalBuilder, TextInputBuilder, TextInputStyle } = require("discord.js");
const { assignManualHousePoints, normalizeHouseInput } = require("../Services/Community/hogwartsManualHousePointsService");
const { fetchHouseDashboardData, expelSortedMemberFromHouse, formatRankLabel } = require("../Services/Community/hogwartsHouseAdminService");
const {
  fetchHouseMemberPointsLeaderboard,
  paginateMemberRows,
  formatMemberPointsLines,
} = require("../Services/Community/hogwartsMemberHousePointsService");
const { HOUSES, getHouseMeta } = require("../Utils/Web/hogwartsSortingBank");
const { resolveHogwartsEventConfig } = require("../Utils/Web/hogwartsSortingConfig");
const { resolveHouseCrestEmbedAssets } = require("../Utils/Web/hogwartsEventAssets");
const { canAccessHouse, buildPrefectDeniedMessage, parseDiscordUserRef } = require("../Utils/Community/punticasaPrefectAccess");
const { HOGWARTS_HOUSE_POINT_PERIODS, housePointPeriodKey, findHousePointPeriod } = require("../Utils/Web/hogwartsHousePointPeriods");
const PREFIX = "punticasa_panel";
const MODAL_PREFIX = "punticasa_panel_modal";

function match(interaction) {
  const id = String(interaction?.customId || "");
  const isComponent =
    interaction?.isButton?.() ||
    interaction?.isStringSelectMenu?.() ||
    interaction?.isModalSubmit?.();
  if (!isComponent) return false;
  return id.startsWith(`${PREFIX}:`) || id.startsWith(`${MODAL_PREFIX}:`);
}

function parseComponentId(customId) {
  const parts = String(customId || "").split(":");
  if (parts[0] === PREFIX) {
    const kind = parts[1] || "";
    if (kind === "pick" || kind === "switch") {
      const viewTok = String(parts[3] || "").trim();
      return {
        root: PREFIX,
        kind,
        action: "",
        houseId: "",
        ownerId: parts[2] || "",
        view: viewTok === "mem" ? "members" : "dashboard",
        page: parts[4] || "0",
        periodKey: parts[5] || "",
      };
    }
    if (kind === "btn") {
      return {
        root: PREFIX,
        kind,
        action: parts[2] || "",
        houseId: parts[3] || "",
        ownerId: parts[4] || "",
        page: parts[5] || "0",
        periodKey: parts[6] || "",
      };
    }
    if (kind === "period") {
      return {
        root: PREFIX,
        kind,
        action: "",
        houseId: parts[2] || "",
        ownerId: parts[3] || "",
        page: parts[4] || "0",
        periodKey: "",
      };
    }
    return { root: PREFIX, kind, action: parts[2] || "", houseId: parts[3] || "", ownerId: parts[4] || "" };
  }
  if (parts[0] === MODAL_PREFIX) {
    return {
      root: MODAL_PREFIX,
      kind: "modal",
      action: parts[1] || "",
      houseId: parts[2] || "",
      ownerId: parts[3] || "",
    };
  }
  return null;
}

function buildHouseSwitchCustomId(ownerId, view = "dashboard", page = 0, periodKey = "") {
  const safeOwner = String(ownerId || "");
  if (view === "members") {
    const p = Math.max(0, Math.floor(Number(page) || 0));
    const pk = String(periodKey || "").trim();
    return pk
      ? `${PREFIX}:switch:${safeOwner}:mem:${p}:${pk}`
      : `${PREFIX}:switch:${safeOwner}:mem:${p}`;
  }
  return `${PREFIX}:switch:${safeOwner}`;
}

function assertOwner(interaction, ownerId) {
  return String(interaction?.user?.id || "") === String(ownerId || "");
}

async function denyUnlessPanelAccess(interaction, ownerId, houseId) {
  if (!assertOwner(interaction, ownerId)) {
    await interaction.reply({
      content: "<:vegax:1443934876440068179> Solo chi ha aperto il pannello può usarlo.",
      flags: 1 << 6,
    }).catch(() => null);
    return false;
  }
  if (!canAccessHouse(ownerId, houseId, interaction.client)) {
    await interaction.reply({
      content: buildPrefectDeniedMessage(ownerId, interaction.client),
      flags: 1 << 6,
    }).catch(() => null);
    return false;
  }
  return true;
}

function houseSelectOptions(eventCfg) {
  return HOUSES.map((houseId) => {
    const crest = String(eventCfg?.houses?.[houseId]?.crestUrl || "").trim();
    const meta = getHouseMeta(houseId, crest || undefined);
    return {
      label: meta?.label || houseId,
      value: houseId,
      description: String(meta?.motto || "").slice(0, 100),
    };
  });
}

function resolveMembersPeriodKey(data, options = {}) {
  const fromOpt = String(options.periodKey || "").trim();
  if (fromOpt && findHousePointPeriod(fromOpt)) return fromOpt;
  return String(data?.periodKey || housePointPeriodKey()?.key || "").trim();
}

function buildPeriodSelectRow(houseId, ownerId, page, currentPeriodKey) {
  const hid = normalizeHouseInput(houseId);
  const safeOwner = String(ownerId || "");
  const safePage = Math.max(0, Math.floor(Number(page) || 0));
  const current = String(currentPeriodKey || "").trim();
  return new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`${PREFIX}:period:${hid}:${safeOwner}:${safePage}`)
      .setPlaceholder("Anno accademico…")
      .addOptions(
        HOGWARTS_HOUSE_POINT_PERIODS.map((period) => ({
          label: period.label,
          value: period.key,
          description: String(period.rangeLabel || "").slice(0, 100),
          default: period.key === current,
        })),
      ),
  );
}

function buildHousePickerPayload(ownerId, client) {
  const eventCfg = resolveHogwartsEventConfig(client);
  const embed = new EmbedBuilder()
    .setColor("#6f4e37")
    .setTitle("Gestione casate")
    .setDescription(
      [
        "<:VC_Leaderboard:1482534806314287387> Seleziona una **casata** per aprire la dashboard.",
        "",
        "Da lì puoi consultare punti e classifica, aggiungere o togliere punti ed espellere uno smistato.",
      ].join("\n"),
    );
  const row = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`${PREFIX}:pick:${ownerId}`)
      .setPlaceholder("Scegli casata…")
      .addOptions(houseSelectOptions(eventCfg)),
  );
  return { embeds: [embed], components: [row] };
}

async function buildHouseDashboardPayload(client, guild, houseId, ownerId, options = {}) {
  const hid = normalizeHouseInput(houseId);
  const data = await fetchHouseDashboardData(client, guild.id, hid);
  if (!data) {
    return {
      embeds: [
        new EmbedBuilder()
          .setColor("#8b3a3a")
          .setTitle("Casata non valida")
          .setDescription("<:vegax:1443934876440068179> Casata non riconosciuta."),
      ],
      components: [],
    };
  }
  const eventCfg = resolveHogwartsEventConfig(client);
  const periodLine = data.periodLabel
    ? `**${data.periodLabel}**${data.periodRangeLabel ? ` (${data.periodRangeLabel})` : ""}`
    : "Periodo scolastico in corso";
  const embed = new EmbedBuilder()
    .setColor(data.color || "#6f4e37")
    .setTitle(data.houseLabel)
    .setDescription(
      [
        `<a:VC_StarBlue:1330194918043418674> **Punti annuali:** ${data.periodPoints.toLocaleString("it-IT")} · **${formatRankLabel(data.periodRank)}** in classifica`,
        `<a:VC_StarPink:1330194976440848500> **Punti totali:** ${data.totalPoints.toLocaleString("it-IT")} · **${formatRankLabel(data.totalRank)}**`,
        `<a:VC_StarPurple:1330195026688344156> **Smistati in casata:** ${data.sortedCount.toLocaleString("it-IT")}`,
        "",
        `*${periodLine}*`,
        options.footerNote ? `\n${options.footerNote}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  const crest = resolveHouseCrestEmbedAssets(client, hid, eventCfg?.houses?.[hid]?.crestUrl);
  if (crest.thumbnail) embed.setThumbnail(crest.thumbnail);
  const safeOwner = String(ownerId || "");
  const rowActions = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${PREFIX}:btn:add:${hid}:${safeOwner}`)
      .setLabel("Aggiungi punti")
      .setStyle(ButtonStyle.Success)
      .setEmoji("<:VC_addperson:1485419347068588073>"),
    new ButtonBuilder()
      .setCustomId(`${PREFIX}:btn:remove:${hid}:${safeOwner}`)
      .setLabel("Rimuovi punti")
      .setStyle(ButtonStyle.Danger)
      .setEmoji("<a:VC_Cross:1482532424570376253>"),
    new ButtonBuilder()
      .setCustomId(`${PREFIX}:btn:expel:${hid}:${safeOwner}`)
      .setLabel("Espelli smistato")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("<:VC_Lock:1482526739044368476>"),
    new ButtonBuilder()
      .setCustomId(`${PREFIX}:btn:refresh:${hid}:${safeOwner}`)
      .setLabel("Aggiorna")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("<:VC_Refresh:1473359252276904203>"),
    new ButtonBuilder()
      .setCustomId(`${PREFIX}:btn:members:${hid}:${safeOwner}:0:${data.periodKey || ""}`)
      .setLabel("Membri e punti")
      .setStyle(ButtonStyle.Secondary)
      .setEmoji("<:VC_addperson:1485419347068588073>"),
  );
  const rowNav = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(buildHouseSwitchCustomId(safeOwner, "dashboard"))
      .setPlaceholder("Cambia casata…")
      .addOptions(houseSelectOptions(eventCfg).map((opt) => ({
        ...opt,
        default: opt.value === hid,
      }))),
  );
  const components = [rowActions, rowNav];
  const payload = { embeds: [embed], components };
  if (crest.files.length) payload.files = crest.files;
  return payload;
}

async function buildHouseMembersPayload(client, guild, houseId, ownerId, page = 0, options = {}) {
  const hid = normalizeHouseInput(houseId);
  const data = await fetchHouseDashboardData(client, guild.id, hid);
  if (!data) {
    return buildHouseDashboardPayload(client, guild, houseId, ownerId, {
      footerNote: "<:vegax:1443934876440068179> Casata non valida.",
    });
  }
  const eventCfg = resolveHogwartsEventConfig(client);
  const viewPeriodKey = resolveMembersPeriodKey(data, options);
  const viewPeriod = findHousePointPeriod(viewPeriodKey);
  const rows = await fetchHouseMemberPointsLeaderboard(guild.id, data.eventKey, hid, {
    periodKey: viewPeriodKey,
  });
  const paged = paginateMemberRows(rows, page);
  const periodLabel = viewPeriod?.label
    ? `${viewPeriod.label}${viewPeriod.rangeLabel ? ` (${viewPeriod.rangeLabel})` : ""}`
    : data.periodLabel
      ? `periodo ${data.periodLabel}`
      : "periodo in corso";
  const lines = formatMemberPointsLines(paged.slice, paged.page * paged.pageSize);
  const embed = new EmbedBuilder()
    .setColor(data.color || "#6f4e37")
    .setTitle(`${data.houseLabel}`)
    .setDescription(
      [
        `<:VC_Leaderboard:1482534806314287387> **${paged.totalMembers}** smistati · pagina **${paged.page + 1}/${paged.totalPages}**`,
        `Punti **personali** del **${periodLabel}** (primo numero) e **totali dall'inizio evento** (secondo numero).`,
        "",
        ...lines,
        options.footerNote ? `\n${options.footerNote}` : "",
      ]
        .filter(Boolean)
        .join("\n"),
    );
  const crest = resolveHouseCrestEmbedAssets(client, hid, eventCfg?.houses?.[hid]?.crestUrl);
  if (crest.thumbnail) embed.setThumbnail(crest.thumbnail);
  const safeOwner = String(ownerId || "");
  const periodSuffix = viewPeriodKey ? `:${viewPeriodKey}` : "";
  const navButtons = [
    new ButtonBuilder()
      .setCustomId(`${PREFIX}:btn:dashboard:${hid}:${safeOwner}`)
      .setLabel("Dashboard")
      .setStyle(ButtonStyle.Primary)
      .setEmoji("<:VC_Refresh:1473359252276904203>"),
    new ButtonBuilder()
      .setCustomId(`${PREFIX}:btn:members_prev:${hid}:${safeOwner}:${paged.page}${periodSuffix}`)
      .setLabel("Indietro")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(paged.page <= 0),
    new ButtonBuilder()
      .setCustomId(`${PREFIX}:btn:members_next:${hid}:${safeOwner}:${paged.page}${periodSuffix}`)
      .setLabel("Avanti")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(paged.page >= paged.totalPages - 1),
  ];
  const rowActions = new ActionRowBuilder().addComponents(navButtons);
  const rowPeriod = buildPeriodSelectRow(hid, safeOwner, paged.page, viewPeriodKey);
  const rowNav = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(buildHouseSwitchCustomId(safeOwner, "members", paged.page, viewPeriodKey))
      .setPlaceholder("Cambia casata…")
      .addOptions(houseSelectOptions(eventCfg).map((opt) => ({
        ...opt,
        default: opt.value === hid,
      }))),
  );
  const payload = { embeds: [embed], components: [rowActions, rowPeriod, rowNav] };
  if (crest.files.length) payload.files = crest.files;
  return payload;
}

function buildPointsModal(action, houseId, ownerId) {
  const hid = normalizeHouseInput(houseId);
  const modal = new ModalBuilder()
    .setCustomId(`${MODAL_PREFIX}:${action}:${hid}:${ownerId}`)
    .setTitle(action === "add" ? "Aggiungi punti casata" : "Rimuovi punti casata");
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("points")
        .setLabel("Punti")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder("es. 50"),
    ),
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("reason")
        .setLabel("Motivo")
        .setStyle(TextInputStyle.Paragraph)
        .setRequired(false)
        .setPlaceholder("Opzionale"),
    ),
  );
  return modal;
}

function buildExpelModal(houseId, ownerId) {
  const hid = normalizeHouseInput(houseId);
  const modal = new ModalBuilder()
    .setCustomId(`${MODAL_PREFIX}:expel:${hid}:${ownerId}`)
    .setTitle("Espelli smistato");
  modal.addComponents(
    new ActionRowBuilder().addComponents(
      new TextInputBuilder()
        .setCustomId("user")
        .setLabel("Utente")
        .setStyle(TextInputStyle.Short)
        .setRequired(true)
        .setPlaceholder("@utente o ID Discord"),
    ),
  );
  return modal;
}

function formatExpelOutcomeNote(expelled, targetId) {
  if (!expelled.ok) {
    if (expelled.code === "wrong_house") {
      return `<:vegax:1443934876440068179> <@${targetId}> non è smistato in **${expelled.sortedHouse}**, non in questa casata.`;
    }
    if (expelled.code === "not_sorted") {
      return `<:vegax:1443934876440068179> <@${targetId}> non risulta smistato.`;
    }
    return "<:vegax:1443934876440068179> Espulsione non riuscita.";
  }
  return `<a:VC_Winner:1482535294757507255> <@${targetId}> espulso da **${expelled.houseLabel}**.`;
}

async function applyExpelFromModal(interaction, houseId, ownerId) {
  const targetId = parseDiscordUserRef(interaction.fields.getTextInputValue("user"), null);
  if (!targetId) {
    return { ok: false, message: "<:vegax:1443934876440068179> Indica un utente valido con **@menzione** o ID." };
  }
  const expelled = await expelSortedMemberFromHouse(
    interaction.client,
    interaction.guild,
    targetId,
    houseId,
    ownerId,
  );
  return { ok: expelled.ok, message: formatExpelOutcomeNote(expelled, targetId) };
}

async function applyPointsFromModal(interaction, action, houseId, ownerId) {
  const rawPts = String(interaction.fields.getTextInputValue("points") || "").trim();
  const reason = String(interaction.fields.getTextInputValue("reason") || "").trim();
  let points = Math.floor(Number(rawPts));
  if (!Number.isFinite(points) || points === 0) {
    return { ok: false, message: "<:vegax:1443934876440068179> Indica un numero di punti valido." };
  }
  if (action === "remove") points = -Math.abs(points);
  else points = Math.abs(points);
  if (Math.abs(points) > 5000) {
    return { ok: false, message: "<:vegax:1443934876440068179> Massimo **5000** punti per modifica." };
  }
  const result = await assignManualHousePoints(interaction.client, {
    guildId: interaction.guild.id,
    houseId,
    points,
    actorId: ownerId,
    reason,
  });
  if (!result.ok) {
    return { ok: false, message: "<:vegax:1443934876440068179> Impossibile aggiornare i punti." };
  }
  const delta = result.points > 0 ? `+${result.points}` : `${result.points}`;
  return {
    ok: true,
    message: `<a:VC_Winner:1482535294757507255> **${result.houseLabel}** ${delta} pt.${result.reason ? ` · ${result.reason}` : ""}`,
  };
}

async function execute(interaction) {
  const parsed = parseComponentId(interaction.customId);
  if (!parsed) return false;

  if (parsed.root === MODAL_PREFIX) {
    if (!(await denyUnlessPanelAccess(interaction, parsed.ownerId, parsed.houseId))) return true;
    // Modal Discord: risposta entro 3s. Espulsione/punti fanno DB+ruoli+DM → defer subito.
    const deferred = await interaction.deferUpdate().then(() => true).catch(() => false);
    if (parsed.action === "expel") {
      const outcome = await applyExpelFromModal(interaction, parsed.houseId, parsed.ownerId);
      const payload = await buildHouseDashboardPayload(
        interaction.client,
        interaction.guild,
        parsed.houseId,
        parsed.ownerId,
        { footerNote: outcome.message },
      );
      if (deferred) {
        await interaction.editReply(payload).catch(async () => {
          await interaction.message?.edit?.(payload).catch(() => null);
        });
      } else {
        await interaction.update(payload).catch(async () => {
          await interaction.reply({ ...payload, flags: 1 << 6 }).catch(() => null);
        });
      }
      return true;
    }
    const outcome = await applyPointsFromModal(interaction, parsed.action, parsed.houseId, parsed.ownerId);
    const payload = await buildHouseDashboardPayload(
      interaction.client,
      interaction.guild,
      parsed.houseId,
      parsed.ownerId,
      { footerNote: outcome.message },
    );
    if (deferred) {
      await interaction.editReply(payload).catch(async () => {
        await interaction.message?.edit?.(payload).catch(() => null);
      });
    } else {
      await interaction.update(payload).catch(async () => {
        await interaction.reply({ ...payload, flags: 1 << 6 }).catch(() => null);
      });
    }
    return true;
  }

  if (parsed.kind === "pick" || parsed.kind === "switch") {
    if (!assertOwner(interaction, parsed.ownerId)) {
      await interaction.reply({ content: "<:vegax:1443934876440068179> Solo chi ha aperto il pannello può usarlo.", flags: 1 << 6 }).catch(() => null);
      return true;
    }
    const houseId = String(interaction.values?.[0] || "").trim();
    if (!(await denyUnlessPanelAccess(interaction, parsed.ownerId, houseId))) return true;
    const keepMembers = parsed.kind === "switch" && parsed.view === "members";
    const payload = keepMembers
      ? await buildHouseMembersPayload(
          interaction.client,
          interaction.guild,
          houseId,
          parsed.ownerId,
          0,
          { periodKey: parsed.periodKey },
        )
      : await buildHouseDashboardPayload(interaction.client, interaction.guild, houseId, parsed.ownerId);
    await interaction.update(payload).catch(async () => {
      await interaction.reply({ ...payload, flags: 1 << 6 }).catch(() => null);
    });
    return true;
  }

  if (parsed.kind === "period") {
    if (!(await denyUnlessPanelAccess(interaction, parsed.ownerId, parsed.houseId))) return true;
    const periodKey = String(interaction.values?.[0] || "").trim();
    const payload = await buildHouseMembersPayload(
      interaction.client,
      interaction.guild,
      parsed.houseId,
      parsed.ownerId,
      Math.max(0, Number(parsed.page || 0)),
      { periodKey },
    );
    await interaction.update(payload).catch(() => null);
    return true;
  }

  if (parsed.kind === "btn") {
    if (!(await denyUnlessPanelAccess(interaction, parsed.ownerId, parsed.houseId))) return true;
    if (parsed.action === "add" || parsed.action === "remove") {
      await interaction.showModal(buildPointsModal(parsed.action, parsed.houseId, parsed.ownerId));
      return true;
    }
    if (parsed.action === "expel") {
      await interaction.showModal(buildExpelModal(parsed.houseId, parsed.ownerId));
      return true;
    }
    if (parsed.action === "refresh") {
      const payload = await buildHouseDashboardPayload(
        interaction.client,
        interaction.guild,
        parsed.houseId,
        parsed.ownerId,
      );
      await interaction.update(payload).catch(() => null);
      return true;
    }
    if (parsed.action === "members") {
      const payload = await buildHouseMembersPayload(
        interaction.client,
        interaction.guild,
        parsed.houseId,
        parsed.ownerId,
        Math.max(0, Number(parsed.page || 0)),
        { periodKey: parsed.periodKey },
      );
      await interaction.update(payload).catch(() => null);
      return true;
    }
    if (parsed.action === "members_prev" || parsed.action === "members_next") {
      let page = Math.max(0, Number(parsed.page || 0));
      if (parsed.action === "members_prev") page -= 1;
      if (parsed.action === "members_next") page += 1;
      const payload = await buildHouseMembersPayload(
        interaction.client,
        interaction.guild,
        parsed.houseId,
        parsed.ownerId,
        page,
        { periodKey: parsed.periodKey },
      );
      await interaction.update(payload).catch(() => null);
      return true;
    }
    if (parsed.action === "dashboard") {
      const payload = await buildHouseDashboardPayload(
        interaction.client,
        interaction.guild,
        parsed.houseId,
        parsed.ownerId,
      );
      await interaction.update(payload).catch(() => null);
      return true;
    }
  }

  return false;
}

module.exports = {
  name: "punticasaPanel",
  order: 12,
  match,
  execute,
  buildHousePickerPayload,
  buildHouseDashboardPayload,
  formatExpelOutcomeNote,
};