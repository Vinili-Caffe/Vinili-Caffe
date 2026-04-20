/**
 * JSON per il sito (/regole): allineato a MOD_RULE_DETAIL e a info_rules nei bottoni staff.
 */
const { MOD_RULE_DETAIL } = require("../Moderation/modRegolamentoConstants");

const MOD_RULE_TITLE_IT = {
  "1.1": "Discord ToS e linee guida",
  "1.2": "Discriminazione e linguaggio",
  "1.3": "Rispetto verso utenti e staff",
  "1.4": "Auto-promozione",
  "1.5": "Uscire e rientrare dal server",
  "2.1": "Contenuti vietati in chat",
  "2.2": "Toxicity e troll",
  "2.3": "Link, virus e sponsor",
  "2.4": "Flood e wall of text",
  "2.5": "Parolacce e bestemmie",
  "3.1": "Contenuti sensibili in vocale",
  "3.2": "Toxicity in vocale",
  "3.3": "Musica e bot in vocale",
  "3.4": "Soundboard e voice changer",
  "3.5": "Microfono disturbante",
  "3.6": "Parolacce in vocale",
  "3.7": "Uscire e rientrare dalle vocali",
};

const ICON_BY_ID = {
  "1.1": "shield",
  "1.2": "balance-scale",
  "1.3": "users",
  "1.4": "bullhorn",
  "1.5": "refresh",
  "2.1": "ban",
  "2.2": "comments",
  "2.3": "link",
  "2.4": "align-left",
  "2.5": "warning",
  "3.1": "eye-slash",
  "3.2": "comments",
  "3.3": "music",
  "3.4": "volume-off",
  "3.5": "microphone",
  "3.6": "warning",
  "3.7": "refresh",
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

/** Anteprima chiusa: prima frase o troncamento; corpo = testo completo. */
function defaultSummaryFromBody(body) {
  const d = String(body || "").trim();
  if (!d) return { summary: "", body: "" };
  const max = 130;
  const dot = d.indexOf(". ");
  if (dot > 8 && dot < max + 40) {
    return { summary: d.slice(0, dot + 1).trim(), body: d };
  }
  if (d.length <= max) return { summary: d, body: d };
  const cut = d.slice(0, max - 1).trim();
  const sp = cut.lastIndexOf(" ");
  const head = sp > 40 ? cut.slice(0, sp) : cut;
  return { summary: `${head}…`, body: d };
}

const SITE_RULE_OVERRIDES = {
  "1.1": {
    title: "Discord ToS",
    summary: "Rispetta i Termini di Servizio di Discord.",
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
    const summaryRaw = ov.summary != null ? String(ov.summary).trim() : defaultSummaryFromBody(raw).summary;
    const summary = summaryRaw || body;
    const title = String(ov.title || "").trim() || MOD_RULE_TITLE_IT[id] || `Regola ${id}`;
    const links = Array.isArray(ov.links) ? ov.links : [];
    const out = {
      id,
      category,
      tag: tagLabelForCategory(category),
      title,
      summary,
      body,
      icon: ICON_BY_ID[id] || "file-text-o",
    };
    if (links.length) out.links = links;
    return out;
  });
  return {
    ok: true,
    disclaimer:
      "Lo staff si riserva il diritto di cambiare sanzioni e regole in base alla situazione.",
    categories: [
      { id: "generale", label: "Generali", icon: "shield" },
      { id: "testuali", label: "Chat testuali", icon: "comments" },
      { id: "vocali", label: "Chat vocali", icon: "microphone" },
    ],
    rules,
  };
}

module.exports = { buildCommunityRulesSitePayload };