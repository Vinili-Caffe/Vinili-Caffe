const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const IDs = require("../Utils/Config/ids") as typeof import("../Utils/Config/ids");
const { enqueueSiteInAppNotification } = require("../Web/siteInAppNotificationsService") as typeof import("../Web/siteInAppNotificationsService");
const {
  isDiscordWorkflowUiEnabled,
  replyWorkflowMovedToSite,
} = require("../Web/discordWorkflowUiGate") as typeof import("../Web/discordWorkflowUiGate");
const ACC_PREFIX = "website_unban_acc";
const REJ_PREFIX = "website_unban_rej";
const EPHEMERAL = 1 << 6;
const UNBAN_ACCEPTED_COLOR = "#2ECC71";
const UNBAN_REJECTED_COLOR = "#ED4245";

function hasHighStaffRole(interaction?) {
  const highStaffRoleId = IDs?.roles?.HighStaff ? String(IDs.roles.HighStaff) : "";
  if (!highStaffRoleId) return false;
  return Boolean(interaction?.member?.roles?.cache?.has(highStaffRoleId));
}

function match(interaction?) {
  const id = String(interaction?.customId || "");
  return id.startsWith(`${ACC_PREFIX}:`) || id.startsWith(`${REJ_PREFIX}:`);
}

function parseTargetUserId(customId?) {
  const id = String(customId || "");
  const accept = id.startsWith(`${ACC_PREFIX}:`);
  const prefix = accept ? `${ACC_PREFIX}:` : `${REJ_PREFIX}:`;
  const uid = id.startsWith(prefix) ? id.slice(prefix.length).trim() : "";
  return { accept, uid };
}

async function deleteUnbanStarterThread(message?) {
  if (!message?.id) return;
  let thread = message.thread;
  if (!thread) {
    const full = await message.fetch({ force: true }).catch(() => null);
    thread = full?.thread || null;
  }
  if (!thread) return;
  await thread.delete("Richiesta unban.").catch(() => null);
}

function recolorEmbeds(embeds?, color?) {
  return (Array.isArray(embeds) ? embeds : [])
    .map((embed?) => EmbedBuilder.from(embed).setColor(color));
}

async function setUnbanMessageStatusColor(message?, color?) {
  if (!message?.editable) return;
  const embeds = recolorEmbeds(message.embeds, color);
  await message.edit({ embeds, components: [] }).catch(() => null);
}

async function execute(interaction?) {
  if (!isDiscordWorkflowUiEnabled()) {
    return replyWorkflowMovedToSite(interaction, "appelliInbox");
  }
  const { accept, uid } = parseTargetUserId(interaction.customId);
  if (!/^\d{17,20}$/.test(uid)) {
    await interaction.reply({ content: "<a:VC_Cross:1482532424570376253> ID utente non valido.", flags: EPHEMERAL }).catch(() => null);
    return;
  }
  if (!hasHighStaffRole(interaction)) {
    await interaction.reply({ content: "<a:VC_Alert:1482706673176150077> Questo bottone è riservato all'High Staff.", flags: EPHEMERAL }).catch(() => null);
    return;
  }
  const guild = interaction.guild;
  if (!guild) {
    await interaction.reply({ content: "<a:VC_Cross:1482532424570376253> Guild non disponibile.", flags: EPHEMERAL }).catch(() => null);
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
      await guild.members.unban(uid, "Richiesta unban accettata");
      staffNote = "Unban completato.";
      acceptNotifyUser = true;
      acceptUserBody = "Lo staff ha accettato la tua richiesta unban: puoi rientrare nel server con l'invito ufficiale o tramite il sito.";
    } catch (err) {
      const code = err?.code;
      const notBanned =
        code === 10026 || String(err?.message || "").toLowerCase().includes("not banned");
      staffNote = notBanned
        ? "L'utente non risultava bannato."
        : "Impossibile completare l'unban: verifica permessi del bot e stato del ban.";
      await interaction.followUp({ content: `<a:VC_Cross:1482532424570376253> ${staffNote}`, flags: EPHEMERAL }).catch(() => null);
      if (notBanned) {
        acceptNotifyUser = true;
        acceptUserBody = "Lo staff ha accettato la tua richiesta: puoi rientrare nel server con l'invito ufficiale o tramite il sito.";
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
        body: "Lo staff ha rifiutato la tua richiesta unban. Puoi inviare una nuova richiesta dopo il cooldown di 15 giorni sul sito.",
        kind: "mod",
        openUrl: "/unban",
        dedupeKey: `unban-rej:${uid}:${messageId}`,
        dedupeWindowMs: 86_400_000,
      });
    } catch (_) {}
  }
  if (msg?.editable) {
    await setUnbanMessageStatusColor(msg, accept ? UNBAN_ACCEPTED_COLOR : UNBAN_REJECTED_COLOR);
  }
  await deleteUnbanStarterThread(msg);
  if (accept && staffNote === "Unban completato.") {
    await interaction.followUp({ content: "<a:VC_Verified:1482532479637127188> Unban completato.", flags: EPHEMERAL }).catch(() => null);
  }
  if (!accept) {
    await interaction.followUp({ content: "<a:VC_Cross:1482532424570376253> Richiesta rifiutata.", flags: EPHEMERAL }).catch(() => null);
  }
}

export = { name: "websiteUnbanSite", order: 22, match, execute };