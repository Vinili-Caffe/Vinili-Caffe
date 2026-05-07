const DISCORD_TIMEOUT_MAX_MS = 28 * 24 * 60 * 60_000;

const MOD_RULE_DETAIL = {
  "1.1": "**Rispettare** i [__ToS__](https://discord.com/terms) e le [__Linee Guida__](https://discord.com/guidelines) di Discord.",
  "1.2": "**Non discriminare nessuno**, non accettiamo nessuna forma di razzismo, fascismo/nazismo, omofobia. È __vietato__ **scrivere** o **dire** la `f-word` e la `n-word`.",
  "1.3": "**Rispettare** gli __utenti__ e lo __staff__ del server.",
  "1.4": "È __vietato__ **auto - promuoversi**.",
  "1.5": "È __vietato__ **uscire** e **rientrare** continuamente dal server.",
  "2.1": "È __vietato__ inviare **file** **gore**, **NSFW** o **dati sensibili** di un utente.",
  "2.2": "È __vietato__ avere **comportamenti toxic** o **troll** che conducono al flame.",
  "2.3": "È __vietato__ inviare **link** contenenti virus, grabber, sponsor o social.",
  "2.4": "È __vietato__ inviare **flood** o **Wall Of Text** che intasano la chat.",
  "2.5": "È __vietato__ abusare di **parolacce**, **bestemmie** e ogni tipo di **insulto** a **divinità**.",
  "3.1": "È __vietato__ mostrare contenuti **gore**, **NSFW** o **dati sensibili** di un utente.",
  "3.2": "È __vietato__ avere **comportamenti toxic** o **troll** che conducono al flame.",
  "3.3": "È __vietato__ **disconnettere il bot** o cambiare musica mentre un utente sta ascoltando una canzone tramite il bot.",
  "3.4": "È __vietato__ utilizzare **SoundBoard** o qualunque tipo di **VoiceChanger**.",
  "3.5": "È __vietato__ **urlare** o fare **errori** col microfono.",
  "3.6": "È __vietato__ abusare di **parolacce**, **bestemmie** e ogni tipo di **insulto** a **divinità**.",
  "3.7": "È __vietato__ **uscire** e **rientrare** continuamente dalle vocali.",
};

const BUCKET_PRIORITY = ["2_3", "2_1", "1_2", "1_4", "2_4"];

const BUCKET_VIOLATION_KEYS = {
  "2_3": new Set(["scam_pattern", "panic_mode"]),
  "2_1": new Set(["nsfw_link"]),
  "1_2": new Set(["word_blacklist"]),
  "1_4": new Set(["link_blacklist"]),
  "2_4": new Set([
    "regular_message",
    "emoji_spam",
    "new_lines",
    "characters",
    "attachment_embed",
    "attachment_image",
    "attachment_file",
    "attachment_link",
    "attachment_sticker",
    "unwhitelisted_webhook",
  ]),
};

/**
 * Passi per famiglia: timeout (ms) o ban effettivo.
 * 2.4: warn/delete prima tramite heat; poi mute 6 h → 18 h ai timeout su questa famiglia.
 */
const AUTOMOD_REGOLA_STEPS = {
  "1_2": [{ type: "timeout", ms: 2 * 60 * 60_000 }],
  "1_4": [{ type: "timeout", ms: 12 * 60 * 60_000 }, { type: "ban" }],
  "2_1": [{ type: "timeout", ms: 18 * 60 * 60_000 }, { type: "ban" }],
  "2_3": [{ type: "ban" }],
  "2_4": [{ type: "timeout", ms: 6 * 60 * 60_000 }, { type: "timeout", ms: 18 * 60 * 60_000 }],
};

const BUCKET_TO_RULE_DOT = {
  "1_2": "1.2",
  "1_4": "1.4",
  "2_1": "2.1",
  "2_3": "2.3",
  "2_4": "2.4",
};

const VIOLATION_KEY_LABEL_IT = {
  regular_message: "Spam / troppi messaggi (reg. 2.4)",
  suspicious_account: "Profilo sospetto / segnali di sicurezza",
  similar_message: "Messaggi troppo simili",
  emoji_spam: "Troppe emoji (reg. 2.4)",
  new_lines: "Troppi a capo / wall of text (reg. 2.4)",
  zalgo: "Testo illeggibile / zalgo",
  characters: "Densità caratteri / non conversazione normale (reg. 2.4)",
  invite: "Invito Discord non autorizzato",
  scam_pattern: "Link malevoli / scam (reg. 2.3)",
  nsfw_link: "Contenuto NSFW o link non consentito (reg. 2.1)",
  word_blacklist: "Linguaggio discriminatorio / blacklist (reg. 1.2)",
  link_blacklist: "Link / dominio in blacklist (reg. 1.4)",
  mention_user: "Spam di menzioni utenti",
  mention_role: "Spam di menzioni ruoli",
  mention_everyone: "Menzioni @everyone / @here",
  mention_hour_cap: "Troppe menzioni in un’ora",
  mentions_lockdown: "Menzioni in lockdown",
  attachment_embed: "Troppi embed allegati (reg. 2.4)",
  attachment_image: "Troppe immagini (reg. 2.4)",
  attachment_file: "Troppi file (reg. 2.4)",
  attachment_link: "Troppi link nel testo (reg. 2.4)",
  attachment_sticker: "Troppi sticker (reg. 2.4)",
  unwhitelisted_webhook: "Webhook non autorizzato (reg. 2.4)",
  panic_mode: "Panic mode / raid (severità elevata)",
};

function formatRegolaDotFromBucket(bucketId) {
  return BUCKET_TO_RULE_DOT[String(bucketId || "")] || "";
}

function pickPrimaryAutomodRegolaBucket(violations = []) {
  const keys = new Set(
    (Array.isArray(violations) ? violations : [])
      .map((v) => String(v?.key || "").trim())
      .filter(Boolean),
  );
  for (const bucket of BUCKET_PRIORITY) {
    const set = BUCKET_VIOLATION_KEYS[bucket];
    if (!set || !set.size) continue;
    for (const k of set) {
      if (keys.has(k)) return bucket;
    }
  }
  return null;
}

function collectAutomodRegolaBucketsForViolations(violations = []) {
  const keys = new Set(
    (Array.isArray(violations) ? violations : [])
      .map((v) => String(v?.key || "").trim())
      .filter(Boolean),
  );
  const out = [];
  for (const bucket of BUCKET_PRIORITY) {
    const set = BUCKET_VIOLATION_KEYS[bucket];
    if (!set || !set.size) continue;
    for (const k of set) {
      if (keys.has(k)) {
        out.push(bucket);
        break;
      }
    }
  }
  return [...new Set(out)];
}

function getAutomodRegolaSanction(bucketId, previousStepCount = 0) {
  const steps = AUTOMOD_REGOLA_STEPS[String(bucketId || "")];
  if (!Array.isArray(steps) || !steps.length) return null;
  const idx = Math.max(
    0,
    Math.min(steps.length - 1, Math.floor(Number(previousStepCount) || 0)),
  );
  const step = steps[idx];
  if (!step || typeof step !== "object") return null;
  if (step.type === "ban") return { type: "ban" };
  if (step.type === "timeout") {
    const ms = Number(step.ms || 0);
    if (!Number.isFinite(ms) || ms <= 0) return null;
    return { type: "timeout", ms: Math.min(DISCORD_TIMEOUT_MAX_MS, ms) };
  }
  return null;
}

function buildAutomodRegolaSummaryLine(violations = []) {
  const buckets = collectAutomodRegolaBucketsForViolations(violations);
  if (!buckets.length) return "";
  const parts = buckets.map((b) => {
    const dot = formatRegolaDotFromBucket(b);
    const excerpt = dot && MOD_RULE_DETAIL[dot]
      ? MOD_RULE_DETAIL[dot].replace(/\*\*/g, "").replace(/__/g, "").slice(0, 120)
      : "";
    return excerpt ? `**${dot}** — ${excerpt}${excerpt.length >= 120 ? "…" : ""}` : `**${dot || b}**`;
  });
  return parts.join(" · ");
}

function violationKeyLabelIt(key) {
  return VIOLATION_KEY_LABEL_IT[String(key || "")] || String(key || "sconosciuto").replace(/_/g, " ");
}

module.exports = {
  MOD_RULE_DETAIL,
  DISCORD_TIMEOUT_MAX_MS,
  BUCKET_PRIORITY,
  BUCKET_VIOLATION_KEYS,
  pickPrimaryAutomodRegolaBucket,
  collectAutomodRegolaBucketsForViolations,
  getAutomodRegolaSanction,
  formatRegolaDotFromBucket,
  buildAutomodRegolaSummaryLine,
  violationKeyLabelIt,
};