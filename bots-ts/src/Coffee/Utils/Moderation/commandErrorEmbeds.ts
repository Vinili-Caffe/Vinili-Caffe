const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");

function buildBaseErrorEmbed(title?, description?) {
  return new EmbedBuilder().setColor("Red").setTitle(title).setDescription(description);
}

function buildCooldownErrorEmbed(remainingSeconds?) {
  const remaining = Math.max(1, Number(remainingSeconds || 1));
  return buildBaseErrorEmbed(
    "<a:VC_Cross:1482532424570376253> Cooldown attivo",
    `<:VC_Attention:1482534443632558151> Aspetta **${remaining}s** prima di usare un altro comando.`,
  );
}

function buildBusyCommandErrorEmbed() {
  return buildBaseErrorEmbed(
    "<a:VC_Cross:1482532424570376253> Comando in esecuzione",
    "<:VC_Attention:1482534443632558151> Hai già un comando in esecuzione, attendi un attimo.",
  );
}

function buildMissingArgumentsErrorEmbed() {
  return buildBaseErrorEmbed(
    "<a:VC_Cross:1482532424570376253> Argomenti mancanti",
    "<:VC_Attention:1482534443632558151> Non hai aggiunto nessun argomento.",
  );
}

function buildInternalCommandErrorEmbed(rawError?) {
  const raw = String(rawError || "Errore sconosciuto");
  const compact = raw.length > 900 ? `${raw.slice(0, 900)}...` : raw;
  return buildBaseErrorEmbed(
    "<a:VC_Cross:1482532424570376253> Errore comando",
    `<:VC_Attention:1482534443632558151> C'è stato un errore nell'esecuzione del comando.\n\`\`\`${compact}\`\`\``,
  );
}

export = { buildCooldownErrorEmbed, buildBusyCommandErrorEmbed, buildMissingArgumentsErrorEmbed, buildInternalCommandErrorEmbed };