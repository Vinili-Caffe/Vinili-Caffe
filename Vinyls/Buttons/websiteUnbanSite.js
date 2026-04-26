const IDs = require("../Utils/Config/ids");
const { enqueueSiteInAppNotification } = require("../Utils/Web/siteInAppNotificationsService");

const ACC_PREFIX = "website_unban_acc";
const REJ_PREFIX = "website_unban_rej";
const EPHEMERAL = 1 << 6;

function hasHighStaffRole(interaction) {
  const highStaffRoleId = IDs?.roles?.HighStaff ? String(IDs.roles.HighStaff) : "";
  if (!highStaffRoleId) return false;
  return Boolean(interaction?.member?.roles?.cache?.has(highStaffRoleId));
}

function match(interaction) {
  const id = String(interaction?.customId || "");
  return id.startsWith(`${ACC_PREFIX}:`) || id.startsWith(`${REJ_PREFIX}:`);
}

function parseTargetUserId(customId) {
  const id = String(customId || "");
  const accept = id.startsWith(`${ACC_PREFIX}:`);
  const prefix = accept ? `${ACC_PREFIX}:` : `${REJ_PREFIX}:`;
  const uid = id.startsWith(prefix) ? id.slice(prefix.length).trim() : "";
  return { accept, uid };
}

async function execute(interaction) {
  const { accept, uid } = parseTargetUserId(interaction.customId);
  if (!/^\d{17,20}$/.test(uid)) {
    await interaction.reply({ content: "ID utente non valido.", flags: EPHEMERAL }).catch(() => null);
    return;
  }
  if (!hasHighStaffRole(interaction)) {
    await interaction.reply({
      content: "<a:VC_Alert:1482706673176150077> Questo bottone è riservato all'High Staff.",
      flags: EPHEMERAL,
    }).catch(() => null);
    return;
  }
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: "Guild non disponibile.", flags: EPHEMERAL }).catch(() => null);
    return;
  }
  const msg = interaction.message;
  const messageId = String(msg?.id || "").trim();
  await interaction.deferUpdate().catch(() => null);
  let staffNote = "";
  let acceptNotifyUser = false;
  let acceptUserBody = "";
  if (accept) {
    try {
      await guild.members.unban(uid, "Richiesta unban dal sito — accettata dallo staff");
      staffNote = "Unban eseguito su Discord.";
      acceptNotifyUser = true;
      acceptUserBody = "Lo staff ha accettato la tua richiesta unban: puoi rientrare nel server con l'invite ufficiale.";
    } catch (err) {
      const code = err?.code;
      const notBanned =
        code === 10026 || String(err?.message || "").toLowerCase().includes("not banned");
      staffNote = notBanned
        ? "L'utente non risultava bannato (unban non necessario)."
        : "Impossibile completare l'unban: verifica permessi del bot e stato del ban.";
      await interaction.followUp({ content: `<:cancel:1461730653677551691> ${staffNote}`, flags: EPHEMERAL }).catch(() => null);
      if (notBanned) {
        acceptNotifyUser = true;
        acceptUserBody = "Lo staff ha accettato la tua richiesta: non risultavi più bannato sul server.";
      }
    }
    if (acceptNotifyUser && acceptUserBody) {
      try {
        await enqueueSiteInAppNotification({
          guildId: guild.id,
          userId: uid,
          title: "Richiesta unban accettata",
          body: acceptUserBody,
          kind: "mod",
          openUrl: "/unban",
          dedupeKey: `unban-acc:${uid}:${messageId}`,
          dedupeWindowMs: 86_400_000,
        });
      } catch (_) {}
    }
  } else {
    try {
      await enqueueSiteInAppNotification({
        guildId: guild.id,
        userId: uid,
        title: "Richiesta unban rifiutata",
        body: "Lo staff ha rifiutato la tua richiesta unban. Puoi inviare una nuova richiesta dopo il cooldown di 24 ore sul sito, se applicabile.",
        kind: "mod",
        openUrl: "/unban",
        dedupeKey: `unban-rej:${uid}:${messageId}`,
        dedupeWindowMs: 86_400_000,
      });
    } catch (_) {}
  }
  if (msg?.editable) {
    await msg.edit({ components: [] }).catch(() => null);
  }
  if (accept && staffNote === "Unban eseguito su Discord.") {
    await interaction.followUp({ content: "<:success:1461731530333229226> Unban completato.", flags: EPHEMERAL }).catch(() => null);
  }
  if (!accept) {
    await interaction.followUp({ content: "<:cancel:1461730653677551691> Richiesta rifiutata.", flags: EPHEMERAL }).catch(() => null);
  }
}

module.exports = { name: "websiteUnbanSite", order: 22, match, execute };