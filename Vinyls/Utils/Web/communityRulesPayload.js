const { MOD_RULE_DETAIL } = require("../Moderation/modRegolamentoConstants");
const MOD_RULE_TITLE_IT = {
  "1.1": "ToS e Linee Guida di Discord",
  "1.2": "Discriminazione e linguaggio offensivo",
  "1.3": "Rispetto verso utenti e staff",
  "1.4": "Spam nel server o in DM",
  "1.5": "Uscire e rientrare dal server",
  "2.1": "Doxing e contenuti NSFW o dati sensibili",
  "2.2": "Link, file eseguibili e materiale illecito",
  "2.3": "Flood e Wall of Text",
  "2.4": "Parolacce, bestemmie e insulti",
  "3.1": "Contenuti NSFW o dati sensibili in vocale",
  "3.2": "Comportamenti scorretti in vocale",
  "3.3": "Errape, SoundBoard e VoiceChanger",
  "3.4": "Uscire e rientrare dalle vocali",
  "3.6": "AFK in vocale",
};

const ICON_BY_ID = {
  "1.1": "shield",
  "1.2": "balance-scale",
  "1.3": "users",
  "1.4": "bullhorn",
  "1.5": "refresh",
  "2.1": "ban",
  "2.2": "link",
  "2.3": "align-left",
  "2.4": "warning",
  "3.1": "eye-slash",
  "3.2": "music",
  "3.3": "volume-off",
  "3.4": "refresh",
  "3.6": "microphone",
};

function stripDiscordMarkup(s) {
  let t = String(s || "");
  t = t.replace(/\*\*/g, "");
  t = t.replace(/__/g, "");
  t = t.replace(/`([^`]+)`/g, "$1");
  t = t.replace(/\[__([^[\]]+)__\]\(([^)]+)\)/g, "$1");
  t = t.replace(/\[([^\]]+)\]\(([^)]+)\)/g, "$1");
  return t.replace(/\s+/g, " ").trim();
}

function categoryFromId(id) {
  const k = String(id || "");
  if (k.startsWith("1.")) return "generale";
  if (k.startsWith("2.")) return "testuali";
  if (k.startsWith("3.")) return "vocali";
  return "generale";
}

function tagLabelForCategory(cat) {
  if (cat === "testuali") return "Chat testuali";
  if (cat === "vocali") return "Chat vocali";
  return "Generale";
}

function sortRuleIds(ids) {
  return [...ids].sort((a, b) => {
    const pa = String(a).split(".").map(Number);
    const pb = String(b).split(".").map(Number);
    return (pa[0] - pb[0]) || (pa[1] - pb[1]);
  });
}

const SITE_RULE_OVERRIDES = {
  "1.1": {
    title: "Discord ToS",
    body:
      "Rispetta i Termini di Servizio di Discord, dove vengono elencate tutte le regole che vanno rispettate all'interno della piattaforma. La violazione dei ToS di Discord comporta sanzioni anche sul nostro server.",
    links: [
      { label: "Termini di Servizio Discord", href: "https://discord.com/terms" },
      { label: "Linee Guida Community", href: "https://discord.com/guidelines" },
    ],
  },
};

function buildCommunityRulesSitePayload() {
  const ids = sortRuleIds(Object.keys(MOD_RULE_DETAIL));
  const rules = ids.map((id) => {
    const category = categoryFromId(id);
    const raw = stripDiscordMarkup(MOD_RULE_DETAIL[id]);
    const ov = SITE_RULE_OVERRIDES[id] || {};
    const body = String(ov.body != null ? ov.body : raw).trim();
    const title = String(ov.title || "").trim() || MOD_RULE_TITLE_IT[id] || `Regola ${id}`;
    const links = Array.isArray(ov.links) ? ov.links : [];
    const out = {
      id,
      category,
      tag: tagLabelForCategory(category),
      title,
      body,
      icon: ICON_BY_ID[id] || "file-text-o",
    };
    if (links.length) out.links = links;
    return out;
  });
  return {
    ok: true,
    disclaimer:
      "Lo staff si riserva il diritto di cambiare le sanzioni e le regole in base alla situazione. Entrando nel server, accetti di rispettare le regole e le sanzioni.",
    categories: [
      { id: "generale", label: "Generali", icon: "shield" },
      { id: "testuali", label: "Chat testuali", icon: "comments" },
      { id: "vocali", label: "Chat vocali", icon: "microphone" },
    ],
    rules,
  };
}

module.exports = { buildCommunityRulesSitePayload };