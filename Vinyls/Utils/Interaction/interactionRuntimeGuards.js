const { checkButtonPermission, checkStringSelectPermission, checkModalPermission, buildGlobalPermissionDeniedEmbed, buildGlobalChannelDeniedEmbed, buildGlobalNotYourControlEmbed, } = require("../Moderation/commandPermissions");
const PRIVATE_FLAG = 1 << 6;
const BUTTON_SPAM_COOLDOWN_MS = 1200;
const BUTTON_INFLIGHT_TTL_MS = 15000;
const MONO_GUILD_DENIED = "Questo bot è utilizzabile solo nei server autorizzati.";
const TICKET_OPEN_CONTROLS = new Set(["ticket_partnership", "ticket_highstaff", "ticket_supporto", "ticket_open_menu",]);
/** Pulsanti verifica: non applicare cooldown/inFlight per evitare di bloccare il primo click o click dopo altro bottone. */
const VERIFY_CONTROLS = new Set(["verify_start", "verify_enter"]);

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
  if (VERIFY_CONTROLS.has(customId)) {
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

function buildDeniedEmbed(gate, controlLabel) {
  if (gate.reason === "not_owner") {
    return buildGlobalNotYourControlEmbed();
  }

  if (gate.reason === "verify_session_required") {
    return buildGlobalPermissionDeniedEmbed(
      [],
      controlLabel,
      "<a:VC_Alert:1482706673176150077> Devi prima premere `Inizia Verifica`, poi inserire il codice.",
    );
  }

  if (gate.reason === "mono_guild") {
    return buildGlobalPermissionDeniedEmbed([], controlLabel, MONO_GUILD_DENIED);
  }

  if (gate.reason === "channel") {
    return buildGlobalChannelDeniedEmbed(gate.channels || [], controlLabel);
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
      await interaction.editReply(payload);
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
        TICKET_OPEN_CONTROLS.has(String(interaction.customId || ""))
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
      await sendPrivateInteractionResponse(interaction, {
        embeds: [buildDeniedEmbed(gate, "bottone")],
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
        TICKET_OPEN_CONTROLS.has(String(interaction.customId || ""))
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
        embeds: [buildDeniedEmbed(gate, "menu")],
        flags: PRIVATE_FLAG,
      });
      return false;
    }
  }

  if (interaction.isUserSelectMenu?.()) {
    const gate = await checkStringSelectPermission(interaction);
    if (!gate.allowed) {
      await sendPrivateInteractionResponse(interaction, {
        embeds: [buildDeniedEmbed(gate, "menu")],
        flags: PRIVATE_FLAG,
      });
      return false;
    }
  }

  if (interaction.isChannelSelectMenu?.() || interaction.isRoleSelectMenu?.()) {
    const gate = await checkStringSelectPermission(interaction);
    if (!gate.allowed) {
      await sendPrivateInteractionResponse(interaction, {
        embeds: [buildDeniedEmbed(gate, "menu")],
        flags: PRIVATE_FLAG,
      });
      return false;
    }
  }

  if (interaction.isModalSubmit?.()) {
    const gate = await checkModalPermission(interaction);
    if (!gate.allowed) {
      await sendPrivateInteractionResponse(interaction, {
        embeds: [buildDeniedEmbed(gate, "modulo")],
        flags: PRIVATE_FLAG,
      });
      return false;
    }
  }

  return true;
}

module.exports = { acquireButtonSpamGuard, isAckError, isTransientDiscordError, runPermissionGate, sendPrivateInteractionResponse };