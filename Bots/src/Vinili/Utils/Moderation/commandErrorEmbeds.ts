const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const IDs = require("../Config/ids") as typeof import("../Config/ids");
const { TENANT_EMBED_COLOR } = require("../../MultiGuild/utils/tenantEmbedBranding") as typeof import("../../MultiGuild/utils/tenantEmbedBranding");

function buildBaseErrorEmbed(title?, description?) {
  return new EmbedBuilder()
    .setColor(TENANT_EMBED_COLOR)
    .setTitle(title)
    .setDescription(description);
}

function buildCooldownErrorEmbed(remainingSeconds?) {
  const remaining = Math.max(1, Number(remainingSeconds || 1));
  return buildBaseErrorEmbed(
    "<:cancel:1461730653677551691> Cooldown attivo",
    [
      `<:VC_Attention:1482534443632558151> Aspetta **${remaining}s** prima di usare un altro comando.`,
      "",
      "<a:VC_Timer:1482527426557775954> Il cooldown si riduce con i ruoli:",
      `<:VC_Dot:1482532364222595303> <@&${IDs.roles.Level30}>, <@&${IDs.roles.ServerBooster}> o <@&${IDs.roles.VIP}> <a:VC_Arrow:1482706699365257397> **15s**`,
      `<:VC_Dot:1482532364222595303> <@&${IDs.roles.Level50}>, <@&${IDs.roles.VIPplus}> o <@&${IDs.roles.DoubleBooster}> <a:VC_Arrow:1482706699365257397> **5s**`,
    ].join("\n"),
  );
}

function buildBusyCommandErrorEmbed() {
  return buildBaseErrorEmbed(
    "<:cancel:1461730653677551691> Comando in esecuzione",
    "<:VC_Attention:1482534443632558151> Hai già un comando in esecuzione, attendi un attimo.",
  );
}

function buildMissingArgumentsErrorEmbed() {
  return buildBaseErrorEmbed(
    "<:cancel:1461730653677551691> Argomenti mancanti",
    "<:VC_Attention:1482534443632558151> Non hai aggiunto nessun argomento.",
  );
}

function buildInternalCommandErrorEmbed(rawError?) {
  const raw = String(rawError || "Errore sconosciuto");
  const compact = raw.length > 900 ? `${raw.slice(0, 900)}...` : raw;
  return buildBaseErrorEmbed(
    "<:cancel:1461730653677551691> Errore comando",
    `<:VC_Attention:1482534443632558151> C'è stato un errore nell'esecuzione del comando.\n\`\`\`${compact}\`\`\``,
  );
}

export = { buildCooldownErrorEmbed, buildBusyCommandErrorEmbed, buildMissingArgumentsErrorEmbed, buildInternalCommandErrorEmbed };