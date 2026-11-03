const Ticket = require("../../../MultiGuild/tickets/data/guildFeatureBucketTicketModel");
const IDs = require("../../../Config/ids") as typeof import("../../../Config/ids");
const { getPartnerDescriptionTextOrSync } = require("../../services/partnerDescriptionSyncService") as typeof import("../../services/partnerDescriptionSyncService");
const { getTenantPartnerDescriptionTextOrSync } = require("../../services/tenantPartnerDescriptionService") as typeof import("../../services/tenantPartnerDescriptionService");
const {
  isPartnershipOperational,
  memberHasPartnerManagerRole,
  shouldApplyMainPartnershipFilters,
} = require("../../core/partnershipConfigResolver") as typeof import("../../core/partnershipConfigResolver");
const { getPartnershipConfigSync } = require("../../core/tenantPartnershipSettings") as typeof import("../../core/tenantPartnershipSettings");
const { replyPrefixSetupRequired } = require("../../tenant/tenantSetupRequiredReply") as typeof import("../../tenant/tenantSetupRequiredReply");
const { t } = require("../../i18n/tenantPartnershipI18n/index") as typeof import("../../i18n/tenantPartnershipI18n/index");
const { resolveTenantLanguageForMessage } = require("../../tenant/tenantPartnershipPrefixMessages") as typeof import("../../tenant/tenantPartnershipPrefixMessages");

function _stripRef(p?) {
  if (!p || typeof p !== "object") return p;
  const o = { ...p };
  delete o.reply;
  delete o.messageReference;
  delete o.failIfNotExists;
  if (o.allowedMentions && typeof o.allowedMentions === "object") {
    o.allowedMentions = { ...o.allowedMentions, repliedUser: false };
  }
  return o;
}

async function _reply(message?, payload?) {
  if (!message || typeof message.reply !== "function") {
    return message.channel && message.channel.send
      ? message.channel.send(_stripRef(payload)).catch(() => null)
      : null;
  }
  try {
    return await message.reply(payload);
  } catch (e) {
    if (e && e.code === 10008) return null;
    if (
      e &&
      e.code === 50035 &&
      e.rawError &&
      e.rawError.errors &&
      e.rawError.errors.message_reference
    ) {
      return message.channel.send(_stripRef(payload)).catch(() => null);
    }
    return null;
  }
}

async function resolveTargetUser(message?, rawArg?) {
  if (!rawArg) return null;

  const value = String(rawArg).trim();
  const mentionMatch = value.match(/^<@!?(\d+)>$/);
  const id = (mentionMatch ? mentionMatch[1] : null) || (/^\d{17,20}$/.test(value) ? value : null);
  if (!id) return null;
  return message.client.users.fetch(id).catch(() => null);
}

function buildMissingDescriptionReply(guildId?, legacy?, lang = "it") {
  if (legacy) {
    const channelHint = IDs.channels?.descriptionPartner
      ? `<#${IDs.channels.descriptionPartner}>`
      : "descrizione partner";
    return `<:vegax:1443934876440068179> Nessuna descrizione disponibile in ${channelHint}. Aggiungi o aggiorna il messaggio nel canale.`;
  }

  const cfg = getPartnershipConfigSync(guildId);
  const desc = cfg?.partnerDesc;
  if (desc?.mode === "channel" && desc.channelId) {
    return t(lang, "description_missingChannel", { channelId: desc.channelId });
  }
  return t(lang, "description_missingSettings");
}

async function deliverDescription(message?, args = [], options: Record<string, any> = {}) {
  const { legacy, lang, guildId, descriptionText } = options;
  if (!descriptionText) {
    return _reply(message, buildMissingDescriptionReply(guildId, legacy, lang));
  }

  let target = null;
  const mode = String(args[0] || "").toLowerCase();
  if (mode === "user" || mode === "utente" || mode === "id") {
    target = await resolveTargetUser(message, args[1]);
    if (!target) {
      await _reply(message, {
        content: t(lang, "description_usage"),
        allowedMentions: { repliedUser: false },
      });
      return;
    }
  } else if (args[0]) {
    target = await resolveTargetUser(message, args[0]);
  }

  if (!target) {
    await _reply(message, {
      content: descriptionText,
      allowedMentions: { parse: [], repliedUser: false },
    });
    return;
  }

  const delivered = await target
    .send({ content: descriptionText, allowedMentions: { parse: [] } })
    .then(() => true)
    .catch(() => false);
  if (!delivered) {
    await _reply(message, {
      content: t(lang, "description_dmFailed", { target: `<@${target.id}>` }),
      allowedMentions: { repliedUser: false },
    });
    return;
  }

  await _reply(message, {
    content: t(lang, "description_dmSent", { target: `<@${target.id}>` }),
    allowedMentions: { repliedUser: false },
  });
}

/** Main: solo in ticket partnership aperti (o web-ticket partnership). */
async function executeMainDescription(message?, args = []) {
  const guildId = message.guild.id;
  const channelId = String(message.channel?.id || "");
  const isWebTicket = channelId.startsWith("web-ticket-");
  if (isWebTicket) {
    const cat = String(message.__webTicketCategory || "").toLowerCase();
    if (cat !== "partnership") {
      return _reply(
        message,
        "<:vegax:1443934876440068179> Questo comando si usa **solo nei ticket partnership**.",
      );
    }
  } else {
    const ticketDoc = await Ticket.findOne({ channelId, open: true }).lean().catch(() => null);
    if (!ticketDoc) {
      return _reply(
        message,
        "<:vegax:1443934876440068179> Questo comando può essere usato **solo in un canale ticket aperto**.",
      );
    }
  }

  const lang = "it";
  const descriptionText = await getPartnerDescriptionTextOrSync(message.client);
  return deliverDescription(message, args, { legacy: true, lang, guildId, descriptionText });
}

async function executeTenantDescription(message?, args = []) {
  const guildId = message.guild.id;
  const lang = await resolveTenantLanguageForMessage(message);
  if (!isPartnershipOperational(guildId)) {
    return replyPrefixSetupRequired(message);
  }
  if (!memberHasPartnerManagerRole(message.member, guildId)) {
    return _reply(message, t(lang, "description_noPermission"));
  }
  const cfg = getPartnershipConfigSync(guildId);
  if (!cfg?.partnerDesc?.configured) {
    return _reply(message, t(lang, "description_notConfigured"));
  }

  const descriptionText = await getTenantPartnerDescriptionTextOrSync(message.client, guildId);
  return deliverDescription(message, args, { legacy: false, lang, guildId, descriptionText });
}

export = {
  name: "description",
  aliases: ["desc"],
  allowEmptyArgs: true,
  description: "Mostra la descrizione partnership configurata per questo server.",
  usage: "+description",
  examples: ["+description"],

  async execute(message?, args = []) {
    await message.channel.sendTyping();
    if (!message.inGuild?.() || !message.guild || !message.member) return;

    if (shouldApplyMainPartnershipFilters(message.guild.id)) {
      return executeMainDescription(message, args);
    }
    return executeTenantDescription(message, args);
  },
};
