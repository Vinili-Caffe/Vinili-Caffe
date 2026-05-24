const { EmbedBuilder } = require("discord.js");

function buildTicketPanelEmbed(kind) {
  if (kind === "supporto") {
    return new EmbedBuilder()
      .setTitle("<:VC_Ticket:1482535175283019888> • **__TICKET SUPPORTO__**")
      .setDescription(
        `<a:ThankYou:1329504268369002507> • __Grazie per aver aperto un ticket!__\n\n<a:loading:1443934440614264924> ➥ Attendi un membro dello **__\`STAFF\`__**.\n\n<:reportmessage:1443670575376765130> ➥ Descrivi supporto, segnalazione o problema in modo chiaro.`,
      )
      .setColor("#6f4e37");
  }
  if (kind === "partnership") {
    return new EmbedBuilder()
      .setTitle("<:VC_Ticket:1482535175283019888> • **__TICKET PARTNERSHIP__**")
      .setDescription(
        `<a:ThankYou:1329504268369002507> • __Grazie per aver aperto un ticket!__\n\n<a:loading:1443934440614264924> ➥ Attendi un **__\`PARTNER MANAGER\`__**.\n\n<:reportmessage:1443670575376765130> ➥ Invia direttamente qui la tua descrizione.`,
      )
      .setColor("#6f4e37");
  }
  if (kind === "high") {
    return new EmbedBuilder()
      .setTitle("<:VC_Ticket:1482535175283019888> • **__TICKET HIGH STAFF__**")
      .setDescription(
        `<a:ThankYou:1329504268369002507> • __Grazie per aver aperto un ticket!__\n\n<a:loading:1443934440614264924> ➥ Attendi un **__\`HIGH STAFF\`__**.\n\n<:reportmessage:1443670575376765130> ➥ Specifica se riguarda Donazioni, Sponsor o High Staff.`,
      )
      .setColor("#6f4e37");
  }
  if (kind === "perks") {
    return new EmbedBuilder()
      .setTitle("<:VC_Ticket:1482535175283019888> • **__TICKET PERKS__**")
      .setDescription(
        `<a:ThankYou:1329504268369002507> • __Grazie per aver aperto un ticket!__\n\n<a:loading:1443934440614264924> ➥ Attendi **__\`SENIOR MODERATOR\`__** o **__\`DIRECTOR\`__**.\n\n<:reportmessage:1443670575376765130> ➥ Specifica se riguarda verifica selfie, riscatto ruolo Supporter o Follower.`,
      )
      .setColor("#6f4e37");
  }
  return null;
}

function getTicketPanelConfig(raw) {
  const key = String(raw || "").toLowerCase();
  const aliases = {
    supporto: "supporto",
    prima: "supporto",
    1: "supporto",
    first: "supporto",
    partnership: "partnership",
    partner: "partnership",
    seconda: "partnership",
    2: "partnership",
    second: "partnership",
    highstaff: "highstaff",
    high: "highstaff",
    terza: "highstaff",
    3: "highstaff",
    third: "highstaff",
    perks: "perks",
    quarta: "perks",
    4: "perks",
    fourth: "perks",
  };
  const resolved = aliases[key] || key;
  if (resolved === "supporto") {
    return {
      type: "supporto",
      emoji: "⭐",
      name: "supporto",
      label: "Supporto",
      embed: buildTicketPanelEmbed("supporto"),
    };
  }
  if (resolved === "partnership") {
    return {
      type: "partnership",
      emoji: "🤝",
      name: "partnership",
      label: "Partnership",
      embed: buildTicketPanelEmbed("partnership"),
    };
  }
  if (resolved === "highstaff") {
    return {
      type: "high",
      emoji: "✨",
      name: "highstaff",
      label: "High Staff",
      embed: buildTicketPanelEmbed("high"),
    };
  }
  if (resolved === "perks") {
    return {
      type: "perks",
      emoji: "🎁",
      name: "perks",
      label: "Perks",
      embed: buildTicketPanelEmbed("perks"),
    };
  }
  return null;
}

module.exports = { getTicketPanelConfig, buildTicketPanelEmbed };