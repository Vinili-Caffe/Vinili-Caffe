const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { formatVisibleChannelMentionsList } = require("../discord/visibleChannelMentions") as typeof import("../discord/visibleChannelMentions");

const { E } = require("../emojis/emojiCatalog") as typeof import("../emojis/emojiCatalog");
/**
 * Embed di accesso negato (ruolo / canale / non-tuo-controllo).
 * @param {object} [options]
 * @param {string} [options.color]
 * @param {(ids: any[]) => any[]} options.normalizeRoleList
 * @param {boolean} [options.filterRolesByGuildCache]
 * @param {(ctx: { embed: any, rawIds: any[], viewer: any, hasVisibleChannels: boolean, entityLabel: string }) => boolean} [options.enrichChannelDeniedEmbed]
 *   Se ritorna true, lo hint di default non viene aggiunto.
 */
function createPermissionDeniedEmbeds(options: Record<string, any> = {}) {
  const color = options.color || "#6f4e37";
  const normalizeRoleList =
    typeof options.normalizeRoleList === "function"
      ? options.normalizeRoleList
      : (ids?) => (Array.isArray(ids) ? ids : []);
  const filterRolesByGuildCache = options.filterRolesByGuildCache === true;
  const enrichChannelDeniedEmbed =
    typeof options.enrichChannelDeniedEmbed === "function" ? options.enrichChannelDeniedEmbed : null;

  function buildGlobalPermissionDeniedEmbed(
    requiredRoleIds = [],
    entityLabel = "comando",
    customDescription = null,
    guild = null,
  ) {
    let roles = normalizeRoleList(Array.isArray(requiredRoleIds) ? requiredRoleIds : []);
    if (filterRolesByGuildCache && guild?.roles?.cache) {
      roles = roles.filter((id?) => guild.roles.cache.has(String(id)));
    }
    const rolesText = roles.length
      ? roles.map((id?) => `<@&${id}>`).join(", ")
      : `${E.VC_Attention} Nessun ruolo configurato.`;
    const description =
      customDescription != null
        ? customDescription
        : `${E.VC_Lock} Questo ${entityLabel} è riservato ad una categoria di utenti specifici.`;

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(`${E.VC_Lock} **Non hai i permessi**`)
      .setDescription(description);
    if (roles.length > 0) {
      embed.addFields({
        name: `${E.VC_Rocket} **Per sbloccarlo:**`,
        value: `${E.VC_Arrow} Ottieni uno dei seguenti ruoli: ${rolesText}`,
      });
    }
    return embed;
  }

  function buildGlobalChannelDeniedEmbed(allowedChannelIds = [], entityLabel = "comando", viewer = null) {
    const rawIds = Array.isArray(allowedChannelIds) ? allowedChannelIds : [];
    const channelsText = formatVisibleChannelMentionsList(rawIds, viewer, {
      sep: ", ",
      emptyFallback: "",
    });
    const hasVisibleChannels = Boolean(channelsText);

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle(`${E.VC_Lock} **Non hai i permessi**`)
      .setDescription(
        `${E.VC_Lock} Questo ${entityLabel} è disponibile solo in canali specifici.`,
      );

    if (hasVisibleChannels) {
      embed.addFields({
        name: `${E.VC_Rocket} **Per sbloccarlo:**`,
        value: `${E.VC_Arrow} Usa il comando in uno dei seguenti canali: ${channelsText}`,
      });
      return embed;
    }

    const handled = enrichChannelDeniedEmbed
      ? enrichChannelDeniedEmbed({ embed, rawIds, viewer, hasVisibleChannels, entityLabel })
      : false;
    if (handled) return embed;

    if (rawIds.some((id?) => /^\d{5,30}$/.test(String(id || "").trim()))) {
      embed.addFields({
        name: `${E.VC_Rocket} **Per sbloccarlo:**`,
        value:
          `${E.VC_Arrow} Usa il comando in un canale consentito a cui hai accesso.`,
      });
    } else {
      embed.addFields({
        name: `${E.VC_Rocket} **Per sbloccarlo:**`,
        value: `${E.VC_Attention} Nessun canale configurato.`,
      });
    }
    return embed;
  }

  function buildGlobalNotYourControlEmbed() {
    return new EmbedBuilder()
      .setColor(color)
      .setTitle(`${E.VC_Lock} **Accesso negato**`)
      .setDescription(
        `${E.VC_Attention} Questo controllo non è associato al tuo comando.`,
      );
  }

  return {
    buildGlobalPermissionDeniedEmbed,
    buildGlobalChannelDeniedEmbed,
    buildGlobalNotYourControlEmbed,
  };
}

export = { createPermissionDeniedEmbeds };
