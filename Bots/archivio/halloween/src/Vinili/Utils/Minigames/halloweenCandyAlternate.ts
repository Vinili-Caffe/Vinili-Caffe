const __path = require("path") as typeof import("path");
const __eventCoreVinili = (rel: string) => __path.join(__path.resolve(__dirname, "../../../../../../src/Vinili"), rel);

/**
 * Alternanza dolcetto/scherzetto (Trick or Treat) ↔ caccia emoji (reaction).
 * Stato per guild in SiteDocument.
 */
const { SiteDocument, SITE_DOCUMENT_TYPE } = require(__eventCoreVinili("Schemas/Community/communitySchemas"));

const DOC_TYPE = SITE_DOCUMENT_TYPE.HOGWARTS_REACT_PRESS;
const DOC_OWNER = "__halloween_candy_alternate__";
const DOC_DEDUPE = "halloween_candy_alternate_v1";

const KIND_TOT = "tot";
const KIND_HUNT = "hunt";

function normalizeId(value?) {
  return String(value || "").trim();
}

function normalizeKind(value?) {
  const k = String(value || "").trim().toLowerCase();
  if (k === KIND_TOT || k === "trickortreat" || k === "trick_or_treat") return KIND_TOT;
  if (k === KIND_HUNT || k === "emoji" || k === "reaction") return KIND_HUNT;
  return "";
}

function oppositeKind(kind?) {
  return normalizeKind(kind) === KIND_TOT ? KIND_HUNT : KIND_TOT;
}

async function loadDoc(guildId?) {
  const gid = normalizeId(guildId);
  if (!gid) return null;
  return SiteDocument.findOne({ guildId: gid, docType: DOC_TYPE, dedupeKey: DOC_DEDUPE }).lean().catch(() => null);
}

function readLastKind(doc?) {
  const raw = doc?.rawWebhook && typeof doc.rawWebhook === "object" ? doc.rawWebhook : {};
  return normalizeKind(raw.lastKind);
}

/** Prossimo evento caramella per questa guild (opposto dell’ultimo). */
async function peekNextCandyKind(guildId?) {
  const last = readLastKind(await loadDoc(guildId));
  if (!last) return KIND_HUNT;
  return oppositeKind(last);
}

async function commitCandyKind(guildId?, kind?) {
  const gid = normalizeId(guildId);
  const k = normalizeKind(kind);
  if (!gid || !k) return null;
  return SiteDocument.findOneAndUpdate(
    { guildId: gid, docType: DOC_TYPE, dedupeKey: DOC_DEDUPE },
    {
      $set: {
        "rawWebhook.lastKind": k,
        "rawWebhook.updatedAtMs": Date.now(),
        updatedAt: new Date(),
      },
      $setOnInsert: { guildId: gid, docType: DOC_TYPE, userId: DOC_OWNER, dedupeKey: DOC_DEDUPE },
    },
    { upsert: true, new: true },
  ).catch((err?) => {
    global.logger?.warn?.("[HALLOWEEN-CANDY] commitCandyKind failed:", err?.message || err);
    return null;
  });
}

export = {
  KIND_TOT,
  KIND_HUNT,
  peekNextCandyKind,
  commitCandyKind,
  oppositeKind,
};
