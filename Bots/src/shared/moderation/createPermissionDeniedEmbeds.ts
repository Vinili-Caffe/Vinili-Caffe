const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const { formatVisibleChannelMentionsList } = require("../discord/visibleChannelMentions") as typeof import("../discord/visibleChannelMentions");

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
      : "<:VC_Attention:1482534443632558151> Nessun ruolo configurato.";
    const description =
      customDescription != null
        ? customDescription
        : `<:VC_Lock:1482526739044368476> Questo ${entityLabel} è riservato ad una categoria di utenti specifici.`;

    const embed = new EmbedBuilder()
      .setColor(color)
      .setTitle("<:VC_Lock:1482526739044368476> **Non hai i permessi**")
      .setDescription(description);
    if (roles.length > 0) {
      embed.addFields({
        name: "<a:VC_Rocket:1468544312475123753> **Per sbloccarlo:**",
        value: `<a:VC_Arrow:1482706699365257397> Ottieni uno dei seguenti ruoli: ${rolesText}`,
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
      .setTitle("<:VC_Lock:1482526739044368476> **Non hai i permessi**")
      .setDescription(
        `<:VC_Lock:1482526739044368476> Questo ${entityLabel} è disponibile solo in canali specifici.`,
      );

    if (hasVisibleChannels) {
      embed.addFields({
        name: "<a:VC_Rocket:1468544312475123753> **Per sbloccarlo:**",
        value: `<a:VC_Arrow:1482706699365257397> Usa il comando in uno dei seguenti canali: ${channelsText}`,
      });
      return embed;
    }

    const handled = enrichChannelDeniedEmbed
      ? enrichChannelDeniedEmbed({ embed, rawIds, viewer, hasVisibleChannels, entityLabel })
      : false;
    if (handled) return embed;

    if (rawIds.some((id?) => /^\d{5,30}$/.test(String(id || "").trim()))) {
      embed.addFields({
        name: "<a:VC_Rocket:1468544312475123753> **Per sbloccarlo:**",
        value:
          "<a:VC_Arrow:1482706699365257397> Usa il comando in un canale consentito a cui hai accesso.",
      });
    } else {
      embed.addFields({
        name: "<a:VC_Rocket:1468544312475123753> **Per sbloccarlo:**",
        value: "<:VC_Attention:1482534443632558151> Nessun canale configurato.",
      });
    }
    return embed;
  }

  function buildGlobalNotYourControlEmbed() {
    return new EmbedBuilder()
      .setColor(color)
      .setTitle("<:VC_Lock:1482526739044368476> **Accesso negato**")
      .setDescription(
        "<:VC_Attention:1482534443632558151> Questo controllo non è associato al tuo comando.",
      );
  }

  return {
    buildGlobalPermissionDeniedEmbed,
    buildGlobalChannelDeniedEmbed,
    buildGlobalNotYourControlEmbed,
  };
}

export = { createPermissionDeniedEmbeds };
