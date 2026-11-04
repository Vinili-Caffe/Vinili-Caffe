/**
 * Sezioni deck Reliquie / PG per il profilo sito (stile caramelle Halloween).
 */
"use strict";

const __path = require("path") as typeof import("path");
const __eventCoreVinili = (rel: string) => __path.join(__path.resolve(__dirname, "../../../../../../src/Vinili"), rel);

const { listReliquieCatalog, normalizeReliquieId, reliquieTotal } = require("../../Utils/Eventi/starWarsReliquieCatalog") as typeof import("../../Utils/Eventi/starWarsReliquieCatalog");
const { listPgCatalog, normalizePgId, pgTotal } = require("../../Utils/Eventi/starWarsPgCatalog") as typeof import("../../Utils/Eventi/starWarsPgCatalog");
const { resolveStarWarsEventConfig, isStarWarsEventLive } = require("../../Utils/Eventi/starWarsEventConfig") as typeof import("../../Utils/Eventi/starWarsEventConfig");

function normalizeOwnedIds(raw?, normalizeIdFn?) {
  const out = [];
  const seen = new Set();
  for (const row of Array.isArray(raw) ? raw : []) {
    const id = normalizeIdFn(row);
    if (!id || seen.has(id)) continue;
    seen.add(id);
    out.push(id);
  }
  return out;
}

function buildDeckSection({ title, kind, catalog, ownedRaw, normalizeIdFn, total, visible }) {
  if (!visible) return null;
  const owned = normalizeOwnedIds(ownedRaw, normalizeIdFn);
  const ownedSet = new Set(owned);
  return {
    visible: true,
    kind,
    title,
    ownedCount: owned.length,
    total: Math.max(total, catalog.length),
    items: catalog.map((c?) => ({
      id: c.id,
      name: c.name,
      imageUrl: c.imageUrl || "",
      thumbUrl: c.thumbUrl || c.imageUrl || "",
      silhouetteUrl: c.silhouetteUrl || c.imageUrl || "",
      owned: ownedSet.has(c.id),
      hasImage: c.hasImage !== false && Boolean(c.imageUrl),
    })),
  };
}

function buildStarWarsDeckProfileSections(doc?, client?, opts: Record<string, any> = {}) {
  const sw = doc?.profile?.events?.starwars && typeof doc.profile.events.starwars === "object" ? doc.profile.events.starwars : {};
  const cfg = resolveStarWarsEventConfig(client);
  const eventOn = Boolean(cfg?.enabled && (cfg.testGuildForceLive || isStarWarsEventLive(client, new Date(), opts?.guildId || null)));
  const relicOwned = Array.isArray(sw.deckReliquie) ? sw.deckReliquie : [];
  const pgOwned = Array.isArray(sw.deckPG) ? sw.deckPG : [];
  const forceVisible = Boolean(opts?.forceVisible);
  const relicVisible = forceVisible || eventOn || relicOwned.length > 0;
  const pgVisible = forceVisible || eventOn || pgOwned.length > 0;

  const reliquie = buildDeckSection({
    title: "Collezione di reliquie",
    kind: "reliquie",
    catalog: listReliquieCatalog(),
    ownedRaw: relicOwned,
    normalizeIdFn: normalizeReliquieId,
    total: reliquieTotal(),
    visible: relicVisible,
  });
  const pg = buildDeckSection({
    title: "Collezione PG",
    kind: "pg",
    catalog: listPgCatalog(),
    ownedRaw: pgOwned,
    normalizeIdFn: normalizePgId,
    total: pgTotal(),
    visible: pgVisible,
  });

  if (!reliquie && !pg) return null;
  return { visible: true, reliquie, pg };
}

export = {
  buildStarWarsDeckProfileSections,
};
