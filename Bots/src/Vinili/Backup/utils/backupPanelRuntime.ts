const {
  EmbedBuilder,
  ModalBuilder,
  TextInputBuilder,
  TextInputStyle,
  ActionRowBuilder,
  ButtonBuilder,
  ButtonStyle,
} = require("discord.js") as typeof import("discord.js");
const {
  buildBackupPanelNavRow,
  SECTION_HOME,
} = require("./backupPanelNav") as typeof import("./backupPanelNav");
const { renderList } = require("../discord/buttons/backupList") as typeof import("../discord/buttons/backupList");

const MODAL_ROOT = "backup_panel_modal";

function formatBackupOpenButtonId(ownerId?, action?) {
  return `backup_panel:open:${String(action)}:${String(ownerId)}`;
}

function parseBackupPanelOpenButtonId(customId?) {
  const parts = String(customId || "").split(":");
  if (parts.length < 4 || parts[0] !== "backup_panel" || parts[1] !== "open") return null;
  const action = String(parts[2] || "").toLowerCase();
  const ownerId = String(parts[3] || "");
  if (!["info", "load", "delete"].includes(action)) return null;
  if (!/^\d{16,20}$/.test(ownerId)) return null;
  return { action, ownerId };
}

function parseBackupPanelModalCustomId(customId?) {
  const parts = String(customId || "").split(":");
  if (parts.length < 3 || parts[0] !== MODAL_ROOT) return null;
  const scope = String(parts[1] || "").toLowerCase();
  const ownerId = String(parts[2] || "");
  if (!["info", "load", "delete"].includes(scope)) return null;
  if (!/^\d{16,20}$/.test(ownerId)) return null;
  return { scope, ownerId };
}

function buildBackupPanelModal(scope?, ownerId?) {
  const s = String(scope || "").toLowerCase();
  const o = String(ownerId);
  const title =
    s === "info"
      ? "Info backup"
      : s === "load"
        ? "Carica backup"
        : "Elimina backup";
  const modal = new ModalBuilder()
    .setCustomId(`${MODAL_ROOT}:${s}:${o}`)
    .setTitle(title.slice(0, 45));
  const idRow = new ActionRowBuilder().addComponents(
    new TextInputBuilder()
      .setCustomId("backup_id")
      .setLabel("Backup ID (o guildId:backupId)")
      .setStyle(TextInputStyle.Short)
      .setRequired(true)
      .setPlaceholder("es. ABC123 o 123456789:ABC123"),
  );
  const rows = [idRow];
  if (s === "load") {
    rows.push(
      new ActionRowBuilder().addComponents(
        new TextInputBuilder()
          .setCustomId("messages_limit")
          .setLabel("Limite messaggi (vuoto=default, 0=tutti)")
          .setStyle(TextInputStyle.Short)
          .setRequired(false)
          .setPlaceholder("1000"),
      ),
    );
  }
  return modal.addComponents(...rows);
}

function buildBackupHomeEmbed(guild?) {
  return new EmbedBuilder()
    .setColor("#3498db")
    .setTitle("<:VC_InactiveStatus:1482526984234860574> Centro backup")
    .setDescription(
      [
        "Da qui puoi **creare** uno snapshot, vedere la **lista**, aprire **info**, **caricare** o **eliminare** un backup.",
        "",
        "Usa il **menu** qui sotto. Per inserire l’ID usa **Apri modulo** nelle sezioni Info / Carica / Elimina.",
      ].join("\n"),
    )
    .setFooter({ text: guild?.name ? String(guild.name).slice(0, 80) : "Server" });
}

function buildBackupFormIntroEmbed(title?, bodyLines?) {
  return new EmbedBuilder()
    .setColor("#3498db")
    .setTitle(title)
    .setDescription(bodyLines.join("\n"));
}

async function buildBackupPanelPayload(guild?, ownerId?, section = SECTION_HOME) {
  const o = String(ownerId);
  const sec = String(section || SECTION_HOME).toLowerCase();
  const nav = buildBackupPanelNavRow(o, sec);

  if (sec === "list") {
    return renderList(o, 1, true);
  }

  if (sec === "info") {
    const embed = buildBackupFormIntroEmbed(
      "<:VC_InactiveStatus:1482526984234860574> Info backup",
      [
        "Incolla l’ID del backup nel modulo (formato `BACKUPID` oppure `guildId:backupId` se serve).",
        "",
        "Poi **Apri modulo** e conferma.",
      ],
    );
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(formatBackupOpenButtonId(o, "info"))
        .setStyle(ButtonStyle.Primary)
        .setLabel("Apri modulo")
        .setEmoji("<:VC_Modifica:1478859646587633717>"),
    );
    return { embeds: [embed], components: [nav, row] };
  }

  if (sec === "load") {
    const embed = buildBackupFormIntroEmbed(
      "<a:VC_Loading:1482526818278969578> Carica backup",
      [
        "Il caricamento sovrascrive dati del server: segui il wizard dopo aver inserito l’ID.",
        "",
        "**Limite messaggi** (opzionale): lascia vuoto per il default, **0** per tutti (max 50000).",
      ],
    );
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(formatBackupOpenButtonId(o, "load"))
        .setStyle(ButtonStyle.Primary)
        .setLabel("Apri modulo")
        .setEmoji("<:VC_Modifica:1478859646587633717>"),
    );
    return { embeds: [embed], components: [nav, row] };
  }

  if (sec === "delete") {
    const embed = buildBackupFormIntroEmbed(
      "<:VC_purge:1478861828271636561> Elimina backup",
      [
        "Dopo il modulo vedrai la **conferma** sul messaggio del pannello.",
        "",
        "L’operazione è **irreversibile**.",
      ],
    );
    const row = new ActionRowBuilder().addComponents(
      new ButtonBuilder()
        .setCustomId(formatBackupOpenButtonId(o, "delete"))
        .setStyle(ButtonStyle.Danger)
        .setLabel("Apri modulo")
        .setEmoji("<:VC_Modifica:1478859646587633717>"),
    );
    return { embeds: [embed], components: [nav, row] };
  }

  return {
    embeds: [buildBackupHomeEmbed(guild)],
    components: [nav],
  };
}

export = {
  buildBackupPanelPayload,
  buildBackupPanelModal,
  parseBackupPanelModalCustomId,
  parseBackupPanelOpenButtonId,
  SECTION_HOME,
};