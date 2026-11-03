const PRIVATE_FLAG = 1 << 6;
const BUTTON_SPAM_COOLDOWN_MS = 1200;
const BUTTON_INFLIGHT_TTL_MS = 15000;
const TICKET_GUARD_BYPASS_EXACT = new Set([
  "claim_ticket",
  "unclaim",
  "close_ticket",
  "close_ticket_motivo",
  "accetta",
  "rifiuta",
]);
const TICKET_GUARD_BYPASS_PREFIXES = ["ticket_", "ticket_panel_"];

function isAckError(error?) {
  const code = error?.code || error?.rawError?.code;
  return (
    code === 40060 ||
    code === 10062 ||
    code === "InteractionAlreadyReplied"
  );
}

function isTransientDiscordError(error?) {
  const status = error?.status ?? error?.statusCode;
  return Number(status) >= 500 && Number(status) < 600;
}

function getButtonSpamState(client?) {
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

function pruneExpiredMap(map?, nowTs?) {
  if (!map || map.size === 0) return;
  for (const [key, expiresAt] of map.entries()) {
    if (!Number.isFinite(expiresAt) || expiresAt <= nowTs) {
      map.delete(key);
    }
  }
}

function acquireButtonSpamGuard(interaction?, client?) {
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
    TICKET_GUARD_BYPASS_PREFIXES.some((prefix?) => customId.startsWith(prefix));
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

async function sendPrivateInteractionResponse(interaction?, payload?) {
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

export = {
  PRIVATE_FLAG,
  isAckError,
  isTransientDiscordError,
  acquireButtonSpamGuard,
  sendPrivateInteractionResponse,
};
