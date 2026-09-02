const { checkButtonPermission, checkStringSelectPermission, checkModalPermission, buildGlobalPermissionDeniedEmbed, buildGlobalChannelDeniedEmbed, buildGlobalNotYourControlEmbed, } = require("../Moderation/commandPermissions");
const { EmbedBuilder } = require("discord.js");
const { siteUserProfilePageDiscordRef, siteTicketsPageDiscordRef } = require("../../../shared/web/siteTicketsPageRef");
const PRIVATE_FLAG = 1 << 6;
const BUTTON_SPAM_COOLDOWN_MS = 1200;
const BUTTON_INFLIGHT_TTL_MS = 15000;
const MONO_GUILD_DENIED = "Questo bot è utilizzabile solo nei server autorizzati.";
const TICKET_OPEN_CONTROLS = new Set([
  "ticket_partnership",
  "ticket_highstaff",
  "ticket_supporto",
  "ticket_perks",
  "ticket_open_menu",
]);
function isTicketOpenControlId(customId) {
  const id = String(customId || "");
  return TICKET_OPEN_CONTROLS.has(id) || id.startsWith("tkp:");
}
const TICKET_GUARD_BYPASS_EXACT = new Set([
  "claim_ticket",
  "unclaim",
  "close_ticket",
  "close_ticket_motivo",
  "accetta",
  "rifiuta",
]);
const TICKET_GUARD_BYPASS_PREFIXES = [
  "ticket_",
  "ticket_panel_",
];

function isAckError(error) {
  const code = error?.code || error?.rawError?.code;
  return (
    code === 40060 ||
    code === 10062 ||
    code === "InteractionAlreadyReplied"
  );
}

function isTransientDiscordError(error) {
  const status = error?.status ?? error?.statusCode;
  return Number(status) >= 500 && Number(status) < 600;
}

function getButtonSpamState(client) {
  if (!client) {
    return {
      cooldownByUser: new Map(),
      inFlightByAction: new Map(),
    };
  }
  if (!client._buttonSpamState) {
    client._buttonSpamState = {
      cooldownByUser: new Map(),
      inFlightByAction: new Map(),
    };
  }
  return client._buttonSpamState;
}

function pruneExpiredMap(map, nowTs) {
  if (!map || map.size === 0) return;
  for (const [key, expiresAt] of map.entries()) {
    if (!Number.isFinite(expiresAt) || expiresAt <= nowTs) {
      map.delete(key);
    }
  }
}

function acquireButtonSpamGuard(interaction, client) {
  const isComponentInteraction = Boolean(
    interaction?.isButton?.() ||
    interaction?.isStringSelectMenu?.() ||
    interaction?.isUserSelectMenu?.() ||
    interaction?.isChannelSelectMenu?.() ||
    interaction?.isRoleSelectMenu?.(),
  );
  if (!isComponentInteraction) {
    return {
      blocked: false,
      release: () => { },
    };
  }
  const customId = String(interaction?.customId || "");
  const bypassTicketGuard = TICKET_GUARD_BYPASS_EXACT.has(customId) ||
    TICKET_GUARD_BYPASS_PREFIXES.some((prefix) => customId.startsWith(prefix));
  if (bypassTicketGuard) {
    return {
      blocked: false,
      release: () => { },
    };
  }
  const userId = String(interaction?.user?.id || "");
  const guildId = String(interaction?.guildId || interaction?.guild?.id || "dm");
  if (!userId) {
    return {
      blocked: false,
      release: () => { },
    };
  }
  const nowTs = Date.now();
  const state = getButtonSpamState(client);
  pruneExpiredMap(state.cooldownByUser, nowTs);
  pruneExpiredMap(state.inFlightByAction, nowTs);
  const userKey = `${guildId}:${userId}`;
  const actionKey = `${userKey}:${customId}`;
  const cooldownUntil = Number(state.cooldownByUser.get(userKey) || 0);
  const inFlightUntil = Number(state.inFlightByAction.get(actionKey) || 0);
  if (cooldownUntil > nowTs || inFlightUntil > nowTs) {
    return {
      blocked: true,
      release: () => { },
    };
  }
  state.cooldownByUser.set(userKey, nowTs + BUTTON_SPAM_COOLDOWN_MS);
  state.inFlightByAction.set(actionKey, nowTs + BUTTON_INFLIGHT_TTL_MS);
  return {
    blocked: false,
    release: () => {
      state.inFlightByAction.delete(actionKey);
    },
  };
}

function resolveNotOwnerPanelHint(customId) {
  const id = String(customId || "").trim();
  if (!id) return { label: "pannello", command: null };
  if (id.startsWith("profile_panel:") || id.startsWith("tprof:")) {
    return { label: "profilo", command: null, siteReopen: siteUserProfilePageDiscordRef() };
  }
  if (
    id.startsWith("customrole_") ||
    id.startsWith("customvoc_") ||
    id.startsWith("customreaction_") ||
    id.startsWith("cmd_colors") ||
    id.startsWith("avatar_") ||
    id.startsWith("banner_") ||
    id.startsWith("bh_") ||
    id.startsWith("privacy_") ||
    id.startsWith("nodm_") ||
    id.startsWith("no_dm")
  ) {
    return { label: "pannello", command: null, siteReopen: siteUserProfilePageDiscordRef() };
  }
  if (id.startsWith("staff_profile_panel:") || id.startsWith("staff_pm_shop:") || id.startsWith("staff_val_neg_trade:")) {
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

function buildDeniedEmbed(gate, controlLabel, viewer = null, customId = "") {
  if (gate.reason === "tenant_profile_not_owner") {
    return new EmbedBuilder()
      .setColor("#6f4e37")
      .setTitle("<:VC_Lock:1482526739044368476> **Accesso negato**")
      .setDescription(
        `<:VC_Attention:1482534443632558151> Puoi usare solo **il tuo** pannello profilo partner. Esegui di nuovo [profilo sul sito](https://www.viniliecaffe.it/personalizza/) per aprirlo.`,
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
        .setTitle("<:VC_Lock:1482526739044368476> **Accesso negato**")
        .setDescription(
          `<:VC_Attention:1482534443632558151> Questo ${hint.label} appartiene a <@${gate.ownerId}>.${reopen}`,
        );
    }
    return buildGlobalNotYourControlEmbed();
  }

  if (gate.reason === "candidature_blacklist") {
    return buildGlobalPermissionDeniedEmbed(
      [],
      controlLabel,
      "<a:VC_Alert:1482706673176150077> Non puoi inviare candidature con il tuo stato attuale.",
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

async function sendPrivateInteractionResponse(interaction, payload) {
  if (!interaction?.isRepliable?.()) return;

  try {
    if (!interaction.replied && !interaction.deferred) {
      await interaction.reply(payload);
      return;
    }

    if (interaction.deferred && !interaction.replied) {
            await interaction.followUp(payload);
      return;
    }

    await interaction.followUp(payload);
  } catch (error) {
    if (isAckError(error) || isTransientDiscordError(error)) return;
    throw error;
  }
}

async function runPermissionGate(interaction) {
  if (interaction.isButton?.()) {
    const gate = await checkButtonPermission(interaction);
    if (!gate.allowed) {
      if (
        gate.reason === "missing_role" &&
        isTicketOpenControlId(String(interaction.customId || ""))
      ) {
        await sendPrivateInteractionResponse(interaction, {
          embeds: [
            buildGlobalPermissionDeniedEmbed(
              [],
              "bottone",
              "<a:VC_Alert:1482706673176150077> Devi completare la verifica per aprire un ticket. Verificati e riprova.",
            ),
          ],
          flags: PRIVATE_FLAG,
        });
        return false;
      }
      const customId = String(interaction.customId || "");
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
              "<a:VC_Alert:1482706673176150077> Devi completare la verifica per aprire un ticket. Verificati e riprova.",
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

module.exports = { acquireButtonSpamGuard, isAckError, isTransientDiscordError, runPermissionGate, sendPrivateInteractionResponse };