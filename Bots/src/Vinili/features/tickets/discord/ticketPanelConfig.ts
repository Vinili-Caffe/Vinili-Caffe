const { EmbedBuilder } = require("discord.js") as typeof import("discord.js");
const {
  DEFAULT_TICKET_WELCOME_COLOR,
  getDefaultWelcomeDescription,
} = require("./ticketUiDefaults") as typeof import("./ticketUiDefaults");
const { DEFAULT_LANGUAGE } = require("../../../MultiGuild/utils/Partner/tenantPartnershipI18n/languages") as typeof import("../../../MultiGuild/utils/Partner/tenantPartnershipI18n/languages");

function buildDefaultWelcomeContent(lang = DEFAULT_LANGUAGE) {
  return Object.freeze({
    color: DEFAULT_TICKET_WELCOME_COLOR,
    title: "",
    description: getDefaultWelcomeDescription(lang),
  });
}

function resolveWelcomeKind(raw?) {
  const key = String(raw || "").toLowerCase();
  if (key === "highstaff" || key === "high" || key === "terza" || key === "3" || key === "third") {
    return "high";
  }
  if (key === "partnership" || key === "partner" || key === "seconda" || key === "2" || key === "second") {
    return "partnership";
  }
  if (key === "perks" || key === "quarta" || key === "4" || key === "fourth") {
    return "perks";
  }
  return "supporto";
}

function getTicketWelcomeContent(kindOrType?, lang = DEFAULT_LANGUAGE) {
  resolveWelcomeKind(kindOrType);
  return buildDefaultWelcomeContent(lang);
}

function buildTicketPanelEmbed(kind?, lang = DEFAULT_LANGUAGE) {
  const content = getTicketWelcomeContent(kind, lang);
  if (!content) return null;
  const embed = new EmbedBuilder().setDescription(content.description).setColor(content.color);
  if (content.title) embed.setTitle(content.title);
  return embed;
}

function getTicketPanelConfig(raw?, lang = DEFAULT_LANGUAGE) {
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
      embed: buildTicketPanelEmbed("supporto", lang),
    };
  }
  if (resolved === "partnership") {
    return {
      type: "partnership",
      emoji: "🤝",
      name: "partnership",
      label: "Partnership",
      embed: buildTicketPanelEmbed("partnership", lang),
    };
  }
  if (resolved === "highstaff") {
    return {
      type: "high",
      emoji: "✨",
      name: "highstaff",
      label: "High Staff",
      embed: buildTicketPanelEmbed("high", lang),
    };
  }
  if (resolved === "perks") {
    return {
      type: "perks",
      emoji: "🎁",
      name: "perks",
      label: "Perks",
      embed: buildTicketPanelEmbed("perks", lang),
    };
  }
  return null;
}

export = {
  TICKET_WELCOME_BY_KIND: Object.freeze({
    supporto: buildDefaultWelcomeContent(DEFAULT_LANGUAGE),
    partnership: buildDefaultWelcomeContent(DEFAULT_LANGUAGE),
    high: buildDefaultWelcomeContent(DEFAULT_LANGUAGE),
    perks: buildDefaultWelcomeContent(DEFAULT_LANGUAGE),
  }),
  resolveWelcomeKind,
  getTicketWelcomeContent,
  getTicketPanelConfig,
  buildTicketPanelEmbed,
};
