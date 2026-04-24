const {
  EmbedBuilder,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
  StringSelectMenuBuilder,
  MessageFlags,
} = require("discord.js");

const PRIVATE_FLAG = MessageFlags.Ephemeral;
const STATICS_LAST = 2;

const MODULE_OPTIONS = [
  { label: "AntiNuke", value: "antinuke", description: "Panic manuale e modulo" },
  { label: "AutoMod", value: "automod", description: "Panic heat / moduli" },
  { label: "JoinGate", value: "joingate", description: "Filtri ingresso" },
  { label: "JoinRaid", value: "joinraid", description: "Rilevamento raid" },
  { label: "Lock commands", value: "lockcommands", description: "Lock comandi raid/panic" },
  { label: "Tutti (all)", value: "all", description: "Tutti i moduli" },
];

function match(interaction) {
  const id = String(interaction?.customId || "");
  if (!interaction?.isButton?.() && !interaction?.isStringSelectMenu?.()) return false;
  return id.startsWith("security_panel:");
}

function notYourPanelReply() {
  return {
    content: "<:vegax:1443934876440068179> Solo chi ha aperto il pannello può usarlo.",
    flags: PRIVATE_FLAG,
  };
}

function buildPagerRow(kind, ownerId, page, lastIdx) {
  const p = Math.max(0, Math.min(lastIdx, page));
  const base = `security_panel:${kind}:${ownerId}`;
  const back = `security_panel:back:${ownerId}`;
  return new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`${base}:${p}:first`)
      .setLabel("<<")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(p <= 0),
    new ButtonBuilder()
      .setCustomId(`${base}:${p}:prev`)
      .setLabel("<")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(p <= 0),
    new ButtonBuilder()
      .setCustomId(`${base}:${p}:next`)
      .setLabel(">")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(p >= lastIdx),
    new ButtonBuilder()
      .setCustomId(`${base}:${p}:last`)
      .setLabel(">>")
      .setStyle(ButtonStyle.Secondary)
      .setDisabled(p >= lastIdx),
    new ButtonBuilder().setCustomId(back).setLabel("Menu").setStyle(ButtonStyle.Primary),
  );
}

function buildPickRows(ownerId, action) {
  const rowPick = new ActionRowBuilder().addComponents(
    new StringSelectMenuBuilder()
      .setCustomId(`security_panel:pick:${ownerId}:${action}`)
      .setPlaceholder("Scegli un target…")
      .addOptions(MODULE_OPTIONS),
  );
  const rowBack = new ActionRowBuilder().addComponents(
    new ButtonBuilder()
      .setCustomId(`security_panel:back:${ownerId}`)
      .setLabel("Menu")
      .setStyle(ButtonStyle.Secondary),
  );
  return [rowPick, rowBack];
}

async function execute(interaction) {
  const sec = require("../Prefix/Admin/security");
  const guild = interaction.guild;
  const member = interaction.member;
  if (!guild || !member) return false;
  if (!sec.hasStaffAccess(member, guild)) {
    await interaction
      .reply({
        content: "<:vegax:1443934876440068179> Non hai i permessi.",
        flags: PRIVATE_FLAG,
      })
      .catch(() => {});
    return true;
  }

  const id = String(interaction.customId || "");
  const parts = id.split(":");

  let ownerId = "";
  if (parts[1] === "hub" || parts[1] === "pick" || parts[1] === "back") {
    ownerId = String(parts[2] || "");
  } else if (["status", "panic", "statics"].includes(parts[1])) {
    ownerId = String(parts[2] || "");
  }
  if (!/^\d{16,20}$/.test(ownerId)) return false;

  if (String(interaction.user?.id || "") !== ownerId) {
    await interaction.reply(notYourPanelReply()).catch(() => {});
    return true;
  }

  const tryUpdate = async (payload) => {
    await interaction.update(payload).catch(async () => {
      await interaction.reply({ ...payload, flags: PRIVATE_FLAG }).catch(() => {});
    });
  };

  if (interaction.isStringSelectMenu() && parts[1] === "hub") {
    const v = String(interaction.values?.[0] || "");
    if (v === "view_status") {
      const pages = await sec.buildStatusEmbeds(guild);
      const last = pages.length - 1;
      await tryUpdate({
        embeds: [pages[0]],
        components: [buildPagerRow("status", ownerId, 0, last)],
      });
      return true;
    }
    if (v === "view_panic") {
      const pages = await sec.buildPanicStatusEmbeds(guild);
      const last = pages.length - 1;
      await tryUpdate({
        embeds: [pages[0]],
        components: [buildPagerRow("panic", ownerId, 0, last)],
      });
      return true;
    }
    if (v === "view_statics") {
      await tryUpdate({
        embeds: [sec.buildSecurityStaticsPanelEmbed(guild.id, 0)],
        components: [buildPagerRow("statics", ownerId, 0, STATICS_LAST)],
      });
      return true;
    }
    if (v === "pick_enable" || v === "pick_disable") {
      if (!sec.hasPanicControlAccess(member, guild)) {
        await interaction
          .reply({
            content: "<:vegax:1443934876440068179> Solo Founder può abilitare o disabilitare i moduli.",
            flags: PRIVATE_FLAG,
          })
          .catch(() => {});
        return true;
      }
      const action = v === "pick_enable" ? "enable" : "disable";
      const embed = new EmbedBuilder()
        .setColor("#6f4e37")
        .setTitle(action === "enable" ? "Abilita moduli" : "Disabilita moduli")
        .setDescription("Scegli il **target** da applicare.");
      await tryUpdate({ embeds: [embed], components: buildPickRows(ownerId, action) });
      return true;
    }
    await interaction
      .reply({
        content: "<:vegax:1443934876440068179> Selezione non valida.",
        flags: PRIVATE_FLAG,
      })
      .catch(() => {});
    return true;
  }

  if (interaction.isStringSelectMenu() && parts[1] === "pick") {
    const action = String(parts[3] || "").toLowerCase();
    if (!["enable", "disable"].includes(action)) return false;
    if (!sec.hasPanicControlAccess(member, guild)) {
      await interaction
        .reply({
          content: "<:vegax:1443934876440068179> Solo Founder può abilitare o disabilitare i moduli.",
          flags: PRIVATE_FLAG,
        })
        .catch(() => {});
      return true;
    }
    const target = sec.parsePanicTarget(interaction.values?.[0]);
    if (!target) {
      await interaction
        .reply({
          content: "<:vegax:1443934876440068179> Target non valido.",
          flags: PRIVATE_FLAG,
        })
        .catch(() => {});
      return true;
    }
    const results = await sec.runSecurityAction(action, target, guild, interaction.user.id);
    const okCount = results.filter((r) => r.ok).length;
    const changedCount = results.filter((r) => r.changed).length;
    const lines = results.map((r) => {
      const status = r.ok ? "OK" : "ERR";
      const changed = r.changed ? "changed" : "no-change";
      return `- **${r.system}**: ${status} (${changed}) - ${r.note}`;
    });
    await sec
      .sendSecurityAuditLog(guild, {
        actorId: interaction.user.id,
        action: action === "enable" ? "security.enable" : "security.disable",
        details: [
          `Target: \`${target}\``,
          `Results: ${okCount}/${results.length} ok, changed ${changedCount}`,
        ],
        color: okCount === results.length ? "#57F287" : "#FEE75C",
      })
      .catch(() => null);

    const resultEmbed = new EmbedBuilder()
      .setColor(okCount === results.length ? "#57F287" : "#FEE75C")
      .setTitle(action === "enable" ? "Security Enable" : "Security Disable")
      .setDescription(
        [
          `Target: **${target}**`,
          `Success: **${okCount}/${results.length}**`,
          `Changed: **${changedCount}**`,
          "",
          ...lines,
        ].join("\n"),
      );
    const rowBack = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(`security_panel:back:${ownerId}`)
        .setLabel("Menu")
        .setStyle(ButtonStyle.Primary),
    );
    await tryUpdate({ embeds: [resultEmbed], components: [rowBack] });
    return true;
  }

  if (interaction.isButton() && parts[1] === "back") {
    const payload = sec.buildSecurityHubPayload(guild, ownerId, interaction.user, member);
    await tryUpdate(payload);
    return true;
  }

  if (interaction.isButton() && ["status", "panic", "statics"].includes(parts[1])) {
    const page = Number(parts[3]);
    const op = String(parts[4] || "").toLowerCase();
    if (!Number.isFinite(page)) return false;
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
    } else return false;

    if (parts[1] === "status") {
      const pages = await sec.buildStatusEmbeds(guild);
      const last = pages.length - 1;
      nextPage = Math.max(0, Math.min(last, nextPage));
      await tryUpdate({
        embeds: [pages[nextPage]],
        components: [buildPagerRow("status", ownerId, nextPage, last)],
      });
      return true;
    }
    if (parts[1] === "panic") {
      const pages = await sec.buildPanicStatusEmbeds(guild);
      const last = pages.length - 1;
      nextPage = Math.max(0, Math.min(last, nextPage));
      await tryUpdate({
        embeds: [pages[nextPage]],
        components: [buildPagerRow("panic", ownerId, nextPage, last)],
      });
      return true;
    }
    if (parts[1] === "statics") {
      nextPage = Math.max(0, Math.min(STATICS_LAST, nextPage));
      await tryUpdate({
        embeds: [sec.buildSecurityStaticsPanelEmbed(guild.id, nextPage)],
        components: [buildPagerRow("statics", ownerId, nextPage, STATICS_LAST)],
      });
      return true;
    }
  }

  return false;
}

module.exports = { name: "securityPanel", order: 12, match, execute };