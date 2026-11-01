/** Bacheca sul sito: reazioni date dal sito (una riga per utente, contenuto ed emoji). */
const mongoose = require("mongoose") as typeof import("mongoose");

const { Schema, model, models } = mongoose;

const BACHECA_EMOJIS = Object.freeze(["💀", "❤️", "🔥", "😂"]);

const bachecaReactionSchema = new Schema(
  {
    guildId: { type: String, required: true },
    /* id del contenuto in bacheca (boardMessageId) */
    itemId: { type: String, required: true },
    userId: { type: String, required: true },
    emoji: { type: String, required: true },
  },
  { timestamps: true, collection: "bachecareactions" },
);
bachecaReactionSchema.index({ guildId: 1, itemId: 1, userId: 1, emoji: 1 }, { unique: true });
bachecaReactionSchema.index({ guildId: 1, itemId: 1 });

const BachecaReaction: import("mongoose").Model<import("mongoose").InferSchemaType<typeof bachecaReactionSchema>> =
  models.BachecaReaction || model("BachecaReaction", bachecaReactionSchema);

/** Mette o toglie la reazione. Ritorna se adesso c'è. */
async function toggleBachecaReaction(guildId: string, itemId: string, userId: string, emoji: string) {
  const filter = { guildId, itemId, userId, emoji };
  const removed = await BachecaReaction.deleteOne(filter);
  if (Number(removed?.deletedCount || 0) > 0) return false;
  await BachecaReaction.updateOne(filter, { $setOnInsert: filter }, { upsert: true });
  return true;
}

/** Conteggi per emoji e reazioni dell'utente, per un gruppo di contenuti. */
async function loadBachecaReactions(guildId: string, itemIds: string[], viewerId = "") {
  const counts = new Map<string, Record<string, number>>();
  const mine = new Map<string, string[]>();
  if (!itemIds.length) return { counts, mine };
  const rows = await BachecaReaction.find({ guildId, itemId: { $in: itemIds } })
    .select("itemId userId emoji")
    .lean()
    .catch(() => []);
  for (const r of rows as any[]) {
    const c = counts.get(r.itemId) || {};
    c[r.emoji] = (c[r.emoji] || 0) + 1;
    counts.set(r.itemId, c);
    if (viewerId && r.userId === viewerId) mine.set(r.itemId, [...(mine.get(r.itemId) || []), r.emoji]);
  }
  return { counts, mine };
}

export = { BACHECA_EMOJIS, toggleBachecaReaction, loadBachecaReactions };
