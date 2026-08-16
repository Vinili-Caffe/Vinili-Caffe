const { EmbedBuilder } = require("discord.js");
const IDs = require("../Utils/Config/ids");
const { enqueueSiteInAppNotification } = require("../Utils/Web/siteInAppNotificationsService");
const { applyWebsiteUnmute } = require("../Events/interaction/unmuteWebsiteHandlers");

const ACC_PREFIX = "website_unmute_acc";
const REJ_PREFIX = "website_unmute_rej";
const EPHEMERAL = 1 << 6;
const UNMUTE_ACCEPTED_COLOR = "#2ECC71";
const UNMUTE_REJECTED_COLOR = "#ED4245";

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

async function deleteUnmuteStarterThread(message) {
  if (!message?.id) return;
  let thread = message.thread;
  if (!thread) {
    const full = await message.fetch({ force: true }).catch(() => null);
    thread = full?.thread || null;
  }
  if (!thread) return;
  await thread.delete("Richiesta unmute.").catch(() => null);
}

function recolorEmbeds(embeds, color) {
  return (Array.isArray(embeds) ? embeds : []).map((embed) => EmbedBuilder.from(embed).setColor(color));
}

async function setUnmuteMessageStatusColor(message, color) {
  if (!message?.editable) return;
  const embeds = recolorEmbeds(message.embeds, color);
  await message.edit({ embeds, components: [] }).catch(() => null);
}

async function execute(interaction) {
  const { accept, uid } = parseTargetUserId(interaction.customId);
  if (!/^\d{17,20}$/.test(uid)) {
    await interaction
      .reply({ content: "<a:VC_Cross:1482532424570376253> ID utente non valido.", flags: EPHEMERAL })
      .catch(() => null);
    return;
  }
  if (!hasHighStaffRole(interaction)) {
    await interaction
      .reply({
        content: "<a:VC_Alert:1482706673176150077> Questo bottone è riservato all'High Staff.",
        flags: EPHEMERAL,
      })
      .catch(() => null);
    return;
  }
  const guild = interaction.guild;
  if (!guild) {
    await interaction
      .reply({ content: "<a:VC_Cross:1482532424570376253> Guild non disponibile.", flags: EPHEMERAL })
      .catch(() => null);
    return;
  }
  const msg = interaction.message;
  const messageId = String(msg?.id || "").trim();
  await interaction.deferUpdate().catch(() => null);

  if (accept) {
    const result = await applyWebsiteUnmute(guild, uid, interaction.client);
    if (!result.ok) {
      const staffNote =
        result.reason === "not_in_guild"
          ? "L'utente non è più nel server: impossibile completare l'unmute."
          : "Impossibile completare l'unmute.";
      await interaction
        .followUp({ content: `<a:VC_Cross:1482532424570376253> ${staffNote}`, flags: EPHEMERAL })
        .catch(() => null);
      if (result.reason === "not_in_guild") {
        try {
          await enqueueSiteInAppNotification({
            guildId: guild.id,
            userId: uid,
            title: "Richiesta unmute accettata",
            body: "Lo staff ha accettato la tua richiesta unmute, ma non risulti nel server. Rientra e contatta lo staff se sei ancora mutato.",
            kind: "mod",
            openUrl: "/unmute",
            dedupeKey: `unmute-acc:${uid}:${messageId}`,
            dedupeWindowMs: 86_400_000,
          });
        } catch (_) {}
      }
    } else {
      try {
        await enqueueSiteInAppNotification({
          guildId: guild.id,
          userId: uid,
          title: "Richiesta unmute accettata",
          body: "Lo staff ha accettato la tua richiesta unmute: puoi di nuovo scrivere nel server.",
          kind: "mod",
          openUrl: "/unmute",
          dedupeKey: `unmute-acc:${uid}:${messageId}`,
          dedupeWindowMs: 86_400_000,
        });
      } catch (_) {}
      await interaction
        .followUp({ content: "<a:VC_Verified:1482532479637127188> Unmute completato.", flags: EPHEMERAL })
        .catch(() => null);
    }
  } else {
    try {
      await enqueueSiteInAppNotification({
        guildId: guild.id,
        userId: uid,
        title: "Richiesta unmute rifiutata",
        body: "Lo staff ha rifiutato la tua richiesta unmute. Puoi inviare una nuova richiesta dopo il cooldown di 15 giorni sul sito.",
        kind: "mod",
        openUrl: "/unmute",
        dedupeKey: `unmute-rej:${uid}:${messageId}`,
        dedupeWindowMs: 86_400_000,
      });
    } catch (_) {}
    await interaction
      .followUp({ content: "<a:VC_Cross:1482532424570376253> Richiesta rifiutata.", flags: EPHEMERAL })
      .catch(() => null);
  }

  if (msg?.editable) {
    await setUnmuteMessageStatusColor(msg, accept ? UNMUTE_ACCEPTED_COLOR : UNMUTE_REJECTED_COLOR);
  }
  await deleteUnmuteStarterThread(msg);
}

module.exports = { name: "websiteUnmuteSite", order: 23, match, execute };
