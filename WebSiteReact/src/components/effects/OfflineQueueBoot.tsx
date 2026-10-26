"use client";

import { useCallback } from "react";
import { useAuth } from "@/lib/auth";
import { loadVote } from "@/lib/vote";
import { toggleLike } from "@/lib/reviews";
import { react, saveTicketComposerDraft } from "@/lib/tickets";
import { type OfflineAction, useOfflineQueueFlush } from "@/lib/offline-queue";

/** Ritenta la coda offline globale (sync voti, like recensioni, react ticket, draft). */
export function OfflineQueueBoot() {
  const { token, user, ready } = useAuth();

  const handleItem = useCallback(
    async (item: OfflineAction): Promise<boolean> => {
      if (item.type === "vote") {
        const userId = typeof item.payload.userId === "string" ? item.payload.userId : user?.id;
        try {
          const data = await loadVote({ userId });
          return data != null;
        } catch {
          return false;
        }
      }
      if (item.type === "react") {
        if (!token) return false;
        const scope = item.payload.scope;
        if (scope === "review") {
          const reviewId = String(item.payload.reviewId || "");
          if (!reviewId) return true;
          const r = await toggleLike(token, reviewId);
          return r.ok;
        }
        if (scope === "ticket") {
          const ticketId = String(item.payload.ticketId || "");
          const messageId = String(item.payload.messageId || "");
          const emoji = String(item.payload.emoji || "");
          if (!ticketId || !messageId || !emoji) return true;
          const r = await react(token, ticketId, messageId, emoji);
          return r.ok;
        }
        return true;
      }
      if (item.type === "draft") {
        const ticketId = String(item.payload.ticketId || "");
        const text = String(item.payload.text || "");
        if (!ticketId) return true;
        saveTicketComposerDraft(ticketId, text);
        return true;
      }
      return true;
    },
    [token, user?.id],
  );

  useOfflineQueueFlush(handleItem, ready);
  return null;
}
