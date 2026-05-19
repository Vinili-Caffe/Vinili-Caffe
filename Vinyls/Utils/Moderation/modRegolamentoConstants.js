const DISCORD_TIMEOUT_MAX_MS = 28 * 24 * 60 * 60_000;

const MOD_RULE_DETAIL = {
  "1.1": "**Rispettare** i [__ToS__](https://discord.com/terms) e le [__Linee Guida__](https://discord.com/guidelines) di Discord.",
  "1.2": "**Nessuna discriminazione.** Sono vietate forme di razzismo, incitamento al fascismo/nazismo, omofobia e altri comportamenti denigratori (comprese f-word e n-word).",
  "1.3": "Il **rispetto** è alla base di tutto. I comportamenti considerati **tossici** saranno sanzionati (compresa la promozione di attività illecite o di raid/grief/nuke).",
  "1.4": "L'**autopromozione** è vietata (anche in **DM**). Se vuoi dare visibilità ai tuoi progetti, valuta le nostre offerte di **sponsor**.",
  "1.5": "Praticare **join-leave** per il solo scopo di **infastidire** è una pratica scorretta e non accettata.",
  "2.1": "Il **doxing** è un reato e una violazione delle informazioni personali altrui. È vietato insieme all'invio di materiale **NSFW** di qualsiasi tipo.",
  "2.2": "Se possiedi i permessi per inviare **link**, non condividere materiale **esplicito** o **illecito**. File con estensioni eseguibili (`.exe`, `.jar`, `.bat`, `.sh` o altri) sono severamente vietati e verranno rimossi dallo staff. Vinili&Caffè non si assume responsabilità per eventuali danni derivati dall'uso di tali file.",
  "2.3": "Non intasare i canali con **flood** o **Wall Of Text**.",
  "2.4": "È vietato abusare di **parolacce**, **bestemmie** e ogni tipo di **insulto** a **divinità**. Se un utente si lamenta è buona pratica smettere di utilizzare tale linguaggio.",
  "3.1": "Non mostrare contenuti **NSFW** o **dati sensibili** di un utente.",
  "3.2": "È vietato **disconnettere il bot** o cambiare musica mentre un utente sta ascoltando una canzone tramite il bot per il solo scopo di dare fastidio.",
  "3.3": "Non **urlare** o fare **errape**. Utilizzare **SoundBoard** esterne a quelle di Discord o qualunque tipo di **VoiceChanger** non è accettato.",
  "3.4": "È vietato **uscire** e **rientrare** continuamente dalle **vocali**.",
  "3.6": "Non restare in vocale se sei **AFK**. Se vuoi comunque rimanere nei canali **VC** con gli altri, silenzia il **microfono** e l'**audio**. Farmare **EXP** in questa maniera non è consentito. Nel caso, durante un controllo, ti trovassimo per più di **10 minuti** inattivo in un vocale o non risponderai in testuale o alle chiamate, sarai sanzionato.",
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
 * 2.4: warn/delete prima tramite heat; poi mute 3 h → 6 h.
 */
const AUTOMOD_REGOLA_STEPS = {
  "1_2": [
    { type: "timeout", ms: 4 * 60 * 60_000 },
    { type: "timeout", ms: 12 * 60 * 60_000 },
    { type: "timeout", ms: 24 * 60 * 60_000 },
  ],
  "1_4": [{ type: "ban" }],
  "2_1": [{ type: "timeout", ms: 24 * 60 * 60_000 }, { type: "ban" }],
  "2_3": [{ type: "ban" }],
  "2_4": [{ type: "timeout", ms: 3 * 60 * 60_000 }, { type: "timeout", ms: 6 * 60 * 60_000 }],
};

const BUCKET_TO_RULE_DOT = {
  "1_2": "1.2",
  "1_4": "1.4",
  "2_1": "2.1",
  "2_3": "2.2",
  "2_4": "2.3",
};

const VIOLATION_KEY_LABEL_IT = {
  regular_message: "Spam / troppi messaggi (reg. 2.3)",
  suspicious_account: "Profilo sospetto / segnali di sicurezza",
  similar_message: "Messaggi troppo simili",
  emoji_spam: "Troppe emoji (reg. 2.3)",
  new_lines: "Troppi a capo / wall of text (reg. 2.3)",
  zalgo: "Testo illeggibile / zalgo",
  characters: "Densità caratteri / non conversazione normale (reg. 2.3)",
  invite: "Invito Discord non autorizzato",
  scam_pattern: "Link malevoli / scam / file pericolosi (reg. 2.2)",
  nsfw_link: "Contenuto NSFW o link non consentito (reg. 2.1)",
  word_blacklist: "Linguaggio discriminatorio / blacklist (reg. 1.2)",
  link_blacklist: "Link / dominio in blacklist / autopromozione (reg. 1.4)",
  mention_user: "Spam di menzioni utenti",
  mention_role: "Spam di menzioni ruoli",
  mention_everyone: "Menzioni @everyone / @here",
  mention_hour_cap: "Troppe menzioni in un’ora",
  mentions_lockdown: "Menzioni in lockdown",
  attachment_embed: "Troppi embed allegati (reg. 2.3)",
  attachment_image: "Troppe immagini (reg. 2.3)",
  attachment_file: "Troppi file (reg. 2.3)",
  attachment_link: "Troppi link nel testo (reg. 2.3)",
  attachment_sticker: "Troppi sticker (reg. 2.3)",
  unwhitelisted_webhook: "Webhook non autorizzato (reg. 2.3)",
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