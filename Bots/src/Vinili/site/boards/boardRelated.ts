/**
 * Bacheche: schede collegate.
 * - scheda server → i bot in vetrina che sono nel server;
 * - scheda bot → i server in vetrina dove c'è quel bot.
 * Si controlla con Discord se il bot è membro del server (serve il nostro bot nel server, come per ogni scheda server).
 */
const mongoose = require("mongoose") as typeof import("mongoose");
const { Routes } = require("discord.js") as typeof import("discord.js");
const { SiteDocument } = require("../../Community/schemas/communitySchemas") as typeof import("../../Community/schemas/communitySchemas");
const { BL, featureGate } = require("./boardReviews") as typeof import("./boardReviews");
const { serializeListing } = require("./boardInvites") as typeof import("./boardInvites");

const CACHE_MS = 60 * 60_000;
const MAX_CHECKS = 120;
const CONCURRENCY = 4;
const SELECT =
  "title boardKind boardDiscordId boardSlug status boardTagline boardCategories boardLocales boardTags boardIconUrl boardBannerUrl boardInviteUrl boardBotInviteUrl boardScore boardVotes30d boardVotesMonth boardVotesMonthKey boardBumps7d boardBumpedAt boardRatingAvg boardReviewsCount boardAccent boardStats boardNsfw createdAt updatedAt userId authorName";

const cache = new Map<string, { at: number; ids: string[] }>();
const memberCache = new Map<string, { at: number; in: boolean }>();

/** Il bot (utente) è nel server? Risposta di Discord tenuta in cache. */
async function isMember(client?, guildId?: string, userId?: string) {
  const k = `${guildId}:${userId}`;
  const hit = memberCache.get(k);
  if (hit && Date.now() - hit.at < CACHE_MS) return hit.in;
  let inGuild = false;
  try {
    await client.rest.get(Routes.guildMember(String(guildId), String(userId)));
    inGuild = true;
  } catch (err) {
    /* 404 = non è nel server; altri errori: non lo sappiamo, non lo mostriamo */
    inGuild = false;
  }
  if (memberCache.size > 20000) memberCache.clear();
  memberCache.set(k, { at: Date.now(), in: inGuild });
  return inGuild;
}

async function mapLimit<T, R>(items: T[], n: number, fn: (x: T) => Promise<R>) {
  const out: R[] = new Array(items.length);
  let i = 0;
  await Promise.all(
    Array.from({ length: Math.min(n, items.length) }, async () => {
      while (i < items.length) {
        const j = i++;
        out[j] = await fn(items[j]);
      }
    }),
  );
  return out;
}

async function getRelatedListings(client?, listingId?) {
  const gate = featureGate(client);
  if (!gate.ok) return gate;
  const id = String(listingId || "").trim();
  if (!mongoose.isValidObjectId(id)) return { ok: false, status: 400, error: "invalid_id", message: "ID scheda non valido." };
  const doc: any = await SiteDocument.findOne({ _id: id, docType: BL, status: "approved" }).select({ boardKind: 1, boardDiscordId: 1 }).lean();
  if (!doc) return { ok: false, status: 404, error: "not_found", message: "Scheda non trovata." };
  if (!client?.rest) return { ok: true, status: 200, items: [] };
  const kind = String(doc.boardKind || "") === "bot" ? "bot" : "server";
  const discordId = String(doc.boardDiscordId || "");

  let ids: string[];
  const hit = cache.get(id);
  if (hit && Date.now() - hit.at < CACHE_MS) {
    ids = hit.ids;
  } else {
    /* l'altro tipo di schede, le più in alto prima */
    const others: any[] = await SiteDocument.find({ docType: BL, status: "approved", boardKind: kind === "bot" ? "server" : "bot", _id: { $ne: id } })
      .select({ boardDiscordId: 1 })
      .sort({ boardScore: -1, boardBumpedAt: -1 })
      .limit(MAX_CHECKS)
      .lean();
    const found = await mapLimit(others, CONCURRENCY, async (o) => {
      const other = String(o.boardDiscordId || "");
      if (!other) return null;
      /* server → bot: il bot dell'altra scheda è nel server; bot → server: questo bot è nel server dell'altra scheda */
      const ok = kind === "server" ? await isMember(client, discordId, other) : await isMember(client, other, discordId);
      return ok ? String(o._id) : null;
    });
    ids = found.filter((x): x is string => Boolean(x));
    cache.set(id, { at: Date.now(), ids });
  }
  if (!ids.length) return { ok: true, status: 200, kind: kind === "bot" ? "server" : "bot", items: [] };
  const rows: any[] = await SiteDocument.find({ _id: { $in: ids }, docType: BL, status: "approved" }).select(SELECT).sort({ boardScore: -1 }).limit(24).lean();
  return { ok: true, status: 200, kind: kind === "bot" ? "server" : "bot", items: rows.map((r) => serializeListing(r, { mode: "card" })) };
}

export = { getRelatedListings };
