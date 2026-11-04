const { checkButtonPermission, checkStringSelectPermission, checkModalPermission, buildGlobalPermissionDeniedEmbed, buildGlobalChannelDeniedEmbed, buildGlobalNotYourControlEmbed, } = require("../../../Moderation/utils/commandPermissions") as typeof import("../../../Moderation/utils/commandPermissions");
const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { siteUserProfilePageDiscordRef, siteTicketsPageDiscordRef } = require("../../../../shared/web/siteTicketsPageRef") as typeof import("../../../../shared/web/siteTicketsPageRef");
const { E } = require("../../../../shared/emojis/emojiCatalog") as typeof import("../../../../shared/emojis/emojiCatalog");
const {
  PRIVATE_FLAG,
  isAckError,
  isTransientDiscordError,
  acquireButtonSpamGuard,
  sendPrivateInteractionResponse,
} = require("../../../../shared/discord/interactionAck") as typeof import("../../../../shared/discord/interactionAck");

const MONO_GUILD_DENIED = "Questo bot è utilizzabile solo nei server autorizzati.";
const TICKET_OPEN_CONTROLS = new Set([
  "ticket_partnership",
  "ticket_highstaff",
  "ticket_supporto",
  "ticket_perks",
  "ticket_open_menu",
]);
function isTicketOpenControlId(customId?) {
  const id = String(customId || "");
  return TICKET_OPEN_CONTROLS.has(id) || id.startsWith("tkp:");
}

function resolveNotOwnerPanelHint(customId?) {
  const id = String(customId || "").trim();
  if (!id) return { label: "pannello", command: null };
  if (id.startsWith("profile_panel:") || id.startsWith("tprof:")) {
    return { label: "profilo", command: null, siteReopen: siteUserProfilePageDiscordRef() };
  }
  if (
    id.startsWith("customrole_") ||
    id.startsWith("customvoc_") ||
    id.startsWith("customreaction_") ||
    id.startsWith("avatar_") ||
    id.startsWith("banner_") ||
    id.startsWith("bh_") ||
    id.startsWith("privacy_") ||
    id.startsWith("nodm_") ||
    id.startsWith("no_dm")
  ) {
    return { label: "pannello", command: null, siteReopen: siteUserProfilePageDiscordRef() };
  }
  if (id.startsWith("staff_pm_shop:") || id.startsWith("staff_val_neg_trade:")) {
    return { label: "pannello staff", command: null };
  }
  if (id.startsWith("security_panel:")) return { label: "pannello", command: "+security" };
  if (id.startsWith("backup_") || id.startsWith("backup-load_") || id.startsWith("backup_list_")) {
    return { label: "pannello", command: "+backup" };
  }
  if (id.startsWith("level_panel")) return { label: "pannello", command: "+level" };
  if (id.startsWith("ticket_panel_") || id.startsWith("ticket_")) {
    return { label: "pannello", command: null, siteReopen: siteTicketsPageDiscordRef() };
  }
  if (id.startsWith("mpr:")) return { label: "pannello", command: null };
  return { label: "pannello", command: null };
}

function buildDeniedEmbed(gate?, controlLabel?, viewer = null, customId = "") {
  if (gate.reason === "tenant_profile_not_owner") {
    return new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle(`${E.VC_Lock} **Accesso negato**`)
      .setDescription(
        `${E.VC_Attention} Puoi usare solo **il tuo** pannello profilo partner. Esegui di nuovo [Personalizza](https://www.viniliecaffe.it/personalizza/) per aprirlo.`,
      );
  }

  if (gate.reason === "not_owner") {
    const hint = resolveNotOwnerPanelHint(customId);
    if (gate.ownerId) {
      const reopen = hint.siteReopen
        ? ` Apri il ${hint.siteReopen} per aprirne uno tuo.`
        : hint.command
          ? ` Usa \`${hint.command}\` per aprirne uno tuo.`
          : " Usa solo i tuoi controlli.";
      return new EmbedBuilder()
        .setColor("#6f4e37")
        .setTitle(`${E.VC_Lock} **Accesso negato**`)
        .setDescription(
          `${E.VC_Attention} Questo ${hint.label} appartiene a <@${gate.ownerId}>.${reopen}`,
        );
    }
    return buildGlobalNotYourControlEmbed();
  }

  if (gate.reason === "candidature_blacklist") {
    return buildGlobalPermissionDeniedEmbed(
      [],
      controlLabel,
      `${E.VC_Alert} Non puoi inviare candidature con il tuo stato attuale.`,
    );
  }

  if (gate.reason === "mono_guild") {
    return buildGlobalPermissionDeniedEmbed([], controlLabel, MONO_GUILD_DENIED);
  }

  if (gate.reason === "channel") {
    return buildGlobalChannelDeniedEmbed(gate.channels || [], controlLabel, viewer);
  }

  return buildGlobalPermissionDeniedEmbed(gate.requiredRoles || [], controlLabel);
}

async function runPermissionGate(interaction?) {
  if (interaction.isButton?.()) {
    const customId = String(interaction.customId || "");
    const gate = await checkButtonPermission(interaction);
    if (!gate.allowed) {
      if (
        gate.reason === "missing_role" &&
        isTicketOpenControlId(customId)
      ) {
        await sendPrivateInteractionResponse(interaction, {
          embeds: [
            buildGlobalPermissionDeniedEmbed(
              [],
              "bottone",
              `${E.VC_Alert} Devi completare la verifica per aprire un ticket. Verificati e riprova.`,
            ),
          ],
          flags: PRIVATE_FLAG,
        });
        return false;
      }
      const kind =
        customId.startsWith("repost_btn:") || customId.startsWith("repost_src:")
          ? "comando"
          : "bottone";
      await sendPrivateInteractionResponse(interaction, {
        embeds: [buildDeniedEmbed(gate, kind, interaction.member, customId)],
        flags: PRIVATE_FLAG,
      });
      return false;
    }
  }

  if (interaction.isStringSelectMenu?.()) {
    const gate = await checkStringSelectPermission(interaction);
    if (!gate.allowed) {
      if (
        gate.reason === "missing_role" &&
        isTicketOpenControlId(String(interaction.customId || ""))
      ) {
        await sendPrivateInteractionResponse(interaction, {
          embeds: [
            buildGlobalPermissionDeniedEmbed(
              [],
              "menu",
              `${E.VC_Alert} Devi completare la verifica per aprire un ticket. Verificati e riprova.`,
            ),
          ],
          flags: PRIVATE_FLAG,
        });
        return false;
      }
      await sendPrivateInteractionResponse(interaction, {
        embeds: [buildDeniedEmbed(gate, "menu", interaction.member, String(interaction.customId || ""))],
        flags: PRIVATE_FLAG,
      });
      return false;
    }
  }

  if (interaction.isUserSelectMenu?.()) {
    const gate = await checkStringSelectPermission(interaction);
    if (!gate.allowed) {
      await sendPrivateInteractionResponse(interaction, {
        embeds: [buildDeniedEmbed(gate, "menu", interaction.member, String(interaction.customId || ""))],
        flags: PRIVATE_FLAG,
      });
      return false;
    }
  }

  if (interaction.isChannelSelectMenu?.() || interaction.isRoleSelectMenu?.()) {
    const gate = await checkStringSelectPermission(interaction);
    if (!gate.allowed) {
      await sendPrivateInteractionResponse(interaction, {
        embeds: [buildDeniedEmbed(gate, "menu", interaction.member, String(interaction.customId || ""))],
        flags: PRIVATE_FLAG,
      });
      return false;
    }
  }

  if (interaction.isModalSubmit?.()) {
    const gate = await checkModalPermission(interaction);
    if (!gate.allowed) {
      await sendPrivateInteractionResponse(interaction, {
        embeds: [buildDeniedEmbed(gate, "modulo", interaction.member, String(interaction.customId || ""))],
        flags: PRIVATE_FLAG,
      });
      return false;
    }
  }

  return true;
}

export = { acquireButtonSpamGuard, isAckError, isTransientDiscordError, runPermissionGate, sendPrivateInteractionResponse };
